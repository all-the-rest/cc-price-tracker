import type { Translation } from "./i18n";
import type { PlanId } from "./types";

export const TAB_PLAN_IDS: readonly PlanId[] = ["go", "goat", "pro", "max10", "max20"];

export function isTabPlan(id: string | null): id is PlanId {
  return id !== null && (TAB_PLAN_IDS as readonly string[]).includes(id);
}

const PLAN_LABEL_KEY: Record<string, keyof Translation> = {
  go: "planGo",
  goat: "planGoat",
  pro: "planPro",
  provider: "planProvider",
  max10: "planMax10",
  max20: "planMax20",
};

export function planLabel(id: string, t: Translation): string {
  const key = PLAN_LABEL_KEY[id];
  return key ? t[key] : id;
}
