import { For } from "solid-js";
import type { Translation } from "../i18n";
import type { Model } from "../types";
import Heading from "./Heading";
import { fmtContextWindow } from "../util";
import { fmtCaps } from "../capabilities";
import { SECTION_ANCHORS } from "../anchors";

interface AllModelsProps {
  models: Model[];
  t: Translation;
}

/**
 * Vollständige, für Crawler sichtbare Modell-Übersicht (Name, Anbieter,
 * Fähigkeiten, Kontextfenster) mit Sprungmarke zur Preistabelle.
 */
export default function AllModels(props: AllModelsProps) {
  const sorted = () =>
    [...props.models].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );

  return (
    <section id={SECTION_ANCHORS.models} class="mt-10">
      <Heading anchor={SECTION_ANCHORS.models}>{props.t.headingAllModels}</Heading>
      <p class="mt-2 max-w-3xl text-sm leading-relaxed text-base-content/70">
        {props.t.allModelsIntro}{" "}
        <a href="#prices" class="link link-primary">
          {props.t.headingPrices}
        </a>
      </p>
      <div class="mt-4 w-full overflow-x-auto">
        <table class="table table-sm table-zebra">
          <caption class="py-2 text-left text-xs text-base-content/60">
            {props.t.captionAllModels}
          </caption>
          <thead>
            <tr>
              <th scope="col">{props.t.colModel}</th>
              <th scope="col">{props.t.colProvider}</th>
              <th scope="col">{props.t.capsLabel}</th>
              <th scope="col" class="text-right">
                {props.t.colContext}
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={sorted()}>
              {(m) => (
                <tr>
                  <th scope="row" class="font-medium whitespace-nowrap">
                    {m.name}
                  </th>
                  <td>{m.provider ?? props.t.noValue}</td>
                  <td>{fmtCaps(m.capabilities, props.t)}</td>
                  <td class="text-right whitespace-nowrap tabular-nums">
                    {fmtContextWindow(m.contextWindow)}
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
