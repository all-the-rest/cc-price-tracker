import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

const BUBBLE =
  "max-w-xs rounded-md border border-base-300 bg-base-200 px-3 py-2 text-xs text-base-content shadow-lg";

interface TooltipProps {
  tip: string;
  children: JSX.Element;
  class?: string;
}

/**
 * Rendered die Bubble in einem Portal (position: fixed, viewport-basiert),
 * damit sie außerhalb von overflow-Scrollcontainern liegt — kein Abschneiden
 * und keine vertikale Scrollbar durch dauerhaft positionierte Pseudo-Elemente.
 *
 * Trigger: Hover (Maus), Fokus (Tab) und Tap (Touch — pinnen/löschen durch
 * Tap außerhalb). Die Bubble bleibt pointer-events-none. Beim Scrollen/Resizen
 * wird sie neu positioniert, damit sie am Trigger "kleben" bleibt (scrollt mit).
 */
export default function Tooltip(props: TooltipProps) {
  const [pos, setPos] = createSignal<{ top: number; left: number } | null>(null);
  const [pinned, setPinned] = createSignal(false);
  let span: HTMLSpanElement | undefined;

  const computePos = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const pad = 8;
    const probe = document.createElement("div");
    probe.className = `${BUBBLE} invisible absolute`;
    probe.textContent = props.tip;
    document.body.appendChild(probe);
    const w = probe.offsetWidth;
    const h = probe.offsetHeight;
    document.body.removeChild(probe);

    const left = Math.min(Math.max(r.left + r.width / 2, w / 2 + pad), window.innerWidth - w / 2 - pad);
    let top = r.bottom + pad;
    if (top + h > window.innerHeight - pad) top = r.top - h - pad;
    // Bubble vollständig innerhalb des Viewports halten (deckt auch den
    // unteren Rand ab, falls selbst die Aufklapp-Variante nicht passt).
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    return { top, left };
  };

  const show = (el: HTMLElement) => setPos(computePos(el));

  const hide = () => {
    setPinned(false);
    setPos(null);
  };

  // Tap-to-open/close for touch: tap the host to toggle a "pinned" bubble,
  // tap anywhere outside to dismiss.
  const toggle = (el: HTMLElement) => {
    if (pinned()) {
      hide();
    } else {
      setPinned(true);
      show(el);
    }
  };

  // Während eine Bubble "gepinnt" ist (Tap), schließt ein Pointer-Down außerhalb
  // des Triggers sie wieder. Effekt bereinigt den Listener beim Unmount.
  createEffect(() => {
    if (!pinned()) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (span && !span.contains(target)) hide();
    };
    document.addEventListener("pointerdown", onPointerDown);
    onCleanup(() => document.removeEventListener("pointerdown", onPointerDown));
  });

  // Offene Bubble bei Scroll/Resize neu positionieren, damit sie am Trigger
  // kleben bleibt (scrollt mit der Seite) und die Rand-Umklappung neu prüft.
  onMount(() => {
    const reposition = () => {
      if (pos() && span) setPos(computePos(span));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    onCleanup(() => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    });
  });

  return (
    <>
      <span
        ref={span!}
        tabIndex={0}
        class={props.class}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={() => {
          if (!pinned()) hide();
        }}
        onFocus={(e) => show(e.currentTarget)}
        onBlur={hide}
        onClick={(e) => {
          e.stopPropagation();
          toggle(e.currentTarget);
        }}
      >
        {props.children}
      </span>
      <Show when={pos()}>
        {(p) => (
          <Portal>
            <div
              role="tooltip"
              class={`${BUBBLE} pointer-events-none fixed z-50`}
              style={{ top: `${p().top}px`, left: `${p().left}px`, transform: "translateX(-50%)" }}
            >
              {props.tip}
            </div>
          </Portal>
        )}
      </Show>
    </>
  );
}
