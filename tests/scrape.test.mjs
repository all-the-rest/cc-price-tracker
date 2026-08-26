import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  extractRscPayload,
  extractCatalog,
  extractArray,
  normalizeDate,
  buildModels,
  parsePeakWindows,
  parsePlanTables,
  planApiAccessFromHtml,
  mapAvailability,
  buildFreeModels,
  mergeChanges,
  upsertChangelogJson,
  computeModelChanges,
  computePlanChanges,
  computeFreeChanges,
  buildChanges,
  enrichCapabilities,
  toCapabilities,
  capsFallback,
  validateSnapshot,
  validateChangelog,
  normalizeChangelogIds,
  modelKey,
  validatePlanBaselines,
} from "../scripts/scrape.mjs";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const pricingHtml = readFileSync(join(fixtures, "pricing-limits.html"), "utf8");
const goHtml = readFileSync(join(fixtures, "plans-go.html"), "utf8");

const { rows, billingModels } = extractCatalog(pricingHtml);
const today = "2026-08-15";
const { models, peakHours } = buildModels(rows, billingModels, today);
const $ = cheerio.load(pricingHtml);
const plans = parsePlanTables($);

test("extractCatalog: 58 rows + 54 Billing-Modelle aus der RSC-Payload", () => {
  assert.equal(rows.length, 58);
  assert.equal(billingModels.length, 54);
  // 56 Modelle + 2 Peak-Splits (DeepSeek V4 Pro/Flash je off-peak + peak)
  assert.equal(models.length, 58);
});

test("parsePeakWindows: parst UTC-Bereiche", () => {
  assert.deepEqual(parsePeakWindows("01–04 & 06–10 UTC"), [[1, 4], [6, 10]]);
  assert.deepEqual(parsePeakWindows("09-17 UTC"), [[9, 17]]);
  assert.throws(() => parsePeakWindows(""));
  assert.throws(() => parsePeakWindows("04-01 UTC"));
});

test("buildModels: peakHours-Map nach normalisiertem Namen", () => {
  assert.deepEqual(peakHours["deepseekv4pro(latest)"], [[1, 4], [6, 10]]);
  assert.deepEqual(peakHours["deepseekv4flash(latest)"], [[1, 4], [6, 10]]);
});

test("extractRscPayload: leere Seite wirft", () => {
  assert.throws(() => extractRscPayload("<html><body>no payload</body></html>"));
});

test("extractArray: fehlender Marker wirft", () => {
  assert.throws(() => extractArray(extractRscPayload(pricingHtml), '"gibtsnicht"'));
});

test("buildModels: DeepSeek V4 Pro Peak/Off-Peak Split (Deal ersetzt)", () => {
  const off = models.find((m) => m.id === "deepseek-v4-pro");
  assert.equal(off.name, "DeepSeek V4 Pro (latest)");
  assert.equal(off.tier, "off-peak");
  assert.equal(off.input, 0.66);
  assert.equal(off.output, 1.98);
  assert.equal(off.cachedRead, 0.022);
  assert.equal(off.listInput, null);
  assert.equal(off.deal, null);
  assert.deepEqual(off.allowances, { goat: 20, pro: 30 });

  const peak = models.find((m) => m.id === "deepseek-v4-pro-peak");
  assert.equal(peak.name, "DeepSeek V4 Pro (latest)");
  assert.equal(peak.tier, "peak");
  assert.equal(peak.input, 1.32);
  assert.equal(peak.output, 3.96);
  assert.equal(peak.cachedRead, 0.044);
  assert.equal(peak.deal, null);
});

test("buildModels: MiniMax M3 Deal was/now + Multi-Tier", () => {
  const mm = models.find((m) => m.id === "minimax-m3");
  assert.equal(mm.input, 0.3);
  assert.equal(mm.output, 1.2);
  assert.equal(mm.listInput, 0.6);
  assert.equal(mm.listOutput, 2.4);
  assert.equal(mm.deal.discountPercent, 50);
  assert.equal(mm.tier, "Standard / Long context");
  // String-Referenz-ListRates im zweiten Tier crasht nicht → tiers[0] zählt
  assert.equal(mm.listCachedRead, 0.12);
});

test("buildModels: Allowances aus dem Billing-JOIN", () => {
  const glm = models.find((m) => m.id === "glm-5.2");
  assert.deepEqual(glm.allowances, { goat: 70, pro: 80 });
  assert.equal(glm.provider, "Z.ai");
  const ds = models.find((m) => m.id === "deepseek-v4-pro");
  assert.deepEqual(ds.allowances, { goat: 20, pro: 30 });
  const mm = models.find((m) => m.id === "minimax-m3");
  assert.deepEqual(mm.allowances, { goat: 47, pro: 57 });
  // Ohne Billing-Eintrag → null
  const laguna = models.find((m) => m.id === "laguna-s-2.1-free");
  assert.equal(laguna.provider, null);
  assert.deepEqual(laguna.allowances, { goat: null, pro: null });
});

test("buildModels: deprecated/unverfügbare Modelle raus", () => {
  assert.ok(!models.find((m) => m.id === "ling-3.0-flash-free"));
  assert.ok(!models.find((m) => m.id === "claude-sonnet-4-5"));
  // claude-fable-5 nur auf Provider/Max/Team
  const fable = models.find((m) => m.id === "claude-fable-5");
  assert.deepEqual(fable.availability, {
    go: false,
    goat: false,
    pro: false,
    provider: true,
    max: true,
    team: true,
  });
});

test("mapAvailability: explizite Keys gewinnen, all ist Fallback", () => {
  assert.deepEqual(mapAvailability({ "individual-go": false, "individual-goat": true, all: true }), {
    go: false,
    goat: true,
    pro: true,
    provider: true,
    max: true,
    team: true,
  });
  assert.deepEqual(mapAvailability({ "individual-go": false, "individual-goat": false }), {
    go: false,
    goat: false,
    pro: false,
    provider: false,
    max: false,
    team: false,
  });
  assert.deepEqual(mapAvailability({ all: true }), {
    go: true,
    goat: true,
    pro: true,
    provider: true,
    max: true,
    team: true,
  });
});

test("buildModels: abgelaufener Deal wird verworfen (Qwen 3.7 Max)", () => {
  const qw = models.find((m) => m.id === "qwen-3.7-max");
  assert.equal(qw.deal, null);
  assert.equal(qw.input, 5.0);
  assert.equal(qw.output, 15.0);
  assert.equal(qw.cachedRead, 1.0);
  assert.equal(qw.cachedWrite, 6.26);
  assert.equal(qw.listInput, null);
});

test("normalizeDate: ISO mit Uhrzeit → YYYY-MM-DD", () => {
  assert.equal(normalizeDate("2026-12-31T23:59:59Z"), "2026-12-31");
  assert.equal(normalizeDate("2026-06-22"), "2026-06-22");
  assert.equal(normalizeDate(null), null);
  assert.equal(normalizeDate("gibtsnicht"), null);
  const gemini = models.find((m) => m.id === "gemini-3.7-flash");
  assert.equal(gemini.deal.expires, "2026-12-31");
  assert.equal(gemini.deal.revertNote, null);
});

test("buildFreeModels: Laguna S 2.1 ist drin, Ling (deprecated) nicht", () => {
  const free = buildFreeModels(rows, [], today);
  assert.deepEqual(
    free.map((f) => f.id),
    ["laguna-s-2.1-free"]
  );
  const laguna = free[0];
  assert.equal(laguna.availableFrom, today);
  assert.equal(laguna.until, null);
  assert.equal(laguna.note, "Free while capacity lasts.");
});

test("buildFreeModels: übernimmt availableFrom aus dem vorherigen Lauf", () => {
  const free = buildFreeModels(rows, [{ id: "laguna-s-2.1-free", availableFrom: "2026-08-01" }], today);
  assert.equal(free[0].availableFrom, "2026-08-01");
});

test("planApiAccessFromHtml: nur die Go-Seite hat keinen API-Zugang", () => {
  assert.equal(planApiAccessFromHtml(goHtml), false);
  assert.equal(
    planApiAccessFromHtml("<p>Every plan except the Go plan has API access</p>"),
    true
  );
  assert.equal(planApiAccessFromHtml(""), true);
});

test("parsePlanTables: 6 Individual-Pläne mit Preisen/Credits/Requests/Limits", () => {
  assert.equal(plans.length, 6);
  assert.deepEqual(plans.map((p) => p.id), ["go", "goat", "pro", "provider", "max10", "max20"]);

  const go = plans.find((p) => p.id === "go");
  assert.equal(go.name, "Go");
  assert.equal(go.priceMonthly, 1);
  assert.equal(go.creditsMonthly, 10);
  assert.equal(go.requestEstimate, 15000);
  assert.equal(go.limits.h5, 3);
  assert.equal(go.limits.weekly, 6);
  assert.equal(go.limits.monthly, 10);
  assert.equal(go.defaultAllowance, null);
  assert.equal(go.modelsIncluded, "Open models + some premium");

  const goat = plans.find((p) => p.id === "goat");
  assert.equal(goat.priceMonthly, 10);
  assert.equal(goat.creditsMonthly, 70);
  assert.equal(goat.requestEstimate, 75000);
  assert.equal(goat.limits.h5, 14);
  assert.equal(goat.limits.weekly, 35);
  assert.equal(goat.defaultAllowance, 20);

  const pro = plans.find((p) => p.id === "pro");
  assert.equal(pro.priceMonthly, 20);
  assert.equal(pro.creditsMonthly, 80);
  assert.equal(pro.requestEstimate, 100000);
  assert.equal(pro.limits.h5, 16);
  assert.equal(pro.defaultAllowance, 30);

  const provider = plans.find((p) => p.id === "provider");
  assert.equal(provider.priceMonthly, 15);
  assert.equal(provider.creditsMonthly, null);
  assert.equal(provider.requestEstimate, null);
  assert.equal(provider.limits.h5, null);
  assert.equal(provider.limits.weekly, null);
  assert.equal(provider.limits.monthly, null);

  const max10 = plans.find((p) => p.id === "max10");
  assert.equal(max10.priceMonthly, 100);
  assert.equal(max10.creditsMonthly, 150);
  assert.equal(max10.requestEstimate, 230000);
  assert.equal(max10.limits.h5, 45);
  assert.equal(max10.limits.weekly, 90);

  const max20 = plans.find((p) => p.id === "max20");
  assert.equal(max20.priceMonthly, 200);
  assert.equal(max20.creditsMonthly, 300);
  assert.equal(max20.requestEstimate, 370000);
  assert.equal(max20.limits.h5, 90);
  assert.equal(max20.limits.weekly, 180);
});

test("validatePlanBaselines: bekannte Pläne passieren, neuer Plan ohne scrapebare Baseline schlägt fehl", () => {
  const baselines = {
    go: { creditsIncluded: 10, advertisedPrice: 1 },
    goat: { creditsIncluded: 70, advertisedPrice: 10 },
    pro: { creditsIncluded: 80, advertisedPrice: 20 },
    provider: null,
    max10: { creditsIncluded: 150, advertisedPrice: 100 },
    max20: { creditsIncluded: 300, advertisedPrice: 200 },
  };
  assert.deepEqual(validatePlanBaselines(plans, baselines), plans);

  const scrapable = { id: "max40", name: "Max 40×", priceMonthly: 400, creditsMonthly: 600 };
  const nonScrapable = { id: "ultra", name: "Ultra", priceMonthly: 500, creditsMonthly: null };
  assert.deepEqual(validatePlanBaselines([scrapable], baselines), [scrapable]);
  assert.throws(
    () => validatePlanBaselines([nonScrapable], baselines),
    /neuer Plan "ultra".*Baseline nicht scrapbar/
  );
});

test("toCapabilities: filtert auf gültige Modalitäten", () => {
  assert.deepEqual(
    toCapabilities({
      modalities: { input: ["text", "image", "video", "audio", "pdf", "xyz"], output: ["text", "audio"] },
      reasoning: true,
      tool_call: true,
    }),
    {
      input: ["text", "image", "video", "audio", "pdf"],
      output: ["text", "audio"],
      reasoning: true,
      toolCall: true,
    }
  );
  assert.equal(toCapabilities(null), null);
});

test("capsFallback: aus dem CC-caps-Objekt", () => {
  assert.deepEqual(capsFallback({ text: true, vision: true, reasoning: true }), {
    input: ["text", "image"],
    output: ["text"],
    reasoning: true,
    toolCall: false,
  });
  assert.deepEqual(capsFallback({ text: true, vision: false, reasoning: false }), {
    input: ["text"],
    output: ["text"],
    reasoning: false,
    toolCall: false,
  });
});

test("enrichCapabilities: models.dev-Treffer + Override + Fallback", () => {
  const oc = {
    "deepseek-v4-pro": {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      reasoning: true,
      tool_call: true,
      modalities: { input: ["text"], output: ["text"] },
    },
  };
  const md = {
    "zhipuai/glm-5.2": {
      id: "zhipuai/glm-5.2",
      name: "GLM-5.2",
      reasoning: true,
      tool_call: true,
      modalities: { input: ["text"], output: ["text"] },
    },
  };
  const capsById = new Map(rows.map((r) => [r.id, r.caps]));
  const targets = [
    models.find((m) => m.id === "deepseek-v4-pro"),
    models.find((m) => m.id === "glm-5.2-fast"),
    models.find((m) => m.id === "tencent/hy3-paid"),
  ];
  enrichCapabilities(targets, oc, md, capsById);
  assert.deepEqual(targets[0].capabilities, {
    input: ["text"],
    output: ["text"],
    reasoning: true,
    toolCall: true,
  });
  // Override glm5.2fast → zhipuai/glm-5.2
  assert.equal(targets[1].capabilities.reasoning, true);
  assert.equal(targets[1].capabilities.toolCall, true);
  // Kein models.dev-Treffer → Fallback aus CC-caps (toolCall false)
  assert.deepEqual(targets[2].capabilities, {
    input: ["text"],
    output: ["text"],
    reasoning: true,
    toolCall: false,
  });
});

test("computeModelChanges: model_added mit pricing + listPricing", () => {
  const model = models.find((m) => m.id === "deepseek-v4-pro");
  const changes = computeModelChanges([], [model]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, "model_added");
  assert.equal(changes[0].model, "deepseek-v4-pro");
  assert.deepEqual(changes[0].pricing, {
    input: 0.66,
    output: 1.98,
    cachedRead: 0.022,
    cachedWrite: null,
    allowances: { goat: 20, pro: 30 },
  });
  assert.equal(changes[0].listPricing, null);
  // Modell ohne Deal → listPricing null
  const noDeal = models.find((m) => m.id === "grok-4.6");
  const changesNoDeal = computeModelChanges([], [noDeal]);
  assert.equal(changesNoDeal[0].listPricing, null);
});

test("computeModelChanges: price_changed + allowance_changed (no deal_changed)", () => {
  const glm = models.find((m) => m.id === "glm-5.2");
  const ds = models.find((m) => m.id === "minimax-m3");
  const next = [
    { ...glm, input: 1.2, allowances: { goat: 55, pro: 80 } },
    { ...ds, deal: { ...ds.deal, discountPercent: 60 } },
  ];
  const changes = computeModelChanges([glm, ds], next);
  assert.ok(changes.some((c) => c.type === "price_changed" && c.fields.includes("input")));
  assert.ok(
    changes.some(
      (c) => c.type === "allowance_changed" && c.plans.some((p) => p.plan === "goat" && p.from === 70 && p.to === 55)
    )
  );
  assert.ok(!changes.some((c) => c.type === "allowance_changed" && c.plans.some((p) => p.plan === "pro")));
  // Deal-Änderungen ohne Preisänderung erzeugen kein eigenes Event
  assert.ok(!changes.some((c) => c.type === "deal_changed"));
  assert.ok(!changes.some((c) => c.model === "minimax-m3"));
});

test("computeModelChanges: goat+pro Änderung wird zu EINEM allowance_changed (alle Pläne in einer Zeile)", () => {
  const glm = models.find((m) => m.id === "glm-5.2");
  const before = { ...glm, allowances: { goat: 70, pro: 80 } };
  const after = { ...glm, allowances: { goat: 55, pro: 65 } };
  const changes = computeModelChanges([before], [after]);
  const ac = changes.filter((c) => c.type === "allowance_changed");
  assert.equal(ac.length, 1);
  assert.deepEqual(ac[0].plans, [
    { plan: "goat", from: 70, to: 55 },
    { plan: "pro", from: 80, to: 65 },
  ]);
});

test("computeModelChanges: model_removed mit days aus firstSeen", () => {
  const glm = models.find((m) => m.id === "glm-5.2");
  const changes = computeModelChanges([glm], [], new Map([["glm-5.2", "2026-08-01"]]), today);
  assert.deepEqual(changes, [{ type: "model_removed", model: "glm-5.2", days: 14 }]);
});

test("computePlanChanges: plan_added / plan_pricing_changed / api_access_changed", () => {
  const goat = { ...plans.find((p) => p.id === "goat"), apiAccess: true, apiAccessSourceUrl: "https://x" };
  const nextGoat = { ...goat, priceMonthly: 12 };
  const nextGoatNoApi = { ...goat, apiAccess: false };
  const changes = computePlanChanges([], [goat]);
  assert.deepEqual(changes, [
    {
      type: "plan_added",
      plan: "goat",
      to: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000, apiAccess: true },
    },
  ]);
  const changed = computePlanChanges([goat], [nextGoat]);
  assert.equal(changed.length, 1);
  assert.deepEqual(changed[0], {
    type: "plan_pricing_changed",
    plan: "goat",
    from: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000 },
    to: { priceMonthly: 12, creditsMonthly: 70, requestEstimate: 75000 },
  });
  const api = computePlanChanges([goat], [nextGoatNoApi]);
  assert.deepEqual(api, [
    { type: "api_access_changed", plan: "goat", from: true, to: false },
  ]);
});

test("computeFreeChanges: free_added/free_removed", () => {
  const prev = [{ id: "laguna-s-2.1-free", availableFrom: "2026-08-01" }];
  const added = computeFreeChanges([], prev, today);
  assert.deepEqual(added, [{ type: "free_added", model: "laguna-s-2.1-free" }]);
  const removed = computeFreeChanges(prev, [], today);
  assert.deepEqual(removed, [
    { type: "free_removed", model: "laguna-s-2.1-free", availableFrom: "2026-08-01", until: today },
  ]);
});

test("buildChanges: identische Snapshots → keine Events; ohne Vorgänger → []", () => {
  const snap = { models, plans, freeModels: [] };
  assert.deepEqual(buildChanges(snap, snap, today), []);
  assert.deepEqual(buildChanges(null, snap, today), []);
});

test("buildChanges: Gratis-Modell → nur free_added/free_removed, kein doppeltes model_added/-removed", () => {
  const freeModel = {
    id: "laguna-s-2.1-free",
    name: "Laguna S 2.1 Free",
    input: 0,
    output: 0,
    cachedRead: 0,
    cachedWrite: null,
  };
  const empty = { models: [], plans: [], freeModels: [] };
  const withFree = { models: [freeModel], plans: [], freeModels: [{ id: "laguna-s-2.1-free" }] };
  assert.deepEqual(buildChanges(empty, withFree, today), [{ type: "free_added", model: "laguna-s-2.1-free" }]);

  const gone = { models: [freeModel], plans: [], freeModels: [{ id: "laguna-s-2.1-free", availableFrom: "2026-08-01" }] };
  assert.deepEqual(buildChanges(gone, empty, today), [
    { type: "free_removed", model: "laguna-s-2.1-free", availableFrom: "2026-08-01", until: today },
  ]);
});

test("mergeChanges: allowance_changed wird pro Modell gemerged (alle Pläne in einem Event)", () => {
  const a = {
    type: "allowance_changed",
    model: "glm-5.2",
    plans: [
      { plan: "goat", from: 70, to: 55 },
      { plan: "pro", from: 80, to: 70 },
    ],
  };
  const b = { type: "allowance_changed", model: "glm-5.2", plans: [{ plan: "goat", from: 55, to: 60 }] };
  assert.deepEqual(mergeChanges([a], [b]), [b]);
  assert.deepEqual(mergeChanges([], [a]), [a]);
});

test("upsertChangelogJson: Eintrag derselben id wird gemerged, leere entfernt", () => {
  const existing = {
    entries: [
      { id: "2026-08-15T10-00-00Z", date: "2026-08-15", changes: [{ type: "free_added", model: "laguna-s-2.1-free" }] },
      { id: "2026-08-10", date: "2026-08-10", changes: [] },
    ],
  };
  const result = upsertChangelogJson(existing, "2026-08-15T10-00-00Z", "2026-08-15", [
    { type: "free_removed", model: "laguna-s-2.1-free", availableFrom: "2026-08-01", until: today },
  ]);
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].id, "2026-08-15T10-00-00Z");
  assert.equal(result.entries[0].date, "2026-08-15");
  assert.deepEqual(
    result.entries[0].changes.map((c) => c.type).sort(),
    ["free_added", "free_removed"]
  );
});

test("normalizeChangelogIds: weist fehlendes id = date zu", () => {
  const out = normalizeChangelogIds({ entries: [{ date: "2026-08-15", changes: [{ type: "text", lang: { en: "x" } }] }] });
  assert.equal(out.entries[0].id, "2026-08-15");
});

test("validateSnapshot: vollständiger Snapshot aus den Fixtures ist valide", () => {
  const snap = {
    fetchedAt: "2026-08-15T00:00:00.000Z",
    sourceUrl: "https://commandcode.ai/docs/resources/pricing-limits",
    plansSourceUrl: "https://commandcode.ai/docs/resources/pricing-limits",
    capabilitiesSourceUrl: "https://models.dev/api.json",
    sourceLang: "en",
    plans: plans.map((p) => ({
      ...p,
      apiAccess: p.id !== "go",
      apiAccessSourceUrl: p.id === "provider" ? "https://commandcode.ai/docs/resources/pricing-limits" : "https://commandcode.ai/docs/plans/" + p.id,
    })),
    models,
    freeModels: buildFreeModels(rows, [], today),
    peakHours,
  };
  assert.doesNotThrow(() => validateSnapshot(snap));
  const broken = { ...snap, models: [{ ...models[0], pattern: null }] };
  assert.throws(() => validateSnapshot(broken));
});

test("validateChangelog: plan-aware Events sind valide", () => {
  const changelog = {
    entries: [
      {
        id: today,
        date: today,
        changes: [
          { type: "text", lang: { en: "Initial version", de: "Initialversion" } },
          {
            type: "model_added",
            model: "deepseek-v4-pro",
            pricing: {
              input: 0.435,
              output: 0.87,
              cachedRead: 0.003625,
              cachedWrite: null,
              allowances: { goat: 20, pro: 30 },
            },
            listPricing: {
              input: 1.74,
              output: 3.48,
              cachedRead: 0.0145,
              cachedWrite: null,
              allowances: { goat: null, pro: null },
            },
          },
          {
            type: "model_removed",
            model: "ling-3.0-flash-free",
            days: 3,
          },
          {
            type: "price_changed",
            model: "glm-5.2",
            from: { input: 1.4, output: 4.4, cachedRead: 0.26, cachedWrite: null, allowances: { goat: 70, pro: 80 } },
            to: { input: 1.2, output: 4.4, cachedRead: 0.26, cachedWrite: null, allowances: { goat: 70, pro: 80 } },
            fields: ["input"],
          },
          {
            type: "allowance_changed",
            model: "glm-5.2",
            plans: [{ plan: "goat", from: 70, to: 55 }],
          },
          {
            type: "capabilities_changed",
            model: "deepseek-v4-pro",
            from: null,
            to: { input: ["text"], output: ["text"], reasoning: true, toolCall: true },
          },
          { type: "free_added", model: "laguna-s-2.1-free" },
          { type: "free_removed", model: "a-free", availableFrom: "2026-08-01", until: today },
          {
            type: "plan_added",
            plan: "max10",
            to: { priceMonthly: 100, creditsMonthly: 150, requestEstimate: 230000, apiAccess: true },
          },
          {
            type: "plan_pricing_changed",
            plan: "goat",
            from: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000 },
            to: { priceMonthly: 12, creditsMonthly: 70, requestEstimate: 75000 },
          },
          { type: "api_access_changed", plan: "go", from: true, to: false },
        ],
      },
    ],
  };
  assert.doesNotThrow(() => validateChangelog(changelog));
});

test("validateChangelog: ungültige Events brechen", () => {
  assert.throws(() => validateChangelog({ entries: [{ id: today, date: today, changes: [] }] }));
  assert.throws(() =>
    validateChangelog({
      entries: [{ id: today, date: today, changes: [{ type: "plan_pricing_changed", plan: "goat", from: {}, to: {} }] }],
    })
  );
  assert.throws(() =>
    validateChangelog({
      entries: [{ id: today, date: today, changes: [{ type: "allowance_changed", model: "x", plans: [{ plan: "goat", from: null, to: 55 }] }] }],
    })
  );
});

test("modelKey: id ist der Schlüssel", () => {
  assert.equal(modelKey({ id: "glm-5.2" }), "glm-5.2");
});
