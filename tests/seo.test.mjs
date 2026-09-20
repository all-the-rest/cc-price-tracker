// SEO-/Prerender-Vertrag: prüft den Produktions-Build in dist/. Läuft ohne
// dist/ (z. B. in CI vor dem Build) übersprungen statt rot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const INDEX = join(DIST, "index.html");
const MISSING = "dist/ fehlt — zuerst `pnpm build` ausführen";

const read = (p) => readFileSync(p, "utf8");

test("SEO: dist/index.html enthält h1 und nicht-leeren #root (Prerender)", { skip: !existsSync(INDEX) && MISSING }, () => {
  const html = read(INDEX);
  assert.match(html, /<h1[^>]*>/, "h1 vorhanden");
  const start = html.indexOf('<div id="root">');
  const end = html.lastIndexOf("</body>");
  assert.ok(start > -1 && end > start, "App-Root gefunden");
  const rootContent = html.slice(start + '<div id="root">'.length, end);
  assert.ok(rootContent.trim().length > 500, "App-Root enthält vorgerendertes Markup");
});

test("SEO: JSON-LD ist vorhanden und parsebar (WebSite + ItemList + FAQPage)", { skip: !existsSync(INDEX) && MISSING }, () => {
  const html = read(INDEX);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 1, "mindestens ein JSON-LD-Block");
  const parsed = blocks.map((b) => JSON.parse(b));
  const types = parsed.map((p) => p["@type"]);
  assert.ok(types.includes("WebSite"), "WebSite-JSON-LD");
  assert.ok(types.includes("ItemList"), "ItemList-JSON-LD");
  assert.ok(types.includes("FAQPage"), "FAQPage-JSON-LD");
});

test("SEO: vorgerenderte Startseite enthält alle Modellnamen aus data/latest.json", { skip: !existsSync(INDEX) && MISSING }, () => {
  const html = read(INDEX);
  const data = JSON.parse(read(join(ROOT, "data", "latest.json")));
  const missing = data.models.filter((m) => !html.includes(m.name)).map((m) => m.name);
  assert.deepEqual(missing, [], `fehlende Modellnamen: ${missing.join(", ")}`);
});

test("SEO: robots.txt verweist auf die Sitemap", { skip: !existsSync(join(DIST, "robots.txt")) && MISSING }, () => {
  const txt = read(join(DIST, "robots.txt"));
  assert.match(txt, /User-agent: \*/);
  assert.match(txt, /Allow: \//);
  assert.match(txt, /Sitemap: https:\/\/cc-pricing\.all-the\.rest\/sitemap\.xml/);
});

test("SEO: sitemap.xml ist valides XML und listet beide Sprachen", { skip: !existsSync(join(DIST, "sitemap.xml")) && MISSING }, () => {
  const xml = read(join(DIST, "sitemap.xml"));
  const $ = cheerio.load(xml, { xmlMode: true });
  assert.equal($("urlset").length, 1, "urlset vorhanden");
  const locs = $("url > loc").map((_, el) => $(el).text()).get();
  assert.ok(locs.includes("https://cc-pricing.all-the.rest/"), "EN-Startseite");
  assert.ok(locs.includes("https://cc-pricing.all-the.rest/de/"), "DE-Startseite");
  assert.match(xml, /<xhtml:link[^>]+hreflang="en"/, "hreflang en");
  assert.match(xml, /<xhtml:link[^>]+hreflang="de"/, "hreflang de");
  assert.match(xml, /<xhtml:link[^>]+hreflang="x-default"/, "hreflang x-default");
});

test("SEO: Sprachdateien mit html lang, Canonical und hreflang", { skip: !existsSync(join(DIST, "de", "index.html")) && MISSING }, () => {
  const de = read(join(DIST, "de", "index.html"));
  assert.match(de, /<html lang="de"/);
  assert.match(de, /<link rel="canonical" href="https:\/\/cc-pricing\.all-the\.rest\/de\/" \/>/);
  assert.match(de, /hreflang="en" href="https:\/\/cc-pricing\.all-the\.rest\/"/);
  assert.match(de, /hreflang="x-default" href="https:\/\/cc-pricing\.all-the\.rest\/"/);
  const imp = read(join(DIST, "impressum", "index.html"));
  assert.match(imp, /<meta name="robots" content="noindex,follow" \/>/);
  assert.match(imp, /<link rel="canonical" href="https:\/\/cc-pricing\.all-the\.rest\/impressum\/" \/>/);
});
