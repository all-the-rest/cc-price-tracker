import { For } from "solid-js";
import type { Translation } from "../i18n";
import type { Model, Plan } from "../types";
import { modelOnPlan } from "../util";
import { TAB_PLAN_IDS, planLabel } from "../plans";

interface PlanComparisonProps {
  models: Model[];
  plans: Plan[];
  t: Translation;
}

export default function PlanComparison(props: PlanComparisonProps) {
  const sorted = [...props.models].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
  );

  return (
    <section class="mt-10">
      <h2 class="text-lg font-bold tracking-tight">{props.t.headingComparison}</h2>
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
            <tr>
              <th class="font-semibold">{props.t.cmpApi}</th>
              <For each={TAB_PLAN_IDS}>
                {(id) => {
                  const p = props.plans.find((pl) => pl.id === id);
                  return (
                    <td class="text-center">
                      {p?.apiAccess ? (
                        <span class="badge badge-success badge-sm">{props.t.apiYes}</span>
                      ) : (
                        <span class="badge badge-error badge-sm">{props.t.apiNo}</span>
                      )}
                    </td>
                  );
                }}
              </For>
            </tr>
            <For each={sorted}>
              {(m) => (
                <tr>
                  <td class="font-medium whitespace-nowrap">{m.name}</td>
                  <For each={TAB_PLAN_IDS}>
                    {(id) => (
                      <td class="text-center">
                        {modelOnPlan(m, id) ? (
                          <span class="badge badge-success badge-sm">✓</span>
                        ) : (
                          <span class="text-base-content/30">–</span>
                        )}
                      </td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

