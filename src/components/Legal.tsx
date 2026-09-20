import type { Translation } from "../i18n";
import Heading from "./Heading";

interface LegalSectionProps {
  t: Translation;
}

export function ImpressumSection(props: LegalSectionProps) {
  return (
    <section id="impressum" class="mt-10">
      <Heading anchor="impressum">{props.t.impressum}</Heading>
      <div class="mt-2 text-sm leading-relaxed text-base-content/80">
        <p class="font-medium">Florian Reisinger</p>
        <p>Robert-Stolz-Straße 8</p>
        <p>4020 Linz, Österreich</p>
        <p>
          E-Mail:
          <a href="mailto:hello@all-the.rest" class="link link-primary">
            hello@all-the.rest
          </a>
        </p>
        <p class="mt-3 text-base-content/70">{props.t.impressumNote}</p>
      </div>
    </section>
  );
}

export function DatenschutzSection(props: LegalSectionProps) {
  return (
    <section id="datenschutz" class="mt-10">
      <Heading anchor="datenschutz">{props.t.datenschutz}</Heading>
      <div class="mt-2 max-w-3xl space-y-3 text-sm leading-relaxed text-base-content/80">
        <p>{props.t.privacyRights}</p>
      </div>
    </section>
  );
}

export default function Legal(props: LegalSectionProps) {
  return (
    <>
      <ImpressumSection t={props.t} />
      <DatenschutzSection t={props.t} />
    </>
  );
}
