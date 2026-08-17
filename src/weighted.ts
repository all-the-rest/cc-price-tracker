import type { Basis, Model, Plan, PriceField } from "./types";
import { actualPaid } from "./fees";
import planBaselinesJson from "./plan-baselines.json";

interface PlanBaseline {
  creditsIncluded: number;
  advertisedPrice: number;
}
const PLAN_BASELINES = planBaselinesJson as unknown as Record<string, PlanBaseline | null>;

export type { PriceField };

/**
 * Inkl. Nutzung (Allowance) eines Modells auf einem Plan:
 * Modell-Allowance (GOAT/Pro) → Plan-Default-Allowance → monatliche Credits.
 * Go/Max haben keine Modell-Allowances → es zählen die Credits des Plans.
 */
export function usageOf(m: Model, plan: Plan): number {
  const allowance = m.allowances[plan.id as "goat" | "pro"];
  if (typeof allowance === "number") return allowance;
  if (typeof plan.defaultAllowance === "number") return plan.defaultAllowance;
  return plan.creditsMonthly ?? 0;
}

/**
 * Plan-Wert: beworbene Kredit-Baseline je Plan („credits included" ÷
 * „advertised price"). Null → unbegrenzt (Provider, pay-as-you-go). Diese
 * Baseline ist zugleich die grüne Schwelle in PriceTable.
 *
 * Fällt auf die gescrapten Werte (Credits ÷ Listenpreis) zurück, wenn der Plan
 * nicht in der persistierten Config steht (neuer Plan).
 */
export function planValue(plan: Plan): number | null {
  const baseline = PLAN_BASELINES[plan.id];
  if (baseline !== undefined && baseline !== null) {
    return baseline.creditsIncluded / baseline.advertisedPrice;
  }
  if (plan.creditsMonthly === null) return null;
  return plan.creditsMonthly / plan.priceMonthly;
}

/**
 * Preis je Modellfeld für die gewählte Preisbasis:
 * - "list" → aktueller Preis aus der Doku (Now-Preis, inkl. Deals)
 * - "full" → Listenpreis × monatliche Credits / inkl. Nutzung
 * - "paid" → Listenpreis × Monatspreis / inkl. Nutzung
 */
export function fieldPrice(m: Model, f: PriceField, basis: Basis, plan: Plan): number | null {
  const raw = m[f];
  if (raw === null || raw === undefined) return null;
  if (basis === "list") return raw;
  const usage = usageOf(m, plan);
  if (usage <= 0) return null;
  const factor = basis === "full" ? plan.creditsMonthly : actualPaid(plan);
  if (factor === null || factor === undefined) return null;
  return raw * (factor / usage);
}

/**
 * Kosten pro Anfrage für ein Modell: dokumentiertes Anfragemuster des Modells
 * (Input/Cached/Output Tokens pro Anfrage) × Modellpreis pro 1M Tokens.
 *
 * Preiszuordnung (Heuristik): Input-Tokens → 5% Input-Preis + 95% Cached-Write-
 * Preis, Cached-Tokens → Cached-Read-Preis, Output-Tokens → Output-Preis. Ein
 * fehlender Cached-Write-Preis (in der Doku mit "-" dokumentiert) zählt wie der
 * Input-Preis (der Input-Anteil wird dann zum reinen Input-Preis).
 *
 * Die 5/95-Gewichtung basiert auf beobachteter Nutzung (opencode-Telemetrie):
 * für Modelle mit dokumentiertem Cached-Write-Preis entfällt der Großteil der
 * frischen Token auf Cached-Write (Luna ~28/72, Qwen3.8 Max ~0/100), nicht auf
 * den reinen Input-Preis.
 */
export function requestCost(m: Model, basis: Basis, plan: Plan): number | null {
  if (!m.pattern) return null;
  const input = fieldPrice(m, "input", basis, plan);
  const cached = fieldPrice(m, "cachedRead", basis, plan);
  const writeRaw = fieldPrice(m, "cachedWrite", basis, plan);
  const output = fieldPrice(m, "output", basis, plan);
  if (input === null || cached === null || output === null) return null;
  const write = writeRaw ?? input;
  const inputEffective = 0.05 * input + 0.95 * write;
  return (
    (inputEffective * m.pattern.input + cached * m.pattern.cachedRead + output * m.pattern.output) /
    1e6
  );
}

/**
 * Anfragen pro Monat für ein Modell: inkl. Nutzung (Guthaben in $) ÷ Kosten
 * pro Anfrage. Null-Kosten (kostenloses Modell) → Infinity (unbegrenzt).
 * Fehlendes Anfragemuster/Kosten → null.
 */
export function requestsPerMonth(m: Model, basis: Basis, plan: Plan): number | null {
  const cost = requestCost(m, basis, plan);
  if (cost === null) return null;
  if (cost <= 0) return Infinity;
  const usage = usageOf(m, plan);
  if (usage <= 0) return null;
  return usage / cost;
}

export function formatTokens(n: number, lang: "de" | "en"): string {
  return new Intl.NumberFormat(lang === "de" ? "de-DE" : "en-US").format(n);
}
