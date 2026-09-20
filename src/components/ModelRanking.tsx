import { For, Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { Model, Plan } from "../types";
import Heading from "./Heading";
import { fmt, formatRequests } from "../util";
import { requestCost, requestsPerMonth } from "../weighted";
import { SECTION_ANCHORS } from "../anchors";

interface ModelRankingProps {
  models: Model[];
  plan: Plan;
  lang: Lang;
  t: Translation;
}

interface RankRow {
  m: Model;
  requests: number | null;
  cost: number | null;
}

const TOP_N = 10;

/**
 * Ranking der Top-Modelle des aktiven Plans nach Anfragen pro Monat bei vollem
 * Guthaben. Nutzt ausschließlich die vorhandene Berechnung aus `weighted.ts`
 * (`requestsPerMonth` / `requestCost`) — keine eigene Mathematik.
 */
export default function ModelRanking(props: ModelRankingProps) {
  const rows = (): RankRow[] =>
    props.models
      .map((m) => ({
        m,
        requests: requestsPerMonth(m, "full", props.plan),
        cost: requestCost(m, "full", props.plan),
      }))
      .sort((a, b) => {
        const av = a.requests;
        const bv = b.requests;
        const aBad = av === null || Number.isNaN(av);
        const bBad = bv === null || Number.isNaN(bv);
        if (aBad && bBad) return a.m.name.localeCompare(b.m.name);
        if (aBad) return 1;
        if (bBad) return -1;
        if (av === bv) return a.m.name.localeCompare(b.m.name);
        return (bv as number) - (av as number);
      })
      .slice(0, TOP_N);

  return (
    <section id={SECTION_ANCHORS.ranking} class="mt-10">
      <Heading anchor={SECTION_ANCHORS.ranking}>{props.t.headingRanking}</Heading>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-base-content/70">
        {props.t.rankingIntro}
      </p>
      <div class="mt-4 w-full overflow-x-auto">
        <table class="table table-sm table-zebra">
          <caption class="py-2 text-left text-xs text-base-content/60">
            {props.t.captionRanking
              .replace("{count}", String(rows().length))
              .replace("{plan}", props.plan.name)}
          </caption>
          <thead>
            <tr>
              <th scope="col">{props.t.colRank}</th>
              <th scope="col">{props.t.colModel}</th>
              <th scope="col">{props.t.colProvider}</th>
              <th scope="col" class="text-right">
                {props.t.colRequestsPerMonth}
              </th>
              <th scope="col" class="text-right">
                {props.t.colCostPerRequest}
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={rows()}>
              {(row, i) => (
                <tr>
                  <td class="tabular-nums text-base-content/60">{i() + 1}</td>
                  <th scope="row" class="font-medium">
                    <a href="#prices" class="link link-hover">
                      {row.m.name}
                    </a>
                    <Show when={row.m.tier}>
                      <span class="block text-xs font-normal text-base-content/70">{row.m.tier}</span>
                    </Show>
                  </th>
                  <td>{row.m.provider ?? props.t.noValue}</td>
                  <td class="text-right tabular-nums">
                    {formatRequests(row.requests, props.lang)}
                  </td>
                  <td class="text-right tabular-nums">{fmt(row.cost)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
