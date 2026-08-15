import { createMemo, For, Show } from "solid-js";
import type { Lang, Translation } from "../i18n";
import type { FreeModel } from "../types";
import { fmtDateOnly } from "../util";
import { CapabilityBadges, CapabilityFilter, capsOf, type CapId } from "../capabilities";
import type { FreeSortField, FreeSortState } from "../sort";

interface FreeModelsTableProps {
  freeModels: FreeModel[];
  t: Translation;
  lang: Lang;
  sort: FreeSortState;
  setSort: (u: (prev: FreeSortState) => FreeSortState) => void;
  caps: CapId[];
  setCaps: (u: (prev: CapId[]) => CapId[]) => void;
}

export default function FreeModelsTable(props: FreeModelsTableProps) {
  const sortedFree = createMemo(() => {
    const { field, dir } = props.sort;
    let models = props.freeModels;
    if (props.caps.length > 0) {
      models = models.filter((f) => {
        const s = capsOf(f);
        return props.caps.some((cap) => s.has(cap));
      });
    }
    return [...models].sort((a, b) => {
      const cmp =
        field === "availableFrom" ? a.availableFrom.localeCompare(b.availableFrom) : a.id.localeCompare(b.id);
      return cmp !== 0 ? cmp * dir : a.id.localeCompare(b.id);
    });
  });

  const thFreeSort = (field: FreeSortField, label: string) => {
    const active = props.sort.field === field;
    return (
      <th>
        <button
          class="inline-flex items-center gap-1 whitespace-nowrap"
          classList={{ "text-primary": active }}
          onClick={() =>
            props.setSort((s) => ({ field, dir: s.field === field ? (s.dir === 1 ? -1 : 1) : 1 }))
          }
        >
          {label}
          {active ? <span aria-hidden="true">{props.sort.dir === 1 ? "▲" : "▼"}</span> : null}
        </button>
      </th>
    );
  };

  return (
    <Show when={props.freeModels.length > 0}>
      <section class="mt-10">
        <h2 class="text-lg font-bold tracking-tight">{props.t.headingFree}</h2>
        <p class="mt-1 text-sm text-base-content/50">{props.t.freeModelsNote}</p>
        <CapabilityFilter value={() => props.caps} setter={props.setCaps} t={props.t} />
        <div class="mt-4 w-full overflow-x-auto">
          <table class="table table-sm table-zebra">
            <thead>
              <tr>
                {thFreeSort("model", props.t.colModel)}
                <th>{props.t.capsLabel}</th>
                {thFreeSort("availableFrom", props.t.colAvailableFrom)}
                <th class="text-right">{props.t.colUntil}</th>
                <th>{props.t.colNote}</th>
              </tr>
            </thead>
            <tbody>
              <For each={sortedFree()}>
                {(f) => (
                  <tr>
                    <td class="font-medium">{f.name}</td>
                    <td>
                      <CapabilityBadges m={f} t={props.t} />
                    </td>
                    <td class="whitespace-nowrap tabular-nums">
                      {fmtDateOnly(`${f.availableFrom}T00:00:00.000Z`, props.lang)}
                    </td>
                    <td class="whitespace-nowrap text-right tabular-nums">
                      {f.until ? fmtDateOnly(`${f.until}T00:00:00.000Z`, props.lang) : props.t.noValue}
                    </td>
                    <td class="text-base-content/60">{f.note ?? props.t.noValue}</td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </section>
    </Show>
  );
}
