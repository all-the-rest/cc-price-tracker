import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "vite";
import solid from "vite-plugin-solid";
import * as cheerio from "cheerio";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "tests", ".ssr");
const FIELDS = ["input", "output", "cachedRead", "cachedWrite", "cost"];
const BASES = ["list", "full", "paid"];
const TAB_IDS = ["go", "goat", "pro", "max10", "max20"];

let ssr;
let data;

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
  const entry = join(
    OUT_DIR,
    readdirSync(OUT_DIR).find((f) => f.startsWith("ssr-entry."))
  );
  ssr = await import(pathToFileURL(entry).href);
  data = JSON.parse(readFileSync(join(ROOT, "data", "latest.json"), "utf8"));
});

const displayedValue = (m, field, basis, plan) =>
  field === "cost" ? ssr.requestCost(m, basis, plan) : ssr.fieldPrice(m, field, basis, plan);

const extractRowNames = (html) => {
  const $ = cheerio.load(html);
  const names = [];
  $("tbody tr").each((_, tr) => {
    names.push(
      $(tr)
        .find("th span.block")
        .first()
        .text()
        .trim()
    );
  });
  return names;
};

const expectedOrder = (models, field, basis, dir, plan) =>
  [...models]
    .sort((a, b) => {
      const va = displayedValue(a, field, basis, plan);
      const vb = displayedValue(b, field, basis, plan);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * dir;
    })
    .map((m) => m.name);

test("Tab-IDs aus ssr-entry entsprechen den erwarteten Tabs", () => {
  assert.deepEqual(ssr.TAB_PLAN_IDS, TAB_IDS);
});

for (const planId of TAB_IDS) {
  for (const basis of BASES) {
    for (const field of FIELDS) {
      for (const dir of [1, -1]) {
        test(`Sortierung ${planId}/${basis}/${field}/${dir === 1 ? "asc" : "desc"} = Reihenfolge der angezeigten Werte`, () => {
          const plan = data.plans.find((p) => p.id === planId);
          assert.ok(plan, `Plan ${planId} ist im Datensatz`);
          const planModels = data.models.filter((m) => ssr.modelOnPlan(m, planId));
          const expected = expectedOrder(planModels, field, basis, dir, plan);
          const html = ssr.renderPriceTable(planModels, plan, {
            basis,
            sortField: field,
            sortDir: dir,
            lang: "de",
          });
          assert.deepEqual(extractRowNames(html), expected);
        });
      }
    }
  }
}

test("paid-Basis input asc (GOAT): Effektivpreis entscheidet, nicht der rohe Listenpreis (Regression MiMo vs. DeepSeek V4 Flash)", () => {
  const plan = data.plans.find((p) => p.id === "goat");
  const models = data.models.filter((m) => ssr.modelOnPlan(m, "goat"));
  const mimo = models.find((m) => m.id === "mimo-v2.5");
  const flash = models.find((m) => m.id === "deepseek-v4-flash");
  assert.ok(mimo && flash, "MiMo V2.5 und DeepSeek V4 Flash sind im Datensatz");
  assert.ok(flash.input > mimo.input, "Flash hat höheren rohen Input-Preis (0.22 > 0.14)");
  const flashPaid = displayedValue(flash, "input", "paid", plan);
  const mimoPaid = displayedValue(mimo, "input", "paid", plan);
  assert.ok(
    flashPaid < mimoPaid,
    "Effektivpreis (paid) von DeepSeek V4 Flash ist trotz höherem Listenpreis niedriger (höhere Allowance)"
  );
  const names = extractRowNames(
    ssr.renderPriceTable(models, plan, {
      basis: "paid",
      sortField: "input",
      sortDir: 1,
      lang: "de",
    })
  );
  assert.ok(
    names.indexOf("DeepSeek V4 Flash (latest)") < names.indexOf("MiMo V2.5"),
    "DeepSeek V4 Flash muss vor MiMo V2.5 stehen"
  );
});
