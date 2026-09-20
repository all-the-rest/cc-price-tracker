import type { Translation } from "./i18n";

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * FAQ-Inhalte als Datenquelle für das sichtbare `<details>`-Akkordeon UND für
 * das `FAQPage`-JSON-LD (beide Sprachen). Bewusst als reine Daten (kein TSX),
 * damit `seo.ts` sie ohne Komponenten-Import verwenden kann.
 */
export function faqItems(t: Translation): FaqItem[] {
  return [
    { q: t.faqQ1, a: t.faqA1 },
    { q: t.faqQ2, a: t.faqA2 },
    { q: t.faqQ3, a: t.faqA3 },
    { q: t.faqQ4, a: t.faqA4 },
    { q: t.faqQ5, a: t.faqA5 },
    { q: t.faqQ6, a: t.faqA6 },
  ];
}
