import { createMemo, For, Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { Model, Plan } from "../types";
import { actualPaid } from "../fees";
import { fmt, formatMult, modelOnPlan } from "../util";
import { TAB_PLAN_IDS, planLabel } from "../plans";
import { CapabilityFilter, capsOf, type CapId } from "../capabilities";
import { advertisedValue, planValue } from "../weighted";

interface PlanComparisonProps {
  models: Model[];
  plans: Plan[];
  t: Translation;
  search: string;
  setSearch: (s: string) => void;
  caps: CapId[];
  setCaps: (u: (prev: CapId[]) => CapId[]) => void;
  lang: Lang;
}

export default function PlanComparison(props: PlanComparisonProps) {
  const filtered = createMemo(() => {
    const q = props.search.trim().toLowerCase();
    return [...props.models]
      .filter((m) => {
        if (q && !m.name.toLowerCase().includes(q)) return false;
        if (props.caps.length > 0) {
          const s = capsOf(m);
          if (!props.caps.some((cap) => s.has(cap))) return false;
        }
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  });

  return (
    <>
      <section class="mt-10">
        <h2 class="text-lg font-bold tracking-tight">{props.t.headingApi}</h2>
        <div class="mt-4 w-full overflow-x-auto">
          <table class="table table-sm table-zebra">
            <thead>
              <tr>
                <th>{props.t.colPlan}</th>
                <th class="text-center">{props.t.cmpApi}</th>
                <th>{props.t.sourceLink}</th>
              </tr>
            </thead>
            <tbody>
              <For each={props.plans}>
                {(plan) => (
                  <tr>
                    <td class="font-medium whitespace-nowrap">{planLabel(plan.id, props.t)}</td>
                    <td class="text-center">
                      {plan.apiAccess ? (
                        <span class="badge badge-success badge-sm">{props.t.apiYes}</span>
                      ) : (
                        <span class="badge badge-error badge-sm">{props.t.apiNo}</span>
                      )}
                    </td>
                    <td>
                      <a
                        href={plan.apiAccessSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="underline"
                      >
                        {plan.apiAccessSourceUrl.replace("https://", "")}
                      </a>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-10">
        <h2 class="text-lg font-bold tracking-tight">{props.t.headingValue}</h2>
        <div class="mt-4 w-full overflow-x-auto">
          <table class="table table-sm table-zebra">
            <thead>
              <tr>
                <th>{props.t.colPlan}</th>
                <For each={TAB_PLAN_IDS}>{(id) => <th class="text-center">{planLabel(id, props.t)}</th>}</For>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{props.t.cmpAdvertisedPrice}</td>
                <For each={TAB_PLAN_IDS}>
                  {(id) => {
                    const plan = props.plans.find((p) => p.id === id);
                    return <td class="text-center">{plan ? fmt(plan.priceMonthly) : props.t.noValue}</td>;
                  }}
                </For>
              </tr>
              <tr>
                <td>{props.t.cmpActualPaid}</td>
                <For each={TAB_PLAN_IDS}>
                  {(id) => {
                    const plan = props.plans.find((p) => p.id === id);
                    return <td class="text-center">{plan ? fmt(actualPaid(plan)) : props.t.noValue}</td>;
                  }}
                </For>
              </tr>
              <tr>
                <td>{props.t.cmpValue}</td>
                <For each={TAB_PLAN_IDS}>
                  {(id) => {
                    const plan = props.plans.find((p) => p.id === id);
                    return (
                      <td class="text-center">
                        {plan && planValue(plan) !== null ? `${formatMult(planValue(plan)!, props.lang)}×` : props.t.noValue}
                      </td>
                    );
                  }}
                </For>
              </tr>
              <tr>
                <td>{props.t.cmpAdvertised}</td>
                <For each={TAB_PLAN_IDS}>
                  {(id) => {
                    const plan = props.plans.find((p) => p.id === id);
                    return (
                      <td class="text-center text-base-content/60">
                        {plan && advertisedValue(plan) !== null ? `${formatMult(advertisedValue(plan)!, props.lang)}×` : props.t.noValue}
                      </td>
                    );
                  }}
                </For>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="mt-10">
        <h2 class="text-lg font-bold tracking-tight">{props.t.headingComparison}</h2>
        <div class="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            class="input input-sm input-bordered w-56"
            placeholder={props.t.searchPlaceholder}
            value={props.search}
            onInput={(e) => props.setSearch(e.currentTarget.value)}
          />
        </div>
        <CapabilityFilter value={() => props.caps} setter={props.setCaps} t={props.t} />
        <div class="mt-4 w-full overflow-x-auto">
          <table class="table table-sm table-zebra table-pin-rows">
            <thead>
              <tr>
                <th>{props.t.colModel}</th>
                <For each={TAB_PLAN_IDS}>
                  {(id) => <th class="text-center">{planLabel(id, props.t)}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={filtered()}>
                {(m) => (
                  <tr>
                    <td class="font-medium whitespace-nowrap">{m.name}</td>
                    <For each={TAB_PLAN_IDS}>
                      {(id) => (
                        <td class="text-center">
                          {modelOnPlan(m, id) ? (
                            <span class="badge badge-success badge-sm">✓</span>
                          ) : (
                            <span class="text-base-content/60">–</span>
                          )}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
              <Show when={filtered().length === 0}>
                <tr>
                  <td colspan={TAB_PLAN_IDS.length + 1} class="py-4 text-center text-base-content/60">
                    {props.t.chgNone}
                  </td>
                </tr>
              </Show>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
