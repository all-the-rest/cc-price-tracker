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
  allowances: ModelAllowances;
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

/**
 * Datengetriebene Peak-Regel je Modell (Schlüssel: normalisierter Modellname,
 * siehe `peakKey` in `config/peakPricing.ts`). Ersetzt die frühere reinen
 * UTC-Fenster (`PeakHours`) inkl. hartkodierter Wochenend-Annahme.
 */
export interface PeakRule {
  /** IANA-Zone, in der der Wochentag bewertet wird (nicht der Browser). */
  timezone: string;
  /** ISO 8601 mit Offset; davor gilt kein Peak (nur wenn die Quelle ein Datum nennt). */
  effectiveFrom?: string;
  peak: {
    /** ISO-Wochentage 1=Montag … 7=Sonntag, an denen `windowsUtc` gilt. */
    days: number[];
    /** UTC-Stundenfenster [start, end], 0 ≤ start < end ≤ 24, aufsteigend, nicht überlappend. */
    windowsUtc: [number, number][];
  };
  /** Ganztägig Off-Peak an diesen ISO-Wochentagen (Komplement von `peak.days`). */
  offPeak: { days: number[]; allDay: true };
  /** Nur setzen, wenn die Quelle Feiertage nennt. */
  holidays?: { policy: "off-peak"; calendar: string };
}

export type PeakRules = Record<string, PeakRule>;

/** Feiertagskalender: aufsteigende ISO-Datumsstrings (lokale Tage der Regel-Zone). */
export interface HolidayCalendar {
  dates: string[];
  /** Letzter Kalendertag, den die Feiertagsquelle abdeckt. */
  coveredThrough: string;
}

export type HolidayCalendars = Record<string, HolidayCalendar>;

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
  peakRules: PeakRules;
  /**
   * Optional: Feiertagskalender. Die Command-Code-Quelle nennt **keine**
   * Feiertage, daher wird das Feld nicht geschrieben (Spezifikation §3:
   * `holidays` weggelassen). Die Datenform bleibt offen, falls die Quelle
   * Feiertage künftig nennt.
   */
  holidayCalendars?: HolidayCalendars;
}

export type SupportedLocale = "en" | "de";

export type PlanEventInfo = PlanPricing & { apiAccess: boolean };

export type Change =
  | { type: "text"; lang: Record<SupportedLocale, string> }
  | { type: "model_added"; model: string; pricing: PricingType; listPricing: PricingType | null }
  | { type: "model_removed"; model: string; days: number }
  | { type: "price_changed"; model: string; from: PricingType; to: PricingType; fields: PriceField[] }
  | { type: "allowance_changed"; model: string; plans: { plan: string; from: number; to: number }[] }
  | { type: "capabilities_changed"; model: string; from: Capabilities | null; to: Capabilities | null }
  | { type: "free_added"; model: string }
  | { type: "free_removed"; model: string; availableFrom: string; until: string }
  | { type: "plan_added"; plan: string; to: PlanEventInfo }
  | { type: "plan_removed"; plan: string; from: PlanEventInfo }
  | { type: "plan_pricing_changed"; plan: string; from: PlanPricing; to: PlanPricing }
  | { type: "api_access_changed"; plan: string; from: boolean; to: boolean };

export interface ChangelogEntry {
  /** Run-id (z. B. `2026-08-28T09-46-46Z`); Altschema-Einträge fallen auf `date` zurück. */
  id: string;
  date: string;
  changes: Change[];
}

export interface ChangelogData {
  entries: ChangelogEntry[];
}
