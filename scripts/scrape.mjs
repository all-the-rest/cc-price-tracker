#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import { z } from "zod";
import { Models } from "@opencode-ai/models";
import {
  providers as snapshotProviders,
  models as snapshotModels,
} from "@opencode-ai/models/snapshot";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRICING_URL = "https://commandcode.ai/docs/resources/pricing-limits";
const MODELS_DEV_URL = "https://models.dev/api.json";
const SOURCE_LANG = "en";
const FLOAT_TOLERANCE = 1e-9;
const USER_AGENT =
  "cc-price-tracker/0.1.0 (+https://github.com/all-the-rest/cc-price-tracker)";

// Dokumentiertes Standard-Anfragemuster (Input/Cached/Output Tokens pro Anfrage):
// "~800 fresh input tokens, ~50,000 cache-read tokens, and ~125-200 output tokens
// depending on the model family" (commandcode.ai/docs/plans/goat). Output = Range-Mitte.
const REQUEST_PATTERN = { input: 800, cachedRead: 50000, output: 162 };

// API-Zugang je Plan: /docs/plans/{go,goat,pro,max}; max deckt Max 10×/20× ab.
const PLAN_DOC_PAGES = {
  go: "https://commandcode.ai/docs/plans/go",
  goat: "https://commandcode.ai/docs/plans/goat",
  pro: "https://commandcode.ai/docs/plans/pro",
  max: "https://commandcode.ai/docs/plans/max",
};

const PLAN_NAMES = {
  "go": "go",
  "goat": "goat",
  "pro": "pro",
  "provider": "provider",
  "max 10×": "max10",
  "max 20×": "max20",
};

// Dokumentierte Regel für Modelle ohne eigenen Eintrag (pro Plan).
const DEFAULT_ALLOWANCES = { goat: 20, pro: 30 };

const PLAN_BASELINES_PATH = join(ROOT, "src", "plan-baselines.json");

const AVAILABILITY_KEYS = {
  "individual-go": "go",
  "individual-goat": "goat",
  "individual-pro": "pro",
  "individual-provider": "provider",
  "individual-max": "max",
  "individual-ultra": "max",
  "teams-pro": "team",
};

const CAPABILITY_VALUES = ["text", "audio", "image", "video", "pdf"];

const PRICE_FIELDS = ["input", "output", "cachedRead", "cachedWrite"];

class ScrapeError extends Error {}

/**
 * Lädt den models.dev-Katalog (Live-API) und fällt bei Fehlern auf den
 * gebündelten Snapshot zurück.
 */
async function loadModelsDev() {
  try {
    const catalog = await Models.make({
      baseUrl: "https://models.dev",
      headers: { "User-Agent": USER_AGENT },
    }).catalog({ signal: AbortSignal.timeout(10_000) });
    return { providers: catalog.providers, models: catalog.models, source: "live" };
  } catch (err) {
    console.error(
      `[scrape] Warnung: models.dev API nicht erreichbar (${err instanceof Error ? err.message : String(err)}); nutze den gebündelten Snapshot.`
    );
    return { providers: snapshotProviders, models: snapshotModels, source: "snapshot" };
  }
}

const normalizeName = (s) => String(s).toLowerCase().replace(/[\s-]+/g, "");

const near = (a, b) =>
  (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) < FLOAT_TOLERANCE);

/**
 * Extrahiert alle RSC-Flight-Chunks (`self.__next_f.push([1,"…"])`), JSON-parse-t
 * sie und konkateniert sie zu einem einzigen JSON-String.
 */
export function extractRscPayload(html) {
  const chunks = [];
  const re = /self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)/g;
  let match;
  while ((match = re.exec(html)) !== null) {
    try {
      chunks.push(JSON.parse(match[1]));
    } catch (err) {
      throw new ScrapeError(
        `RSC-Chunk unparsebar: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  if (chunks.length === 0) {
    throw new ScrapeError("keine RSC-Flight-Payload-Chunks gefunden");
  }
  return chunks.join("");
}

/**
 * Extrahiert das erste JSON-Array ab dem Marker `"rows":` bzw. `"models":`
 * per Klammer-Tiefenscan (Strings mit Backslash-Escaping werden übersprungen).
 */
export function extractArray(json, marker) {
  const idx = json.indexOf(marker);
  if (idx === -1) throw new ScrapeError(`Marker "${marker}" nicht in der RSC-Payload gefunden`);
  const start = json.indexOf("[", idx);
  if (start === -1) throw new ScrapeError(`kein Array hinter "${marker}"`);
  let depth = 0;
  let end = -1;
  for (let i = start; i < json.length; i++) {
    const ch = json[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) throw new ScrapeError(`Array hinter "${marker}" nicht geschlossen`);
  return JSON.parse(json.slice(start, end + 1));
}

/**
 * Zerlegt das RSC-Payload in den Model-Katalog (`rows`) und die Billing-Modelle
 * (`models`). Strukturänderungen brechen rot ab.
 */
export function extractCatalog(html) {
  const json = extractRscPayload(html);
  const rows = extractArray(json, '"rows"');
  const billingModels = extractArray(json, '"models"');
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ScrapeError(`rows-Array leer oder fehlt (${typeof rows})`);
  }
  if (!Array.isArray(billingModels) || billingModels.length === 0) {
    throw new ScrapeError(`billing-models-Array leer oder fehlt (${typeof billingModels})`);
  }
  return { rows, billingModels, json };
}

/**
 * Normalisiert ein Datum auf `YYYY-MM-DD` (auch ISO-Strings mit Uhrzeit).
 */
export function normalizeDate(value) {
  if (value == null) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function parseRates(rates) {
  const num = (key) => (rates && typeof rates[key] === "number" ? rates[key] : null);
  return {
    input: num("input"),
    output: num("output"),
    cachedRead: num("cacheRead"),
    cachedWrite: num("cacheWrite"),
  };
}

/**
 * List-Preise aus `tiers[0].listRates`. Eine String-Referenz (z. B.
 * `"$30:props:rows:13:tiers:0:listRates"`) wird nicht aufgelöst → null.
 */
function parseListRates(tiers) {
  const t0 = tiers?.[0];
  const list = t0 && typeof t0.listRates === "object" && t0.listRates !== null ? t0.listRates : null;
  return parseRates(list);
}

/**
 * Baut das Deal-Objekt aus der Zeile. `expires` wird auf `YYYY-MM-DD`
 * normalisiert, `revertNote` ist immer null (Quelle wird nicht übernommen).
 */
function toDeal(row) {
  const d = row?.deal;
  if (!d || typeof d !== "object") return null;
  return {
    id: d.id ?? null,
    discountPercent: typeof d.discountPercent === "number" ? d.discountPercent : 0,
    free: d.free === true,
    expires: normalizeDate(d.expires),
    endsWhen: typeof d.endsWhen === "string" ? d.endsWhen : null,
    revertNote: null,
  };
}

/**
 * Mappt die availability der Zeile auf unser Schema. Explizite Einzel-Keys
 * gewinnen; `all: true` ist nur der Fallback, wenn ein Key fehlt.
 */
export function mapAvailability(av) {
  const out = { go: false, goat: false, pro: false, provider: false, max: false, team: false };
  for (const [key, plan] of Object.entries(AVAILABILITY_KEYS)) {
    if (typeof av?.[key] === "boolean") out[plan] = av[key];
    else if (av?.all === true) out[plan] = true;
  }
  return out;
}

const hasAnyAvailability = (av) => Object.values(mapAvailability(av)).some(Boolean);

const isPeakTier = (tier) => /^(?:off[- ]?peak|peak)$/i.test(tier ?? "");

/**
 * Parst die Peak-Zeitfenster aus dem `windows`-String der `timeOfDay`-Struktur
 * (z. B. "01–04 & 06–10 UTC" → [[1,4],[6,10]]). En-/Bis-Trennung per
 * Bindestrich („–" oder „-"); mehrere Fenster per „&"/Leerzeichen. Ein
 * unparsebares oder leeres Fenster bricht rot ab.
 */
export function parsePeakWindows(windows) {
  if (typeof windows !== "string") {
    throw new ScrapeError(`Peak-Zeitfenster fehlt (erwartet String, ${typeof windows})`);
  }
  const ranges = [];
  const re = /(\d{1,2})\s*[–-]\s*(\d{1,2})/g;
  let m;
  while ((m = re.exec(windows)) !== null) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if (start < 0 || start > 23 || end < 1 || end > 24 || start >= end) {
      throw new ScrapeError(`Peak-Zeitfenster unparsebar: "${windows}"`);
    }
    ranges.push([start, end]);
  }
  if (ranges.length === 0) {
    throw new ScrapeError(`keine gültigen Peak-Zeitfenster gefunden: "${windows}"`);
  }
  return ranges;
}

/**
 * Baut die Modelle aus den `rows` und reichert sie mit den Billing-Daten an
 * (JOIN über exakte `id` für `provider` und `allowances`). Modelle mit
 * `timeOfDay` (DeepSeek V4) werden in zwei Zeilen aufgeteilt — eine
 * Off-Peak- und eine Peak-Variante (eigene `tier`-Spalte, eigene Preise) —,
 * analog zum OpenCode-Upstream. Liefert zusätzlich die `peakHours`-Map
 * (Schlüssel: normalisierter Modellname → UTC-Bereiche).
 */
export function buildModels(rows, billingModels, today = new Date().toISOString().slice(0, 10)) {
  const billingById = new Map((billingModels ?? []).map((b) => [b.id, b]));
  const models = [];
  const peakHours = {};
  const pushModel = (row, model) => {
    const billing = billingById.get(model.id.replace(/-peak$/, ""));
    models.push({
      id: model.id,
      name: model.name,
      provider: billing?.provider ?? null,
      category: row.category ?? null,
      tier: model.tier,
      contextWindow: typeof row.contextWindow === "number" ? row.contextWindow : null,
      input: model.input,
      output: model.output,
      cachedRead: model.cachedRead,
      cachedWrite: model.cachedWrite,
      listInput: model.listInput ?? null,
      listOutput: model.listOutput ?? null,
      listCachedRead: model.listCachedRead ?? null,
      listCachedWrite: model.listCachedWrite ?? null,
      deal: model.deal ?? null,
      deprecated: false,
      availability: mapAvailability(row.availability),
      allowances: {
        goat: billing?.planAllowanceUsd?.goat ?? null,
        pro: billing?.planAllowanceUsd?.pro ?? null,
      },
      capabilities: null,
      pattern: REQUEST_PATTERN,
      tip: typeof row.tip === "string" ? row.tip : null,
    });
  };
  for (const row of rows ?? []) {
    if (row.deprecated === true || !hasAnyAvailability(row.availability)) continue;
    const billing = billingById.get(row.id);
    const tiers = Array.isArray(row.tiers) ? row.tiers : [];
    const rates = parseRates(tiers[0]?.rates);
    const list = parseListRates(tiers);
    const deal = toDeal(row);
    const tier = tiers.length > 1 ? tiers.map((t) => t.label).filter(Boolean).join(" / ") : null;
    const tod = row.timeOfDay;
    const hasPeak = !!(tod && tod.peak && tod.offPeak);

    if (hasPeak) {
      const num = (v) => (typeof v === "number" ? v : null);
      // Peak-Pricing ersetzt laufende Deals → keine Deal-/Listenpreise.
      pushModel(row, {
        id: row.id,
        name: row.name,
        tier: "off-peak",
        input: num(tod.offPeak.input) ?? rates.input,
        output: num(tod.offPeak.output) ?? rates.output,
        cachedRead: num(tod.offPeak.cacheRead) ?? rates.cachedRead,
        cachedWrite: rates.cachedWrite,
        deal: null,
      });
      pushModel(row, {
        id: `${row.id}-peak`,
        name: row.name,
        tier: "peak",
        input: num(tod.peak.input) ?? null,
        output: num(tod.peak.output) ?? null,
        cachedRead: num(tod.peak.cacheRead) ?? null,
        cachedWrite: rates.cachedWrite,
        deal: null,
      });
      peakHours[normalizeName(row.name)] = parsePeakWindows(tod.windows);
      continue;
    }

    // Abgelaufene Deals (expires < heute) verwerfen: der Listenpreis wird zum
    // aktuellen Now-Preis (z. B. Qwen 3.7 Max, Deal endete 2026-06-22).
    const expired = deal !== null && deal.expires !== null && deal.expires < today;
    pushModel(row, {
      id: row.id,
      name: row.name,
      tier,
      input: expired ? (list.input ?? rates.input) : rates.input,
      output: expired ? (list.output ?? rates.output) : rates.output,
      cachedRead: expired ? (list.cachedRead ?? rates.cachedRead) : rates.cachedRead,
      cachedWrite: expired ? (list.cachedWrite ?? rates.cachedWrite) : rates.cachedWrite,
      listInput: expired ? null : list.input,
      listOutput: expired ? null : list.output,
      listCachedRead: expired ? null : list.cachedRead,
      listCachedWrite: expired ? null : list.cachedWrite,
      deal: expired ? null : deal,
    });
  }
  return { models, peakHours };
}

/**
 * Parst einen Währungs-Wert ("$10" → 10, "$70 of usage" → 70). "Pay as you
 * go"/"Custom"/"-" → null.
 */
export function parseUsd(text) {
  const t = (text ?? "").trim();
  if (t === "" || /pay as you go|custom/i.test(t) || /^[-—–]+$/.test(t)) return null;
  const m = t.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) throw new ScrapeError(`USD-Wert unparsebar: "${text}"`);
  return Number(m[1]);
}

/**
 * Parst einen Request-Schätzwert ("~75K requests" → 75000). Nicht-Schätzwerte
 * ("Pay as you go", "Provider API access", "-") → null.
 */
export function parseRequests(text) {
  const t = (text ?? "").trim();
  if (t === "" || /pay as you go|custom|provider api access/i.test(t) || /^[-—–]+$/.test(t)) return null;
  const m = t.replace(/,/g, "").match(/~?\s*(\d+(?:\.\d+)?)\s*([kKmM])?/);
  if (!m) throw new ScrapeError(`Request-Schätzwert unparsebar: "${text}"`);
  let value = Number(m[1]);
  if (m[2]) value *= m[2].toLowerCase() === "k" ? 1000 : 1_000_000;
  return value;
}

/**
 * Findet die erste Tabelle, deren Header alle gegebenen Teilstrings enthält.
 */
export function findTable($, { and, label }) {
  const matches = [];
  $("main table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_, th) => $(th).text().trim().toLowerCase())
      .get();
    if (and.every((part) => headers.some((h) => h.includes(part)))) matches.push(table);
  });
  if (matches.length === 0) {
    throw new ScrapeError(`keine Tabelle mit ${label} gefunden`);
  }
  if (matches.length > 1) {
    console.error(`[scrape] Warnung: ${matches.length} Tabellen mit ${label} gefunden, erste wird verwendet.`);
  }
  return matches[0];
}

function parseTableRows($, table) {
  const rows = [];
  $(table)
    .find("tbody tr, > tr")
    .each((_, row) => {
      const cells = $(row)
        .find("th, td")
        .map((_, c) => $(c).text().replace(/\s+/g, " ").trim())
        .get();
      if (cells.length > 0 && cells[0] !== "") rows.push(cells);
    });
  return rows;
}

/**
 * Parst die server-gerenderten Plan-Tabellen (Preis/Credits/Requests +
 * 5h/Weekly-Limits) und liefert die 6 Individual-Pläne. `apiAccess`/`apiAccessSourceUrl`
 * werden erst später (Plan-Docs-Seiten) befüllt.
 */
export function parsePlanTables($) {
  const plansTable = findTable($, {
    and: ["price/mo", "credits/mo"],
    label: "'Price/mo' + 'Credits/mo'",
  });
  const limitsTable = findTable($, {
    and: ["5-hour limit", "weekly limit"],
    label: "'5-hour limit' + 'Weekly limit'",
  });

  const limitsByPlan = new Map();
  for (const cells of parseTableRows($, limitsTable)) {
    const id = PLAN_NAMES[cells[0].toLowerCase()];
    if (!id) continue;
    limitsByPlan.set(id, { h5: parseUsd(cells[3]), weekly: parseUsd(cells[4]) });
  }

  const plans = [];
  for (const cells of parseTableRows($, plansTable)) {
    const name = cells[0];
    const id = PLAN_NAMES[name.toLowerCase()];
    if (!id) continue;
    const creditsMonthly = parseUsd(cells[2]);
    const limits = limitsByPlan.get(id) ?? { h5: null, weekly: null };
    plans.push({
      id,
      name,
      priceMonthly: parseUsd(cells[1]),
      creditsMonthly,
      requestEstimate: parseRequests(cells[3]),
      apiAccess: null,
      apiAccessSourceUrl: null,
      limits: { h5: limits.h5, weekly: limits.weekly, monthly: creditsMonthly },
      defaultAllowance: DEFAULT_ALLOWANCES[id] ?? null,
      modelsIncluded: cells[4] ?? "",
      sourceUrl: PRICING_URL,
    });
  }
  if (plans.length < 6) {
    throw new ScrapeError(
      `unerwartete Plan-Struktur: ${plans.length} Pläne statt 6 geparst (${plans.map((p) => p.id).join(", ")})`
    );
  }
  return plans;
}

/**
 * Liest die persistierte Kredit-Baseline-Config (src/plan-baselines.json) —
 * die beworbene „credits included" / „advertised price"-Schwelle je Plan.
 * `null` = unbegrenzt (Provider). Unbekannte Struktur → rot.
 */
export function loadPlanBaselines(file = PLAN_BASELINES_PATH) {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    for (const [id, p] of Object.entries(raw)) {
      if (p !== null && (typeof p?.creditsIncluded !== "number" || typeof p?.advertisedPrice !== "number")) {
        throw new Error(`Eintrag "${id}" ungültig (erwartet { creditsIncluded, advertisedPrice } oder null)`);
      }
    }
    return raw;
  } catch (err) {
    throw new ScrapeError(
      `Plan-Baseline-Config nicht lesbar (${PLAN_BASELINES_PATH}): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Stellt sicher, dass zu jedem geparsten Plan eine Baseline existiert: entweder
 * in der persistierten Config oder aus den gescrapten Preisen ableitbar.
 * Ein neuer Plan (nicht in der Config) schlägt rot fehl, wenn seine Baseline
 * (Credits oder Preis) nicht gescrapt werden kann.
 */
export function validatePlanBaselines(plans, baselines = loadPlanBaselines()) {
  for (const plan of plans) {
    const configured = baselines[plan.id];
    if (configured !== undefined) continue;
    if (plan.creditsMonthly === null || plan.priceMonthly === null) {
      throw new ScrapeError(
        `neuer Plan "${plan.id}" (${plan.name}): Baseline nicht scrapbar (Credits oder Preis fehlen) — in src/plan-baselines.json aufnehmen`
      );
    }
    console.error(
      `[scrape] Warnung: neuer Plan "${plan.id}" (${plan.name}): Baseline aus gescrapten Preisen abgeleitet (${plan.creditsMonthly}/${plan.priceMonthly})`
    );
  }
  return plans;
}

/**
 * API-Zugang aus dem HTML einer Plan-Docs-Seite: enthält sie den Satz
 * "only plan without API access" (nur Go), gibt es keinen API-Zugang.
 */
export const planApiAccessFromHtml = (html) => !html.includes("only plan without API access");

/**
 * Holt den API-Zugang je Plan von den Plan-Docs-Seiten. Ein HTTP-Fehler bricht
 * rot ab. Für `provider` gibt es keine Plan-Seite (Provider-API ist pay-as-you-go).
 */
async function fetchApiAccess() {
  const result = {};
  for (const [id, url] of Object.entries(PLAN_DOC_PAGES)) {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) throw new ScrapeError(`HTTP ${res.status} beim Abrufen von ${url}`);
    const apiAccess = planApiAccessFromHtml(await res.text());
    if (id === "max") {
      result.max10 = { apiAccess, sourceUrl: url };
      result.max20 = { apiAccess, sourceUrl: url };
    } else {
      result[id] = { apiAccess, sourceUrl: url };
    }
  }
  result.provider = { apiAccess: true, sourceUrl: PRICING_URL };
  return result;
}

/**
 * Baut die Lookups für die models.dev-Zuordnung auf (normalisierte IDs und
 * Namen) und liefert `resolve(id, name)`.
 */
function buildModelsDevLookup(opencodeModels, metadataModels) {
  const opencodeById = new Map();
  const opencodeByName = new Map();
  for (const m of Object.values(opencodeModels)) {
    opencodeById.set(normalizeName(m.id), m);
    opencodeByName.set(normalizeName(m.name), m);
  }

  const canonByName = new Map();
  for (const meta of Object.values(metadataModels)) {
    const norm = normalizeName(meta.name);
    const list = canonByName.get(norm) ?? [];
    list.push(meta);
    canonByName.set(norm, list);
  }
  for (const list of canonByName.values()) list.sort((a, b) => a.id.localeCompare(b.id));

  const resolveCanon = (name) => {
    const norm = normalizeName(name);
    const canonical = canonByName.get(norm);
    if (!canonical?.length) return null;
    return canonical.find((c) => normalizeName(c.id) === norm) ?? canonical[0];
  };

  // Klammer-Suffixe wie "(latest)" gehören nicht zum models.dev-Namen.
  const stripSuffix = (name) => String(name).replace(/\s*\([^)]*\)\s*$/, "");

  const resolve = (id, name) => {
    const idNorm = normalizeName(id);
    if (opencodeById.has(idNorm)) return opencodeById.get(idNorm);
    const base = stripSuffix(name ?? id);
    return opencodeByName.get(normalizeName(base)) ?? resolveCanon(base);
  };

  return { resolve };
}

/**
 * Ausnahmen für die Fähigkeiten-Zuordnung (normalisierter Modellname →
 * kanonische models.dev-ID). Für Namen, die nicht exakt matchen (Ids weichen ab).
 */
const CAPABILITY_OVERRIDES = {
  tencenthy3: "tencent/hy3",
  "glm5.2fast": "zhipuai/glm-5.2",
  nemotron3ultra: "nemotron-3-ultra-free",
  "musespark1.2contributor": "meta/muse-spark-1.2",
};

/**
 * Baut aus einem models.dev-Modell das capabilities-Objekt. Liefert null,
 * wenn das Modell fehlt oder keine Input-Modalitäten hat.
 */
export function toCapabilities(md) {
  if (!md || !Array.isArray(md.modalities?.input)) return null;
  const valid = (arr) => (Array.isArray(arr) ? arr.filter((v) => CAPABILITY_VALUES.includes(v)) : []);
  return {
    input: valid(md.modalities.input),
    output: valid(md.modalities.output),
    reasoning: md.reasoning === true,
    toolCall: md.tool_call === true,
  };
}

/**
 * Fallback-Capabilities aus dem CC-`caps`-Objekt der Zeile.
 */
export function capsFallback(caps) {
  return {
    input: caps?.vision === true ? ["text", "image"] : ["text"],
    output: ["text"],
    reasoning: caps?.reasoning === true,
    toolCall: false,
  };
}

/**
 * Reichert Modelle mit `capabilities` aus models.dev an (Fallback: CC-`caps`).
 */
export function enrichCapabilities(models, opencodeModels, metadataModels, capsById = new Map()) {
  const { resolve } = buildModelsDevLookup(opencodeModels, metadataModels);
  for (const m of models) {
    const norm = normalizeName(m.name);
    let md = null;
    if (CAPABILITY_OVERRIDES[norm]) {
      md = metadataModels[CAPABILITY_OVERRIDES[norm]] ?? resolve(CAPABILITY_OVERRIDES[norm], CAPABILITY_OVERRIDES[norm]);
    }
    if (!md) md = resolve(m.id, m.name);
    m.capabilities = toCapabilities(md) ?? capsFallback(capsById.get(m.id));
  }
  return models;
}

/**
 * Reichert kostenlose Modelle mit `capabilities` an (Fallback: text-only).
 */
export function enrichFreeModels(freeModels, opencodeModels, metadataModels) {
  const { resolve } = buildModelsDevLookup(opencodeModels, metadataModels);
  for (const f of freeModels) {
    f.capabilities = toCapabilities(resolve(f.id, f.name)) ?? capsFallback(null);
  }
  return freeModels;
}

/**
 * Baut die kostenlosen Modelle aus den `rows` (deal.free ODER alle rates 0),
 * vorausgesetzt das Modell ist auf mindestens einem Plan verfügbar.
 */
export function buildFreeModels(rows, prevFree, today) {
  const prev = new Map((Array.isArray(prevFree) ? prevFree : []).map((f) => [f.id, f]));
  const candidates = [];
  for (const row of rows ?? []) {
    if (row.deprecated === true) continue;
    const t0 = row.tiers?.[0];
    const rates = t0?.rates;
    const allZero = rates && ["input", "output", "cacheRead"].every((k) => (rates[k] ?? 0) === 0);
    if (row.deal?.free !== true && !allZero) continue;
    if (!hasAnyAvailability(row.availability)) continue;
    candidates.push(row);
  }
  return candidates.map((row) => ({
    id: row.id,
    name: row.name,
    availableFrom: prev.get(row.id)?.availableFrom ?? today,
    until: null,
    capabilities: null,
    note: row.tip ?? row.deal?.endsWhen ?? null,
  }));
}

export const modelKey = (model) => model.id;

export const capabilitiesEqual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const pricingOf = (m) => ({
  input: m.input,
  output: m.output,
  cachedRead: m.cachedRead,
  cachedWrite: m.cachedWrite,
  allowances: m.allowances ?? { goat: null, pro: null },
});

const hasListPricing = (m) =>
  m.listInput !== null || m.listOutput !== null || m.listCachedRead !== null || m.listCachedWrite !== null;

const listPricingOfNullable = (m) =>
  hasListPricing(m)
    ? {
        input: m.listInput,
        output: m.listOutput,
        cachedRead: m.listCachedRead,
        cachedWrite: m.listCachedWrite,
        allowances: { goat: null, pro: null },
      }
    : null;

/**
 * Modell-Diff: added/removed (mit `pricing` + `listPricing`), `price_changed`
 * (Now-Preise, Float-Toleranz; Deals sind im Preis enthalten und erzeugen
 * kein eigenes Event), `allowance_changed` (goat/pro), `capabilities_changed`.
 */
export function computeModelChanges(prevModels, nextModels, firstSeen = new Map(), today = "") {
  const prev = new Map(prevModels.map((m) => [modelKey(m), m]));
  const next = new Map(nextModels.map((m) => [modelKey(m), m]));
  const changes = [];

  for (const key of next.keys()) {
    if (prev.has(key)) continue;
    const model = next.get(key);
    changes.push({
      type: "model_added",
      model: key,
      pricing: pricingOf(model),
      listPricing: listPricingOfNullable(model),
    });
  }

  for (const key of prev.keys()) {
    if (next.has(key)) continue;
    const first = firstSeen.get(key);
    const days = first ? Math.max(0, Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000)) : 0;
    changes.push({ type: "model_removed", model: key, days });
  }

  for (const key of next.keys()) {
    const before = prev.get(key);
    if (!before) continue;
    const after = next.get(key);

    const fields = PRICE_FIELDS.filter((f) => !near(before[f], after[f]));
    if (fields.length > 0) {
      changes.push({ type: "price_changed", model: key, from: pricingOf(before), to: pricingOf(after), fields });
    }

    const planChanges = [];
    for (const plan of ["goat", "pro"]) {
      const from = before.allowances?.[plan] ?? null;
      const to = after.allowances?.[plan] ?? null;
      if (typeof from !== "number" || typeof to !== "number" || from === to) continue;
      planChanges.push({ plan, from, to });
    }
    if (planChanges.length > 0) {
      changes.push({ type: "allowance_changed", model: key, plans: planChanges });
    }

    if (!capabilitiesEqual(before.capabilities, after.capabilities)) {
      changes.push({
        type: "capabilities_changed",
        model: key,
        from: before.capabilities ?? null,
        to: after.capabilities ?? null,
      });
    }
  }

  return changes;
}

const planEventInfo = (p) => ({
  priceMonthly: p.priceMonthly,
  creditsMonthly: p.creditsMonthly,
  requestEstimate: p.requestEstimate,
  apiAccess: p.apiAccess,
});

const planPricing = (p) => ({
  priceMonthly: p.priceMonthly,
  creditsMonthly: p.creditsMonthly,
  requestEstimate: p.requestEstimate,
});

/**
 * Plan-Diff: `plan_added`/`plan_removed` (mit `{ priceMonthly, creditsMonthly,
 * requestEstimate, apiAccess }`), `plan_pricing_changed` und `api_access_changed`.
 */
export function computePlanChanges(prevPlans, nextPlans) {
  const prev = new Map(prevPlans.map((p) => [p.id, p]));
  const next = new Map(nextPlans.map((p) => [p.id, p]));
  const changes = [];

  for (const id of next.keys()) {
    if (!prev.has(id)) changes.push({ type: "plan_added", plan: id, to: planEventInfo(next.get(id)) });
  }
  for (const id of prev.keys()) {
    if (!next.has(id)) changes.push({ type: "plan_removed", plan: id, from: planEventInfo(prev.get(id)) });
  }
  for (const id of next.keys()) {
    const before = prev.get(id);
    if (!before) continue;
    const after = next.get(id);
    const pricingChanged =
      !near(before.priceMonthly, after.priceMonthly) ||
      !near(before.creditsMonthly, after.creditsMonthly) ||
      !near(before.requestEstimate, after.requestEstimate);
    if (pricingChanged) {
      changes.push({ type: "plan_pricing_changed", plan: id, from: planPricing(before), to: planPricing(after) });
    }
    if (before.apiAccess !== after.apiAccess) {
      changes.push({ type: "api_access_changed", plan: id, from: before.apiAccess, to: after.apiAccess });
    }
  }

  return changes;
}

/**
 * Free-Model-Diff: `free_added`/`free_removed` (bis = heute).
 */
export function computeFreeChanges(prevFree, nextFree, today) {
  const prevIds = new Set((prevFree ?? []).map((f) => f.id));
  const nextIds = new Set((nextFree ?? []).map((f) => f.id));
  const changes = [];
  for (const f of nextFree ?? []) {
    if (!prevIds.has(f.id)) changes.push({ type: "free_added", model: f.id });
  }
  for (const f of prevFree ?? []) {
    if (!nextIds.has(f.id)) {
      changes.push({ type: "free_removed", model: f.id, availableFrom: f.availableFrom, until: today });
    }
  }
  return changes;
}

/**
 * Gesamt-Diff zweier Snapshots. Ohne Vorgänger (Erstlauf) → keine Events
 * (der `text`-Event wird separat vom Hauptprogramm erzeugt).
 */
export function buildChanges(prev, next, today = "", firstSeen = new Map()) {
  if (prev === null) return [];
  return [
    ...computeModelChanges(prev.models ?? [], next.models ?? [], firstSeen, today),
    ...computePlanChanges(prev.plans ?? [], next.plans ?? []),
    ...computeFreeChanges(prev.freeModels ?? [], next.freeModels ?? [], today),
  ];
}

/**
 * Mergt Events desselben Tages (2 Läufe/Tag): neu hinzukommende Events werden
 * angehängt, Events mit gleichem Dedupe-Key `${type}:${model}:${plan}` werden
 * durch das neueste ersetzt (neuestes gewinnt). Für `text`-Events gilt `type`.
 */
export function mergeChanges(existing, incoming) {
  const key = (c) => `${c.type}:${c.model ?? ""}:${c.plan ?? ""}`;
  const map = new Map();
  for (const c of [...existing, ...incoming]) {
    map.set(key(c), c);
  }
  return [...map.values()];
}

export function upsertChangelogJson(existing, date, changes) {
  const entries = Array.isArray(existing?.entries) ? existing.entries : [];
  const keep = entries.filter((e) => Array.isArray(e.changes) && e.changes.length > 0);
  const hasChanges = Array.isArray(changes) && changes.length > 0;
  if (!hasChanges) return { entries: keep };
  const rest = keep.filter((e) => e.date !== date);
  const sameDate = keep.find((e) => e.date === date);
  const merged = sameDate ? mergeChanges(sameDate.changes, changes) : changes;
  rest.unshift({ date, changes: merged });
  return { entries: rest };
}

const RequestPatternSchema = z.object({
  input: z.number(),
  cachedRead: z.number(),
  output: z.number(),
});

const CapabilitiesSchema = z.object({
  input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
  output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
  reasoning: z.boolean(),
  toolCall: z.boolean(),
});

const ModelAllowancesSchema = z.object({
  goat: z.number().nullable(),
  pro: z.number().nullable(),
});

const PricingTypeSchema = z.object({
  input: z.number().nullable(),
  output: z.number().nullable(),
  cachedRead: z.number().nullable(),
  cachedWrite: z.number().nullable(),
  allowances: ModelAllowancesSchema,
});

const DealSchema = z.object({
  id: z.string().nullable(),
  discountPercent: z.number(),
  free: z.boolean(),
  expires: z.string().nullable(),
  endsWhen: z.string().nullable(),
  revertNote: z.string().nullable(),
});

const ModelAvailabilitySchema = z.object({
  go: z.boolean(),
  goat: z.boolean(),
  pro: z.boolean(),
  provider: z.boolean(),
  max: z.boolean(),
  team: z.boolean(),
});

const ModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().nullable(),
  category: z.enum(["opensource", "premium"]).nullable(),
  tier: z.string().nullable(),
  contextWindow: z.number().nullable(),
  input: z.number().nullable(),
  output: z.number().nullable(),
  cachedRead: z.number().nullable(),
  cachedWrite: z.number().nullable(),
  listInput: z.number().nullable(),
  listOutput: z.number().nullable(),
  listCachedRead: z.number().nullable(),
  listCachedWrite: z.number().nullable(),
  deal: DealSchema.nullable(),
  deprecated: z.boolean(),
  availability: ModelAvailabilitySchema,
  allowances: ModelAllowancesSchema,
  capabilities: CapabilitiesSchema.nullable(),
  pattern: RequestPatternSchema,
  tip: z.string().nullable(),
});

const FreeModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().nullable(),
  capabilities: CapabilitiesSchema.nullable(),
  note: z.string().nullable(),
});

const PlanLimitsSchema = z.object({
  h5: z.number().nullable(),
  weekly: z.number().nullable(),
  monthly: z.number().nullable(),
});

const PlanSchema = z.object({
  id: z.enum(["go", "goat", "pro", "provider", "max10", "max20"]),
  name: z.string().min(1),
  priceMonthly: z.number(),
  creditsMonthly: z.number().nullable(),
  requestEstimate: z.number().nullable(),
  apiAccess: z.boolean(),
  apiAccessSourceUrl: z.string().url(),
  limits: PlanLimitsSchema,
  defaultAllowance: z.number().nullable(),
  modelsIncluded: z.string(),
  sourceUrl: z.string().url(),
});

const SnapshotSchema = z.object({
  fetchedAt: z.string(),
  sourceUrl: z.string().url(),
  plansSourceUrl: z.string().url(),
  capabilitiesSourceUrl: z.string().url(),
  sourceLang: z.literal("en"),
  plans: z.array(PlanSchema).min(6),
  models: z.array(ModelSchema).min(1),
  freeModels: z.array(FreeModelSchema),
  peakHours: z.record(z.string().min(1), z.array(z.tuple([z.number().int().min(0).max(23), z.number().int().min(1).max(24)]).refine(([s, e]) => s < e)).min(1)),
});

const PlanEventInfoSchema = z.object({
  priceMonthly: z.number(),
  creditsMonthly: z.number().nullable(),
  requestEstimate: z.number().nullable(),
  apiAccess: z.boolean(),
});

const PlanPricingSchema = z.object({
  priceMonthly: z.number(),
  creditsMonthly: z.number().nullable(),
  requestEstimate: z.number().nullable(),
});

const ChangeSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text"),
    lang: z.object({ en: z.string().min(1), de: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("model_added"),
    model: z.string().min(1),
    pricing: PricingTypeSchema,
    listPricing: PricingTypeSchema.nullable(),
  }),
  z.object({
    type: z.literal("model_removed"),
    model: z.string().min(1),
    days: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("price_changed"),
    model: z.string().min(1),
    from: PricingTypeSchema,
    to: PricingTypeSchema,
    fields: z.array(z.enum(["input", "output", "cachedRead", "cachedWrite"])).min(1),
  }),
  z.object({
    type: z.literal("allowance_changed"),
    model: z.string().min(1),
    plans: z
      .array(z.object({ plan: z.string(), from: z.number(), to: z.number() }))
      .min(1),
  }),
  z.object({
    type: z.literal("capabilities_changed"),
    model: z.string().min(1),
    from: CapabilitiesSchema.nullable(),
    to: CapabilitiesSchema.nullable(),
  }),
  z.object({ type: z.literal("free_added"), model: z.string().min(1) }),
  z.object({
    type: z.literal("free_removed"),
    model: z.string().min(1),
    availableFrom: z.string(),
    until: z.string(),
  }),
  z.object({ type: z.literal("plan_added"), plan: z.string().min(1), to: PlanEventInfoSchema }),
  z.object({ type: z.literal("plan_removed"), plan: z.string().min(1), from: PlanEventInfoSchema }),
  z.object({
    type: z.literal("plan_pricing_changed"),
    plan: z.string().min(1),
    from: PlanPricingSchema,
    to: PlanPricingSchema,
  }),
  z.object({ type: z.literal("api_access_changed"), plan: z.string().min(1), from: z.boolean(), to: z.boolean() }),
]);

const ChangelogSchema = z.object({
  entries: z.array(
    z.object({
      date: z.string(),
      changes: z.array(ChangeSchema).min(1),
    })
  ),
});

/**
 * Validiert den kompletten Changelog (zod). Leere Einträge und unbekannte
 * Event-Typen brechen den Lauf rot ab.
 */
export function validateChangelog(changelog) {
  return ChangelogSchema.parse(changelog);
}

/**
 * Validiert einen kompletten Snapshot (zod). Jedes Modell MUSS `pattern` haben.
 */
export function validateSnapshot(snapshot) {
  return SnapshotSchema.parse(snapshot);
}

async function main() {
  try {
    const response = await fetch(PRICING_URL, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
    });
    if (!response.ok) throw new ScrapeError(`HTTP ${response.status} beim Abrufen von ${PRICING_URL}`);
    const html = await response.text();

    const { rows, billingModels } = extractCatalog(html);
    const capsById = new Map(rows.map((r) => [r.id, r.caps]));
    const { models, peakHours } = buildModels(rows, billingModels);

    const $ = cheerio.load(html);
    const plans = validatePlanBaselines(parsePlanTables($));
    const apiAccess = await fetchApiAccess();
    for (const plan of plans) {
      const acc = apiAccess[plan.id];
      plan.apiAccess = acc.apiAccess;
      plan.apiAccessSourceUrl = acc.sourceUrl;
    }

    const { providers: mdProviders, models: mdModels, source: mdSource } = await loadModelsDev();
    enrichCapabilities(models, mdProviders.opencode?.models ?? {}, mdModels, capsById);

    const fetchedAt = new Date().toISOString();
    const date = fetchedAt.slice(0, 10);

    const prevPath = join(ROOT, "data", "latest.json");
    const prev = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, "utf8")) : null;

    const freeModels = buildFreeModels(rows, prev?.freeModels ?? [], date);
    enrichFreeModels(freeModels, mdProviders.opencode?.models ?? {}, mdModels);

    const historyPath = join(ROOT, "data", "history.json");
    let history = { snapshots: [] };
    if (existsSync(historyPath)) {
      history = JSON.parse(readFileSync(historyPath, "utf8"));
      if (!history || !Array.isArray(history.snapshots)) history = { snapshots: [] };
    }

    const firstSeen = new Map();
    for (const snap of history.snapshots) {
      const day = snap?.fetchedAt?.slice(0, 10);
      if (!day) continue;
      for (const m of snap.models ?? []) {
        const key = modelKey(m);
        if (!firstSeen.has(key)) firstSeen.set(key, day);
      }
    }

    const latest = {
      fetchedAt,
      sourceUrl: PRICING_URL,
      plansSourceUrl: PRICING_URL,
      capabilitiesSourceUrl: MODELS_DEV_URL,
      sourceLang: SOURCE_LANG,
      plans,
      models,
      freeModels,
      peakHours,
    };

    validateSnapshot(latest);

    const isFirstRun = prev === null;
    const changes = isFirstRun
      ? [{ type: "text", lang: { en: "Initial version", de: "Initialversion" } }]
      : buildChanges(prev, latest, date, firstSeen);

    const changelogPath = join(ROOT, "CHANGELOG.json");
    let existingChangelog = { entries: [] };
    if (!isFirstRun && existsSync(changelogPath)) {
      existingChangelog = JSON.parse(readFileSync(changelogPath, "utf8"));
    }
    const changelog = isFirstRun
      ? { entries: [{ date, changes }] }
      : upsertChangelogJson(existingChangelog, date, changes);
    validateChangelog(changelog);
    const changelogJson = JSON.stringify(changelog) + "\n";
    writeFileSync(changelogPath, changelogJson);
    mkdirSync(join(ROOT, "src", "data"), { recursive: true });
    writeFileSync(join(ROOT, "src", "data", "changelog.json"), changelogJson);

    if (changes.length > 0) {
      history.snapshots.push(latest);
      writeFileSync(historyPath, JSON.stringify(history, null, 2) + "\n");
      writeFileSync(prevPath, JSON.stringify(latest, null, 2) + "\n");
    }

    const enriched = models.filter((m) => m.capabilities !== null).length;
    const goatAllow = new Set(models.map((m) => m.allowances?.goat).filter((v) => typeof v === "number")).size;
    const proAllow = new Set(models.map((m) => m.allowances?.pro).filter((v) => typeof v === "number")).size;
    console.log(
      `Gescrapt: ${models.length} Modelle, ${plans.length} Pläne, ${freeModels.length} kostenlose Modelle, ${changes.length} Änderungen (Snapshot ${date}); Fähigkeiten (models.dev: ${mdSource}) für ${enriched}/${models.length} Modelle; Allowances (goat/pro): ${goatAllow}/${proAllow} Modelle; Quelle: ${PRICING_URL}.`
    );
  } catch (err) {
    console.error(`[scrape] FEHLER: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

const isMain = process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main();
}
