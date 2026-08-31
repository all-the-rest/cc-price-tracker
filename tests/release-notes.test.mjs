import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  renderReleaseNotesForEntry,
  renderChange,
  pricingLine,
  fmtPrice,
  fmtCaps,
  fmtPlanInfo,
  PRICE_FIELD_NAMES,
  planLabel,
} from "../scripts/release-notes.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Baut eine vollständige Release-Notes-Blöcke aus einem einzelnen Change-Satz.
 * Kopfzeilen (Titel/Intro) sind Bestandteil von `renderReleaseNotesForEntry`,
 * die eigentliche Zeile je Change kommt aus `renderChange`.
 */
const notesFor = (date, changes, id = `${date}T10-00-00Z`) =>
  renderReleaseNotesForEntry({ id, date, changes });

const full = (date, changes) => notesFor(date, changes);

// ---------------------------------------------------------------------------
// Modell-Events
// ---------------------------------------------------------------------------

test("release notes: model_added enthält Preise UND Usage-Limit (Allowances), was-Preis", () => {
  const notes = full("2026-08-28", [
    {
      type: "model_added",
      model: "tencent/hy4-preview",
      pricing: {
        input: 0.834,
        output: 2.501,
        cachedRead: 0.042,
        cachedWrite: null,
        allowances: { goat: 20, pro: 30 },
      },
      listPricing: null,
    },
  ]);
  assert.equal(
    notes,
    [
      "# Price Update 2026-08-28",
      "",
      "Price changes for Command Code on **2026-08-28**:",
      "",
      "- **tencent/hy4-preview** — added ($0.834 / $2.50 / $0.042 @ GOAT 20 / Pro 30)",
    ].join("\n")
  );

  // model_added mit Deal-Referenzpreis → „was …“ mit eigenem Usage-Limit
  const withList = full("2026-08-28", [
    {
      type: "model_added",
      model: "glm-5.2",
      pricing: {
        input: 0.3,
        output: 1.2,
        cachedRead: 0.06,
        cachedWrite: null,
        allowances: { goat: 20, pro: 30 },
      },
      listPricing: {
        input: 0.3,
        output: 1.2,
        cachedRead: 0.06,
        cachedWrite: null,
        allowances: { goat: 70, pro: 80 },
      },
    },
  ]);
  assert.match(
    withList,
    /- \*\*glm-5\.2\*\* — added \(\$0\.3 \/ \$1\.20 \/ \$0\.06 @ GOAT 20 \/ Pro 30\) \(was \$0\.3 \/ \$1\.20 \/ \$0\.06 @ GOAT 70 \/ Pro 80\)/
  );
});

test("release notes: model_removed enthält Tage", () => {
  assert.equal(
    renderChange({ type: "model_removed", model: "glm-5.2", days: 14 }),
    "- **glm-5.2** — removed (was available 14 days)"
  );
});

test("release notes: price_changed zeigt from/to mit Allowances und Feldnamen", () => {
  assert.equal(
    renderChange({
      type: "price_changed",
      model: "gemini-3.7-flash",
      from: {
        input: 0.75,
        output: 3.75,
        cachedRead: 0.075,
        cachedWrite: 0.04167,
        allowances: { goat: 20, pro: 30 },
      },
      to: {
        input: 1.5,
        output: 7.5,
        cachedRead: 0.15,
        cachedWrite: 0.08334,
        allowances: { goat: 40, pro: 50 },
      },
      fields: ["input", "output", "cachedRead", "cachedWrite"],
    }),
    "- **gemini-3.7-flash** — price change (Input, Output, Cached Read, Cached Write): " +
      "$0.75 / $3.75 / $0.075 / $0.04167 @ GOAT 20 / Pro 30 → " +
      "$1.50 / $7.50 / $0.15 / $0.08334 @ GOAT 40 / Pro 50"
  );
});

test("release notes: price_changed ohne Allowances (alle null) hängt kein @ an", () => {
  assert.equal(
    renderChange({
      type: "price_changed",
      model: "m",
      from: { input: 0.1, output: 0.2, cachedRead: null, cachedWrite: null, allowances: { goat: null, pro: null } },
      to: { input: 0.2, output: 0.4, cachedRead: null, cachedWrite: null, allowances: { goat: null, pro: null } },
      fields: ["input"],
    }),
    "- **m** — price change (Input): $0.1 / $0.2 / – → $0.2 / $0.4 / –"
  );
});

test("release notes: allowance_changed listet alle Pläne", () => {
  assert.equal(
    renderChange({
      type: "allowance_changed",
      model: "gemini-3.7-flash",
      plans: [
        { plan: "goat", from: 20, to: 40 },
        { plan: "pro", from: 30, to: 50 },
      ],
    }),
    "- **gemini-3.7-flash** — allowance: goat $20 → $40, pro $30 → $50"
  );
});

test("release notes: capabilities_changed zeigt From/To-Fähigkeiten", () => {
  assert.equal(
    renderChange({
      type: "capabilities_changed",
      model: "deepseek-v4-pro",
      from: null,
      to: { input: ["text"], output: ["text"], reasoning: true, toolCall: true },
    }),
    "- **deepseek-v4-pro** — capabilities: – → in:text out:text reasoning+tool"
  );
});

test("release notes: free_added / free_removed (mit Tagen + verfügbar seit)", () => {
  assert.equal(
    renderChange({ type: "free_added", model: "ox-alpha" }),
    "- **ox-alpha** — new free model"
  );
  assert.equal(
    renderChange({ type: "free_removed", model: "ox-alpha", availableFrom: "2026-08-21", until: "2026-08-26" }),
    "- **ox-alpha** — free model removed (was available 5 days, since 2026-08-21)"
  );
});

// ---------------------------------------------------------------------------
// Plan-Events
// ---------------------------------------------------------------------------

test("release notes: plan_added / plan_removed mit Plan-Info + API access", () => {
  assert.equal(
    renderChange({
      type: "plan_added",
      plan: "max10",
      to: { priceMonthly: 100, creditsMonthly: 150, requestEstimate: 230000, apiAccess: true },
    }),
    "- **Plan Max 10×** — added ($100.00/mo · 150 credits · ~230000 requests, API access: yes)"
  );
  assert.equal(
    renderChange({
      type: "plan_removed",
      plan: "goat",
      from: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000, apiAccess: false },
    }),
    "- **Plan GOAT** — removed ($10.00/mo · 70 credits · ~75000 requests, API access: no)"
  );
});

test("release notes: plan_pricing_changed zeigt from → to", () => {
  assert.equal(
    renderChange({
      type: "plan_pricing_changed",
      plan: "goat",
      from: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000 },
      to: { priceMonthly: 12, creditsMonthly: 70, requestEstimate: 75000 },
    }),
    "- **Plan GOAT** — pricing: $10.00/mo · 70 credits · ~75000 requests → $12.00/mo · 70 credits · ~75000 requests"
  );
});

test("release notes: api_access_changed zeigt yes/no-Richtung", () => {
  assert.equal(
    renderChange({ type: "api_access_changed", plan: "go", from: true, to: false }),
    "- **Plan Go** — API access: yes → no"
  );
});

test("release notes: text-Event rendert englischen Text", () => {
  assert.equal(
    renderChange({ type: "text", lang: { en: "Initial version", de: "Initialversion" } }),
    "- Initial version"
  );
});

// ---------------------------------------------------------------------------
// Release-Text muss den Changelog-Eintrag vollständig abdecken (echte Daten)
// ---------------------------------------------------------------------------

/** Fragment-Checks pro Change-Typ: Der Release-Text muss alle Kern-Infos enthalten. */
function assertCovered(notes, c) {
  const has = (s) =>
    assert.ok(notes.includes(s), `${c.type}: "${s}" fehlt im Release-Text:\n${notes}`);
  switch (c.type) {
    case "text":
      has(c.lang.en);
      return;
    case "model_added":
      has(c.model);
      has(pricingLine(c.pricing));
      if (c.listPricing) has(pricingLine(c.listPricing));
      return;
    case "model_removed":
      has(c.model);
      has(String(c.days));
      return;
    case "price_changed":
      has(c.model);
      has(pricingLine(c.from));
      has(pricingLine(c.to));
      for (const f of c.fields) has(PRICE_FIELD_NAMES[f] ?? f);
      return;
    case "allowance_changed":
      has(c.model);
      for (const p of c.plans) has(`${p.plan} $${p.from} → $${p.to}`);
      return;
    case "capabilities_changed":
      has(c.model);
      if (c.from) has(fmtCaps(c.from));
      if (c.to) has(fmtCaps(c.to));
      return;
    case "free_added":
      has(c.model);
      return;
    case "free_removed": {
      has(c.model);
      has(c.availableFrom);
      const days = Math.max(
        0,
        Math.round((Date.parse(c.until) - Date.parse(c.availableFrom)) / 86_400_000)
      );
      has(String(days));
      return;
    }
    case "plan_added":
      has(`Plan ${planLabel(c.plan)}`);
      has(fmtPlanInfo(c.to));
      has(`API access: ${c.to.apiAccess ? "yes" : "no"}`);
      return;
    case "plan_removed":
      has(`Plan ${planLabel(c.plan)}`);
      has(fmtPlanInfo(c.from));
      has(`API access: ${c.from.apiAccess ? "yes" : "no"}`);
      return;
    case "plan_pricing_changed":
      has(`Plan ${planLabel(c.plan)}`);
      has(fmtPlanInfo(c.from));
      has(fmtPlanInfo(c.to));
      return;
    case "api_access_changed":
      has(`Plan ${planLabel(c.plan)}`);
      has(`API access: ${c.from ? "yes" : "no"} → ${c.to ? "yes" : "no"}`);
      return;
  }
}

test("CHANGELOG.json: Release-Text deckt jeden Change vollständig ab (release text == changelog entry)", () => {
  const changelog = JSON.parse(
    readFileSync(join(ROOT, "..", "CHANGELOG.json"), "utf8")
  );
  assert.ok(changelog.entries.length > 0, "Changelog darf nicht leer sein");
  for (const entry of changelog.entries) {
    const notes = renderReleaseNotesForEntry(entry);
    assert.ok(notes, `entry ${entry.id}: Release-Notes dürfen nicht null sein`);
    // Kein Change darf ins Default-Fallback (JSON-Dump) fallen.
    assert.doesNotMatch(notes, /- [a-z_]+: \{/, `entry ${entry.id}: unbekannter Change-Typ`);
    // Pro Change genau eine Bullet-Zeile (Kopf: Titel, Blank, Intro, Blank).
    const bullets = notes.split("\n").filter((l) => l.startsWith("- "));
    assert.equal(
      bullets.length,
      entry.changes.length,
      `entry ${entry.id}: Bullet-Anzahl ≠ Changes-Anzahl`
    );
    for (const c of entry.changes) assertCovered(notes, c);
  }
});

test("renderChange: jeder Schema-Change-Typ hat einen Handler (kein JSON-Dump-Fallback)", () => {
  const pricing = (allowances = { goat: 20, pro: 30 }) => ({
    input: 0.3,
    output: 1.2,
    cachedRead: 0.06,
    cachedWrite: null,
    allowances,
  });
  const samples = [
    { type: "text", lang: { en: "Initial version", de: "Initialversion" } },
    { type: "model_added", model: "glm-5.2", pricing: pricing(), listPricing: null },
    { type: "model_removed", model: "glm-5.2", days: 14 },
    {
      type: "price_changed",
      model: "glm-5.2",
      from: pricing(),
      to: pricing(),
      fields: ["input"],
    },
    {
      type: "allowance_changed",
      model: "glm-5.2",
      plans: [{ plan: "goat", from: 20, to: 40 }],
    },
    {
      type: "capabilities_changed",
      model: "glm-5.2",
      from: null,
      to: { input: ["text"], output: ["text"], reasoning: true, toolCall: true },
    },
    { type: "free_added", model: "ox-alpha" },
    { type: "free_removed", model: "ox-alpha", availableFrom: "2026-08-21", until: "2026-08-26" },
    {
      type: "plan_added",
      plan: "max10",
      to: { priceMonthly: 100, creditsMonthly: 150, requestEstimate: 230000, apiAccess: true },
    },
    {
      type: "plan_removed",
      plan: "goat",
      from: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000, apiAccess: false },
    },
    {
      type: "plan_pricing_changed",
      plan: "goat",
      from: { priceMonthly: 10, creditsMonthly: 70, requestEstimate: 75000 },
      to: { priceMonthly: 12, creditsMonthly: 70, requestEstimate: 75000 },
    },
    { type: "api_access_changed", plan: "go", from: true, to: false },
  ];
  for (const c of samples) {
    const line = renderChange(c);
    assert.ok(
      !line.startsWith(`- ${c.type}: {`),
      `renderChange fällt für "${c.type}" in den JSON-Fallback zurück: ${line}`
    );
  }
});

test("fmtPrice/pricingLine: Nutzungsformatierung bleibt stabil", () => {
  assert.equal(fmtPrice(0.834), "$0.834");
  assert.equal(fmtPrice(2.501), "$2.50");
  assert.equal(fmtPrice(null), "–");
  assert.equal(
    pricingLine({
      input: 0.834,
      output: 2.501,
      cachedRead: 0.042,
      cachedWrite: null,
      allowances: { goat: 20, pro: 30 },
    }),
    "$0.834 / $2.50 / $0.042 @ GOAT 20 / Pro 30"
  );
});