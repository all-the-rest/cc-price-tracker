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

## Phase 6: Share-Cards (Portrait-Regel)
- [ ] Portrait-Karten (IG 4:5 1080×1350, Story 9:16 1080×1920) füllen die Höhe mit **Constraints statt
  uninteressanten Modellen**: TopN bescheiden (5–8), pro Zeile max. eine Constraint-Zeile
  (5h-/Weekly-Limit-Hinweis je Plan), kompakter Constraints-Block unter der Liste
  (5h-/Weekly-Limits + Stand + Domain-Quelle `cc-pricing.all-the.rest`).
- [ ] Landscape (OG 1200×630, Twitter 1200×675): Top 5, Requests + Preis, keine Constraints.
- [ ] Zeilen-Details: Rank + Name + Requests + Preis (Breite 1080px begrenzt keine weiteren Felder).

## Phase 7: Datengetriebene Peak-Regeln (Spezifikation 2026-09-30)
Verbindliche Spezifikation: Peak-Regeln aller Tracker-Repos (`peak-spec.md`). `peakHours` wird durch
`peakRules` ersetzt; der Wochentags-Scope kommt aus der Quelle (commandcode-Doku:
`"01–04 & 06–10 UTC, Mon–Fri"` + FAQ „Saturday and Sunday are charged completely off-peak").
**Nutzerentscheidung (bindend): strikt quellenbindend — keine Feiertagsdaten** (die Quelle nennt keine).

- [x] `peakHours` → `peakRules` (**Datenform entfernt**, kein `peakHours` mehr im Snapshot).
- [x] Scraper `parsePeakDays` (en `Mon–Fri`/`Monday to Friday`/`weekdays`; de `Mo–Fr`/`montags bis freitags`/`werktags`),
  fehlender Scope → `ScrapeError`; Komplement → `offPeak.days`; `effectiveFrom` aus `tod.effective` (+ englische Prosa).
- [x] `timezone`/`windowsUtc`/`days`/`effectiveFrom` unverändert quellenbelegt; `PEAK_TIMEZONE_BY_PROVIDER` (DeepSeek → `Asia/Shanghai`).
- [x] Schema (zod) mit allen Invarianten aus §1 inkl. Negativtests. `holidayCalendars` bleibt **optional** im Schema
  (nicht geschrieben); eine Regel MIT `holidays` verlangt weiterhin den referenzierten Kalender.
- [x] Datenmigration `peakHours` → `peakRules` als **stilles** Daten-Update (kein Changelog-Event, kein Release;
  `peakChanged` als Write-Trigger ergänzt `changes.length > 0`). Ergebnis: 5 Peak-Regeln (inkl. `deepseekv41flash`),
  **kein** `holidays`-Feld, **kein** `holidayCalendars`.
- [x] UI-Auswertung in **einer** Quelle (`src/config/peakPricing.ts`: `evaluatePeak`/`isPeakActive`/`localDateKey`/
  `isoWeekday`); `PEAK_WINDOWS_UTC`, `weekendOffPeakDaysBeijing`, `isBeijingWeekend`, `effectiveFromMs` entfernt.
- [x] `PeakIndicator`, `share.ts` und `i18n.ts` (de+en) angepasst; Wochentags-Scope aus `days` generiert
  (`weekdayScopeLabel`/`peakCoverageLabel`), `effectiveFrom` als „Vorlaufzeit" markiert.
- [x] Feiertags-Verzweigung in `evaluatePeak` bleibt als **inerte**, optionale Verzweigung (Quelle nennt keine
  Feiertage); `parseHolidays` bleibt als Parser (Beleg, dass die Quelle geprüft wurde).
- [x] Tests: `tests/peak.test.mjs` prüft das **Fehlen** von Feiertagsdaten (leerer Kalender, 01.10.2026 wie ein normaler
  Werktag) plus die inerte optionale Verzweigung; `tests/scrape.test.mjs` deckt Scope-Parsing, Wochenend-Auszug,
  `parseHolidays`, `ScrapeError`-Negativfälle und alle zod-Invarianten ab; `tests/ssr-entry.tsx` auf `peakRules`
  umgestellt. Keine Testdatei gelöscht/übersprungen.
- [ ] `ai-10-usd` (Consumer dieses Repos, **anderes Repo**): `scripts/normalize.mjs` reicht `peakRules` durch (`?? null`)
  und behält `holidayCalendars` optional/tolerant. **In Arbeit — nicht Teil dieses Repos.**

### Verworfen
- [x] **Chinesische Feiertage in den Tracker-Daten** (Nutzerentscheidung 2026-09-30): Die Quelle
  (`commandcode.ai/docs/resources/pricing-limits`) nennt **keine** Feiertage — weder deutsche noch englische
  Peak-Notiz, live verifiziert. Ein Feiertags-Kalender wäre eine erfundene Annahme. Die Information
  „excluding Chinese public holidays" steht real nur in der **DeepSeek-Originaldoku**
  (`api-docs.deepseek.com`) — bewusst **nicht** übernommen (strikt quellenbindend).
- [x] **`PEAK_HOLIDAY_OVERRIDES`** (Anbieter → Kalender): war eine versteckte Annahme; ersatzlos entfernt.
- [x] **`chinese-days`** als devDependency, `buildHolidayCalendars` und der `getHolidaysInRange`-Aufruf: entfernt
  (`pnpm remove -D chinese-days`); keine Spur in `package.json`/Lockfile/node_modules. Der zugehörige
  **Lib-Frische-Guard-Test** entfällt ersatzlos (es gibt keine Lib mehr zu überwachen).
- [x] **Footer-Feiertagszeile** + i18n-Schlüssel (`footerHolidays`/`footerHolidaysEnded`): entfernt, kein Ersatz,
  keine Platzhalterzeile. Spezifikation §7a gilt damit für dieses Repo als **nicht anwendbar** (keine Kalenderdaten).
- [x] Hartkodierte Wochenend-Annahme (`weekendOffPeakDaysBeijing: [0,6]`, `isBeijingWeekend`) — durch datengetriebene
  `peakRules` ersetzt; **nicht** wieder einführen.
- [x] `PEAK_WINDOWS_UTC`/`PEAK_MECHANISMS` als statische Fenster-Konstanten — Fenster kommen aus dem Snapshot.
- [x] Changelog-Event/Release für Peak-Änderungen — Spezifikation §4: stille Daten-Updates.
- [x] Legacy-`peakHours` als Union/Übergangsform weiterführen — entfernt; Consumer (`ai-10-usd`) bleibt dual-tolerant.

### Abweichungen / Mehrdeutigkeiten
- [x] `offPeak.days` ist per zod `min(1)` (Spezifikation §1 Invariante 2). Ein hypothetischer „täglich Peak"-Anbieter
  (Peak an allen 7 Tagen) würde damit `offPeak.days: []` brauchen und die Invariante brechen — für Command Code
  (DeepSeek) irrelevant, aber als Grenze notiert.

## Browser-Konsolen-Test (Playwright, Follow-up zum Smoke-Test)
- [ ] Playwright-Test, der die Seite im echten Browser lädt und Konsolen-Fehler/pageerrors
  als Fehler wertet (fängt JS-Laufzeitfehler, die Build + `pnpm smoke` nicht sehen).
  Eigene Suite/config (nicht in die Screenshot-Suite — die bleibt assertion-frei),
  in CI nach dem Smoke-Step. Browser via Container-Image oder `playwright install`.

> **Hinweis zum NACHTRAG (Provider-Vendor-Regeln):** Der Nachtrag zu Vendor-Spezifika (`mimo` täglich, `zai` SGT,
> `ollama` UTC, Mitternachts-Fenster aufteilen) betrifft das Repo **`provider-plans`** (Spezifikation §6), nicht
> `cc-price-tracker` — hier existieren ausschließlich DeepSeek-Peak-Zeilen (Spezifikation §8). Nicht in diesem Repo
> umgesetzt/verifiziert.
