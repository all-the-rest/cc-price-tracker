import type { Lang } from "./i18n";

export type RouteId = "home" | "impressum" | "datenschutz";

export interface RouteDef {
  id: RouteId;
  /** Language-neutral base path, normalized, "/" for the home page. */
  base: string;
  /** Canonical, domain-relative path for a language. German is prefixed with /de. */
  path: (lang: Lang) => string;
  /** Output file relative to dist/ for the prerendered HTML. */
  outFile: (lang: Lang) => string;
  /** Search engines may index the route (legal pages stay noindex,follow). */
  indexable: boolean;
}

export const ROUTES: readonly RouteDef[] = [
  {
    id: "home",
    base: "/",
    path: (l) => (l === "de" ? "/de/" : "/"),
    outFile: (l) => (l === "de" ? "de/index.html" : "index.html"),
    indexable: true,
  },
  {
    id: "impressum",
    base: "/impressum",
    path: (l) => (l === "de" ? "/de/impressum/" : "/impressum/"),
    outFile: (l) => (l === "de" ? "de/impressum/index.html" : "impressum/index.html"),
    indexable: false,
  },
  {
    id: "datenschutz",
    base: "/datenschutz",
    path: (l) => (l === "de" ? "/de/datenschutz/" : "/datenschutz/"),
    outFile: (l) => (l === "de" ? "de/datenschutz/index.html" : "datenschutz/index.html"),
    indexable: false,
  },
];

/** Normalisiert einen Pfad: führenden Slash erzwingen, Query/Hash und Trailing Slash entfernen. */
export function normalizePath(path: string): string {
  if (!path) return "/";
  let p = path.split("?")[0]!.split("#")[0]!;
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/+$/, "");
  return p === "" ? "/" : p;
}

/**
 * Trennt das Sprachpräfix (`/de`) vom sprachneutralen Basis-Pfad.
 * Englisch ist Default und trägt kein Präfix.
 */
export function splitLang(path: string): { lang: Lang; base: string } {
  const p = normalizePath(path);
  if (p === "/de") return { lang: "de", base: "/" };
  if (p.startsWith("/de/")) return { lang: "de", base: normalizePath(p.slice(3)) };
  return { lang: "en", base: p };
}

export function routeForBase(base: string): RouteDef | null {
  const b = normalizePath(base);
  return ROUTES.find((r) => r.base === b) ?? null;
}

export function routePath(id: RouteId, lang: Lang): string {
  return (ROUTES.find((r) => r.id === id) ?? ROUTES[0]!).path(lang);
}
