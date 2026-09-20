import { For } from "solid-js";
import type { Translation } from "../i18n";
import type { Plan, PlanId } from "../types";
import { planLabel } from "../plans";
import { SECTION_ANCHORS, planTabAnchor } from "../anchors";

interface PlanTabsProps {
  plans: Plan[];
  active: PlanId;
  onSelect: (p: PlanId) => void;
  t: Translation;
}

export default function PlanTabs(props: PlanTabsProps) {
  return (
    <div role="tablist" id={SECTION_ANCHORS.plans} class="tabs tabs-box mt-6 max-w-full scroll-mt-24 overflow-x-auto">
      <For each={props.plans}>
        {(plan) => (
          <button
            role="tab"
            id={planTabAnchor(plan.id)}
            class="tab"
            classList={{ "tab-active": plan.id === props.active }}
            aria-selected={plan.id === props.active}
            onClick={() => props.onSelect(plan.id)}
          >
            {planLabel(plan.id, props.t)}
          </button>
        )}
      </For>
    </div>
  );
}
