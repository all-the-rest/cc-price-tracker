# Price Tracking for Command Code

Scrapet täglich die Command-Code-Docs (`https://commandcode.ai/docs/resources/pricing-limits`)
sowie die Plan-Seiten und stellt alle Preise, Pro-Modell-Credits, Deals und Free-Models
als statische SolidJS-Seite unter `https://cc-pricing.all-the.rest` bereit.

Besonderheiten:

- **Plan-Tabs** (Go, GOAT, Pro, Max 10×, Max 20× — GOAT vorausgewählt): Jeder Tab zeigt
  die inkludierten Modelle mit ihrer monatlichen Credit-Allowance, den Listenpreisen
  (pro 1M Tokens) und den Effektivpreisen auf Basis des jeweiligen Credit-Pools.
- **Plan-Vergleich**: Preis, Credits, Request-Schätzung, 5h-/Weekly-/Monthly-Limits,
  **API-Zugang** (mit Quellen-Link), Modell-Scope und aktive Deals nebeneinander.
- **Deals** (Was/Now-Preise, Ablauf/Term), **Free-Models** („verfügbar seit/bis") und
  **Capabilities** (Text/Vision/Reasoning/Tool-Call aus models.dev) je Modell.

## Lokal entwickeln

Voraussetzungen: Node ≥ 22, pnpm (Version aus `package.json`).

```bash
pnpm install
pnpm scrape
pnpm test
pnpm dev
pnpm build
pnpm preview
pnpm typecheck
```

`pnpm scrape` funktioniert lokal ohne CI: Es holt die aktuellen Preise und aktualisiert
`data/latest.json`, `data/history.json`, `CHANGELOG.json` und `src/data/changelog.json`.

## Daten

- `data/latest.json` — Snapshot mit:
  - `plans` — dynamisch gescrapte Pläne (Preis, Credits, Request-Schätzung, Limits,
    API-Zugang inkl. Quellen-URL, Default-Allowance)
  - `models` — Modellpreise (Now/List inkl. Deals), `availability` je Plan,
    `allowances` (GOAT/Pro-Credits), Context Window, Capabilities, `pattern`
  - `freeModels` — $0-Modelle mit `availableFrom`/`until`
- `data/history.json` — Chronologie aller Snapshots
- `CHANGELOG.json` — strukturierte Änderungs-Events (plan-aware), wird per CI committet
- `pnpm test` — Scraper-Unit-Tests gegen die Fixtures in `tests/fixtures/`

## Deployment

GitHub Pages über `.github/workflows/price-tracker.yml` (täglich per Cron, manuell via
`workflow_dispatch`). Custom Domain: `cc-pricing.all-the.rest` (CNAME in `public/`).

Setup:

1. Repo: `reisi007/cc-price-tracker`
2. Initialisieren und pushen (siehe `git log`/Erst-Commit).
3. GitHub → Settings → Pages → Source „GitHub Actions", Custom domain
   `cc-pricing.all-the.rest` setzen.
4. DNS: CNAME `cc-pricing.all-the.rest` → `reisi007.github.io`

## Upstream (ocg-price-tracker)

Dieses Projekt entstand als Fresh Copy von `reisi007/ocgo-price-tracker` (Basis-Revision
`2601608f58f7819b7cb37d570b3b235fcf3871ee`) und ist ein eigenständiges Projekt. Das
Original ist als `upstream`-Remote verknüpft; Fixes aus dem Original werden **manuell
übernommen** (diff gegen `upstream/main` prüfen, passende Teile rüberziehen):

```bash
git fetch upstream
git diff upstream/main -- scripts src tests     # Änderungen im Original ansehen
git log upstream/main --oneline -20             # relevante Commits finden
```

Ein reiner `cherry-pick` funktioniert wegen der starken Abweichungen in Datenmodell und
Quellen meist nicht — die Übernahme erfolgt bewusst manuell (Change-by-Change).
