export type PriceField = "input" | "output" | "cachedRead" | "cachedWrite";

export type Basis = "list" | "full" | "paid";

export type PlanId = "go" | "goat" | "pro" | "provider" | "max10" | "max20";

export type Modality = "text" | "audio" | "image" | "video" | "pdf";

export interface Capabilities {
  input: Modality[];
  output: Modality[];
  reasoning: boolean;
  toolCall: boolean;
}

export interface PricingType {
  input: number | null;
  output: number | null;
  cachedRead: number | null;
  cachedWrite: number | null;
}

export interface RequestPattern {
  input: number;
  cachedRead: number;
  output: number;
}

export interface Deal {
  id: string;
  discountPercent: number;
  free: boolean;
  expires: string | null;
  endsWhen: string | null;
  revertNote: string | null;
}

export interface PlanLimits {
  h5: number | null;
  weekly: number | null;
  monthly: number | null;
}

export interface PlanPricing {
  priceMonthly: number;
  creditsMonthly: number | null;
  requestEstimate: number | null;
}

export interface Plan extends PlanPricing {
  id: PlanId;
  name: string;
  apiAccess: boolean;
  apiAccessSourceUrl: string;
  limits: PlanLimits;
  defaultAllowance: number | null;
  modelsIncluded: string;
  sourceUrl: string;
}

export interface ModelAvailability {
  go: boolean;
  goat: boolean;
  pro: boolean;
  provider: boolean;
  max: boolean;
  team: boolean;
}

export interface ModelAllowances {
  goat: number | null;
  pro: number | null;
}

export interface Model {
  id: string;
  name: string;
  provider: string | null;
  category: "opensource" | "premium" | null;
  tier: string | null;
  contextWindow: number | null;
  input: number | null;
  output: number | null;
  cachedRead: number | null;
  cachedWrite: number | null;
  listInput: number | null;
  listOutput: number | null;
  listCachedRead: number | null;
  listCachedWrite: number | null;
  deal: Deal | null;
  deprecated: boolean;
  availability: ModelAvailability;
  allowances: ModelAllowances;
  capabilities: Capabilities | null;
  pattern: RequestPattern;
  tip: string | null;
}

export interface FreeModel {
  id: string;
  name: string;
  availableFrom: string;
  until: string | null;
  capabilities: Capabilities | null;
  note: string | null;
}

export interface PriceData {
  fetchedAt: string;
  sourceUrl: string;
  plansSourceUrl: string;
  capabilitiesSourceUrl: string;
  sourceLang: string;
  plans: Plan[];
  models: Model[];
  freeModels: FreeModel[];
}

export type SupportedLocale = "en" | "de";

export type PlanEventInfo = PlanPricing & { apiAccess: boolean };

export type Change =
  | { type: "text"; lang: Record<SupportedLocale, string> }
  | { type: "model_added"; model: string; pricing: PricingType; listPricing: PricingType | null }
  | { type: "model_removed"; model: string; days: number }
  | { type: "price_changed"; model: string; from: PricingType; to: PricingType; fields: PriceField[] }
  | { type: "deal_changed"; model: string; from: Deal | null; to: Deal | null }
  | { type: "allowance_changed"; model: string; plan: string; from: number; to: number }
  | { type: "capabilities_changed"; model: string; from: Capabilities | null; to: Capabilities | null }
  | { type: "free_added"; model: string }
  | { type: "free_removed"; model: string; availableFrom: string; until: string }
  | { type: "plan_added"; plan: string; to: PlanEventInfo }
  | { type: "plan_removed"; plan: string; from: PlanEventInfo }
  | { type: "plan_pricing_changed"; plan: string; from: PlanPricing; to: PlanPricing }
  | { type: "api_access_changed"; plan: string; from: boolean; to: boolean };

export interface ChangelogEntry {
  date: string;
  changes: Change[];
}

export interface ChangelogData {
  entries: ChangelogEntry[];
}
