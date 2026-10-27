import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import solid from "vite-plugin-solid";
import * as cheerio from "cheerio";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "tests", ".ssr-allowance");

let ssr;
let data;
let baselines;

before(async () => {
  await build({
    configFile: false,
    root: ROOT,
    logLevel: "error",
    plugins: [solid({ ssr: true, generate: "ssr" })],
    build: {
      ssr: "tests/ssr-entry.tsx",
      outDir: OUT_DIR,
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
    },
  });
  const entry = join(OUT_DIR, readdirSync(OUT_DIR).find((f) => f.startsWith("ssr-entry.")));
  ssr = await import(pathToFileURL(entry).href);
  data = JSON.parse(readFileSync(join(ROOT, "data", "latest.json"), "utf8"));
  baselines = JSON.parse(readFileSync(join(ROOT, "src", "plan-baselines.json"), "utf8"));
});

const allowanceClasses = (models, plan) => {
  const $ = cheerio.load(ssr.renderPriceTable(models, plan, {
    basis: "list",
    sortField: "input",
    sortDir: 1,
    lang: "de",
  }));
  const classes = new Map();
  $("tbody tr").each((_, tr) => {
    const name = $(tr).find("th").first().find("span.block").first().text().trim();
    const badge = $(tr).find('span.badge.badge-sm.tabular-nums').first();
    classes.set(name, badge.attr("class").replace(/^badge badge-sm tabular-nums\s*/, ""));
  });
  return classes;
};

const modelsWithAllowances = (source, entries, planId) => entries.map(([name, amount]) => ({
  ...structuredClone(source),
  id: `allowance-${planId}-${amount}`,
  name,
  allowances: { [planId]: amount },
  availability: { ...source.availability, [planId]: true },
}));

test("Guthaben-Farben folgen Anteil am Claim mit bezahltem Preis als dunkelrotem Guard", () => {
  const goat = data.plans.find((plan) => plan.id === "goat");
  const pro = data.plans.find((plan) => plan.id === "pro");
  const source = data.models.find((model) => model.input > 0 && model.output > 0);
  assert.ok(goat && pro && source, "GOAT, Pro und ein Modell mit nicht-null Preisen vorhanden");
  assert.equal(baselines.goat.creditsIncluded, 100);
  // 0.775 wird als 0.7749999999999999 gespeichert → 0.77
  assert.equal(ssr.actualPaid(goat), 10.77);
  assert.equal(baselines.pro.creditsIncluded, 110);
  // 1.235 → 1.2349999999999999 → 1.23
  assert.equal(ssr.actualPaid(pro), 21.23);

  const goatCases = modelsWithAllowances(source, [
    ["GOAT $10", 10], ["GOAT $20", 20], ["GOAT $25", 25], ["GOAT $33", 33],
    ["GOAT $80", 80], ["GOAT $100", 100], ["GOAT $120", 120],
  ], "goat");
  assert.deepEqual(Object.fromEntries(allowanceClasses(goatCases, goat)), {
    "GOAT $10": "badge-error",
    "GOAT $20": "bg-error/20 text-error border border-error",
    "GOAT $25": "bg-error/20 text-error border border-error",
    "GOAT $33": "badge-warning",
    "GOAT $80": "badge-warning",
    "GOAT $100": "bg-success/20 text-success border border-success",
    "GOAT $120": "badge-success",
  });

  const proCases = modelsWithAllowances(source, [["Pro $30", 30], ["Pro $22", 22], ["Pro $20", 20]], "pro");
  assert.deepEqual(Object.fromEntries(allowanceClasses(proCases, pro)), {
    "Pro $30": "badge-warning",
    "Pro $22": "bg-error/20 text-error border border-error",
    "Pro $20": "badge-error",
  });
});
