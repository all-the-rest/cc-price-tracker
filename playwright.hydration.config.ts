// Playwright config for the post-build hydration suite.
//
// Separate from the ui-review screenshot set (which runs against `pnpm dev`):
// this one runs against the prerendered `dist/` via `vite preview` and asserts
// that Solid hydration actually works (no pageerrors, single #root child,
// interactive tabs, path-based language switch). Requires a fresh build, which
// the webServer command performs. Run via `pnpm test:hydration`.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4175;

export default defineConfig({
  testDir: "./tests/hydration",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 60000,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    video: "off",
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  projects: [{ name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } }],
});
