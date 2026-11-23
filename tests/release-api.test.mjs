import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ApiUnavailableError,
  isNotFound,
  isTransientError,
  withRetry,
} from "../scripts/gh-release.mjs";
import { isAlreadyExists } from "../scripts/ensure-release.mjs";

const transient = (message = "HTTP 500") => Object.assign(new Error(message), {
  stderr: message,
});
const notFound = () =>
  Object.assign(new Error("Command failed: gh release view"), {
    stderr: "release not found",
  });

// ---------------------------------------------------------------------------
// isNotFound / isTransientError
// ---------------------------------------------------------------------------

test("isNotFound: 404 und 'release not found' in allen Fehlerquellen", () => {
  assert.equal(isNotFound({ stderr: "release not found" }), true);
  assert.equal(isNotFound(new Error("RELEASE NOT FOUND")), true);
  assert.equal(isNotFound({ message: "release not found" }), true);
  assert.equal(isNotFound("release not found"), true);
  assert.equal(isNotFound({ stderr: "gh: Not Found (HTTP 404)" }), true);
  assert.equal(isNotFound({ stderr: '{"message":"Not Found","status":"404"}' }), true);
  assert.equal(isNotFound({ status: 404, stderr: "gh: Not Found (HTTP 404)" }), true);
  assert.equal(isNotFound(new Error("wrapped", { cause: { stderr: "release not found" } })), true);
});

test("isNotFound: transiente Fehler sind keine 404", () => {
  for (const err of [
    transient("HTTP 500"),
    transient("HTTP 429 rate limit exceeded"),
    transient("HTTP 403 forbidden"),
    transient("getaddrinfo ENOTFOUND api.github.com"),
    transient("command timed out after 10s"),
    new Error("socket hang up"),
    undefined,
    null,
  ]) {
    assert.equal(isNotFound(err), false, String(err));
  }
});

test("isTransientError: alles außer 404 gilt als transient", () => {
  assert.equal(isTransientError(transient("HTTP 503")), true);
  assert.equal(isTransientError(transient("HTTP 403")), true);
  assert.equal(isTransientError(notFound()), false);
  assert.equal(isTransientError({ status: 404 }), false);
});

// ---------------------------------------------------------------------------
// withRetry
// ---------------------------------------------------------------------------

test("withRetry: wiederholt transiente Fehler mit exponentiellem Backoff", async () => {
  const delays = [];
  let calls = 0;
  const result = await withRetry(
    "release tag",
    () => {
      calls++;
      if (calls < 3) throw transient("HTTP 500");
      return "ok";
    },
    { delay: (ms) => delays.push(ms) }
  );
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test("withRetry: 404 wird sofort weitergeworfen (kein Retry, kein Warten)", async () => {
  const delays = [];
  let calls = 0;
  const missing = notFound();
  await assert.rejects(
    withRetry(
      "release tag",
      () => {
        calls++;
        throw missing;
      },
      { delay: (ms) => delays.push(ms) }
    ),
    (err) => err === missing
  );
  assert.equal(calls, 1);
  assert.deepEqual(delays, []);
});

test("withRetry: nach allen Versuchen ApiUnavailableError mit label", async () => {
  const delays = [];
  let calls = 0;
  await assert.rejects(
    withRetry(
      "release tag",
      () => {
        calls++;
        throw transient("HTTP 429 rate limit exceeded");
      },
      { delay: (ms) => delays.push(ms) }
    ),
    (err) =>
      err instanceof ApiUnavailableError &&
      err.label === "release tag" &&
      /rate limit/i.test(err.reason) &&
      err.cause instanceof Error
  );
  assert.equal(calls, 3);
  assert.deepEqual(delays, [1000, 2000]);
});

test("withRetry: Backoff-Folge 1000/2000/4000 bei vier Versuchen", async () => {
  const delays = [];
  await assert.rejects(
    withRetry("release tag", () => Promise.reject(transient("HTTP 500")), {
      attempts: 4,
      delay: async (ms) => {
        delays.push(ms);
      },
    }),
    ApiUnavailableError
  );
  assert.deepEqual(delays, [1000, 2000, 4000]);
});

test("withRetry: Erfolg beim ersten Versuch wartet nicht", async () => {
  const delays = [];
  const value = await withRetry(
    "release tag",
    () => ({ body: "notes" }),
    { delay: (ms) => delays.push(ms) }
  );
  assert.deepEqual(value, { body: "notes" });
  assert.deepEqual(delays, []);
});

test("withRetry: baseDelayMs und attempts sind konfigurierbar", async () => {
  const delays = [];
  let calls = 0;
  await assert.rejects(
    withRetry(
      "release tag",
      () => {
        calls++;
        throw transient("timed out");
      },
      { attempts: 2, baseDelayMs: 50, delay: (ms) => delays.push(ms) }
    ),
    (err) => err instanceof ApiUnavailableError && err.label === "release tag"
  );
  assert.equal(calls, 2);
  assert.deepEqual(delays, [50]);
});

// ---------------------------------------------------------------------------
// ensure-release: Kollision nach langsamem create (HTTP 422 already_exists)
// ---------------------------------------------------------------------------

test("isAlreadyExists: GitHub-422 '\"code\":\"already_exists\"' wird erkannt", () => {
  assert.equal(
    isAlreadyExists({
      stderr: 'gh: Validation Failed (HTTP 422)\n{"code":"already_exists","field":"tag_name"}',
    }),
    true
  );
  assert.equal(isAlreadyExists({ stderr: "release already exists" }), true);
  assert.equal(isAlreadyExists({ stderr: "HTTP 422 Validation Failed" }), false);
});
