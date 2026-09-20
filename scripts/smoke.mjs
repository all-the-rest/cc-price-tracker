// Smoke-Test für den Produktions-Build: prüft dist-Artefakte, startet
// `vite preview` und verifiziert per HTTP, dass die Seite und die Daten
// ausgeliefert werden. Läuft lokal (`pnpm smoke`) und in CI identisch —
// kein Browser nötig. Jeder Fehler → exit 1.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, "..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = `http://localhost:${PORT}`;

let failures = 0;
const fail = (msg) => {
  failures += 1;
  console.error(`[smoke] FAIL: ${msg}`);
};
const ok = (msg) => console.log(`[smoke] ok: ${msg}`);

async function main() {
  // 1. Build-Artefakte vorhanden?
  for (const f of ["index.html", "CNAME", join("data", "latest.json")]) {
    if (!existsSync(join(DIST, f))) fail(`dist/${f} fehlt (Build unvollständig?)`);
    else ok(`dist/${f} vorhanden`);
  }

  // 2. Alle in index.html referenzierten Assets existieren?
  // (Vite schreibt relative ./assets/…-Pfade — data:-URIs ausnehmen.)
  const html = existsSync(join(DIST, "index.html")) ? readFileSync(join(DIST, "index.html"), "utf8") : "";
  const refs = [...html.matchAll(/(?:src|href)="(\.?\/assets\/[^"]+)"/g)].map((m) => m[1].replace(/^\.\//, ""));
  if (refs.length === 0) fail("index.html referenziert keine assets-Dateien");
  for (const ref of new Set(refs)) {
    if (!existsSync(join(DIST, ref))) fail(`${ref} referenziert, aber nicht in dist/`);
  }
  if (refs.length > 0) ok(`${new Set(refs).size} referenzierte Assets vorhanden`);

  // 3. Preview-Server starten und per HTTP prüfen.
  const server = spawn(join(ROOT, "node_modules", ".bin", "vite"), ["preview", "--port", String(PORT), "--strictPort"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  const stop = () => {
    try {
      server.kill("SIGTERM");
    } catch {
      // bereits beendet
    }
  };
  process.on("exit", stop);
  try {
    let root = null;
    for (let i = 0; i < 60; i++) {
      try {
        const res = await fetch(`${BASE}/`);
        if (res.ok) {
          root = await res.text();
          break;
        }
      } catch {
        // noch nicht bereit
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (root === null) {
      fail(`Preview-Server antwortet nicht auf ${BASE}/`);
    } else {
      ok("GET / → 200");
      if (!root.includes('id="root"')) fail("GET / enthält keinen App-Root (id=\"root\") — kaputtes Bundle?");
      else ok("App-Root vorhanden");
      if (!/<h1[^>]*>/.test(root)) fail("GET / enthält kein <h1>");
      else ok("<h1> vorhanden");
      if (!root.includes("application/ld+json")) fail("GET / enthält kein JSON-LD");
      else ok("JSON-LD vorhanden");
      if (!root.includes("window._$HY")) fail("GET / enthält kein Solid-Hydration-Script (window._$HY)");
      else ok("Hydration-Script vorhanden");
      // Vorgerendertes Markup: mindestens ein echter Modellname aus den Daten.
      try {
        const distData = JSON.parse(readFileSync(join(DIST, "data", "latest.json"), "utf8"));
        const sample = distData.models?.[0]?.name;
        if (sample && !root.includes(sample)) fail(`GET / enthält den Modellnamen „${sample}“ nicht (Prerender?)`);
        else if (sample) ok(`vorgerendertes Modell „${sample}“ vorhanden`);
      } catch (e) {
        fail(`Modellname-Prüfung: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const [path, needle, label] of [
      ["robots.txt", "Sitemap:", "robots.txt"],
      ["sitemap.xml", "<urlset", "sitemap.xml"],
      ["de/", '<html lang="de"', "de/"],
    ]) {
      try {
        const res = await fetch(`${BASE}/${path}`);
        if (!res.ok) {
          fail(`GET /${path} → HTTP ${res.status}`);
          continue;
        }
        const body = await res.text();
        if (!body.includes(needle)) fail(`/${path} enthält „${needle}“ nicht`);
        else ok(`GET /${path} → 200 (${label})`);
      } catch (e) {
        fail(`/${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    try {
      const res = await fetch(`${BASE}/data/latest.json`);
      if (!res.ok) fail(`GET /data/latest.json → HTTP ${res.status}`);
      else {
        const data = await res.json();
        ok("GET /data/latest.json → 200, valides JSON");
        if (!Array.isArray(data.models) || data.models.length === 0) fail("latest.json ohne Modelle");
        else ok(`${data.models.length} Modelle`);
        if (!Array.isArray(data.plans) || data.plans.length === 0) fail("latest.json ohne plans[]");
        else ok(`pläne: ${data.plans.map((p) => p.id).join(",")}`);
        if (!Array.isArray(data.freeModels)) fail("latest.json ohne freeModels[]");
        else ok(`${data.freeModels.length} Free-Modelle`);
      }
    } catch (e) {
      fail(`/data/latest.json: ${e instanceof Error ? e.message : String(e)}`);
    }
  } finally {
    stop();
  }

  if (failures > 0) {
    console.error(`[smoke] ${failures} Fehler — nichts davon darf auf prod.`);
    process.exit(1);
  }
  console.log("[smoke] alles grün.");
}

main().catch((e) => {
  console.error(`[smoke] FEHLER: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
