import { createMemo, For, Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { Model, Plan, PlanId } from "../types";
import { modelOnPlan, formatRequests } from "../util";
import { isTabPlan, planLabel } from "../plans";
import { requestsPerMonth, usageColorClass, usageOf } from "../weighted";
import PlanTabs from "../components/PlanTabs";
import { AnchorLink } from "../components/Heading";
import { SECTION_ANCHORS } from "../anchors";

export default function AllowanceComparisonPage(props: {
  models: Model[];
  plans: Plan[];
  planId: PlanId;
  setPlanId: (id: PlanId) => void;
  lang: Lang;
  t: Translation;
}) {
  const comparisonPlans = createMemo(() => props.plans.filter((plan) => isTabPlan(plan.id)));
  const selectedPlan = () => comparisonPlans().find((plan) => plan.id === props.planId) ?? comparisonPlans()[0];
  const ordered = createMemo(() => [...props.models].sort((a, b) => {
    const av = requestsPerMonth(a, "full", selectedPlan());
    const bv = requestsPerMonth(b, "full", selectedPlan());
    if (av === null) return bv === null ? a.name.localeCompare(b.name) : 1;
    if (bv === null) return -1;
    return bv - av || a.name.localeCompare(b.name);
  }));
  const usageText = (model: Model, plan: Plan) =>
    `$${usageOf(model, plan).toLocaleString(props.lang === "de" ? "de-DE" : "en-US", { maximumFractionDigits: 2 })}`;
  const isFree = (model: Model) =>
    model.deal?.free === true ||
    ((model.input ?? 0) === 0 && (model.output ?? 0) === 0 && (model.cachedRead ?? 0) === 0);
  const barColor = (model: Model, usage: number, plan: Plan, requests: number | null) => {
    if (requests === Infinity) return "bg-green-800";
    if (isFree(model)) return "bg-green-800";
    const tier = usageColorClass(usage, plan);
    if (tier.includes("bg-error/20")) return "bg-error/75";
    if (tier === "badge-error") return "bg-error";
    if (tier === "badge-warning") return "bg-warning";
    if (tier.includes("bg-success/20")) return "bg-success/60";
    return "bg-green-800";
  };

  return (
    <section id={SECTION_ANCHORS.allowances} class="scroll-mt-24">
      <h1 class="text-3xl font-bold tracking-tight">
        {props.t.headingAllowances}
        <AnchorLink
          id={SECTION_ANCHORS.allowances}
          label={props.lang === "de" ? "Direktlink zum Nutzungsvergleich" : "Direct link to usage comparison"}
        />
      </h1>
      <p class="mb-4 max-w-3xl text-sm text-base-content/70">{props.t.allowancesIntro}</p>
      <PlanTabs plans={comparisonPlans()} active={selectedPlan().id} onSelect={props.setPlanId} t={props.t} />
      <p class="mb-4 text-sm text-base-content/70">{props.t.allowancesSort.replace("{plan}", planLabel(selectedPlan().id, props.t))}</p>
      <p class="mb-4 text-xs text-base-content/70">{props.t.allowancesBarNote}</p>
      <div class="space-y-3">
        <For each={ordered()}>{(model) => (
          <article class="rounded-box border border-base-300 bg-base-200/40 p-4 sm:p-5">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 class="text-lg font-semibold">{model.name}{model.tier ? ` (${model.tier})` : ""}</h3>
              <Show when={isFree(model)}><span class="badge badge-success badge-sm">{props.t.dealFree}</span></Show>
            </div>
            <div class="mt-3 space-y-4">
              <For each={comparisonPlans()}>{(plan) => {
                const available = modelOnPlan(model, plan.id);
                const usage = usageOf(model, plan);
                const requests = available ? requestsPerMonth(model, "full", plan) : null;
                const max = Math.max(1, ...comparisonPlans().map((candidate) => {
                  const count = modelOnPlan(model, candidate.id)
                    ? requestsPerMonth(model, "full", candidate)
                    : null;
                  return count !== null && Number.isFinite(count) ? count : 0;
                }));
                const width = requests === Infinity ? 100 : requests === null ? 0 : Math.max(0, requests / max * 100);
                const color = barColor(model, usage, plan, requests);
                return <div class="grid gap-1 sm:grid-cols-[8rem_1fr_auto] sm:items-center sm:gap-4">
                  <span class="text-sm font-medium">{planLabel(plan.id, props.t)}</span>
                  <Show when={available} fallback={
                    <span class="text-sm text-base-content/70 sm:col-span-2">{props.t.allowancesUnavailable}</span>
                  }>
                    <div class="h-3 overflow-hidden rounded-full bg-base-300" aria-hidden="true">
                      <div class={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
                    </div>
                    <p class="text-sm tabular-nums sm:text-right">
                    {available && requests === Infinity
                      ? <span class="badge badge-sm bg-green-800 font-bold text-green-50">∞ {props.t.allowancesRequests}</span>
                      : <><strong>{formatRequests(requests, props.lang)}</strong> {props.t.allowancesRequests}</>}
                    <span class="text-base-content/70"> · </span>
                    {isFree(model)
                      ? <span class="badge badge-xs badge-success">{props.t.dealFree}</span>
                      : <span class={`badge badge-xs ${usageColorClass(usage, plan)}`}>{usageText(model, plan)}</span>}
                    </p>
                  </Show>
                  </div>
              }}</For>
            </div>
          </article>
        )}</For>
      </div>
    </section>
  );
}
