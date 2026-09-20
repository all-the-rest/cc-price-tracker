import { i18n } from "./i18n";

/**
 * Zentrale, sprachstabile Anker-Quelle für alle Heading-Anker (`id`-Attribute
 * und URL-Hashes wie `#prices`).
 *
 * Regel: Jede ID wird EINMAL hier definiert und IMMER aus englischem Text
 * abgeleitet — niemals aus dem aktiven i18n-String oder deutschem Text. Alle
 * Komponenten (EN- und DE-Render, SSR-Prerender und Client-Hydration) beziehen
 * ihre IDs ausschließlich aus diesem Modul, dadurch sind sie identisch in
 * beiden Sprachen und stabil über Sprachwechsel (`/` ↔ `/de/`, `?lang=`-Alias).
 *
 * Die Abschnitts-Anker sind bewusst kurze, englisch-basierte Slugs und werden
 * aus Kompatibilitätsgründen (geteilte Deep-Links, JSON-LD, Tests) NICHT
 * umbenannt, auch wenn sich ein englischer Heading-Text einmal ändert. Neu
 * hinzukommende Abschnitte bekommen ihren Slug aus dem englischen Heading
 * (`slugifyEn(i18n.en.headingX)`), gekürzt auf ein stabiles Wort falls nötig.
 * Alle Funktionen hier sind rein (kein `window`/`Date`) und damit
 * hydration-safe: SSR (`src/ssr-entry.tsx`) und Client rendern identisch.
 */

/** Englischen Text zu einem URL-/ID-Slug normalisieren (rein, SSR-safe). */
export function slugifyEn(value: string): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/**
 * Abschnitts-Anker der Startseite und der Rechtsseiten. Einmal vergeben,
 * nie umbenennen (Deep-Links, JSON-LD-URLs, Screenshot-Tests referenzieren
 * sie, z. B. `#prices`, `#comparison`).
 */
export const SECTION_ANCHORS = {
  prices: "prices",
  plans: "plans",
  comparison: "comparison",
  value: "value",
  api: "api",
  ranking: "ranking",
  models: "models",
  zdr: "zdr",
  faq: "faq",
  changelog: "changelog",
  impressum: "impressum",
  datenschutz: "datenschutz",
  apiBanner: "api-banner",
} as const;

export type SectionAnchor = (typeof SECTION_ANCHORS)[keyof typeof SECTION_ANCHORS];

/** Englische FAQ-Fragen in stabiler Reihenfolge (Schlüssel, nicht Text). */
const FAQ_QUESTION_KEYS = ["faqQ1", "faqQ2", "faqQ3", "faqQ4", "faqQ5", "faqQ6"] as const;

/**
 * Stabile ID eines FAQ-`<details>`-Eintrags, abgeleitet aus der ENGLISCHEN
 * Frage (`i18n.en`) — unabhängig von der aktiven Sprache. `index` ist die
 * Position in `faqItems()` (0-basiert).
 */
export function faqAnchor(index: number): string {
  const key = FAQ_QUESTION_KEYS[index];
  const question = key ? i18n.en[key] : `question-${index + 1}`;
  return `faq-${slugifyEn(question)}`;
}

/** Alle FAQ-Anker in Reihenfolge (für Tests und Listen). */
export function faqAnchors(): string[] {
  return FAQ_QUESTION_KEYS.map((_, i) => faqAnchor(i));
}

/**
 * Stabile ID eines Plan-Tabs, abgeleitet aus der sprachneutralen Plan-ID
 * (`go`, `goat`, `pro`, `max10`, `max20`) — identisch in EN und DE.
 */
export function planTabAnchor(planId: string): string {
  return `plan-${slugifyEn(planId)}`;
}
