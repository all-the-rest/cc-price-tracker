import { renderToString } from "solid-js/web";
import PriceTable from "../src/components/PriceTable";
import Changelog from "../src/components/Changelog";
import type { Basis, Model, Plan, PeakHours, ChangelogEntry } from "../src/types";
import type { SortField } from "../src/sort";
import { i18n, type Lang } from "../src/i18n";

export { fieldPrice, requestCost, requestsPerMonth } from "../src/weighted";
export { modelOnPlan } from "../src/util";
export { TAB_PLAN_IDS } from "../src/plans";

export interface RenderOptions {
  basis: Basis;
  sortField: SortField;
  sortDir: 1 | -1;
  lang: Lang;
  peakHours?: PeakHours;
}

/**
 * E2E-Test-Helfer: rendert die echte PriceTable-Komponente serverseitig (SolidJS
 * renderToString) mit einer festen Sortierung. Die Testlogik prüft die
 * gerenderte Tabellen-Reihenfolge gegen die angezeigten Werte — keine Logik wird
 * aus der Komponente extrahiert.
 */
export function renderPriceTable(models: Model[], plan: Plan, opts: RenderOptions): string {
  return renderToString(() => (
    <PriceTable
      models={models}
      plan={plan}
      t={i18n[opts.lang]}
      lang={opts.lang}
      basis={opts.basis}
      setBasis={() => {}}
      sort={{ field: opts.sortField, dir: opts.sortDir }}
      setSort={() => {}}
      caps={[]}
      setCaps={() => {}}
      peakHours={opts.peakHours ?? {}}
    />
  ));
}

/** Rendert die echte Changelog-Komponente serverseitig (für Zeit/Anker-Tests). */
export function renderChangelog(entries: ChangelogEntry[], lang: Lang = "en"): string {
  return renderToString(() => <Changelog entries={entries} t={i18n[lang]} lang={lang} />);
}
