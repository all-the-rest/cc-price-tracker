# AGENTS.todo.md — cc-price-tracker

Status-Tracking für den Aufbau. Upstream: `all-the-rest/ocgo-price-tracker` (@ `2601608f58f7819b7cb37d570b3b235fcf3871ee`), Domain `cc-pricing.all-the.rest`.

## Phase 1: Grundgerüst
- [x] Template-Kopie (rsync, ohne .git/node_modules/dist/data/.idea/.run/tests-Fixtures)
- [x] `git init -b main` + upstream-Remote
- [x] `pnpm install` (Lockfile unverändert, daisuui/tailwind via pnpm-workspace)
- [x] package.json: name/description → cc-price-tracker
- [x] index.html: Title/Meta für Command Code
- [x] public/CNAME → `cc-pricing.all-the.rest`
- [x] README.md umschreiben (Setup, Deployment, Domain/DNS, Upstream-Sync)
- [x] AGENTS.md umschreiben (CC-Quellen, Datenmodell, Scraper-/UI-Regeln, upstream-Revision)
- [x] .github/workflows/price-tracker.yml: Artefaktname, URLs, Versions-Kommentar

## Phase 2: Datenvertrag
- [x] `src/types.ts` neu (Pläne/Modelle/Allowances/Deals/Events) — Ground Truth für Scraper + UI

## Phase 3: Scraper (Subagent)
- [x] `scripts/scrape.mjs` neu:
  - RSC-Payload-Parser für `https://commandcode.ai/docs/resources/pricing-limits` (`rows` = 58 Modelle, Billing-`models` = 54 mit `planAllowanceUsd{goat,pro}`)
  - Plan-Tabelle (server-gerendert) → Pläne dynamisch (Go/GOAT/Pro/Provider/Max 10×/Max 20×: Preis, Credits, ~Requests, Models-Scope) + Limit-Tabelle (5h/weekly)
  - API-Access je Plan aus den Plan-Docs-Seiten (`/docs/plans/{go,goat,pro,max}`) + `apiAccessSourceUrl`; Go = `false`
  - Deals (rates/listRates, expires/endsWhen, free), deprecated-Filter, Free-Models, Multi-Tier (tiers[0])
  - Capabilities via `@opencode-ai/models` (models.dev/api.json, Live→Snapshot-Fallback)
  - `pattern` = globales Standard-Anfragemuster (**800 in / 50.000 cached / 162 out**, ~125–200-Output-Range-Mitte)
  - zod-Validierung (`validateSnapshot`, `validateChangelog`); Erstlauf erzeugt Daten + „Initial version"-Event
  - Plan-aware Diff/Events (`allowance_changed`, `plan_*`, `api_access_changed`)
  - **Expired-Deals-Filter** (`expires < heute` → Deal verwerfen, listRates als Now)
- [x] Fixtures: pricing-limits-HTML + Go/GOAT/Pro/Max-Seiten + models.dev-Snapshot
- [x] `tests/scrape.test.mjs` (Parser, Deals was/now, Allowances, deprecated-Filter, Free, Expired-Deal)
- [x] Initialer Scrape → `data/latest.json`, `data/history.json`, `CHANGELOG.json`, `src/data/changelog.json`

## Phase 4: UI (Subagent, nach Scraper)
- [x] `src/i18n.ts`, `weighted.ts` (plan-basiert), `sort.ts`, `capabilities.tsx` (Text/Vision/Reasoning/Tool-Badges)
- [x] PlanTabs: Go | GOAT | Pro | Max 10× | Max 20×, **GOAT default**, `?plan=` URL-State
- [x] PriceTable plan-aware: `usage = allowances[plan] ?? plan.defaultAllowance ?? plan.creditsMonthly`; Allowance-Badge `$N · Faktor×` mit plan-relativen Farben (rot/gelb/grün/dunkelgrün), Free-Modelle „unlimited" (dunkelgrün), Context-Window; **keine Rabatt-Badges in der Tabelle**
- [x] PlanComparison: Preis/Credits/~Requests/5h·weekly·monthly/API-Zugang (+Quelle)/Modell-Scope/Deals
- [x] ZdrNote (ersetzt PrivacyTable), FreeModelsTable (bis-Spalte), Changelog plan-aware, Hero/Header/Footer
- [x] App.tsx-Verdrahtung, `privacy.ts`/PrivacyTable entfernen
- [x] `tests/ssr-entry.tsx` + `tests/sorting.test.mjs` anpassen

## Phase 5: Verifikation & Launch
- [x] **Expired-Deals-Fix:** Scraper filtert Deals mit `expires < heute` (z. B. Qwen 3.7 Max, 2026-06-22) → Deal verwerfen, `listRates` als Now-Rates übernehmen
- [x] **Tooltip-Text:** Kosten-pro-Anfrage-Tooltip nennt die dokumentierte Annahme: „~800 fresh input tokens, ~50,000 cache-read tokens, ~125-200 output tokens" (de/en), Quelle commandcode.ai/docs/plans/goat
- [x] **Daten-Regeneration:** `REQUEST_PATTERN` (800/50.000/162) ist im Snapshot aktiv → `data/latest.json` + `data/history.json` frisch gescrapt (gekoppelt mit Expired-Deals-Fix)
- [x] `pnpm test` (181), `pnpm typecheck`, `pnpm build` grün
- [x] `pnpm preview` → 200; `/data/latest.json` antwortet
- [x] `dist/` enthält `data/latest.json` + `CNAME`
- [x] Commit + Push `main`; CI grün; Pages-Custom-Domain + DNS prüfen (live: https://cc-pricing.all-the.rest)
- [x] all-the.rest-Eintrag committet + gepusht (live)
- [x] Upstream-Sync-Workflow (manuell, change-by-change) in README dokumentiert

