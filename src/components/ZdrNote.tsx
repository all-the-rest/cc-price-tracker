import type { Translation } from "../i18n";
import Heading from "./Heading";

interface ZdrNoteProps {
  t: Translation;
}

export default function ZdrNote(props: ZdrNoteProps) {
  return (
    <section id="zdr" class="mt-10">
      <Heading anchor="zdr">{props.t.headingZdr}</Heading>
      <div class="alert mt-2 w-full">
        <div>
          <h3 class="font-bold">{props.t.zdrTitle}</h3>
          <p class="mt-1 text-sm leading-relaxed text-base-content/90">{props.t.zdrBody}</p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="badge badge-neutral badge-sm font-mono">{props.t.zdrCmd}</span>
          </div>
        </div>
      </div>
      <div class="alert alert-warning mt-2 w-full">
        <div>
          <p class="text-sm leading-relaxed text-base-content/90">{props.t.zdrTrainingNote}</p>
        </div>
      </div>
    </section>
  );
}
