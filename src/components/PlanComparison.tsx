import { For, Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { Model, Plan, PlanId } from "../types";
import { modelOnPlan } from "../util";
import { formatTokens } from "../weighted";
import { planLabel } from "../plans";
import { dealLabel, dealNote } from "../deals";
import Tooltip from "./Tooltip";

interface PlanComparisonProps {
  plans: Plan[];
  models: Model[];
  activeId: PlanId;
  t: Translation;
  lang: Lang;
}

export default function PlanComparison(props: PlanComparisonProps) {
  const dealsFor = (plan: Plan) => props.models.filter((m) => modelOnPlan(m, plan.id) && m.deal !== null);

  const dealBadge = (m: Model) => {
    const badge = <span class="badge badge-success badge-sm">{dealLabel(m.deal, props.t)}</span>;
    const note = dealNote(m.deal, props.t);
    return note ? (
      <Tooltip tip={note} class="shrink-0">
        {badge}
      </Tooltip>
    ) : (
      badge
    );
  };

  return (
    <section class="mt-10">
      <h2 class="text-lg font-bold tracking-tight">{props.t.headingComparison}</h2>
      <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <For each={props.plans}>
          {(plan) => {
            const deals = dealsFor(plan);
            return (
              <div
                class="card border bg-base-200"
                classList={{
                  "border-primary": plan.id === props.activeId,
                  "border-base-300": plan.id !== props.activeId,
                }}
              >
                <div class="card-body gap-3 p-4">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-base font-bold">{planLabel(plan.id, props.t)}</span>
                    <Show when={plan.id === props.activeId}>
                      <span class="badge badge-primary badge-sm">{props.t.cmpActive}</span>
                    </Show>
                  </div>
                  <dl class="space-y-1.5 text-sm">
                    <div class="flex items-center justify-between gap-2">
                      <dt class="text-base-content/50">{props.t.cmpPrice}</dt>
                      <dd class="font-semibold">
                        ${plan.priceMonthly}/{props.t.perMonth}
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <dt class="text-base-content/50">{props.t.cmpCredits}</dt>
                      <dd class="tabular-nums">{plan.creditsMonthly ?? props.t.noValue}</dd>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <dt class="text-base-content/50">{props.t.cmpRequests}</dt>
                      <dd class="tabular-nums">
                        {plan.requestEstimate === null
                          ? props.t.noValue
                          : `~${formatTokens(plan.requestEstimate, props.lang)}`}
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <dt class="text-base-content/50">{props.t.cmpLimits}</dt>
                      <dd class="whitespace-nowrap tabular-nums text-right">
                        {props.t.cmpLimit5h} {plan.limits.h5 ?? props.t.noValue} · {props.t.cmpLimitWeekly}{" "}
                        {plan.limits.weekly ?? props.t.noValue} · {props.t.cmpLimitMonthly}{" "}
                        {plan.limits.monthly ?? props.t.noValue}
                      </dd>
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <dt class="text-base-content/50">{props.t.cmpApi}</dt>
                      <dd>
                        <Show
                          when={plan.apiAccess}
                          fallback={<span class="badge badge-ghost badge-sm">{props.t.apiNo}</span>}
                        >
                          <a
                            href={plan.apiAccessSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="badge badge-success badge-sm"
                          >
                            {props.t.apiYes}
                          </a>
                        </Show>
                      </dd>
                    </div>
                    <div>
                      <dt class="text-base-content/50">{props.t.cmpScope}</dt>
                      <dd class="mt-0.5 leading-snug text-base-content/80">{plan.modelsIncluded}</dd>
                    </div>
                    <div>
                      <dt class="text-base-content/50">{props.t.cmpDeals}</dt>
                      <Show
                        when={deals.length > 0}
                        fallback={<dd class="mt-0.5 text-base-content/40">{props.t.noValue}</dd>}
                      >
                        <ul class="mt-1 space-y-1">
                          <For each={deals.slice(0, 3)}>
                            {(m) => (
                              <li class="flex items-center justify-between gap-2 text-xs">
                                <span class="truncate">{m.name}</span>
                                {dealBadge(m)}
                              </li>
                            )}
                          </For>
                          <Show when={deals.length > 3}>
                            <li class="text-xs text-base-content/50">+{deals.length - 3} …</li>
                          </Show>
                        </ul>
                      </Show>
                    </div>
                  </dl>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}
