import { For, Show, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js";
import type { Lang, Translation } from "../i18n";
import Heading, { AnchorLink } from "./Heading";
import type { Change, ChangelogEntry, PlanPricing, PriceField, PricingType } from "../types";
import { fmt, fmtDateOnly, formatModelName } from "../util";
import { capCount, fmtCaps } from "../capabilities";
import { planLabel } from "../plans";
import { formatTokens } from "../weighted";

interface ChangelogProps {
  entries: ChangelogEntry[];
  t: Translation;
  lang: Lang;
}

// Einträge pro Changelog-Seite (Pagination).
const PAGE_SIZE = 20;

// Leitet aus einem Run-`id` (z. B. 2026-08-28T09-46-46Z) die Uhrzeit ab (MEZ/MESZ);
// für Altschema-Einträge (id = Datum) wird null geliefert (keine Zeitangabe).
function entryTime(id: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})Z$/.exec(id);
  if (!m) return null;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  return date.toLocaleTimeString([], {
    timeZone: "Europe/Vienna",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const BASE_FIELDS: PriceField[] = ["input", "output", "cachedRead"];
const ALL_FIELDS: PriceField[] = ["input", "output", "cachedRead", "cachedWrite"];

const pricingSum = (p: PricingType): number =>
  (p.input ?? 0) + (p.output ?? 0) + (p.cachedRead ?? 0) + (p.cachedWrite ?? 0);

const planCost = (p: PlanPricing): number =>
  p.creditsMonthly ? p.priceMonthly / p.creditsMonthly : p.priceMonthly;

export default function Changelog(props: ChangelogProps) {
  const t = () => props.t;

  const totalPages = () => Math.max(1, Math.ceil(props.entries.length / PAGE_SIZE));
  const [page, setPage] = createSignal(1);

  // Deep-Link auf einen Eintrag (#<entry-id>): direkt auf die passende Seite.
  // Altschema-Links (#<date>) werden weiterhin auf den ersten Eintrag des Tages aufgelöst.
  onMount(() => {
    const hash = window.location.hash.slice(1);
    const idx = props.entries.findIndex((e) => e.id === hash || e.date === hash);
    if (idx >= 0) setPage(Math.floor(idx / PAGE_SIZE) + 1);
  });

  // Klemmt die Seite, falls `entries` schrumpft (z. B. nach Daten-Patch).
  const clampedPage = () => Math.min(Math.max(1, page()), totalPages());
  const visibleEntries = () =>
    props.entries.slice((clampedPage() - 1) * PAGE_SIZE, clampedPage() * PAGE_SIZE);

  const fieldLabel = (f: PriceField): string =>
    f === "input"
      ? t().colInput
      : f === "output"
        ? t().colOutput
        : f === "cachedRead"
          ? t().colCachedRead
          : t().colCachedWrite;

  const allowancesText = (p: PricingType): string => {
    const parts = Object.entries(p.allowances)
      .filter(([, v]) => typeof v === "number")
      .map(([plan, v]) => `${planLabel(plan, t())} ${fmt(v as number)}`);
    return parts.length ? ` @ ${parts.join(" / ")}` : "";
  };

  const pricingString = (p: PricingType): string => {
    const parts = BASE_FIELDS.map((f) => `${fieldLabel(f)} ${fmt(p[f])}`);
    if (p.cachedWrite !== null) parts.push(`${fieldLabel("cachedWrite")} ${fmt(p.cachedWrite)}`);
    return parts.join(" · ") + allowancesText(p);
  };

  const pricingLine = (p: PricingType, changed: PriceField[], showWrite: boolean): JSX.Element => {
    const fields = showWrite ? ALL_FIELDS : BASE_FIELDS;
    return (
      <span>
        {fields.map((f, i) => (
          <>
            {i > 0 && " · "}
            {fieldLabel(f)}{" "}
            {changed.includes(f) ? (
              <strong class="font-bold">{fmt(p[f])}</strong>
            ) : (
              <span>{fmt(p[f])}</span>
            )}
          </>
        ))}
        {allowancesText(p) && <span class="opacity-70">{allowancesText(p)}</span>}
      </span>
    );
  };

  const planInfoText = (p: PlanPricing): string =>
    t()
      .planInfo.replace("{price}", fmt(p.priceMonthly))
      .replace("{perMonth}", t().perMonth)
      .replace("{credits}", p.creditsMonthly === null ? t().noValue : String(p.creditsMonthly))
      .replace("{creditsUnit}", t().creditsUnit)
      .replace(
        "{requests}",
        p.requestEstimate === null ? t().noValue : formatTokens(p.requestEstimate, props.lang)
      )
      .replace("{requestsUnit}", t().requestsUnit);

  const apiText = (on: boolean): string => (on ? t().apiAccessOn : t().apiAccessOff);

  const changeBadge = (c: Change): JSX.Element => {
    const base = "badge badge-sm shrink-0";
    switch (c.type) {
      case "text":
        return <span class={`${base} badge-ghost`}>i</span>;
      case "model_added":
      case "free_added":
      case "plan_added":
        return <span class={`${base} badge-success`}>+</span>;
      case "model_removed":
      case "free_removed":
      case "plan_removed":
        return <span class={`${base} badge-error`}>−</span>;
      case "price_changed": {
        const diff = pricingSum(c.to) - pricingSum(c.from);
        if (diff > 1e-9) return <span class={`${base} badge-error`}>↑</span>;
        if (diff < -1e-9) return <span class={`${base} badge-success`}>↓</span>;
        return <span class={`${base} badge-ghost`}>≈</span>;
      }
      case "allowance_changed": {
        const increased = c.plans.some((p) => p.to > p.from);
        const decreased = c.plans.some((p) => p.to < p.from);
        if (increased && !decreased) return <span class={`${base} badge-success`}>↑</span>;
        if (decreased && !increased) return <span class={`${base} badge-error`}>↓</span>;
        return <span class={`${base} badge-ghost`}>≈</span>;
      }
      case "capabilities_changed": {
        const diff = capCount(c.to) - capCount(c.from);
        if (diff > 0) return <span class={`${base} badge-success`}>+</span>;
        if (diff < 0) return <span class={`${base} badge-error`}>−</span>;
        return <span class={`${base} badge-ghost`}>≈</span>;
      }
      case "plan_pricing_changed": {
        const diff = planCost(c.to) - planCost(c.from);
        if (diff > 1e-9) return <span class={`${base} badge-error`}>↑</span>;
        if (diff < -1e-9) return <span class={`${base} badge-success`}>↓</span>;
        return <span class={`${base} badge-ghost`}>≈</span>;
      }
      case "api_access_changed":
        return c.to ? (
          <span class={`${base} badge-success`}>+</span>
        ) : (
          <span class={`${base} badge-error`}>−</span>
        );
    }
  };

  const changeText = (c: Change): JSX.Element => {
    switch (c.type) {
      case "text":
        return <span>{c.lang[props.lang]}</span>;
      case "model_added":
        return (
          <span>
            {t().chgModelAdded.replace("{model}", c.model).replace("{pricing}", pricingString(c.pricing))}
            <Show when={c.listPricing}>
              {(lp) => <span> {t().chgListPricing.replace("{pricing}", pricingString(lp()))}</span>}
            </Show>
          </span>
        );
      case "model_removed":
        return (
          <span>{t().chgModelRemoved.replace("{model}", c.model).replace("{days}", String(c.days))}</span>
        );
      case "price_changed": {
        const showWrite = c.from.cachedWrite !== null || c.to.cachedWrite !== null;
        return (
          <span>
            {c.model}: {pricingLine(c.from, c.fields, showWrite)} → {pricingLine(c.to, c.fields, showWrite)}
          </span>
        );
      }
      case "allowance_changed":
        return (
          <span>
            {t().chgAllowance.replace("{model}", c.model).replace("{plans}", "")}
            <For each={c.plans}>
              {(p, i) => (
                <span>
                  {i() > 0 ? ", " : " "}
                  {planLabel(p.plan, t())}{" "}
                  <strong class="font-bold">{fmt(p.from)}</strong> →{" "}
                  <strong class="font-bold">{fmt(p.to)}</strong>
                </span>
              )}
            </For>
          </span>
        );
      case "capabilities_changed":
        return (
          <span>
            {t()
              .chgCaps.replace("{model}", c.model)
              .replace("{from}", fmtCaps(c.from, t()))
              .replace("{to}", fmtCaps(c.to, t()))}
          </span>
        );
      case "free_added":
        return <span>{t().chgFreeAdded.replace("{model}", formatModelName(c.model))}</span>;
      case "free_removed": {
        const days = Math.max(
          0,
          Math.round((Date.parse(c.until) - Date.parse(c.availableFrom)) / 86_400_000)
        );
        return (
          <span>
            {t()
              .chgFreeRemoved.replace("{model}", formatModelName(c.model))
              .replace("{days}", String(days))
              .replace("{from}", fmtDateOnly(`${c.availableFrom}T00:00:00.000Z`, props.lang))}
          </span>
        );
      }
      case "plan_added":
        return (
          <span>
            {t()
              .chgPlanAdded.replace("{plan}", planLabel(c.plan, t()))
              .replace("{info}", planInfoText(c.to))
              .replace("{api}", apiText(c.to.apiAccess))}
          </span>
        );
      case "plan_removed":
        return (
          <span>
            {t()
              .chgPlanRemoved.replace("{plan}", planLabel(c.plan, t()))
              .replace("{info}", planInfoText(c.from))
              .replace("{api}", apiText(c.from.apiAccess))}
          </span>
        );
      case "plan_pricing_changed":
        return (
          <span>
            {t()
              .chgPlanPricing.replace("{plan}", planLabel(c.plan, t()))
              .replace("{from}", planInfoText(c.from))
              .replace("{to}", planInfoText(c.to))}
          </span>
        );
      case "api_access_changed":
        return (
          <span>
            {t()
              .chgApiAccess.replace("{plan}", planLabel(c.plan, t()))
              .replace("{from}", apiText(c.from))
              .replace("{to}", apiText(c.to))}
          </span>
        );
    }
  };

  return (
    <section id="changelog" class="mt-10">
      <Heading anchor="changelog">{t().headingChangelog}</Heading>
      <div class="mt-2 max-w-3xl text-sm leading-relaxed text-base-content/80">
        <For each={visibleEntries()}>
          {(entry) => (
            <div id={entry.id} class="mt-4 scroll-mt-24">
              <h3 class="text-sm font-semibold text-base-content/70">
                {fmtDateOnly(`${entry.date}T00:00:00.000Z`, props.lang)}
                <Show when={entryTime(entry.id) !== null}>
                  <span class="ml-2 font-normal text-base-content/50">{entryTime(entry.id)}</span>
                </Show>
                <AnchorLink id={entry.id} label="Direktlink zu diesem Changelog-Eintrag" />
              </h3>
              <Show when={entry.changes.length > 0} fallback={<p class="mt-1">{t().chgNone}</p>}>
                <ul class="mt-1 space-y-1">
                  <For each={[...entry.changes].reverse()}>
                    {(c) => (
                      <li class="flex items-center gap-2">
                        {changeBadge(c)}
                        {changeText(c)}
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </div>
          )}
        </For>
      </div>
      <Show when={totalPages() > 1}>
        <nav class="mt-6 flex items-center justify-center gap-2" aria-label="Changelog pagination">
          <button
            type="button"
            class="btn btn-sm"
            disabled={clampedPage() <= 1}
            onClick={() => setPage(clampedPage() - 1)}
          >
            ‹ {t().chgPrev}
          </button>
          <span class="text-sm text-base-content/60">
            {t()
              .chgPage.replace("{page}", String(clampedPage()))
              .replace("{total}", String(totalPages()))}
          </span>
          <button
            type="button"
            class="btn btn-sm"
            disabled={clampedPage() >= totalPages()}
            onClick={() => setPage(clampedPage() + 1)}
          >
            {t().chgNext} ›
          </button>
        </nav>
      </Show>
    </section>
  );
}
