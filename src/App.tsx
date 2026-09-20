import { createEffect, createMemo, createSignal, Match, onMount, Show, Switch } from "solid-js";
import type { Basis, ChangelogData, PlanId, PriceData } from "./types";
import { i18n, type Lang } from "./i18n";
import { VALID_SORT, type SortState } from "./sort";
import { CAP_IDS, type CapId } from "./capabilities";
import { TAB_PLAN_IDS, isTabPlan } from "./plans";
import { normalizePath, routeForBase, routePath, splitLang, type RouteId } from "./routes";
import { RouterProvider, useRouter } from "./router";
import { seoFor } from "./seo";
import Header from "./components/Header";
import Hero from "./components/Hero";
import ApiBanner from "./components/ApiBanner";
import PlanTabs from "./components/PlanTabs";
import PriceTable from "./components/PriceTable";
import PlanComparison from "./components/PlanComparison";
import ModelRanking from "./components/ModelRanking";
import AllModels from "./components/AllModels";
import Faq from "./components/Faq";
import ZdrNote from "./components/ZdrNote";
import Changelog from "./components/Changelog";
import ShareDialog from "./components/ShareDialog";
import Legal from "./components/Legal";
import LegalPage from "./pages/LegalPage";
import Footer from "./components/Footer";
import { modelOnPlan } from "./util";
import dataJson from "../data/latest.json";
import changelogJson from "./data/changelog.json";

const data = dataJson as unknown as PriceData;
const changelogData = changelogJson as unknown as ChangelogData;

const tabPlans = data.plans.filter((p) => (TAB_PLAN_IDS as readonly string[]).includes(p.id));
const defaultBasis: Basis = "full";

interface ParsedParams {
  plan: PlanId | null;
  sort: SortState | null;
  basis: Basis | null;
  lang: "de" | "en" | null;
  theme: "dark" | "light" | null;
  cap: CapId[] | null;
  matrixSearch: string | null;
  matrixCaps: CapId[] | null;
}

/** Query-Parameter werden nur clientseitig NACH der Hydration gelesen. */
function readParams(): ParsedParams {
  const p =
    typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const planRaw = p.get("plan");
  const plan = isTabPlan(planRaw) ? planRaw : null;
  const [f, d] = (p.get("sort") ?? "").split(":");
  const sort =
    VALID_SORT.includes(f as SortState["field"]) && (d === "asc" || d === "desc")
      ? { field: f as SortState["field"], dir: (d === "asc" ? 1 : -1) as 1 | -1 }
      : null;
  const b = p.get("basis");
  const basis: Basis | null = b === "list" || b === "full" || b === "paid" ? b : null;
  const l = p.get("lang");
  const lang: "de" | "en" | null = l === "de" || l === "en" ? l : null;
  const themeRaw = p.get("theme");
  const theme: "dark" | "light" | null =
    themeRaw === "dark" || themeRaw === "light" ? themeRaw : null;
  const capRaw = p.get("cap");
  const cap: CapId[] | null =
    capRaw === null
      ? null
      : Array.from(
          new Set(capRaw.split(",").filter((x): x is CapId => (CAP_IDS as readonly string[]).includes(x)))
        );
  const ms = p.get("ms");
  const matrixSearch: string | null = ms !== null ? ms : null;
  const mcapRaw = p.get("mcap");
  const matrixCaps: CapId[] | null =
    mcapRaw === null
      ? null
      : Array.from(
          new Set(mcapRaw.split(",").filter((x): x is CapId => (CAP_IDS as readonly string[]).includes(x)))
        );
  return { plan, sort, basis, lang, theme, cap, matrixSearch, matrixCaps };
}

function readStoredLang(): Lang | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
    return v === "de" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

function readStoredTheme(): "dark" | "light" | null {
  try {
    const v = typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null;
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function prefersDarkSystem(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function resolveInitialDark(themeParam: "dark" | "light" | null, stored: string | null): boolean {
  if (themeParam === "dark") return true;
  if (themeParam === "light") return false;
  if (stored === "dark") return true;
  if (stored === "light") return false;
  return prefersDarkSystem();
}

/**
 * App-Wurzel. `ssrPath`/`ssrLang` setzt der Prerender (Node); im Browser bleibt
 * beides leer und wird synchron aus `window.location` abgeleitet, damit der
 * erste Client-Render exakt zur vorgerenderten Datei passt (Hydration).
 */
export default function App(props: { ssrPath?: string; ssrLang?: Lang }) {
  const initialPath = normalizePath(
    props.ssrPath ?? (typeof window !== "undefined" ? window.location.pathname : "/")
  );
  return (
    <RouterProvider initialPath={initialPath}>
      <AppShell ssrLang={props.ssrLang} />
    </RouterProvider>
  );
}

function AppShell(props: { ssrLang?: Lang }) {
  const router = useRouter();
  const route = createMemo<RouteId>(() => routeForBase(splitLang(router.path()).base)?.id ?? "home");
  const pathLang = createMemo<Lang>(() => splitLang(router.path()).lang);

  // Erster Render = Server-Defaults (hell, Route) — gespeicherte Sprache/Theme
  // und Query-Parameter folgen erst in `onMount` NACH der Hydration.
  const [ready, setReady] = createSignal(false);
  const [lang, setLang] = createSignal<Lang>(props.ssrLang ?? pathLang());
  const [dark, _setDark] = createSignal<boolean>(false);
  const [planId, setPlanId] = createSignal<PlanId>("goat");
  const [basis, setBasis] = createSignal<Basis>(defaultBasis);
  const [sort, setSort] = createSignal<SortState>({ field: "requests", dir: -1 });
  const [caps, setCaps] = createSignal<CapId[]>([]);
  const [matrixSearch, setMatrixSearch] = createSignal<string>("");
  const [matrixCaps, setMatrixCaps] = createSignal<CapId[]>([]);

  const t = () => i18n[lang()];
  const plan = () => data.plans.find((pl) => pl.id === planId()) ?? tabPlans[0] ?? data.plans[0]!;
  const planModels = createMemo(() => data.models.filter((m) => modelOnPlan(m, planId())));

  // Explicit user toggle: always persist.
  const setDark = (v: boolean) => {
    _setDark(v);
    try {
      localStorage.setItem("theme", v ? "dark" : "light");
    } catch {
      // ignore (private mode etc.)
    }
  };

  onMount(() => {
    const p = readParams();
    // Pfad ist die Quelle der Wahrheit. `?lang` (Legacy-Alias) gilt überall;
    // eine frühere localStorage-Wahl nur auf der präfixlosen Startseite, sonst
    // (ohne Wahl) die Browser-Sprache (`de*` → `/de/`). Beides greift erst nach
    // der Hydration; Crawler (ohne `navigator`) sehen immer Englisch.
    const urlLang = p.lang;
    const stored = readStoredLang();
    const browserDe =
      typeof navigator !== "undefined" && (navigator.language || "").toLowerCase().startsWith("de");
    const targetLang: Lang =
      urlLang ??
      (pathLang() === "en" && route() === "home"
        ? (stored ?? (browserDe ? "de" : "en"))
        : pathLang());
    setLang(targetLang);
    _setDark(resolveInitialDark(p.theme, readStoredTheme()));
    if (p.plan) setPlanId(p.plan);
    if (p.basis) setBasis(p.basis);
    if (p.sort) setSort(p.sort);
    if (p.cap) setCaps(p.cap);
    if (p.matrixSearch !== null) setMatrixSearch(p.matrixSearch);
    if (p.matrixCaps) setMatrixCaps(p.matrixCaps);

    // Kanonische Pfadform herstellen (Sprachpräfix statt `?lang=`), per
    // `replaceState`, damit kein zusätzlicher History-Eintrag entsteht.
    if (typeof window !== "undefined" && targetLang !== pathLang()) {
      router.replace(routePath(route(), targetLang) + window.location.search + window.location.hash);
    }
    setReady(true);
  });

  createEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang();
    try {
      localStorage.setItem("lang", lang());
    } catch {
      // ignore
    }
  });

  createEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    if (dark()) el.setAttribute("data-theme", "dark");
    else el.removeAttribute("data-theme");
  });

  // Titel clientseitig konsistent halten (Datei-Titel kommt aus dem Prerender).
  createEffect(() => {
    if (typeof document === "undefined") return;
    document.title = seoFor(route(), lang()).title;
  });

  // Follow OS theme while the user has no explicit choice.
  if (typeof window !== "undefined" && typeof window.matchMedia !== "undefined") {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (localStorage.getItem("theme") !== null) return;
      if (readParams().theme !== null) return;
      _setDark(e.matches);
    };
    if (typeof mq.addEventListener === "function") mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
  }

  // Filterzustand in die URL spiegeln (erst nach der Hydration).
  createEffect(() => {
    if (!ready() || typeof window === "undefined") return;
    void router.path(); // bei Pfadwechsel (Sprachpräfix) erneut schreiben
    const p = new URLSearchParams(window.location.search);
    if (planId() === "goat") p.delete("plan");
    else p.set("plan", planId());
    const s = sort();
    if (s.field === "cost" && s.dir === 1) p.delete("sort");
    else p.set("sort", `${s.field}:${s.dir === 1 ? "asc" : "desc"}`);
    if (basis() === defaultBasis) p.delete("basis");
    else p.set("basis", basis());
    if (caps().length === 0) p.delete("cap");
    else p.set("cap", caps().join(","));
    if (!matrixSearch()) p.delete("ms");
    else p.set("ms", matrixSearch());
    if (matrixCaps().length === 0) p.delete("mcap");
    else p.set("mcap", matrixCaps().join(","));
    p.delete("lang"); // Sprache steckt jetzt im Pfad
    const qs = p.toString();
    const url = (qs ? window.location.pathname + "?" + qs : window.location.pathname) + window.location.hash;
    history.replaceState(null, "", url);
  });

  const resetAll = () => {
    setPlanId("goat");
    setSort({ field: "cost", dir: 1 });
    setBasis(defaultBasis);
    setCaps([]);
    setMatrixSearch("");
    setMatrixCaps([]);
    if (typeof window !== "undefined") {
      router.navigate(routePath("home", lang()));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Sprachwechsel behält Query-Parameter (ohne `lang`) und Hash bei und lädt die
  // vorgerenderte Datei der Zielsprache (echter Reload → korrekte Sprache/HTML).
  const switchLang = (l: Lang, e: MouseEvent) => {
    if (typeof window === "undefined") return;
    e.preventDefault();
    const p = new URLSearchParams(window.location.search);
    p.delete("lang");
    const qs = p.toString();
    const target = routePath(route(), l) + (qs ? "?" + qs : "") + window.location.hash;
    window.location.assign(target);
  };

  return (
    <div class="min-h-screen w-full bg-base-100 text-base-content">
      <Header
        lang={lang()}
        langHref={(l) => routePath(route(), l)}
        switchLang={switchLang}
        homeHref={routePath("home", lang())}
        dark={dark()}
        setDark={setDark}
        onReset={resetAll}
        t={t()}
      />
      <main class="mx-auto max-w-6xl px-4 py-8">
        <Switch>
          <Match when={route() === "impressum"}>
            <LegalPage kind="impressum" t={t()} />
          </Match>
          <Match when={route() === "datenschutz"}>
            <LegalPage kind="datenschutz" t={t()} />
          </Match>
          <Match when={route() === "home"}>
            <Hero t={t()} plan={plan()} modelCount={planModels().length} lang={lang()} />
            <Show when={planId() === "go"}>
              <ApiBanner plans={data.plans} t={t()} />
            </Show>
            <PlanTabs plans={tabPlans} active={planId()} onSelect={setPlanId} t={t()} />
            <PriceTable
              models={planModels()}
              plan={plan()}
              t={t()}
              lang={lang()}
              basis={basis()}
              setBasis={setBasis}
              sort={sort()}
              setSort={setSort}
              caps={caps()}
              setCaps={setCaps}
              peakHours={data.peakHours}
              headerActions={<ShareDialog data={data} planId={planId()} basis={basis()} lang={lang()} />}
            />
            <PlanComparison
              models={data.models}
              plans={data.plans}
              t={t()}
              search={matrixSearch()}
              setSearch={setMatrixSearch}
              caps={matrixCaps()}
              setCaps={setMatrixCaps}
              lang={lang()}
            />
            <ModelRanking models={planModels()} plan={plan()} lang={lang()} t={t()} />
            <AllModels models={data.models} t={t()} />
            <ZdrNote t={t()} />
            <Faq t={t()} />
            <Changelog entries={changelogData.entries} t={t()} lang={lang()} />
            <Legal t={t()} />
          </Match>
        </Switch>
      </main>
      <Footer t={t()} data={data} lang={lang()} />
    </div>
  );
}
