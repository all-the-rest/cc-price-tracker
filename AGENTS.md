# AGENTS.md

## Projektüberblick

Preis-Tracking für Command Code (commandcode.ai). Ein täglicher GitHub-Actions-Lauf scrapet
`https://commandcode.ai/docs/resources/pricing-limits` (RSC-Payload mit Model-Katalog +
server-gerenderte Plan-/Limit-Tabellen), die Plan-Docs-Seiten (`/docs/plans/{go,goat,pro,max}`)
für den API-Zugang und `https://models.dev/api.json` für Modell-Fähigkeiten. Ergebnis: eine
statische SolidJS-Seite unter `https://cc-pricing.all-the.rest` mit Plan-Tabs
(Go/GOAT/Pro/Max 10×/Max 20×, GOAT default), Plan-Vergleich, Deals, Free-Models, Changelog.

- Repo (remote): `all-the-rest/cc-price-tracker`
- Upstream: `all-the-rest/ocgo-price-tracker` (Basis-Revision `2601608f58f7819b7cb37d570b3b235fcf3871ee`) — eigenständiges Projekt, Fixes werden manuell übernommen
- GitHub Pages Custom Domain: `cc-pricing.all-the.rest` (CNAME)

## Stack

- SolidJS 1.9 + Vite 8 (`vite-plugin-solid`), TypeScript 7 (`tsc --noEmit`)
- Tailwind CSS 4 + daisyUI 5 — lokal gebündelt, keine externen Fonts/Libs via URL
- Scraper: Node ≥22, `scripts/scrape.mjs` mit cheerio + `@opencode-ai/models` (nur devDependencies)
- Paketmanager: pnpm — die `packageManager`-Version in `package.json` ist maßgeblich
- Deployment: GitHub Pages (`upload-pages-artifact` + `deploy-pages`), CNAME im `public/`

## Befehle

```bash
pnpm install          # Lockfile versioniert (lockfileVersion 9)
pnpm scrape           # holt Daten → data/latest.json, data/history.json, CHANGELOG.json, src/data/changelog.json
pnpm test             # node --test tests/**/*.test.mjs (Scraper + SSR-Sortierung)
pnpm dev              # Dev-Server
pnpm build            # Typecheck + Vite-Build → dist/ (inkl. dist/data/latest.json)
pnpm preview          # dist/ lokal serven
pnpm typecheck        # nur tsc --noEmit
```

> **Changelog-Git-History:** `CHANGELOG.json` wird bei Änderungen vom CI committet und gepusht
> (`git add CHANGELOG.json data src/data`). Lauf ohne Änderungen erzeugt keinen Commit.

## Datenquellen

| Quelle | Inhalt | Technik |
|---|---|---|
| `https://commandcode.ai/docs/resources/pricing-limits` | Model-Katalog `rows` (58, mit `rates`/`listRates`/`deal`/`availability`/`caps`/`contextWindow`/`deprecated`) + Billing-`models` (54, mit `planAllowanceUsd{goat,pro}`) | RSC-Flight-Payload (`self.__next_f.push([1,"…"])`, konkatenieren, `extractArray`) |
| dito | Plan-Tabellen (Preis/Credits/Requests, 5h-Weekly-Limits) | server-gerendertes HTML (cheerio), Tabellen über Header-Zeile |
| `https://commandcode.ai/docs/plans/{go,goat,pro,max}` | API-Zugang je Plan | HTML, Regex `only plan without API access` |
| `https://models.dev/api.json` | Capabilities (`modalities`, `reasoning`, `tool_call`) | `@opencode-ai/models` Client, Live→Snapshot-Fallback |

## Datenmodell (`data/latest.json`)

```jsonc
{
  "fetchedAt": "…", "sourceUrl": "…/pricing-limits", "plansSourceUrl": "…/pricing-limits",
  "capabilitiesSourceUrl": "https://models.dev/api.json", "sourceLang": "en",
  "plans": [{ "id": "goat", "name": "GOAT", "priceMonthly": 10, "creditsMonthly": 70,
    "requestEstimate": 75000, "apiAccess": true, "apiAccessSourceUrl": "…/docs/plans/goat",
    "limits": { "h5": 14, "weekly": 35, "monthly": 70 }, "defaultAllowance": 20,
    "modelsIncluded": "…", "sourceUrl": "…" }],
  "models": [{ "id": "minimax-m3", "name": "MiniMax M3", "provider": "MiniMax",
    "category": "opensource", "tier": "Standard / Long context", "contextWindow": 1000000,
    "input": 0.3, "output": 1.2, "cachedRead": 0.06, "cachedWrite": null,
    "listInput": 0.6, "listOutput": 2.4, "listCachedRead": 0.12, "listCachedWrite": null,
    "deal": { "id": "minimax-m3-2x-usage", "discountPercent": 50, "free": false,
      "expires": null, "endsWhen": null, "revertNote": null },
    "deprecated": false,
    "availability": { "go": true, "goat": true, "pro": true, "provider": true, "max": true, "team": true },
    "allowances": { "goat": 47, "pro": 57 },
    "capabilities": { "input": ["text","image"], "output": ["text"], "reasoning": true, "toolCall": true },
    "pattern": { "input": 850, "cachedRead": 49000, "output": 180 }, "tip": "…" }],
  "freeModels": [{ "id": "…", "name": "…", "availableFrom": "…", "until": null, "capabilities": {…}, "note": "…" }]
}
```

- **Effektivpreis-Berechnung (UI, `weighted.ts`):** `usage = model.allowances[plan] ?? plan.defaultAllowance ?? plan.creditsMonthly`;
  `full = list × plan.creditsMonthly/usage`, `paid = list × plan.priceMonthly/usage`. Go/Max haben keine Allowances →
  `usage = creditsMonthly` (full = 1×, paid = price/credits).
- **Plan-Wert / grüne Schwelle (`weighted.ts` `planValue`):** aus der persistierten Config `src/plan-baselines.json`
  („credits included" ÷ **tatsächlich gezahlter Preis** `actualPaid`, inkl. Stripe-Gebühr, vgl. commandcode.ai/pricing).
  Dadurch stimmt die Schwelle mit dem `paid`-Faktor (`usage ÷ actualPaid`) überein: ein Modell am Credit-Baseline-Punkt
  liegt exakt auf der grünen Schwelle. `null` = unbegrenzt (Provider) → dunkelgrün. Fällt für nicht-configurierte
  Pläne auf `creditsMonthly ÷ actualPaid` zurück. `defaultAllowance`/`planValue` steuern nicht mehr die Farbklassen.
- **Beworbenes Verhältnis (`weighted.ts` `advertisedValue`):** „credits included" ÷ „advertised price" (OHNE
  Stripe-Gebühr) — dient als Kontrast zu `planValue` (Hero „Wert"-Stat + PlanComparison-Zeile „Beworben"), um den
  Effekt der separaten Stripe-Gebühr sichtbar zu machen.
- `input/output/cachedRead/cachedWrite` = **Deal-Now**-Preise (was man zahlt); `list*` = Was-Preise (nur bei Deals,
  sonst null). `rates`/`listRates` aus `tiers[0]`; `listRates` kann String-Referenz sein → null.
- `deal.expires` ist `YYYY-MM-DD` (normalisiert), `endsWhen` freier Text (z. B. „while capacity lasts").
- `availability`: gemappt aus `individual-go/goat/pro/provider/max/ultra/teams-pro` (+`all`); `max` deckt Max 10×/20× ab.
- `allowances` nur GOAT/Pro (aus `planAllowanceUsd`); andere Pläne null.
- `pattern` = globales dokumentiertes Standard-Anfragemuster (850 in / 49.000 cached / 180 out) für alle Modelle.
- Capabilities-Fallback: wenn models.dev keinen Treffer hat, aus CC-`caps` (`text`/`vision`/`reasoning`) bauen, `toolCall: false`.
- Free-Models: `deal.free` oder alle rates 0 UND mindestens ein availability-Key true; `availableFrom` bleibt über Läufe erhalten.
- `data/history.json` = `{ "snapshots": [ … ] }`; `CHANGELOG.json` minified (`JSON.stringify`, eine Zeile).

## Scraper-Regeln (`scripts/scrape.mjs`)

- **RSC-Payload:** alle `self.__next_f.push([1,"…"])`-Chunks `JSON.parse`-en und konkatenieren; `"rows":[…]` und
  `"models":[…]` per Klammer-Tiefenscan (`extractArray`) extrahieren. Unbekannte/changed Struktur → `process.exit(1)`.
- **Plan-Tabellen** über Header-Zeile identifizieren („Price/mo" + „Credits/mo"; „5-hour limit" + „Weekly limit") —
  nicht nth-child. `~75K requests` → 75000; `Pay as you go` → `creditsMonthly: null`.
- **Baseline-Validierung:** `validatePlanBaselines` prüft je Plan, dass eine Baseline existiert (persistierte Config
  `src/plan-baselines.json` oder aus gescrapten Preisen ableitbar). Neuer Plan (nicht in Config) mit nicht scrapbarer
  Baseline (Credits oder Preis fehlen) → `process.exit(1)`.
- **API-Zugang:** pro Plan-Seite `only plan without API access` → `apiAccess: false` (Go); sonst true. HTTP-Fehler → rot.
- **Deals/Preise:** `rates` = Now, `listRates` = Was. `price_changed` bei Now-Änderung, `deal_changed` bei
  deal/listRates-Änderung. Float-Toleranz 1e-9. `expires` auf `YYYY-MM-DD` normalisieren.
- **Allowances:** `allowance_changed` je Plan (goat/pro) mit from/to; `planAllowanceUsd` ist maßgeblich.
- **Deprecated/unverfügbar:** Modelle ohne availability-Key auf mindestens einem Plan → `model_removed` (wenn vorher da),
  sonst aus dem Snapshot ausgeschlossen (z. B. `ling-3.0-flash-free`).
- **Free-Models:** `availableFrom` aus vorherigem Lauf übernehmen; Modell nicht mehr free → `free_removed` (until = heute).
- **Plan-Events:** `plan_added`/`plan_removed` (mit `{ priceMonthly, creditsMonthly, requestEstimate, apiAccess }`),
  `plan_pricing_changed` (Preis/Credits/Requests), `api_access_changed` (boolean).
- **zod-Validierung:** `validateSnapshot` (jedes Modell MUSS `pattern` haben), `validateChangelog` (keine leeren Einträge).
  Ungültig → `process.exit(1)`.
- **Erstlauf:** ohne `data/latest.json` Daten + History schreiben und `text`-Event „Initial version" anlegen.
- `CHANGELOG.json` minified; `mergeChanges`-Dedupe-Key `${type}:${model ?? ""}:${plan ?? ""}`.

## UI-Regeln (daisyUI 5 / Tailwind 4)

- Nur daisyUI-/Tailwind-Klassen; Semantic-Colors (`base-*`, `primary`, `badge-*`), kein `dark:`.
- Kein `tailwind.config.js` — Tailwind 4: `@import "tailwindcss";` + `@plugin "daisyui";` in `src/index.css`.
- Sprache: localStorage `lang`, sonst Browser-Locale; Default `en` (Quelle ist englisch), Theme via `theme-controller`.
- **Query-Params:** `plan=go|goat|pro|max10|max20` (Default `goat`), `basis=list|full|paid`, `sort=…`,
  `fsort=…` (Free), `lang`, `cap`/`fcap` — URL > localStorage, `history.replaceState`.
- **PlanTabs:** Go | GOAT | Pro | Max 10× | Max 20×; Tab = inkludierte Modelle mit Allowance (`usage`), Deals-Spalte
  (Was/Now), Context-Window, Capability-Badges (Text/Vision/Reasoning/Tool-Call), Drag-Scroll.
- **PlanComparison:** alle Pläne nebeneinander — Preis, Credits, ~Requests, 5h/Weekly/Monthly, API-Zugang (mit Link auf
  `apiAccessSourceUrl`), Modell-Scope, aktive Deals.
- **ZDR-Info-Karte** (ersetzt die OCG-Datenschutz-Tabelle): „Command Code trainiert nicht auf deinem Code", `CMD_ZDR=1`.
- **Free-Models-Tabelle** mit „Verfügbar seit/bis". **Changelog** rendert plan-aware Events mit Richtungs-Badges.
- Quellen-Links (pricing-limits, models.dev), RSS (`releases.atom`) und Watch-Hinweis im Footer.

## CI/CD (`.github/workflows/price-tracker.yml`)

- Trigger: `workflow_dispatch` (extern per Server-Cron getriggert via `scripts/install-cron.sh`: Mo–Fr alle 2h 06:00–20:00 MEZ/MESZ, Sa/So 06:00+14:00) + täglicher GitHub-Actions-Safety-Net-Lauf (`schedule: "28 20 * * *"` = 20:28 UTC), `push` auf `main`.
- Pipeline: install (`--frozen-lockfile`) → `pnpm test` → `pnpm scrape` → `pnpm build` → Commit
  (CHANGELOG.json + data + src/data, `github-actions[bot]`, nur bei Änderungen) → Release
  (`node scripts/ensure-release.mjs --all`, Tag = Changelog-Datum, RSS via `releases.atom`) →
  Sync-Check (`node scripts/check-release-sync.mjs` bricht rot ab, wenn Changelog-Einträge und GitHub-Releases
  divergieren) → `upload-pages-artifact` (dist) + `upload-artifact` → `deploy-pages`.
- `scripts/release-notes.mjs` rendert plan-aware, rein englische Notizen. Fehlgeschlagenes `pnpm scrape` bricht ab.
- Nach einem Daten-Commit (`changed=true`) benachrichtigt der Deploy-Job das Vergleichs-Projekt `all-the-rest/ai-10-usd` per `repository_dispatch` (`event_type=source-updated`, POST auf `/repos/all-the-rest/ai-10-usd/dispatches`). Secret: `AI10USD_DISPATCH_TOKEN` (PAT mit `repo`-Scope bzw. fine-grained mit Contents read/write auf `ai-10-usd`). Fehlt das Secret → Step übersprungen (grün); vorhanden → der Step prüft den HTTP-Status und bricht bei ≠ 2xx **rot** ab (kein stiller Verlust wie beim alten `curl -sS` ohne `-f`).
- **Lokale Daten-Commits (Push statt CI-Commit):** Wird eine Datenänderung lokal committet und per Push auf `main` gebracht — statt vom CI-Job (der `changed=true` erzeugt und committet) —, feuert der automatische Dispatch **nicht**: Der Scrape im CI findet dann keine Diffs (`changed=false`), der Notify-Step wird übersprungen. Das Vergleichs-Projekt dann manuell triggern:
  ```bash
  gh api -X POST repos/all-the-rest/ai-10-usd/dispatches --input - <<'EOF'
  {"event_type":"source-updated","client_payload":{"source":"all-the-rest/cc-price-tracker","sha":"<SHA>"}}
  EOF
  ```
  `<SHA>` = committeter Datenstand (z. B. `git rev-parse HEAD`). Verifikation: `gh run list -R all-the-rest/ai-10-usd` → neuer `repository_dispatch`-Lauf (`source-updated`) wird grün.

## Tests

- `pnpm test` = `tests/scrape.test.mjs` (Parser/Deals/Allowances/deprecated/Free/Pläne/API-Access gegen Fixtures)
  + `tests/sorting.test.mjs` (echte `PriceTable`-Komponente per SolidJS-SSR, `tests/.ssr/` gitignored).
- Fixtures in `tests/fixtures/` sind fixiert — Tests müssen deterministisch gegen sie laufen.

## Verifikation

Nach jeder Umsetzung prüft ein unabhängiger Agent: `pnpm scrape` (exit 0, korrekte Daten — vor Commit/Push
verpflichtend), `pnpm test` grün, `pnpm build` grün, `dist/` enthält `data/latest.json` + `CNAME`, Workflow-YAML
valide, `pnpm preview` liefert 200 und `/data/latest.json` antwortet. Aktuelle Tool-Versionen (`pnpm outdated`),
Node ≥22, pnpm aus `packageManager`. Nach Push CI bis zum grünen Lauf beobachten.

## Delegation & Parallelisierung (Subagenten)

- Wo möglich arbeitet OpenCode mit Subagenten statt alles selbst zu tun: `explore` für Recherche, `general` für
  Implementierung, `vision` für Screenshot-Analyse.
- **Implementierung und Verifikation laufen in getrennten Subagenten**: ein Implementierungs-Agent baut, ein
  **unabhängiger Verifikations-Agent** prüft (siehe „Verifikation"). Bei unabhängigen Teilaufgaben (z. B. zwei
  Projekten, unabhängigen Routen/Batches) werden beide Agenten **parallel** gestartet.
- Jeder Subagent bekommt eine in sich geschlossene Aufgabenbeschreibung (frischer Kontext) inkl. Pfaden, Befehlen
  und Akzeptanzkriterien — keine Annahmen über bereits Gesehenes.
- **Kleine Änderungen** (einzelne Edits, offensichtliche Fixes, Versions-/Befehlskosmetik) macht OpenCode weiter
  **direkt selbst** — Subagenten sind für größere, unabhängige Arbeitspakete gedacht.
