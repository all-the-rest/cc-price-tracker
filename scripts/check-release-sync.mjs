#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderReleaseNotesForEntry } from "./release-notes.mjs";
import { ApiUnavailableError, gh, releaseJson, withRetry } from "./gh-release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Erkennung "unserer" Releases: Tag = Run-`id` (Zeitstempel) oder Vorschema-Datum.
const OUR_TAG = /^(\d{4}-\d{2}-\d{2}(T\d{2}-\d{2}-\d{2}Z)?)$/;

async function main() {
  const changelog = JSON.parse(readFileSync(join(ROOT, "CHANGELOG.json"), "utf8"));
  const entries = changelog?.entries ?? [];
  const errors = [];
  let skipped = 0;
  let apiDown = false; // erster ApiUnavailableError genügt — keine 92×3 Retry-Versuche

  const seenTags = new Set();
  for (const entry of entries) {
    const tag = entry.id ?? entry.date;
    if (!tag) {
      errors.push(`changelog entry without id (date=${entry.date})`);
      continue;
    }
    seenTags.add(tag);
    const notes = renderReleaseNotesForEntry(entry);
    if (notes === null) continue; // keine Änderungen → kein Release erwartet
    if (apiDown) {
      skipped++;
      continue;
    }
    let body;
    try {
      body = (await releaseJson(tag, "body"))?.body ?? null;
    } catch (err) {
      if (err instanceof ApiUnavailableError) {
        if (!apiDown) {
          console.warn(
            `::warning::GitHub API unavailable for ${tag} (${err.reason}) — skipping this and all remaining entries`
          );
        }
        apiDown = true;
        skipped++;
        continue;
      }
      throw err;
    }
    if (body === null) {
      errors.push(`missing GitHub release for changelog entry ${tag}`);
      continue;
    }
    if (body.trimEnd() !== notes.trimEnd()) {
      errors.push(`release notes out of sync for ${tag}`);
    }
  }

  // Verwaiste Releases: Tag in unserem Format, aber kein passender Changelog-Eintrag.
  let releases = [];
  if (apiDown) {
    console.warn("::warning::GitHub API unavailable — skipping orphan check");
  } else {
    try {
      releases = JSON.parse(
        await withRetry("release list", () =>
          gh(["release", "list", "--json", "tagName", "--limit", "1000"])
        )
      );
    } catch (err) {
      if (err instanceof ApiUnavailableError) {
        console.warn(
          `::warning::GitHub API unavailable while listing releases (${err.reason}) — skipping orphan check`
        );
      } else {
        console.error("could not list releases (gh auth?)");
        process.exitCode = 1;
        return;
      }
    }
  }
  for (const r of releases) {
    const tag = r.tagName;
    if (OUR_TAG.test(tag) && !seenTags.has(tag)) {
      errors.push(`orphan release ${tag} has no matching changelog entry`);
    }
  }

  if (errors.length > 0) {
    console.error("changelog/release sync FAILED:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }
  const skippedNote = skipped > 0 ? `, ${skipped} skipped — GitHub API unavailable` : "";
  console.log(`changelog/release sync OK (${entries.length} entries checked${skippedNote})`);
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
