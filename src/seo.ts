import { i18n, type Lang } from "./i18n";
import { ROUTES, routePath, type RouteId } from "./routes";
import { faqItems } from "./faq";
import type { PriceData } from "./types";

export const SITE_URL = "https://cc-pricing.all-the.rest";
export const SITE_NAME = "Command Code Price Tracker";
export const OG_IMAGE = `${SITE_URL}/share/og.png`;
export const OG_IMAGE_ALT = "Top 5 Command Code models by total requests";
export const RSS_URL = "https://github.com/all-the-rest/cc-price-tracker/releases.atom";

const OG_LOCALE: Record<Lang, string> = { en: "en_US", de: "de_DE" };
const HTML_LANG: Record<Lang, string> = { en: "en", de: "de" };

export function htmlLang(lang: Lang): string {
  return HTML_LANG[lang];
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** JSON-LD serialisieren und `<` entschärfen (verhindert ein vorzeitiges `</script>`). */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function seoFor(route: RouteId, lang: Lang): { title: string; description: string } {
  const t = i18n[lang];
  if (route === "impressum") {
    return { title: t.seoTitleImpressum, description: t.seoDescriptionImpressum };
  }
  if (route === "datenschutz") {
    return { title: t.seoTitleDatenschutz, description: t.seoDescriptionDatenschutz };
  }
  return { title: t.seoTitle, description: t.seoDescription };
}

/**
 * Strukturierte Daten je Datei/Sprache: WebSite immer, zusätzlich ItemList
 * (alle Modelle) und FAQPage auf der Startseite.
 */
export function buildJsonLd(route: RouteId, lang: Lang, data: PriceData): unknown[] {
  const t = i18n[lang];
  const canonical = SITE_URL + routePath(route, lang);
  const out: unknown[] = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: SITE_URL + routePath("home", lang),
      inLanguage: HTML_LANG[lang],
      description: seoFor(route, lang).description,
    },
  ];
  if (route !== "home") return out;

  out.push({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t.headingPrices,
    numberOfItems: data.models.length,
    itemListElement: data.models.map((m, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: m.name,
      url: `${canonical}#prices`,
    })),
  });

  out.push({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: HTML_LANG[lang],
    mainEntity: faqItems(t).map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  });

  return out;
}

/**
 * Erzeugt den kompletten SEO-Head für eine Route/Sprache: Title, Description,
 * Canonical, hreflang-Alternates, RSS-Autodiscovery, Robots, OpenGraph/Twitter
 * und JSON-LD. Wird beim Prerender in jede HTML-Datei injiziert.
 */
export function renderSeoHead(route: RouteId, lang: Lang, data: PriceData): string {
  const { title, description } = seoFor(route, lang);
  const canonical = SITE_URL + routePath(route, lang);
  const routeDef = ROUTES.find((r) => r.id === route) ?? ROUTES[0]!;
  const lines: string[] = [];

  lines.push(`<title>${escAttr(title)}</title>`);
  lines.push(`<meta name="description" content="${escAttr(description)}" />`);
  lines.push(`<link rel="canonical" href="${canonical}" />`);
  for (const l of ["en", "de"] as Lang[]) {
    lines.push(
      `<link rel="alternate" hreflang="${HTML_LANG[l]}" href="${SITE_URL + routePath(route, l)}" />`
    );
  }
  lines.push(`<link rel="alternate" hreflang="x-default" href="${SITE_URL + routePath(route, "en")}" />`);
  lines.push(
    `<link rel="alternate" type="application/rss+xml" title="Changelog" href="${RSS_URL}" />`
  );
  lines.push(
    `<meta name="robots" content="${routeDef.indexable ? "index,follow" : "noindex,follow"}" />`
  );
  lines.push(`<meta property="og:type" content="website" />`);
  lines.push(`<meta property="og:site_name" content="${escAttr(SITE_NAME)}" />`);
  lines.push(`<meta property="og:locale" content="${OG_LOCALE[lang]}" />`);
  lines.push(
    `<meta property="og:locale:alternate" content="${OG_LOCALE[lang === "de" ? "en" : "de"]}" />`
  );
  lines.push(`<meta property="og:title" content="${escAttr(title)}" />`);
  lines.push(`<meta property="og:description" content="${escAttr(description)}" />`);
  lines.push(`<meta property="og:url" content="${canonical}" />`);
  lines.push(`<meta property="og:image" content="${OG_IMAGE}" />`);
  lines.push(`<meta property="og:image:width" content="1200" />`);
  lines.push(`<meta property="og:image:height" content="630" />`);
  lines.push(`<meta property="og:image:type" content="image/png" />`);
  lines.push(`<meta property="og:image:alt" content="${escAttr(OG_IMAGE_ALT)}" />`);
  lines.push(`<meta name="twitter:card" content="summary_large_image" />`);
  lines.push(`<meta name="twitter:title" content="${escAttr(title)}" />`);
  lines.push(`<meta name="twitter:description" content="${escAttr(description)}" />`);
  lines.push(`<meta name="twitter:image" content="${OG_IMAGE}" />`);
  lines.push(`<meta name="twitter:image:alt" content="${escAttr(OG_IMAGE_ALT)}" />`);
  for (const obj of buildJsonLd(route, lang, data)) {
    lines.push(`<script type="application/ld+json">${jsonLd(obj)}</script>`);
  }
  return lines.join("\n    ");
}
