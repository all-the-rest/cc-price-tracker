// Prerender-Pipeline: baut den Client, baut eine SSR-Variante der App und
// schreibt je Route × Sprache eine statische HTML-Datei mit vorgerendertem
// Markup und vollständigem SEO-Head (Canonical, hreflang, JSON-LD …).
//
//   pnpm build  →  tsc --noEmit && node scripts/prerender.mjs
//
// Der Build-Stempel wird EINMAL gesetzt und in Client- und SSR-Bundle (via
// data/latest.json) sowie dist/data/latest.json identisch verwendet, damit
// Footer-„Stand“ und Share-Card-Zeit hydration-stabil sind.
import { build } from "vite";
import solid from "vite-plugin-solid";
import { generateHydrationScript } from "solid-js/web";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.BUILD_STAMP ??= new Date().toISOString();
const BUILD_STAMP = process.env.BUILD_STAMP;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const SSR_OUT = join(ROOT, ".ssr-build");
const SITE_URL = "https://cc-pricing.all-the.rest";

// Stempelt data/latest.json im SSR-Bundle (die Repo-Config `vite.config.ts`
// macht das für das Client-Bundle; der SSR-Build läuft bewusst ohne Config).
function ssrStampPlugin() {
  return {
    name: "ssr-stamp-build-time",
    enforce: "pre",
    transform(code, id) {
      if (id.endsWith("data/latest.json")) {
        const data = JSON.parse(code);
        data.fetchedAt = BUILD_STAMP;
        return JSON.stringify(data);
      }
    },
  };
}

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function writeSitemap(routes) {
  const lastmod = BUILD_STAMP.slice(0, 10);
  const indexable = routes.filter((r) => r.indexable);
  const urls = [];
  for (const route of indexable) {
    const en = SITE_URL + route.langs.en.path;
    const de = SITE_URL + route.langs.de.path;
    for (const loc of [en, de]) {
      urls.push(
        `  <url>\n` +
          `    <loc>${escXml(loc)}</loc>\n` +
          `    <lastmod>${lastmod}</lastmod>\n` +
          `    <xhtml:link rel="alternate" hreflang="en" href="${escXml(en)}" />\n` +
          `    <xhtml:link rel="alternate" hreflang="de" href="${escXml(de)}" />\n` +
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${escXml(en)}" />\n` +
          `  </url>`
      );
    }
  }
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    urls.join("\n") +
    `\n</urlset>\n`;
  writeFileSync(join(DIST, "sitemap.xml"), xml);
}

function writeRobots() {
  const txt = `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
  writeFileSync(join(DIST, "robots.txt"), txt);
}

async function main() {
  // 1) Client-Build (mit Repo-Config, inkl. Tailwind/CSS/Assets).
  await build({ configFile: join(ROOT, "vite.config.ts"), root: ROOT, logLevel: "info" });

  // 2) SSR-Build der App (eigene, schlanke Config ohne CSS/Tailwind).
  rmSync(SSR_OUT, { recursive: true, force: true });
  await build({
    configFile: false,
    root: ROOT,
    logLevel: "error",
    plugins: [solid({ ssr: true, generate: "ssr" }), ssrStampPlugin()],
    build: {
      ssr: "src/ssr-entry.tsx",
      outDir: ".ssr-build",
      emptyOutDir: true,
      copyPublicDir: false,
      minify: false,
      sourcemap: false,
    },
  });

  const ssrFile = readdirSync(SSR_OUT).find((f) => f.startsWith("ssr-entry."));
  if (!ssrFile) throw new Error("SSR-Bundle nicht gefunden (.ssr-build/ssr-entry.*)");
  const mod = await import(pathToFileURL(join(SSR_OUT, ssrFile)).href);
  const { renderRoute, prerenderRoutes } = mod;

  // 3) Vorgerenderte HTML-Dateien je Route × Sprache schreiben.
  const template = readFileSync(join(DIST, "index.html"), "utf8");
  if (!template.includes('<div id="root"></div>')) {
    throw new Error('dist/index.html enthält kein leeres <div id="root"></div>');
  }
  const hydrationScript =
    typeof mod.generateHydrationScript === "function"
      ? mod.generateHydrationScript()
      : generateHydrationScript();

  for (const route of prerenderRoutes) {
    for (const lang of ["en", "de"]) {
      const { path, outFile } = route.langs[lang];
      const { html, head } = renderRoute(path, lang);
      let out = template.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
      out = out.replace(/<html lang="[^"]*"/, `<html lang="${lang}"`);
      out = out.replace(
        /<!--seo:start-->[\s\S]*?<!--seo:end-->/,
        `<!--seo:start-->\n    ${head}\n    <!--seo:end-->`
      );
      if (!out.includes("window._$HY")) {
        out = out.replace("</head>", `  ${hydrationScript}\n  </head>`);
      }
      const target = join(DIST, outFile);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, out);
      console.log(`[prerender] ${outFile} (${lang} ${path})`);
    }
  }

  writeRobots();
  writeSitemap(prerenderRoutes);
  console.log(`[prerender] robots.txt + sitemap.xml geschrieben (Stempel ${BUILD_STAMP})`);
  if (!existsSync(join(DIST, "data", "latest.json"))) {
    console.warn("[prerender] Warnung: dist/data/latest.json fehlt");
  }
}

main().catch((e) => {
  console.error(`[prerender] FEHLER: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
