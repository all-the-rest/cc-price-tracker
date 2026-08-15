import { For, Show } from "solid-js";
import type { Translation } from "../i18n";
import type { Plan } from "../types";
import { planLabel } from "../plans";

interface ApiBannerProps {
  plans: Plan[];
  t: Translation;
}

export default function ApiBanner(props: ApiBannerProps) {
  const noApi = () => props.plans.filter((p) => !p.apiAccess);
  return (
    <Show when={noApi().length > 0}>
      <div class="alert alert-warning mt-6 max-w-3xl">
        <div>
          <h2 class="text-lg font-bold">{props.t.apiBannerTitle}</h2>
          <p class="mt-1 text-sm leading-relaxed text-base-content/80">{props.t.apiBannerBody}</p>
          <ul class="mt-2 space-y-1">
            <For each={noApi()}>
              {(p) => (
                <li class="text-sm">
                  <strong>{planLabel(p.id, props.t)}</strong> —{" "}
                  <a href={p.apiAccessSourceUrl} target="_blank" rel="noopener noreferrer" class="underline">
                    {props.t.sourceLink}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>
    </Show>
  );
}
