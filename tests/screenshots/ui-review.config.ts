// UI-review route manifest — single source of truth for which pages get
// screenshotted and in which states. Edit this file to add/remove routes; the
// generic spec picks the changes up automatically.

export type UiReviewState = "filled" | "empty";
export type UiReviewViewport = "desktop" | "mobile";

export interface UiReviewRoute {
  name: string;
  path: string;
  states: UiReviewState[];
  viewports?: UiReviewViewport[];
  note?: string;
  /**
   * Optional CSS selectors for "notice areas" (Hinweis-Bereiche) that deserve
   * their own focused, element-scoped capture in addition to the full-page and
   * section shots — e.g. the privacy table or the changelog.
   */
  elements?: string[];
  /** Static <title> of the app — guards against capturing a foreign server on the port. */
  expectedTitle: string;
}

export interface UiReviewConfig {
  /** Must mirror `outputDir` in playwright.screenshots.config.ts. */
  outputDir: string;
  routes: UiReviewRoute[];
}

export const uiReviewConfig: UiReviewConfig = {
  outputDir: "test-results/ui-screenshots",
  routes: [
    {
      name: "home",
      path: "/",
      states: ["filled"],
      elements: ["#changelog", "#zdr"],
      note: "Statische Pricing-Seite (Daten beim Build importiert) — kein sinnvoller Empty-State.",
      expectedTitle: "Price Tracking for Command Code",
    },
    {
      name: "home-de",
      path: "/?lang=de",
      states: ["filled"],
      elements: ["#changelog", "#zdr"],
      note: "Deutsche Variante zur i18n-Kontrolle; Default-Lang ist en (Browser-Locale).",
      expectedTitle: "Price Tracking for Command Code",
    },
    {
      name: "home-dark",
      path: "/?theme=dark",
      states: ["filled"],
      elements: ["#changelog", "#zdr"],
      note: "Dark-Mode-Variante (data-theme=dark) — prüft Farben/Kontrast im dunklen Theme.",
      expectedTitle: "Price Tracking for Command Code",
    },
    {
      name: "home-de-dark",
      path: "/?lang=de&theme=dark",
      states: ["filled"],
      elements: ["#changelog", "#zdr"],
      note: "Deutsche Dark-Mode-Variante — prüft i18n + dunkles Theme zusammen.",
      expectedTitle: "Price Tracking for Command Code",
    },
  ],
};

export const routes = uiReviewConfig.routes;
