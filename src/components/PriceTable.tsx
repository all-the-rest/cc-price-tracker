import { createMemo, For, onCleanup, onMount, Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { Basis, Model, Plan, PeakHours } from "../types";
import { fmt, fmtContextWindow } from "../util";
import { fieldPrice, formatTokens, planValue, requestCost, requestsPerMonth, usageOf } from "../weighted";
import { actualPaid } from "../fees";
import { CapabilityBadges, CapabilityFilter, capsOf, type CapId } from "../capabilities";
import { setupDragScroll } from "../dragscroll";
import Tooltip from "./Tooltip";
import PeakIndicator, { isPeakTier, isTierActive, peakRangesFor, usePeakClock } from "./PeakIndicator";
import type { SortField, SortState } from "../sort";
import { formatRequests } from "../util";

interface PriceTableProps {
  models: Model[];
  plan: Plan;
  t: Translation;
  lang: Lang;
  basis: Basis;
  setBasis: (b: Basis) => void;
  sort: SortState;
  setSort: (u: (prev: SortState) => SortState) => void;
  caps: CapId[];
  setCaps: (u: (prev: CapId[]) => CapId[]) => void;
  peakHours?: PeakHours;
}

export default function PriceTable(props: PriceTableProps) {
  let scroller: HTMLDivElement | undefined;
  const now = usePeakClock();
  onMount(() => {
    if (!scroller) return;
    const dispose = setupDragScroll(scroller);
    onCleanup(dispose);
  });

  const formatMult = (n: number) =>
    new Intl.NumberFormat(props.lang === "de" ? "de-DE" : "en-US", { maximumFractionDigits: 2 }).format(n);

  const paid = createMemo(() => actualPaid(props.plan));

  const sortValue = (m: Model, f: SortField): number | string | null => {
    if (f === "cost") return requestCost(m, props.basis, props.plan);
    if (f === "requests") return requestsPerMonth(m, props.basis, props.plan);
    if (f === "allowance") return usageOf(m, props.plan);
    if (f === "name") return m.name.toLowerCase();
    return fieldPrice(m, f, props.basis, props.plan);
  };

  const sorted = createMemo(() => {
    const { field, dir } = props.sort;
    let models = props.models;
    if (props.caps.length > 0) {
      models = models.filter((m) => {
        const s = capsOf(m);
        return props.caps.some((cap) => s.has(cap));
      });
    }
    return [...models].sort((a, b) => {
      const va = sortValue(a, field);
      const vb = sortValue(b, field);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  });

  const thSort = (field: SortField, label: string, right?: boolean, tooltip?: string) => {
    const active = props.sort.field === field;
    return (
      <th class={right ? "text-right" : ""}>
        <button
          class="inline-flex items-center gap-1 whitespace-nowrap py-1"
          classList={{ "text-primary": active }}
          aria-label={`${label} (${active ? (props.sort.dir === 1 ? "desc" : "asc") : "sort"})`}
          onClick={() => props.setSort((s) => ({ field, dir: s.field === field ? (s.dir === 1 ? -1 : 1) : 1 }))}
        >
          <span>{label}</span>
          <Show when={tooltip}>
            {(tip) => (
              <Tooltip tip={tip()} class="inline-flex">
                <svg
                  class="h-3.5 w-3.5 text-base-content/70"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </Tooltip>
            )}
          </Show>
          {active ? <span aria-hidden="true">{props.sort.dir === 1 ? "▲" : "▼"}</span> : null}
        </button>
      </th>
    );
  };

  const patternTooltip = (m: Model) => {
    const p = m.pattern;
    if (!p) return "";
    return props.t.patternTooltip
      .replace("{input}", formatTokens(p.input, props.lang))
      .replace("{cached}", formatTokens(p.cachedRead, props.lang))
      .replace("{output}", formatTokens(p.output, props.lang));
  };

  const priceCell = (n: number | null | undefined) => {
    const s = fmt(n);
    const isNull = s === "–";
    return (
      <span class="grid w-full grid-cols-[1.5rem_1fr]">
        <span class="text-right">{isNull ? "" : "$"}</span>
        <span class="text-right tabular-nums">{isNull ? "–" : s.slice(1)}</span>
      </span>
    );
  };

  const modelCell = (m: Model) => {
    const ranges = peakRangesFor(props.peakHours, m.name);
    const peak = isPeakTier(m.tier) && ranges.length > 0;
    const others = [
      m.provider,
      m.contextWindow !== null && m.contextWindow !== undefined
        ? `${fmtContextWindow(m.contextWindow)} ${props.t.contextTokens}`
        : null,
    ].filter(Boolean) as string[];
    return (
      <th class="font-medium">
        <span class="block">{m.name}</span>
        <Show when={peak}>
          <span class="block text-xs font-normal text-base-content/70">
            <PeakIndicator tier={m.tier ?? ""} ranges={ranges} now={now()} t={props.t} />
          </span>
        </Show>
        <Show when={!peak && m.tier}>
          <span class="block text-xs font-normal text-base-content/70">{m.tier}</span>
        </Show>
        <Show when={others.length > 0}>
          <span class="block text-xs font-normal text-base-content/70">{others.join(" · ")}</span>
        </Show>
      </th>
    );
  };

  const isFree = (m: Model) =>
    m.deal?.free === true ||
    ((m.input ?? 0) === 0 && (m.output ?? 0) === 0 && (m.cachedRead ?? 0) === 0);

  const allowanceClass = (usage: number): string => {
    const mult = usage / paid();
    const green = planValue(props.plan);
    if (mult < 1) return "badge-error";
    if (mult < 1.5) return "bg-error/20 text-error border border-error";
    if (green === null) return "badge-success";
    if (mult < green - 1e-6) return "badge-warning";
    if (mult <= green + 1e-6) return "bg-success/20 text-success border border-success";
    return "badge-success";
  };

  const allowanceTip = (usage: number): string => {
    const credits = props.plan.creditsMonthly;
    const mult = usage / paid();
    const pct = credits !== null ? Math.round((usage / credits) * 100) : null;
    const green = planValue(props.plan);
    let tip = props.t.allowanceTooltip
      .replace("{usage}", String(usage))
      .replace("{mult}", formatMult(mult))
      .replace("{paid}", formatMult(paid()))
      .replace("{pct}", pct === null ? "–" : String(pct))
      .replace("{credit}", credits === null ? "" : String(credits));
    if (green !== null) {
      tip += ` · ${props.t.allowanceLegend.replace("{green}", formatMult(green))}`;
    }
    return tip;
  };

  return (
    <section class="mt-10">
      <h2 class="text-lg font-bold tracking-tight">{props.t.headingPrices}</h2>

      <div class="mt-4 flex flex-wrap items-center gap-3">
        <span>{props.t.basisLabel}</span>
        <div class="join">
          <button
            class="join-item btn btn-sm text-xs sm:text-sm whitespace-nowrap"
            classList={{ "btn-active": props.basis === "list", "btn-primary": props.basis === "list" }}
            onClick={() => props.setBasis("list")}
          >
            {props.t.basisList}
          </button>
          <button
            class="join-item btn btn-sm text-xs sm:text-sm whitespace-nowrap"
            classList={{ "btn-active": props.basis === "full", "btn-primary": props.basis === "full" }}
            onClick={() => props.setBasis("full")}
          >
            {props.t.basisFull}
          </button>
          <button
            class="join-item btn btn-sm text-xs sm:text-sm whitespace-nowrap"
            classList={{ "btn-active": props.basis === "paid", "btn-primary": props.basis === "paid" }}
            onClick={() => props.setBasis("paid")}
          >
            {props.t.basisPaid}
          </button>
        </div>
      </div>

      <CapabilityFilter value={() => props.caps} setter={props.setCaps} t={props.t} />

      <div ref={scroller} class="mt-4 max-w-full overflow-x-auto">
        <table class="table table-zebra table-sm table-pin-rows">
          <thead>
            <tr>
              {thSort("name", props.t.colModel)}
              <th>{props.t.capsLabel}</th>
              {thSort("input", props.t.colInput, true)}
              {thSort("output", props.t.colOutput, true)}
              {thSort("cachedRead", props.t.colCachedRead, true)}
              {thSort("cachedWrite", props.t.colCachedWrite, true)}
              {thSort("allowance", props.t.colAllowance, true)}
              {thSort("cost", props.t.colCost, true, props.t.tooltipWeighted)}
              {thSort("requests", props.t.colRequests, true, props.t.tooltipRequests)}
            </tr>
            <tr>
              <th></th>
              <th></th>
              <th class="text-right font-normal text-base-content/40">{props.t.per1m}</th>
              <th class="text-right font-normal text-base-content/40">{props.t.per1m}</th>
              <th class="text-right font-normal text-base-content/40">{props.t.per1m}</th>
              <th class="text-right font-normal text-base-content/40">{props.t.per1m}</th>
              <th></th>
              <th class="text-right font-normal text-base-content/40">{props.t.perReq}</th>
              <th class="text-right font-normal text-base-content/40">{props.t.perMonth}</th>
            </tr>
          </thead>
          <tbody>
            <For each={sorted()}>
              {(m) => (
                <tr
                  classList={{
                    "opacity-70":
                      isPeakTier(m.tier) &&
                      peakRangesFor(props.peakHours, m.name).length > 0 &&
                      !isTierActive(m.tier, now(), peakRangesFor(props.peakHours, m.name)),
                  }}
                >
                  {modelCell(m)}
                  <td>
                    <CapabilityBadges m={m} t={props.t} />
                  </td>
                  <td>{priceCell(fieldPrice(m, "input", props.basis, props.plan))}</td>
                  <td>{priceCell(fieldPrice(m, "output", props.basis, props.plan))}</td>
                  <td>{priceCell(fieldPrice(m, "cachedRead", props.basis, props.plan))}</td>
                  <td>{priceCell(fieldPrice(m, "cachedWrite", props.basis, props.plan))}</td>
                  <td class="text-right whitespace-nowrap">
                    <Show
                      when={!isFree(m)}
                      fallback={
                        <Tooltip tip={props.t.allowanceFreeTip} class="inline-block">
                          <span class="badge badge-sm badge-success">
                            {props.t.allowanceUnlimited}
                          </span>
                        </Tooltip>
                      }
                    >
                      <Tooltip tip={allowanceTip(usageOf(m, props.plan))} class="inline-block">
                        <span class={`badge badge-sm tabular-nums ${allowanceClass(usageOf(m, props.plan))}`}>
                          ${usageOf(m, props.plan)} · {formatMult(usageOf(m, props.plan) / paid())}×
                        </span>
                      </Tooltip>
                    </Show>
                  </td>
                  <td>
                    <Show when={m.pattern} fallback={priceCell(null)}>
                      <Tooltip tip={patternTooltip(m)} class="block">
                        {priceCell(requestCost(m, props.basis, props.plan))}
                      </Tooltip>
                    </Show>
                  </td>
                  <td class="text-right whitespace-nowrap tabular-nums">
                    {formatRequests(requestsPerMonth(m, props.basis, props.plan), props.lang)}
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
