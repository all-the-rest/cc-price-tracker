import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// Einmaliger Build-Stempel für Client, SSR und dist/data/latest.json.
// `scripts/prerender.mjs` setzt `BUILD_STAMP` vor beiden Builds; läuft Vite
// direkt (`pnpm dev`), wird ersatzweise der Startzeitpunkt verwendet.
const buildTimeIso = process.env.BUILD_STAMP ?? new Date().toISOString();

function stampFetchedAt(raw: string): string {
  const data = JSON.parse(raw);
  data.fetchedAt = buildTimeIso;
  return JSON.stringify(data, null, 2);
}

export default defineConfig({
  // Absolute Basis: Assets funktionieren damit auch unter /de/… und /impressum/…
  base: "/",
  plugins: [
    // `ssr: true` → hydratationsfähiger Client-Code (`generate: "dom",
    // hydratable: true`); ohne das findet `hydrate()` die Server-Marker nicht.
    solid({ ssr: true }),
    tailwindcss(),
    {
      name: "stamp-build-time",
      enforce: "pre",
      apply: "build",
      transform(code, id) {
        if (id.endsWith("data/latest.json")) {
          return stampFetchedAt(code);
        }
      },
    },
    {
      name: "copy-price-data",
      apply: "build",
      closeBundle() {
        mkdirSync("dist/data", { recursive: true });
        writeFileSync(
          "dist/data/latest.json",
          stampFetchedAt(readFileSync("data/latest.json", "utf8"))
        );
      },
    },
  ],
});
