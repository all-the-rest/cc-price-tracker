#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { renderReleaseNotesForEntry } from "./release-notes.mjs";
import {
  ApiUnavailableError,
  errorText,
  gh,
  releaseJson,
  withRetry,
} from "./gh-release.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function releaseInfo(tag) {
  // 404 → null (Release existiert noch nicht), API-Fehler → ApiUnavailableError.
  return releaseJson(tag, "name,body");
}

export function isAlreadyExists(err) {
  // GitHub liefert bei vorhandenem Tag HTTP 422 mit `"code":"already_exists"`.
  return /already[ _-]?exists/i.test(errorText(err));
}

async function ensureRelease(tag, notes, { latest }) {
  const title = `Price Update ${tag}`;
  try {
    const existing = await releaseInfo(tag);
    if (existing) {
      if (existing.name === title && existing.body.trimEnd() === notes.trimEnd()) {
        console.log(`release ${tag} is up to date, nothing to do`);
        return;
      }
      await withRetry(`edit release ${tag}`, () =>
        gh(["release", "edit", tag, "--title", title, "--notes", notes])
      );
      console.log(`updated release ${tag}`);
      return;
    }
    const args = ["release", "create", tag, "--title", title, "--notes", notes];
    if (latest === false) args.push("--latest=false");
    try {
      await withRetry(`create release ${tag}`, () => gh(args));
    } catch (err) {
      if (!isAlreadyExists(err)) throw err;
      const retry = await releaseInfo(tag);
      if (retry) {
        if (retry.name === title && retry.body.trimEnd() === notes.trimEnd()) {
          console.log(`release ${tag} is up to date, nothing to do`);
          return;
        }
        await withRetry(`edit release ${tag} (create conflict)`, () =>
          gh(["release", "edit", tag, "--title", title, "--notes", notes])
        );
        console.log(`updated release ${tag} (recovered from create conflict)`);
        return;
      }
      throw err;
    }
    console.log(`created release ${tag}${latest === false ? " (not latest)" : ""}`);
  } catch (err) {
    if (err instanceof ApiUnavailableError) {
      console.warn(
        `::warning::GitHub API unavailable while ensuring release ${tag} — will be retried next run`
      );
      return "api-unavailable";
    }
    throw err;
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const all = argv.includes("--all");
  const dateIdx = argv.indexOf("--date");
  const date =
    (dateIdx !== -1 ? argv[dateIdx + 1] : null) ??
    (argv.find((a) => a.startsWith("--date="))?.slice("--date=".length) ?? null);

  const changelog = JSON.parse(readFileSync(join(ROOT, "CHANGELOG.json"), "utf8"));
  const entries = changelog?.entries ?? [];
  if (entries.length === 0) {
    console.log("no changelog entries, nothing to do");
    return;
  }

  let targets;
  if (all) {
    targets = entries;
  } else if (date) {
    const entry = entries.find((e) => e.id === date || e.date === date);
    if (!entry) {
      console.error(`no changelog entry for date ${date}`);
      process.exit(1);
      return;
    }
    targets = [entry];
  } else {
    targets = [entries[0]];
  }

  const newestId = entries[0].id;
  for (const entry of targets) {
    const notes = renderReleaseNotesForEntry(entry);
    if (notes === null) {
      console.log(`entry ${entry.id}: no changes, skipping release`);
      continue;
    }
    const outcome = await ensureRelease(entry.id, notes, { latest: entry.id === newestId });
    if (outcome === "api-unavailable") {
      console.warn("::warning::GitHub API still unavailable — skipping remaining releases; will retry next run");
      break;
    }
  }
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
