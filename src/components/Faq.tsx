import { For } from "solid-js";
import type { Translation } from "../i18n";
import Heading from "./Heading";
import { faqItems } from "../faq";

interface FaqProps {
  t: Translation;
}

/** FAQ als `<h2>` + `<details>`-Akkordeon; dieselben Texte fließen ins FAQPage-JSON-LD. */
export default function Faq(props: FaqProps) {
  return (
    <section id="faq" class="mt-10">
      <Heading anchor="faq">{props.t.headingFaq}</Heading>
      <div class="mt-3 flex max-w-3xl flex-col gap-2">
        <For each={faqItems(props.t)}>
          {(item) => (
            <details class="collapse collapse-arrow border border-base-300 bg-base-200">
              <summary class="collapse-title text-sm font-semibold">{item.q}</summary>
              <div class="collapse-content text-sm leading-relaxed text-base-content/80">
                <p>{item.a}</p>
              </div>
            </details>
          )}
        </For>
      </div>
    </section>
  );
}
