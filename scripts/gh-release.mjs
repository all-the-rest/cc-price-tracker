#!/usr/bin/env node
import { execFileSync } from "node:child_process";

/** Kleiner, testbarer Wrapper um `gh` – identisch zur Ausführung in den bestehenden Skripten. */
export function gh(args) {
  return execFileSync("gh", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Alle Fehlertexte (inkl. `cause`-Kette) zu einem String zusammenfügen. */
export function errorText(value, seen = new Set()) {
  if (value == null || seen.has(value)) return "";
  seen.add(value);
  const parts = [];
  for (const key of ["stderr", "stdout", "body", "message"]) {
    const part = value?.[key];
    if (typeof part === "string" && part) parts.push(part);
  }
  parts.push(String(value));
  if (value?.cause) parts.push(errorText(value.cause, seen));
  return parts.join("\n");
}

/**
 * Echte 404: `release not found` (gh release view) oder HTTP 404 (gh api).
 * Alles andere – auch Rate-Limits, 5xx, Timeouts und DNS-Fehler – ist transient.
 */
export function isNotFound(err) {
  if (err == null) return false;
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  if (status === 404 || status === "404") return true;
  const text = errorText(err);
  return /\brelease\s+not\s+found\b/i.test(text) || /\b404\b/.test(text);
}

export function isTransientError(err) {
  return !isNotFound(err);
}

/** Kurzer, lesbarer Grund für Warnungen (eine Zeile, gekürzt). */
function reasonOf(err) {
  if (err == null) return "";
  const lines = [err?.stderr, err?.message, err?.cause?.stderr, err?.cause?.message, String(err?.cause ?? err)]
    .filter((line) => typeof line === "string")
    .flatMap((line) => line.split("\n"))
    .map((line) => line.trim())
    .filter(Boolean);
  const reason =
    lines.find((line) => /\b(?:HTTP|rate limit|timed?\s*out|timeout|ENOTFOUND|ECONN|denied|error|failed)\b/i.test(line)) ??
    lines[0] ??
    "unknown error";
  return reason.length > 160 ? `${reason.slice(0, 160)}…` : reason;
}

/** Signalisiert: GitHub war vorübergehend nicht erreichbar (nicht divergiert). */
export class ApiUnavailableError extends Error {
  constructor(label, { cause, reason } = {}) {
    const detail = reason ?? reasonOf(cause);
    super(`GitHub API unavailable for ${label}${detail ? ` (${detail})` : ""}`, { cause });
    this.name = "ApiUnavailableError";
    this.label = label;
    this.reason = detail;
  }
}

export function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ruft `fn` bis zu `attempts` Mal auf. Ein 404 wird sofort weitergeworfen (kein Retry,
 * kein Warten), alle anderen Fehler werden mit exponentiellem Backoff wiederholt.
 * Nach dem letzten Versuch wird ApiUnavailableError geworfen.
 */
export async function withRetry(
  label,
  fn,
  { attempts = 3, baseDelayMs = 1000, delay = defaultDelay } = {}
) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (isNotFound(err)) throw err;
      lastError = err;
      if (attempt < attempts) await delay(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw new ApiUnavailableError(label, { cause: lastError, reason: reasonOf(lastError) });
}

/**
 * `gh release view <tag> --json <fields>` mit Retry. 404 → `null` (Release fehlt
 * wirklich), ApiUnavailableError → weiterwerfen (API nicht erreichbar).
 */
export async function releaseJson(tag, fields) {
  try {
    return await withRetry(`release ${tag}`, () =>
      JSON.parse(gh(["release", "view", tag, "--json", fields]))
    );
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}
