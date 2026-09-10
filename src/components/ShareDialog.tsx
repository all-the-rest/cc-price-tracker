import { createMemo, createSignal, onMount, Show } from "solid-js";
import type { Lang } from "../i18n";
import type { Basis, Plan, PlanId, PriceData } from "../types";
import {
  SHARE_DEFAULTS,
  SHARE_LANG_KEY,
  SHARE_SIZES,
  autoShareTopN,
  buildShareSvg,
  downloadBlob,
  shareFromParams,
  shareLangFromParams,
  shareToParams,
  svgToPngBlob,
  topModels,
  type ShareConfig,
  type ShareLang,
  type ShareSize,
  type ShareTheme,
} from "../share";

interface ShareDialogProps {
  data: PriceData;
  planId: PlanId;
  basis: Basis;
  lang: Lang;
}

const STR: Record<Lang, Record<string, string>> = {
  de: {
    open: "Teilen",
    title: "Share-Card konfigurieren",
    desc: "Top-Modelle des aktiven Plans als SVG/PNG zum Teilen.",
    plan: "Plan",
    basis: "Preisbasis",
    theme: "Farbschema",
    themeDark: "Dunkel",
    themeLight: "Hell",
    size: "Format",
    brand: "Branding (cc-pricing.all-the.rest)",
    stamp: "Zeitstempel",
    copySvg: "SVG kopieren",
    dlSvg: "SVG laden",
    dlPng: "PNG laden",
    copyLink: "Link kopieren",
    close: "Schließen",
    done: "Kopiert!",
    preview: "Vorschau",
    cardLang: "Kartensprache",
  },
  en: {
    open: "Share",
    title: "Configure share card",
    desc: "Top models of the active plan as a shareable SVG/PNG.",
    plan: "Plan",
    themeDark: "Dark",
    themeLight: "Light",
    basis: "Price basis",
    theme: "Theme",
    size: "Size",
    brand: "Branding (cc-pricing.all-the.rest)",
    stamp: "Timestamp",
    copySvg: "Copy SVG",
    dlSvg: "Download SVG",
    dlPng: "Download PNG",
    copyLink: "Copy link",
    close: "Close",
    done: "Copied!",
    preview: "Preview",
    cardLang: "Card language",
  },
};

async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

export default function ShareDialog(props: ShareDialogProps) {
  let dialog: HTMLDialogElement | undefined;
  // Trigger label follows the main UI; everything inside the dialog follows shareLang.
  const openLabel = () => STR[props.lang].open;
  // Independent dialog language: defaults to the main-UI lang, but an
  // explicitly chosen value (URL sh_lang / localStorage / in-dialog switch)
  // is never overridden by later main-UI lang changes.
  const [shareLang, setShareLangState] = createSignal<ShareLang>(props.lang);
  const [shareExplicit, setShareExplicit] = createSignal(false);
  const t = () => STR[shareLang()];
  const setShareLang = (l: ShareLang) => {
    setShareLangState(l);
    setShareExplicit(true);
    try {
      localStorage.setItem(SHARE_LANG_KEY, l);
    } catch {
      // ignore (private mode etc.)
    }
  };
  const [config, setConfig] = createSignal<ShareConfig>({
    ...SHARE_DEFAULTS,
    plan: props.planId,
    basis: props.basis,
  });
  const [flash, setFlash] = createSignal<string | null>(null);
  const [fromLink, setFromLink] = createSignal(false);
  // Dialog theme follows the main page theme (theme-controller data-theme)
  // until the user makes an explicit choice in the dialog — same
  // follow-until-explicit pattern as shareLang.
  const [themeExplicit, setThemeExplicit] = createSignal(false);
  const pageTheme = (): ShareTheme =>
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark"
      ? "dark"
      : "light";

  onMount(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const fromUrl = shareFromParams(q);
      if (fromUrl) {
        setConfig(fromUrl);
        setFromLink(true);
      }
      const urlTheme = q.get("sh_theme");
      if (urlTheme === "dark" || urlTheme === "light") setThemeExplicit(true);
      const urlLang = shareLangFromParams(q);
      if (urlLang) {
        setShareLang(urlLang);
      } else {
        const stored = localStorage.getItem(SHARE_LANG_KEY);
        if (stored === "de" || stored === "en") {
          setShareLangState(stored);
          setShareExplicit(true);
        } else {
          setShareLangState(props.lang);
        }
      }
    } catch {
      // ignore
    }
  });

  const patch = (p: Partial<ShareConfig>) => setConfig((c) => ({ ...c, ...p }));

  const plan = createMemo((): Plan => props.data.plans.find((pl) => pl.id === config().plan) ?? props.data.plans[0]!);
  const rows = createMemo(() => topModels(props.data.models, plan(), config().basis, config().topN, props.data.peakHours));
  const svg = createMemo(() =>
    buildShareSvg({ rows: rows(), plan: plan(), config: config(), fetchedAt: props.data.fetchedAt, lang: shareLang() }),
  );
  const size = createMemo(() => SHARE_SIZES[config().size]);
  const fname = createMemo(() => `cc-top-${config().plan}-${config().metric}-top${config().topN}-${size().w}x${size().h}`);

  const flashed = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(null), 1600);
  };

  const open = () => {
    // Sync with the currently selected plan/basis — unless the config
    // came from a share link (then keep the linked config).
    if (!fromLink()) patch({ plan: props.planId, basis: props.basis });
    // First open without an explicitly chosen value: follow the main UI lang
    // and the main page theme.
    if (!shareExplicit()) setShareLangState(props.lang);
    if (!themeExplicit()) patch({ theme: pageTheme() });
    dialog?.showModal();
  };

  return (
    <>
      <button type="button" class="btn btn-outline btn-sm" onClick={open} aria-haspopup="dialog">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {openLabel()}
      </button>

      <dialog ref={dialog} class="modal" aria-labelledby="share-title">
        <div class="modal-box relative max-h-[92vh] w-11/12 max-w-4xl overflow-y-auto">
          <button
            type="button"
            class="btn btn-circle btn-ghost btn-sm absolute top-2 right-2"
            aria-label={t().close}
            onClick={() => dialog?.close()}
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div class="flex flex-wrap items-center justify-between gap-2 pr-10">
            <h2 id="share-title" class="text-lg font-bold">
              {t().title}
            </h2>
            <div class="join" role="radiogroup" aria-label={t().cardLang}>
              {(["de", "en"] as ShareLang[]).map((l) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={shareLang() === l}
                  class="join-item btn btn-xs"
                  classList={{ "btn-active btn-primary": shareLang() === l }}
                  onClick={() => setShareLang(l)}
                >
                  {l === "de" ? "DE" : "EN"}
                </button>
              ))}
            </div>
          </div>
          <p class="mt-1 text-sm text-base-content/70">{t().desc}</p>

          <div class="mt-4 grid gap-6 md:grid-cols-[280px_1fr]">
            <div class="flex flex-col gap-4" role="group" aria-label={t().title}>
              <label class="form-control">
                <span class="label label-text">{t().plan}</span>
                <select
                  class="select select-bordered select-sm w-full"
                  value={config().plan}
                  onChange={(e) => patch({ plan: e.currentTarget.value as PlanId })}
                >
                  {props.data.plans.map((p) => (
                    <option value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>

              {/* TOP-X is automatic per preset (landscape Top 5, portrait Top 8):
                  no manual selector, only the size (format) choice remains. */}
              <div class="flex flex-wrap gap-4">
                <label class="form-control">
                  <span class="label label-text">{t().size}</span>
                  <select
                    class="select select-bordered select-sm"
                    value={config().size}
                    onChange={(e) => {
                      const size = e.currentTarget.value as ShareSize;
                      patch({ size, topN: autoShareTopN(size) });
                    }}
                  >
                    {(Object.keys(SHARE_SIZES) as ShareSize[]).map((s) => (
                      <option value={s}>{SHARE_SIZES[s].label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div class="flex flex-wrap gap-4">
                <fieldset>
                  <legend class="label label-text">{t().basis}</legend>
                  <div class="join" role="radiogroup" aria-label={t().basis}>
                    {(["list", "full", "paid"] as Basis[]).map((b) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={config().basis === b}
                        class="join-item btn btn-xs"
                        classList={{ "btn-active btn-primary": config().basis === b }}
                        onClick={() => patch({ basis: b })}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend class="label label-text">{t().theme}</legend>
                  <div class="join" role="radiogroup" aria-label={t().theme}>
                    {(["dark", "light"] as ShareTheme[]).map((th) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={config().theme === th}
                        class="join-item btn btn-xs"
                        classList={{ "btn-active btn-primary": config().theme === th }}
                        onClick={() => {
                          patch({ theme: th });
                          setThemeExplicit(true);
                        }}
                      >
                        {th === "dark" ? t().themeDark : t().themeLight}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>

              <div class="flex flex-col gap-1">
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    checked={config().brand}
                    onChange={(e) => patch({ brand: e.currentTarget.checked })}
                  />
                  <span class="label-text text-sm">{t().brand}</span>
                </label>
                <label class="label cursor-pointer justify-start gap-2 py-1">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm checkbox-primary"
                    checked={config().timestamp}
                    onChange={(e) => patch({ timestamp: e.currentTarget.checked })}
                  />
                  <span class="label-text text-sm">{t().stamp}</span>
                </label>
              </div>
            </div>

            <div class="min-w-0">
              <p class="label label-text" aria-hidden="true">
                {t().preview} · {size().label} · Top {config().topN} · {config().basis}
              </p>
              {/* Scaled fit: the image scales down to the 55vh bound instead of
                  overflowing (portrait: height-bound with auto width, landscape:
                  width-bound with auto height); exports use the full native
                  size untouched. */}
              <div
                class="flex max-h-[55vh] justify-center overflow-hidden rounded-lg border border-base-300"
                classList={{
                  "[&>svg]:max-h-[55vh] [&>svg]:w-auto [&>svg]:max-w-full [&>svg]:h-auto":
                    config().size === "portrait" || config().size === "story",
                  "[&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-full":
                    config().size !== "portrait" && config().size !== "story",
                }}
                innerHTML={svg()}
                role="img"
                aria-label={t().preview}
              />
              {/* Sticky so export actions stay reachable when tall cards (portrait/story) overflow on small screens. */}
              <div class="sticky bottom-0 z-10 mt-3 flex flex-wrap gap-2 bg-base-100 py-2">
                <button
                  type="button"
                  class="btn btn-sm btn-primary"
                  onClick={async () => copyText(svg()).then((ok) => ok && flashed(t().done))}
                >
                  {t().copySvg}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  onClick={() => downloadBlob(new Blob([svg()], { type: "image/svg+xml;charset=utf-8" }), `${fname()}.svg`)}
                >
                  {t().dlSvg}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  onClick={async () => {
                    const blob = await svgToPngBlob(svg(), size().w, size().h);
                    downloadBlob(blob, `${fname()}.png`);
                  }}
                >
                  {t().dlPng}
                </button>
                <button
                  type="button"
                  class="btn btn-sm btn-outline"
                  onClick={async () => {
                    const url = `${window.location.origin}${window.location.pathname}?${shareToParams(config(), shareLang()).toString()}`;
                    copyText(url).then((ok) => ok && flashed(t().done));
                  }}
                >
                  {t().copyLink}
                </button>
              </div>
              <Show when={flash()}>
                <p class="mt-2 text-sm text-success" role="status">
                  {flash()}
                </p>
              </Show>
            </div>
          </div>

          <div class="modal-action">
            <form method="dialog">
              <button class="btn btn-sm btn-ghost">{t().close}</button>
            </form>
          </div>
        </div>
        <form method="dialog" class="modal-backdrop">
          <button aria-label={t().close}>close</button>
        </form>
      </dialog>
    </>
  );
}
