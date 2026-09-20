import { renderToString } from "solid-js/web";
import App from "./App";
import type { Lang } from "./i18n";
import { renderSeoHead } from "./seo";
import { ROUTES, routeForBase, splitLang } from "./routes";
import type { PriceData } from "./types";
import dataJson from "../data/latest.json";

// Solid-Hydration-Bootstrap (`window._$HY`) — wird vom Prerender in jede
// HTML-Datei in den <head> injiziert; ohne ihn scheitert `hydrate()`.
export { generateHydrationScript } from "solid-js/web";

const data = dataJson as unknown as PriceData;

export interface RenderedRoute {
  html: string;
  /** Route-/sprachspezifischer SEO-Head (Title, Canonical, hreflang, JSON-LD …). */
  head: string;
}

/**
 * Prerender-Einstieg (nur Build-Zeit, Node). Rendert eine einzelne Route in
 * einer Sprache zu HTML. Server- und Client-Erstrender starten mit denselben
 * Defaults (helles Theme, kein Query-Parameter); gespeicherte Sprache/Theme und
 * Query-Parameter wendet der Client erst nach der Hydration an (siehe App.tsx).
 */
export function renderRoute(path: string, lang: Lang): RenderedRoute {
  const route = routeForBase(splitLang(path).base)?.id ?? "home";
  return {
    html: renderToString(() => <App ssrPath={path} ssrLang={lang} />),
    head: renderSeoHead(route, lang, data),
  };
}

/** Serialisierbare Routenliste für scripts/prerender.mjs (eine Datei je Sprache). */
export const prerenderRoutes = ROUTES.map((r) => ({
  id: r.id,
  indexable: r.indexable,
  langs: {
    en: { path: r.path("en"), outFile: r.outFile("en") },
    de: { path: r.path("de"), outFile: r.outFile("de") },
  },
}));
