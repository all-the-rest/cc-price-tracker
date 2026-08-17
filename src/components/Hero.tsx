import { Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { Plan } from "../types";
import { actualPaid, processingFee } from "../fees";
import { fmt, formatMult } from "../util";
import { planValue } from "../weighted";

interface HeroProps {
  t: Translation;
  plan: Plan;
  modelCount: number;
  lang: Lang;
}

export default function Hero(props: HeroProps) {
  return (
    <section>
      <h1 class="text-2xl font-bold tracking-tight">{props.t.title}</h1>
      <p class="text-base-content/60">{props.t.subtitle}</p>
      <p class="mt-3 max-w-3xl text-sm leading-relaxed text-base-content/70">{props.t.intro}</p>

      <div class="stats stats-vertical mt-6 w-full shadow sm:stats-horizontal sm:w-auto">
        <div class="stat">
          <div class="stat-title">{props.t.statsPriceTitle}</div>
          <div class="stat-value">{fmt(actualPaid(props.plan))}</div>
          <div class="stat-desc">{props.t.statsPriceDesc}</div>
          <div class="stat-desc text-xs text-base-content/70">
            {props.t.priceFeeNote
              .replace("{fee}", fmt(processingFee(props.plan.priceMonthly)))
              .replace("{advertised}", fmt(props.plan.priceMonthly))}
          </div>
        </div>
        <div class="stat">
          <div class="stat-title">{props.t.statsCreditsTitle}</div>
          <div class="stat-value">{props.plan.creditsMonthly ?? props.t.noValue}</div>
          <div class="stat-desc">{props.t.statsCreditsDesc}</div>
          <Show when={planValue(props.plan) !== null}>
            <div class="stat-desc text-xs text-base-content/70">
              {props.t.priceValueNote.replace("{mult}", formatMult(planValue(props.plan)!, props.lang))}
            </div>
          </Show>
        </div>
        <div class="stat">
          <div class="stat-title">{props.t.statsModelsTitle}</div>
          <div class="stat-value">{props.modelCount}</div>
          <div class="stat-desc">{props.t.statsModelsDesc}</div>
        </div>
      </div>
    </section>
  );
}
