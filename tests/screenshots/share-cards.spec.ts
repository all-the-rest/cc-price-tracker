// Permanent screenshot + behavior suite for share cards.
//
// AGENTS.md: neue UI-Features (insb. Share-Cards) bekommen Playwright-Tests —
// alle Size-Varianten (OG/Twitter/IG-4:5/Story-9:16) + Mobile + beide Sprachen.
// AGENTS.todo.md Phase 6 (portrait rule): landscape = Top 5, no
// constraints; portraits = Top 8 + per-row constraint line +
// compact constraints block (limits + stand + domain source).
// TOP-X is automatic per preset (same as ocgo) — no manual TopN selector.
// Runs under playwright.screenshots.config.ts (`pnpm test:screenshots`) on
// Desktop Chrome + Mobile Chrome (no skips: mobile coverage is mandatory).
//
// Unlike ui-screenshots.spec.ts this suite ASSERTS behavior (geometry,
// no-overflow, link compat) and captures pixels for the vision pass.
import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import path from "node:path";
import process from "node:process";

const out = (viewport: string, file: string) =>
  path.resolve(process.cwd(), "test-results", "share-cards", viewport, file);

const SIZES = [
  { key: "og", w: 1200, h: 630 },
  { key: "twitter", w: 1200, h: 675 },
  { key: "portrait", w: 1080, h: 1350 },
  { key: "story", w: 1080, h: 1920 },
] as const;
type SizeKey = (typeof SIZES)[number]["key"];
const SIZE_VALUES = SIZES.map((s) => s.key);
// Automatic TOP-X count per preset (same as ocgo): landscape Top 5, portrait Top 8.
const AUTO_TOPN: Record<SizeKey, number> = { og: 5, twitter: 5, portrait: 8, story: 8 };
const PLAN_VALUES = ["go", "goat", "pro", "provider", "max10", "max20"] as const;

type Lang = "en" | "de";
const TRIGGER = { en: "Share", de: "Teilen" } as const;
const TITLE = { en: "Configure share card", de: "Share-Card konfigurieren" } as const;
const CARD_THEME = {
  en: { dark: "Dark", light: "Light" },
  de: { dark: "Dunkel", light: "Hell" },
} as const;
const SOURCE_DOMAIN = "cc-pricing.all-the.rest";

function isPortrait(size: SizeKey): boolean {
  return size === "portrait" || size === "story";
}

function viewportOf(projectName: string): string {
  return projectName === "Mobile Chrome" ? "mobile" : "desktop";
}

async function waitForApp(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("main")).toBeVisible();
  // Guard: capture the real app, not a foreign dev server on the port.
  await expect(page).toHaveTitle("Price Tracking for Command Code");
  await page.waitForTimeout(300);
}

async function openShareDialog(page: Page, lang: Lang): Promise<Locator> {
  const trigger = page.getByRole("button", { name: TRIGGER[lang], exact: true });
  await expect(trigger, `share trigger (${TRIGGER[lang]}) visible`).toBeVisible();
  await trigger.click();
  const dialog = page.locator("dialog.modal");
  await expect(dialog.locator(".modal-box")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: TITLE[lang] })).toBeVisible();
  return dialog;
}

/** Find a <select> inside the dialog by its option values (label-agnostic, i18n-safe). */
async function findSelectByOptionValue(dialog: Locator, candidates: readonly string[]): Promise<Locator> {
  const idx = await dialog.evaluate(
    (d, vals) =>
      [...d.querySelectorAll("select")].findIndex((s) =>
        [...s.options].some((o) => (vals as readonly string[]).includes(o.value)),
      ),
    candidates,
  );
  expect(idx, `select with option values [${candidates.join(",")}] found`).toBeGreaterThanOrEqual(0);
  return dialog.locator("select").nth(idx);
}

async function selectByOptionValue(
  dialog: Locator,
  candidates: readonly string[],
  value: string,
): Promise<Locator> {
  const sel = await findSelectByOptionValue(dialog, candidates);
  await sel.selectOption(value);
  return sel;
}

/** Fail when any SVG text runs past the card edges (horizontal overflow guard). */
async function expectNoSvgOverflow(modal: Locator, label: string): Promise<void> {
  const violations = await modal.evaluate((m) => {
    const svg = m.querySelector("div[role='img'] > svg");
    if (!svg) return [{ txt: "(no svg)", left: 0, right: 0, W: 0 }];
    const W = Number(svg.getAttribute("width"));
    const bad: Array<{ txt: string; left: number; right: number; W: number }> = [];
    svg.querySelectorAll("text").forEach((t) => {
      let len = 0;
      try {
        len = t.getComputedTextLength();
      } catch {
        return;
      }
      const x = Number(t.getAttribute("x") ?? 0);
      const a = t.getAttribute("text-anchor") ?? "start";
      const l = a === "end" ? x - len : a === "middle" ? x - len / 2 : x;
      const r = a === "end" ? x : a === "middle" ? x + len / 2 : x + len;
      if (l < -1 || r > W + 1) {
        bad.push({ txt: (t.textContent || "").slice(0, 44), left: Math.round(l), right: Math.round(r), W });
      }
    });
    return bad;
  });
  expect(violations, `${label}: SVG text overflow ${JSON.stringify(violations)}`).toEqual([]);
}

async function configureCard(
  dialog: Locator,
  lang: Lang,
  size: SizeKey,
  cardTheme: "dark" | "light",
  plan = "goat",
): Promise<Locator> {
  // Requests-only: no metric radiogroup may exist.
  await expect(dialog.locator('input[name="share-metric"]')).toHaveCount(0);
  // TOP-X is automatic: no TopN selector — only the plan + size selects exist.
  await expect(dialog.locator("select"), "plan + size selects only").toHaveCount(2);
  // Independent dialog language switch (DE|EN) is always present.
  await expect(dialog.getByRole("radio", { name: "DE", exact: true })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "EN", exact: true })).toBeVisible();
  await selectByOptionValue(dialog, PLAN_VALUES, plan);
  await selectByOptionValue(dialog, SIZE_VALUES, size);
  await dialog.getByRole("radio", { name: CARD_THEME[lang][cardTheme], exact: true }).click();
  await dialog.page().waitForTimeout(250);
  // The rendered list follows the automatic preset count.
  await expect(
    dialog.locator("div[role='img'] > svg").locator(":scope > g"),
    `automatic Top ${AUTO_TOPN[size]} for ${size}`,
  ).toHaveCount(AUTO_TOPN[size]);
  return dialog.locator(".modal-box");
}

async function expectCardContent(
  dialog: Locator,
  lang: Lang,
  size: { key: SizeKey; w: number; h: number },
  topN: string,
  label: string,
): Promise<void> {
  const svg = dialog.locator("div[role='img'] > svg");
  await expect(svg, `${label}: card svg rendered`).toBeVisible();
  await expect(svg).toHaveAttribute("width", String(size.w));
  await expect(svg).toHaveAttribute("height", String(size.h));
  const texts = (await svg.locator("text").allTextContents()).join(" ");
  // Requests-only, no per-request/per-month cost figure anywhere: every row
  // shows total requests plus the $/1M input/output prices in the active
  // basis; the footer shows the domain source.
  expect(texts, `${label}: no per-request cost figure`).not.toContain("/req");
  expect(texts, `${label}: $/1M in/out price per row`).toContain("/1M");
  expect(texts, `${label}: domain source in footer`).toContain(SOURCE_DOMAIN);
  // Unified layout: header (title + metric), top-X rows, constraints block
  // (portrait only), footer.
  expect(texts, `${label}: header title`).toContain("Command Code");
  expect(texts, `${label}: header metric`).toContain(lang === "de" ? "Top Modelle/Monat" : "Top models/mo");
  // Footer: LEFT = domain, RIGHT = localized last-update date + intraday time.
  const stampWord = lang === "de" ? "Stand" : "As of";
  expect(texts, `${label}: footer stamp word`).toContain(stampWord);
  expect(texts, `${label}: footer stamp carries intraday time`).toMatch(/\d{1,2}:\d{2}/);
  // Footer geometry: domain left-anchored, stamp right-anchored, both
  // bottom-anchored (within 30px of the card bottom) on every preset.
  const footer = await svg.evaluate((s) => {
    const H = Number(s.getAttribute("height"));
    const direct = [...s.querySelectorAll(":scope > text")].map((t) => ({
      txt: t.textContent || "",
      x: Number(t.getAttribute("x") ?? NaN),
      y: Number(t.getAttribute("y") ?? NaN),
      anchor: t.getAttribute("text-anchor") ?? "start",
    }));
    return { H, direct };
  });
  const domain = footer.direct.find((t) => t.txt.includes(SOURCE_DOMAIN));
  // NB: the header as-of line also contains the stamp word — the footer stamp
  // is the right-anchored (text-anchor=end) direct child. Row values are
  // end-anchored too but nested inside <g>, never direct children.
  const stamp = footer.direct.find((t) => t.anchor === "end" && t.txt.includes(stampWord));
  expect(domain, `${label}: footer domain node`).toBeDefined();
  expect(stamp, `${label}: footer stamp node`).toBeDefined();
  expect(stamp!.txt, `${label}: stamp carries intraday time`).toMatch(/\d{1,2}:\d{2}/);
  expect(domain!.anchor, `${label}: domain left`).toBe("start");
  expect(stamp!.anchor, `${label}: stamp right`).toBe("end");
  expect(domain!.x < stamp!.x, `${label}: domain left of stamp`).toBe(true);
  expect(footer.H - domain!.y, `${label}: domain bottom-anchored`).toBeLessThanOrEqual(30);
  expect(footer.H - stamp!.y, `${label}: stamp bottom-anchored`).toBeLessThanOrEqual(30);
  // Peak rule: every text node mentioning Peak must also state the UTC window
  // times and the weekday coverage — never a bare "Peak"/"Off-Peak".
  // (Checks each <text> node separately so a distant "UTC" elsewhere can't mask a bare mention.)
  const peakNodes = await svg.locator("text").allTextContents();
  const bare = peakNodes.filter(
    (t) =>
      /peak/i.test(t) &&
      !/UTC/.test(t),
  );
  expect(bare, `${label}: bare Peak/Off-Peak without UTC times ${JSON.stringify(bare)}`).toEqual([]);
  const coverOk = lang === "de" ? ["Mo–Fr", "Zeiten laut Quelle"] : ["Mon–Fri", "times per source"];
  const noCover = peakNodes.filter((t) => /peak/i.test(t) && !coverOk.some((c) => t.includes(c)));
  expect(noCover, `${label}: Peak without weekday coverage ${JSON.stringify(noCover)}`).toEqual([]);
  // Phase 6: portraits carry constraints (per-row hint + footer block), landscape does not.
  if (isPortrait(size.key)) {
    expect(texts, `${label}: constraints block`).toContain("Limits");
    expect(texts, `${label}: per-row limit hint`).toContain(lang === "de" ? "5h-Limit" : "5h limit");
    // GOAT top-8 always ranks DeepSeek peak models in range: the peak rule must
    // be visibly exercised (times + coverage), not just vacuously asserted.
    if (topN === "8") {
      expect(texts, `${label}: peak rows present on top-8`).toContain("Peak");
    }
  } else {
    expect(texts, `${label}: no constraints on landscape`).not.toContain("5h");
  }
  // Rendered row count matches the automatic TopN for the preset.
  const rows = await svg.locator(":scope > g").count();
  expect(rows, `${label}: row count`).toBe(Number(topN));
  await expectNoSvgOverflow(dialog.locator(".modal-box"), label);
}

// Automatic TOP-X per preset: landscape Top 5, portraits Top 8 (densest,
// with constraints). No manual selection — the count follows the size.
const MATRIX: Array<{ size: SizeKey; topN: string; themes: Array<"dark" | "light"> }> = [
  { size: "og", topN: "5", themes: ["dark", "light"] },
  { size: "twitter", topN: "5", themes: ["dark"] },
  { size: "portrait", topN: "8", themes: ["dark"] },
  { size: "story", topN: "8", themes: ["dark"] },
];

for (const { size: sizeKey, topN, themes } of MATRIX) {
  const size = SIZES.find((s) => s.key === sizeKey)!;
  for (const lang of ["en", "de"] as const) {
    for (const cardTheme of themes) {
      test(
        `share card ${sizeKey} ${lang} ${cardTheme} top${topN}`,
        { tag: ["@screenshot"] },
        async ({ page }, testInfo) => {
          const v = viewportOf(testInfo.project.name);
          await page.goto(`/?lang=${lang}`);
          await waitForApp(page);
          const dialog = await openShareDialog(page, lang);
          const modal = await configureCard(dialog, lang, sizeKey, cardTheme);
          await expectCardContent(dialog, lang, size, topN, `${sizeKey}/${lang}/${cardTheme}/top${topN}`);
          await modal.screenshot({ path: out(v, `share-${sizeKey}-${lang}-${cardTheme}-top${topN}.png`) });
        },
      );
    }
  }
}

test("share card topN is automatic per preset, no selector", { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
  const v = viewportOf(testInfo.project.name);
  await page.goto("/?lang=en");
  await waitForApp(page);
  const dialog = await openShareDialog(page, "en");
  // No TopN control anywhere in the dialog — only plan + size selects.
  await expect(dialog.locator("select"), "no TopN selector").toHaveCount(2);
  const svg = dialog.locator("div[role='img'] > svg");
  // Default preset og → automatic Top 5; caption reflects the effective count.
  await expect(svg.locator(":scope > g"), "og: automatic Top 5").toHaveCount(5);
  await expect(dialog.locator("p", { hasText: "Top 5" }), "caption shows Top 5").toBeVisible();
  // Switching preset re-renders with the automatic count: story → Top 8.
  await selectByOptionValue(dialog, SIZE_VALUES, "story");
  await page.waitForTimeout(250);
  await expect(svg.locator(":scope > g"), "story: automatic Top 8").toHaveCount(8);
  await expect(dialog.locator("p", { hasText: "Top 8" }), "caption shows Top 8").toBeVisible();
  await dialog.locator(".modal-box").screenshot({ path: out(v, "share-dialog-auto-topn.png") });
});

test("share card portrait provider (no limits branch)", { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
  const v = viewportOf(testInfo.project.name);
  await page.goto("/?lang=en");
  await waitForApp(page);
  const dialog = await openShareDialog(page, "en");
  const modal = await configureCard(dialog, "en", "portrait", "dark", "provider");
  const svg = dialog.locator("div[role='img'] > svg");
  await expect(svg).toHaveAttribute("width", "1080");
  await expect(svg).toHaveAttribute("height", "1350");
  const texts = (await svg.locator("text").allTextContents()).join(" ");
  // Provider plan has no limits and no list prices on this basis: "No limits"
  // note per row + block, "–" price placeholders, domain footer still present,
  // and no per-request cost figure anywhere.
  expect(texts, "provider: no-limits note").toContain("No limits");
  expect(texts, "provider: no per-request cost figure").not.toContain("/req");
  expect(texts, "provider: domain source in footer").toContain(SOURCE_DOMAIN);
  expect(texts, "provider: footer stamp with intraday time").toMatch(/As of.*\d{1,2}:\d{2}/);
  expect(await svg.locator(":scope > g").count(), "provider: automatic Top 8").toBe(8);
  await expectNoSvgOverflow(modal, "portrait/provider");
  await modal.screenshot({ path: out(v, "share-portrait-en-dark-top8-provider.png") });
});

test.describe("share trigger location", () => {
  for (const lang of ["en", "de"] as const) {
    test(`trigger lives on the #prices heading row, not #comparison (${lang})`, async ({ page }, testInfo) => {
      const v = viewportOf(testInfo.project.name);
      await page.goto(`/?lang=${lang}&sort=requests%3Adesc#prices`);
      await waitForApp(page);
      const inPrices = page.locator("#prices").getByRole("button", { name: TRIGGER[lang], exact: true });
      await expect(inPrices, `#prices share trigger (${TRIGGER[lang]}) visible`).toBeVisible();
      await expect(
        page.locator("#comparison").getByRole("button", { name: TRIGGER[lang], exact: true }),
        "#comparison must not carry a share trigger",
      ).toHaveCount(0);
      // Same row: trigger vertically overlaps the heading, heading left of trigger.
      const headBox = await page.locator("#prices h2").first().boundingBox();
      const btnBox = await inPrices.boundingBox();
      expect(headBox, "#prices heading box").not.toBeNull();
      expect(btnBox, "#prices trigger box").not.toBeNull();
      expect(btnBox!.y < headBox!.y + headBox!.height, "trigger shares the heading row").toBe(true);
      expect(headBox!.x < btnBox!.x, "heading left, trigger right").toBe(true);
      await page.locator("#prices").scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      await page.locator("#prices > div").first().screenshot({ path: out(v, `share-trigger-prices-row-${lang}.png`) });
    });
  }
});

test.describe("share dialog close (X) button", () => {
  const CLOSE = { en: "Close", de: "Schließen" } as const;
  for (const lang of ["en", "de"] as const) {
    test(`X top-right closes the dialog (${lang})`, { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
      const v = viewportOf(testInfo.project.name);
      await page.goto(`/?lang=${lang}`);
      await waitForApp(page);
      const dialog = await openShareDialog(page, lang);
      const box = dialog.locator(".modal-box");
      // Disambiguated from the footer Close button via btn-circle.
      const x = dialog.locator(".modal-box > button.btn-circle");
      await expect(x, "X button visible").toBeVisible();
      await expect(x, "X aria-label localized").toHaveAttribute("aria-label", CLOSE[lang]);
      // Top-right of the modal-box (within 16px of the top/right inner edges).
      const boxB = await box.boundingBox();
      const xB = await x.boundingBox();
      expect(boxB, "modal-box").not.toBeNull();
      expect(xB, "X button").not.toBeNull();
      expect(xB!.x + xB!.width, "X at right edge").toBeGreaterThan(boxB!.x + boxB!.width - 48);
      expect(xB!.y, "X at top edge").toBeLessThan(boxB!.y + 48);
      await box.screenshot({ path: out(v, `share-dialog-x-${lang}.png`) });
      await x.click();
      await expect(box, "dialog closed after X click").toBeHidden();
    });
  }
});

test.describe("share preview fits viewport", () => {
  for (const { key: sizeKey } of SIZES) {
    for (const lang of ["en", "de"] as const) {
      test(`preview below screen height, actions without page scroll (${sizeKey}/${lang})`, { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
        const v = viewportOf(testInfo.project.name);
        await page.goto(`/?lang=${lang}`);
        await waitForApp(page);
        const dialog = await openShareDialog(page, lang);
        const modal = await configureCard(dialog, lang, sizeKey, "dark");
        const vp = page.viewportSize()!;
        // Core rule: the preview image box is smaller than the screen height
        // on every preset (tall story/portrait cards scroll internally).
        const preview = dialog.locator("div[role='img']");
        const prevBox = await preview.boundingBox();
        expect(prevBox, `${sizeKey}/${lang}: preview box`).not.toBeNull();
        expect(prevBox!.height, `${sizeKey}/${lang}: preview below screen height`).toBeLessThan(vp.height);
        const boxB = await modal.boundingBox();
        expect(boxB, `${sizeKey}/${lang}: dialog box`).not.toBeNull();
        expect(boxB!.height, `${sizeKey}/${lang}: dialog fits viewport`).toBeLessThanOrEqual(vp.height + 1);
        await modal.screenshot({ path: out(v, `share-fit-${sizeKey}-${lang}.png`) });
        // Export actions reachable via dialog-internal scroll only — never page scroll.
        await modal.evaluate((m) => m.scrollTo(0, m.scrollHeight));
        const actions = modal.locator(".sticky.bottom-0");
        const actBox = await actions.boundingBox();
        expect(actBox, `${sizeKey}/${lang}: actions box`).not.toBeNull();
        expect(
          actBox!.y >= 0 && actBox!.y + actBox!.height <= vp.height,
          `${sizeKey}/${lang}: actions in viewport after dialog scroll`,
        ).toBe(true);
        expect(await page.evaluate(() => window.scrollY), `${sizeKey}/${lang}: no page scroll`).toBe(0);
      });
    }
  }
});

test.describe("share dialog theme follows page", () => {
  const CARD_BG = { dark: "#1d232a", light: "#ffffff" } as const;
  for (const pageTheme of ["dark", "light"] as const) {
    test(
      `defaults to page theme (${pageTheme}), explicit choice sticks`,
      { tag: ["@screenshot"] },
      async ({ page }, testInfo) => {
        const v = viewportOf(testInfo.project.name);
        await page.goto(`/?lang=en&theme=${pageTheme}`);
        await waitForApp(page);
        const dialog = await openShareDialog(page, "en");
        const svg = dialog.locator("div[role='img'] > svg");
        // No explicit choice yet: card SVG + preview follow the page theme.
        await expect(svg.locator("rect").first()).toHaveAttribute("fill", CARD_BG[pageTheme]);
        await dialog.locator(".modal-box").screenshot({ path: out(v, `share-theme-follows-${pageTheme}.png`) });
        // Explicit in-dialog choice applies immediately…
        const other = pageTheme === "dark" ? "Light" : "Dark";
        await dialog.getByRole("radio", { name: other, exact: true }).click();
        await expect(svg.locator("rect").first()).toHaveAttribute(
          "fill",
          CARD_BG[pageTheme === "dark" ? "light" : "dark"],
        );
        // …and sticks across close + reopen (follow-until-explicit).
        await page.keyboard.press("Escape");
        await expect(dialog.locator(".modal-box")).toBeHidden();
        const dialog2 = await openShareDialog(page, "en");
        await expect(dialog2.locator("div[role='img'] > svg rect").first()).toHaveAttribute(
          "fill",
          CARD_BG[pageTheme === "dark" ? "light" : "dark"],
        );
      },
    );
  }
});

test.describe("share link compat", () => {
  test("old sh_size square/wide coerce to og, new sizes round-trip", async ({ page }) => {
    await page.goto("/?sh_plan=goat&sh_size=square");
    await waitForApp(page);
    let dialog = await openShareDialog(page, "en");
    // Coercion visible WITHOUT touching the control: square -> og default.
    await expect(await findSelectByOptionValue(dialog, SIZE_VALUES)).toHaveValue("og");
    await page.keyboard.press("Escape");

    await page.goto("/?sh_plan=goat&sh_size=wide");
    await waitForApp(page);
    dialog = await openShareDialog(page, "en");
    await expect(await findSelectByOptionValue(dialog, SIZE_VALUES)).toHaveValue("og");
    await page.keyboard.press("Escape");

    await page.goto("/?sh_plan=goat&sh_size=story");
    await waitForApp(page);
    dialog = await openShareDialog(page, "en");
    await expect(await findSelectByOptionValue(dialog, SIZE_VALUES)).toHaveValue("story");
  });

  test("legacy sh_n is tolerated but ignored (automatic counts win)", async ({ page }) => {
    await page.goto("/?sh_size=og&sh_n=10");
    await waitForApp(page);
    let dialog = await openShareDialog(page, "en");
    await expect(dialog.locator("select"), "no TopN selector").toHaveCount(2);
    await expect(
      dialog.locator("div[role='img'] > svg").locator(":scope > g"),
      "og ignores sh_n=10 → Top 5",
    ).toHaveCount(5);
    await page.keyboard.press("Escape");

    await page.goto("/?sh_size=story&sh_n=3");
    await waitForApp(page);
    dialog = await openShareDialog(page, "en");
    await expect(
      dialog.locator("div[role='img'] > svg").locator(":scope > g"),
      "story ignores sh_n=3 → Top 8",
    ).toHaveCount(8);
  });

  test("old sh_metric links still open (forced to requests)", async ({ page }) => {
    await page.goto("/?sh_plan=pro&sh_metric=cost&sh_n=7&sh_basis=paid");
    await waitForApp(page);
    const dialog = await openShareDialog(page, "en");
    await expect(await findSelectByOptionValue(dialog, ["pro"])).toHaveValue("pro");
    // Metric forced to requests, legacy sh_n ignored (og default → Top 5), no crash.
    await expect(dialog.locator("div[role='img'] > svg").locator(":scope > g")).toHaveCount(5);
    await expect(dialog.locator('input[name="share-metric"]')).toHaveCount(0);
    await expect(dialog.locator("div[role='img'] > svg")).toBeVisible();
  });
});
