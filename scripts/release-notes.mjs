#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PRICE_FIELD_NAMES = {
  input: "Input",
  output: "Output",
  cachedRead: "Cached Read",
  cachedWrite: "Cached Write",
};

const PLAN_LABELS = {
  go: "Go",
  goat: "GOAT",
  pro: "Pro",
  provider: "Provider",
  max10: "Max 10×",
  max20: "Max 20×",
};

export function planLabel(id) {
  return PLAN_LABELS[id] ?? id;
}

export function fmtPrice(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  if (n >= 1) return `$${n.toFixed(2)}`;
  const s = n.toFixed(6);
  return `$${s.replace(/0+$/, "").replace(/\.$/, "")}`;
}

/**
 * Usage-Limit (Allowances) eines Changelog-Pricing-Objekts, z. B. `GOAT 20 / Pro 30`.
 * Nur Pläne mit numerischem Wert; fehlende/null-Werte werden ausgelassen.
 * Spiegelbild zur Changelog-UI (`allowancesText`), damit der Release-Text den
 * Changelog-Eintrag vollständig wiedergibt.
 */
export function fmtAllowances(p) {
  if (!p || !p.allowances) return "";
  const parts = ["goat", "pro"]
    .map((plan) =>
      typeof p.allowances[plan] === "number" ? `${PLAN_LABELS[plan]} ${p.allowances[plan]}` : null
    )
    .filter(Boolean);
  return parts.length ? ` @ ${parts.join(" / ")}` : "";
}

export function pricingLine(p) {
  const parts = [fmtPrice(p.input), fmtPrice(p.output), fmtPrice(p.cachedRead)];
  if (p.cachedWrite !== null) parts.push(fmtPrice(p.cachedWrite));
  return parts.join(" / ") + fmtAllowances(p);
}

function fmtDeal(d) {
  if (!d) return "no deal";
  if (d.free) return "free";
  let s = `-${d.discountPercent}%`;
  if (d.expires) s += ` (valid until ${d.expires})`;
  else if (d.endsWhen) s += ` (${d.endsWhen})`;
  else s += " (permanent)";
  return s;
}

export function fmtCaps(c) {
  if (!c) return "–";
  const inp = Array.isArray(c.input) && c.input.length ? c.input.join("+") : "–";
  const outp = Array.isArray(c.output) && c.output.length ? c.output.join("+") : "–";
  const flags = [c.reasoning ? "reasoning" : null, c.toolCall ? "tool" : null]
    .filter(Boolean)
    .join("+");
  return `in:${inp} out:${outp}${flags ? ` ${flags}` : ""}`;
}

export function fmtPlanInfo(p) {
  const price = fmtPrice(p.priceMonthly);
  const credits = p.creditsMonthly === null ? "–" : String(p.creditsMonthly);
  const req = p.requestEstimate === null ? "–" : String(p.requestEstimate);
  return `${price}/mo · ${credits} credits · ~${req} requests`;
}

export function renderChange(c) {
  switch (c.type) {
    case "text":
      return `- ${c.lang.en}`;
    case "model_added": {
      let s = `- **${c.model}** — added (${pricingLine(c.pricing)})`;
      if (c.listPricing) s += ` (was ${pricingLine(c.listPricing)})`;
      return s;
    }
    case "model_removed":
      return `- **${c.model}** — removed (was available ${c.days} days)`;
    case "price_changed": {
      const fields = c.fields.map((f) => PRICE_FIELD_NAMES[f] ?? f).join(", ");
      return `- **${c.model}** — price change (${fields}): ${pricingLine(c.from)} → ${pricingLine(c.to)}`;
    }
    case "deal_changed":
      return `- **${c.model}** — deal: ${fmtDeal(c.from)} → ${fmtDeal(c.to)}`;
    case "allowance_changed":
      return `- **${c.model}** — allowance: ${c.plans.map((p) => `${p.plan} $${p.from} → $${p.to}`).join(", ")}`;
    case "capabilities_changed":
      return `- **${c.model}** — capabilities: ${fmtCaps(c.from)} → ${fmtCaps(c.to)}`;
    case "free_added":
      return `- **${c.model}** — new free model`;
    case "free_removed": {
      const days = Math.max(
        0,
        Math.round((Date.parse(c.until) - Date.parse(c.availableFrom)) / 86_400_000)
      );
      return `- **${c.model}** — free model removed (was available ${days} days, since ${c.availableFrom})`;
    }
    case "plan_added":
      return `- **Plan ${planLabel(c.plan)}** — added (${fmtPlanInfo(c.to)}, API access: ${c.to.apiAccess ? "yes" : "no"})`;
    case "plan_removed":
      return `- **Plan ${planLabel(c.plan)}** — removed (${fmtPlanInfo(c.from)}, API access: ${c.from.apiAccess ? "yes" : "no"})`;
    case "plan_pricing_changed":
      return `- **Plan ${planLabel(c.plan)}** — pricing: ${fmtPlanInfo(c.from)} → ${fmtPlanInfo(c.to)}`;
    case "api_access_changed":
      return `- **Plan ${planLabel(c.plan)}** — API access: ${c.from ? "yes" : "no"} → ${c.to ? "yes" : "no"}`;
    default:
      return `- ${c.type}: ${JSON.stringify(c)}`;
  }
}

export function renderReleaseNotesForEntry(entry) {
  if (!entry || !Array.isArray(entry.changes) || entry.changes.length === 0) return null;
  const lines = [
    `# Price Update ${entry.date}`,
    "",
    `Price changes for Command Code on **${entry.date}**:`,
    "",
    ...entry.changes.flatMap((c) => renderChange(c).split("\n")),
  ];
  return lines.join("\n");
}

export function renderReleaseNotes(changelog) {
  return renderReleaseNotesForEntry(changelog?.entries?.[0]);
}

function main() {
  const changelog = JSON.parse(readFileSync(join(ROOT, "CHANGELOG.json"), "utf8"));
  const argv = process.argv.slice(2);
  const dateIdx = argv.indexOf("--date");
  const date =
    (dateIdx !== -1 ? argv[dateIdx + 1] : null) ??
    (argv.find((a) => a.startsWith("--date="))?.slice("--date=".length) ?? null);
  const entry = date
    ? changelog.entries.find((e) => e.id === date || e.date === date)
    : changelog?.entries?.[0];
  if (!entry) {
    console.error(`no changelog entry found${date ? ` for date ${date}` : ""}`);
    process.exit(1);
  }
  const notes = renderReleaseNotesForEntry(entry);
  if (notes !== null) process.stdout.write(notes + "\n");
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main();
