import type { Translation } from "../i18n";

interface ZdrNoteProps {
  t: Translation;
}

export default function ZdrNote(props: ZdrNoteProps) {
  return (
    <section class="mt-10">
      <h2 class="text-lg font-bold tracking-tight">{props.t.headingZdr}</h2>
      <div class="alert mt-2 max-w-3xl">
        <div>
          <h3 class="font-bold">{props.t.zdrTitle}</h3>
          <p class="mt-1 text-sm leading-relaxed text-base-content/80">{props.t.zdrBody}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="badge badge-neutral badge-sm font-mono">{props.t.zdrCmd}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
