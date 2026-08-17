import type { Plan } from "./types";

/**
 * Stripe processing fee charged as a separate checkout line item (verified
 * manually against actual charges):
 *   Go $1 → $1.36 · GOAT $10 → $10.78 · Pro $20 → $21.24 ·
 *   Max 10× $100 → $104.92 · Max 20× $200 → $209.52
 *
 * It is a percentage of the monthly price plus a fixed transaction fee, rounded
 * to cents. The advertised plan price does NOT include it, so "what you pay"
 * (paid basis, allowance multipliers) is based on the actually charged amount.
 */
const FEE_RATE = 0.046;
const FEE_FIXED = 0.315;

export function processingFee(priceMonthly: number): number {
  if (!priceMonthly || priceMonthly <= 0) return 0;
  return Math.round((priceMonthly * FEE_RATE + FEE_FIXED) * 100) / 100;
}

export function actualPaid(plan: Plan): number {
  const base = plan.priceMonthly ?? 0;
  return base + processingFee(base);
}
