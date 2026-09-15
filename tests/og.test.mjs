import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "index.html"), "utf8");

test("index.html has absolute OG/Twitter SEO tags + canonical", () => {
  assert.match(html, /<link rel="canonical" href="https:\/\/cc-pricing\.all-the\.rest\/" \/>/);
  assert.match(html, /<meta property="og:image" content="https:\/\/cc-pricing\.all-the\.rest\/share\/og\.png" \/>/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/cc-pricing\.all-the\.rest\/share\/og\.png" \/>/);
  assert.match(html, /<meta property="og:image:width" content="1200" \/>/);
  assert.match(html, /<meta property="og:image:height" content="630" \/>/);
});

test("build-share generates 1200x630 PNG with PNG magic", () => {
  execFileSync("node", ["scripts/build-share.mjs"], { cwd: root, stdio: "pipe" });
  const out = join(root, "public", "share", "og.png");
  assert.ok(existsSync(out), "public/share/og.png exists");
  const buf = readFileSync(out);
  assert.deepEqual(
    [...buf.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "PNG magic bytes",
  );
  assert.equal(buf.readUInt32BE(16), 1200, "IHDR width");
  assert.equal(buf.readUInt32BE(20), 630, "IHDR height");
});
