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

test("Team Pro ist plan-level: 40 USD Pool, team availability, keine Modell-Allowance", () => {
  const teamPlan = data.plans.find((plan) => plan.id === "team-pro");
  assert.ok(teamPlan);
  assert.equal(teamPlan.defaultAllowance, null);
  const model = data.models.find((candidate) => candidate.availability.team);
  assert.ok(model);
  assert.equal(ssr.modelOnPlan(model, "team-pro"), model.availability.team);
  assert.equal(Object.hasOwn(model.allowances, "team-pro"), false);
  assert.equal(ssr.usageOf(model, teamPlan), teamPlan.creditsMonthly);
});

test("Allowance bar colors retain the full five-tier scale", () => {
  const plan = data.plans.find((candidate) => candidate.id === "goat");
  const source = data.models.find((candidate) => candidate.input > 0 && candidate.output > 0);
  assert.ok(plan && source);
  const claim = baselines.goat.creditsIncluded;
  const paid = ssr.actualPaid(plan);
  const allowanceValues = [
    paid / 2,
    (paid + claim * 0.25) / 2,
    claim * 0.5,
    claim,
    claim * 1.25,
  ];
  const expectedBarClasses = [
    "bg-error",
    "bg-error/75",
    "bg-warning",
    "bg-success/60",
    "bg-green-800",
  ];
  for (const [index, allowance] of allowanceValues.entries()) {
    const model = {
      ...structuredClone(source),
      allowances: { ...source.allowances, goat: allowance },
      availability: { ...source.availability, goat: true },
    };
    const html = ssr.renderAllowancePage("en", [model], [plan], plan.id);
    assert.match(html, new RegExp(`h-full rounded-full ${expectedBarClasses[index].replaceAll("/", "\\/")}`));
  }
});

test("Allowance-Seite rendert die Erklärtexte in der Sprache der Route", () => {
  const model = data.models.find((candidate) => candidate.input > 0);
  const plan = data.plans.find((candidate) => candidate.id === "goat");
  assert.ok(model && plan);
  const german = cheerio.load(ssr.renderAllowancePage("de", [model], data.plans, plan.id)).text();
  const english = cheerio.load(ssr.renderAllowancePage("en", [model], data.plans, plan.id)).text();

  assert.match(german, /Vergleich der geschätzten Requests/);
  assert.doesNotMatch(german, /gesamten gemeinsamen Monatsguthabens/);
  assert.match(german, /bei Go, Max und Team Pro wird das gesamte Planguthaben für ein Modell angenommen/);
  assert.match(german, /Balkenlänge ist relativ/);
  assert.doesNotMatch(german, /Provider|Pay-as-you-go/);
  assert.match(german, /GOAT und Pro zeigen Modell-Allowances/);
  assert.doesNotMatch(german, /Compare estimated requests|model-specific monthly usage|Bar length is relative/);

  assert.match(english, /Compare estimated requests/);
  assert.doesNotMatch(english, /full shared monthly pool/);
  assert.match(english, /for Go, Max and Team Pro, estimates assume the full plan credit pool is used on one model/);
  assert.match(english, /Bar length is relative/);
  assert.doesNotMatch(english, /Provider|Pay-as-you-go/);
  assert.match(english, /GOAT and Pro show model allowances/);
  assert.doesNotMatch(english, /Vergleich der geschätzten Requests|modellbezogenen monatlichen Nutzung|Balkenlänge ist relativ/);

  const invalidProviderSelection = cheerio
    .load(ssr.renderAllowancePage("en", [model], data.plans, "provider"))
    .text();
  assert.doesNotMatch(invalidProviderSelection, /Provider|Pay as you go/);
  assert.match(invalidProviderSelection, /Sorted by estimated requests on the Go plan/);
});

test("Allowance page marks free models and infinite requests dark green", () => {
  const freeModel = data.models.find((candidate) =>
    candidate.deal?.free === true ||
    ((candidate.input ?? 0) === 0 && (candidate.output ?? 0) === 0 && (candidate.cachedRead ?? 0) === 0)
  );
  const plan = data.plans.find((candidate) => candidate.id === "go");
  assert.ok(freeModel && plan);
  const html = ssr.renderAllowancePage("en", [freeModel], data.plans, plan.id);
  const text = cheerio.load(html).text();
  assert.match(text, /free/i);
  assert.match(text, /∞ Requests\/month/);
  assert.doesNotMatch(text, /\$\d/);
  assert.match(html, /bg-green-800/);
  assert.match(html, /text-green-50/);
});

test("Team Pro share links round-trip without falling back to GOAT", () => {
  const config = {
    plan: "team-pro",
    metric: "requests",
    topN: 5,
    basis: "full",
    theme: "dark",
    size: "og",
    brand: true,
    timestamp: true,
  };
  const params = ssr.shareToParams(config);
  assert.equal(ssr.shareFromParams(params).plan, "team-pro");
});
