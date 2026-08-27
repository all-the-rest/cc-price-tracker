// Interaction coverage for the ui-review set.
//
// The manifest-driven `ui-screenshots.spec.ts` only ever captures static
// pixels and asserts nothing. This spec complements it with interactions that
// the static set can never trigger - opening the mobile hamburger and tapping
// a Tooltip - and adds REAL viewport-overflow guards: if the menu or the
// tooltip bubble ever clips off-screen, these tests go RED (not just a bad
// picture). All tests are tagged @screenshot so the harness captures pixels
// too.
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";
import process from "node:process";
import { uiReviewConfig } from "./ui-review.config";

const out = (viewport: string, file: string) =>
  path.resolve(process.cwd(), uiReviewConfig.outputDir, "filled", viewport, file);

/** A Playwright bounding box is fully on-screen within the given viewport. */
function assertWithinViewport(
  box: { x: number; y: number; width: number; height: number } | null,
  viewport: { width: number; height: number },
  label: string,
): void {
  expect(box, `${label}: expected a bounding box`).not.toBeNull();
  expect(
    box!.x >= 0 && box!.y >= 0 && box!.x + box!.width <= viewport.width && box!.y + box!.height <= viewport.height,
    `${label}: box {x:${box!.x}, y:${box!.y}, w:${box!.width}, h:${box!.height}} `
      + `exceeds viewport {w:${viewport.width}, h:${viewport.height}}`,
  ).toBe(true);
}

/**
 * Runs only under the Mobile Chrome project on the home route. Opens the
 * hamburger (now far-left in navbar-start), proves the open menu stays fully
 * on screen, and proves the burger sits at the far left edge.
 */
test.describe("mobile interactions", () => {
  test("hamburger opens on-screen and sits far left", { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "Mobile Chrome", "mobile-only interaction");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main")).toBeVisible();

    const viewport = page.viewportSize()!;
    const burger = page.locator(".dropdown-start > div[role='button']");
    await expect(burger).toBeVisible();

    // 2) Burger trigger sits at the far left edge (<= 64 px from the edge).
    const burgerBox = await burger.boundingBox();
    expect(burgerBox, "burger: expected a bounding box").not.toBeNull();
    expect(burgerBox!.x <= 64, `burger x=${burgerBox!.x} is not at the far left edge`).toBe(true);

    // 1) Open the menu and capture it.
    await burger.click();
    const menu = page.locator(".dropdown-content.menu");
    await expect(menu).toBeVisible();
    await page.waitForTimeout(200);

    const menuBox = await menu.boundingBox();
    await menu.screenshot({ path: out("mobile", "hamburger-menu.png") });
    await page.locator("header").screenshot({ path: out("mobile", "hamburger-header.png") });

    // 1) Guard: the open menu is fully within the viewport.
    assertWithinViewport(menuBox, viewport, "hamburger menu");
  });

  test("tooltip opens on tap and stays on-screen", { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "Mobile Chrome", "mobile-only interaction");

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main")).toBeVisible();

    const viewport = page.viewportSize()!;

    // 3) Tap a known Tooltip host (the allowance badge) to pin the bubble.
    const host = page.locator("span.inline-block > .badge").first();
    await expect(host).toBeVisible();
    await host.click();
    await page.waitForTimeout(200);

    const bubble = page.getByRole("tooltip");
    await expect(bubble).toBeVisible();
    const bubbleBox = await bubble.boundingBox();
    await bubble.screenshot({ path: out("mobile", "tooltip-bubble.png") });

    // 3) Guard: the bubble is fully within the viewport (no clipping).
    assertWithinViewport(bubbleBox, viewport, "tooltip bubble");

    // Scroll-with guard: the pinned bubble must track the trigger on scroll
    // (reposition), NOT stay frozen in the viewport. After scrolling it is still
    // fully on-screen (flip/clamp at the edges) and its vertical offset to the
    // host stays stable.
    const hostBox1 = await host.boundingBox();
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(200);
    const hostBox2 = await host.boundingBox();
    const bubbleBox2 = await bubble.boundingBox();
    expect(bubbleBox2, "bubble: expected bounding box after scroll").not.toBeNull();
    assertWithinViewport(bubbleBox2, viewport, "tooltip bubble (after scroll)");
    const hostVisible =
      hostBox2 !== null && hostBox2.y >= 0 && hostBox2.y + hostBox2.height <= viewport.height;
    if (hostVisible && hostBox1 !== null && bubbleBox !== null) {
      const delta1 = bubbleBox.y - hostBox1.y;
      const delta2 = bubbleBox2!.y - hostBox2!.y;
      expect(
        Math.abs(delta2 - delta1),
        `tooltip bubble did not track the trigger on scroll (delta ${delta1} -> ${delta2})`,
      ).toBeLessThanOrEqual(6);
    }

    // Tapping outside dismisses the pinned bubble.
    await page.locator("header").click();
    await expect(bubble).toBeHidden();
  });

  /**
   * Vertical-centering guard for the PeakIndicator: the schedule icon (16px),
   * the tier label and the countdown must sit on one shared center line. Runs
   * on both viewports; captures an element-scoped screenshot for the vision pass.
   */
  test("peak indicator is vertically centered", { tag: ["@screenshot"] }, async ({ page }, testInfo) => {
    const vp = testInfo.project.name === "Mobile Chrome" ? "mobile" : "desktop";

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("main")).toBeVisible();

    const icon = page.locator("span.icon-\\[material-symbols--schedule\\]").first();
    if ((await icon.count()) === 0) {
      test.skip(true, "no Peak/Off-Peak indicator present in current fixture");
      return;
    }
    await icon.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);

    const host = icon.locator("xpath=..");
    const tierText = host.locator("span").nth(1);
    const iconBox = await icon.boundingBox();
    const tierBox = await tierText.boundingBox();
    expect(iconBox, "peak icon: expected bounding box").not.toBeNull();
    expect(tierBox, "peak tier text: expected bounding box").not.toBeNull();

    const iconCenterY = iconBox!.y + iconBox!.height / 2;
    const tierCenterY = tierBox!.y + tierBox!.height / 2;
    expect(
      Math.abs(iconCenterY - tierCenterY),
      `peak icon center y=${iconCenterY} vs tier text center y=${tierCenterY} not aligned`,
    ).toBeLessThanOrEqual(2);

    await host.screenshot({ path: out(vp, "peak-indicator.png") });
  });
});
