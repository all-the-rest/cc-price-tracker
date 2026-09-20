// Permanent post-build hydration suite (runs against prerendered `dist/`).
//
// Guards the critical failure mode: prerendered markup is visible but the page
// is not interactive because `window._$HY` (Solid hydration bootstrap) is
// missing or the client was compiled without `hydratable: true`.
//
// Run: `pnpm test:hydration` (builds first, then `vite preview` on :4175).
import { expect, test } from "@playwright/test";

const ROUTES: Array<{ path: string; lang: "en" | "de" }> = [
  { path: "/", lang: "en" },
  { path: "/de/", lang: "de" },
  { path: "/impressum/", lang: "en" },
  { path: "/datenschutz/", lang: "en" },
  { path: "/de/impressum/", lang: "de" },
  { path: "/de/datenschutz/", lang: "de" },
];

for (const route of ROUTES) {
  test(`hydrates ${route.path} without errors`, async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

    const res = await page.goto(route.path, { waitUntil: "load" });
    expect(res?.status(), `${route.path} HTTP status`).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", route.lang);

    // Der Server-Render darf durch die Hydration nicht verdoppelt werden.
    await expect(page.locator("#root")).toHaveCount(1);
    await expect(page.locator("#root > *")).toHaveCount(1);
    expect(
      await page.locator("#root").innerText(),
      "#root enthält vorgerenderten Text",
    ).not.toHaveLength(0);

    // Hydration-Bootstrap muss vorhanden sein.
    expect(await page.evaluate(() => typeof (window as { _$HY?: unknown })._$HY)).toBe("object");

    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("client is interactive after hydration (plan tabs)", async ({ page }) => {
  await page.goto("/");
  const goat = page.locator('[role="tab"][aria-selected="true"]');
  await expect(goat).toHaveText(/GOAT/);
  await page.locator('[role="tab"]', { hasText: "Pro" }).click();
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText(/Pro/);
  // Filterzustand landet in der URL (SPA-Verhalten nach Hydration).
  await expect(page).toHaveURL(/plan=pro/);
});

test("language switch navigates to the same route in the other language", async ({ page }) => {
  await page.goto("/datenschutz/");
  await page.locator('a[hreflang="de"]').click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe("/de/datenschutz/");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
});

test("DE deep link with English hash is preserved and resolves", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  await page.goto("/de/#faq-how-much-does-command-code-cost");
  await expect
    .poll(() => {
      const u = new URL(page.url());
      return `${u.pathname}|${u.hash}`;
    })
    .toBe("/de/|#faq-how-much-does-command-code-cost");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#faq-how-much-does-command-code-cost")).toHaveCount(1);
  expect(problems).toEqual([]);
});

test("?lang alias carries hash into path form", async ({ page }) => {
  await page.goto("/?lang=de#prices");
  await expect
    .poll(() => {
      const u = new URL(page.url());
      return `${u.pathname}|${u.hash}`;
    })
    .toBe("/de/|#prices");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator("#prices")).toHaveCount(1);
});

test("language switch keeps query params and hash", async ({ page }) => {
  await page.goto("/?basis=paid&plan=pro#prices");
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText(/Pro/);
  await page.locator('a[hreflang="de"]').click();
  await expect
    .poll(() => {
      const u = new URL(page.url());
      return `${u.pathname}|${u.searchParams.get("plan")}|${u.searchParams.get("basis")}|${u.hash}`;
    })
    .toBe("/de/|pro|paid|#prices");
  await expect(page.locator("html")).toHaveAttribute("lang", "de");
  await expect(page.locator('[role="tab"][aria-selected="true"]')).toHaveText(/Pro/);
});
