import { createEffect, createMemo, createSignal, Show } from "solid-js";
import type { Basis, ChangelogData, PlanId, PriceData } from "./types";
import { i18n, type Lang } from "./i18n";
import { VALID_SORT, type SortState } from "./sort";
import { CAP_IDS, type CapId } from "./capabilities";
import { TAB_PLAN_IDS, isTabPlan } from "./plans";
import Header from "./components/Header";
import Hero from "./components/Hero";
import ApiBanner from "./components/ApiBanner";
import PlanTabs from "./components/PlanTabs";
import PriceTable from "./components/PriceTable";
import PlanComparison from "./components/PlanComparison";
import ZdrNote from "./components/ZdrNote";
import Changelog from "./components/Changelog";
import Legal from "./components/Legal";
import Footer from "./components/Footer";
import { modelOnPlan } from "./util";
import dataJson from "../data/latest.json";
import changelogJson from "./data/changelog.json";

const data = dataJson as unknown as PriceData;
const changelogData = changelogJson as unknown as ChangelogData;

const storedLang = typeof localStorage !== "undefined" ? localStorage.getItem("lang") : null;
const storedTheme = typeof localStorage !== "undefined" ? localStorage.getItem("theme") : null;
const storedBasis = typeof localStorage !== "undefined" ? localStorage.getItem("basis") : null;
const browserLang =
  typeof navigator !== "undefined" ? (navigator.language || "").toLowerCase() : "";
const defaultLang: Lang =
  storedLang === "de" || storedLang === "en" ? storedLang : browserLang.startsWith("de") ? "de" : "en";

const tabPlans = data.plans.filter((p) => (TAB_PLAN_IDS as readonly string[]).includes(p.id));
const defaultBasis: Basis =
  storedBasis === "list" || storedBasis === "full" || storedBasis === "paid" ? storedBasis : "full";

function readParams(): {
  plan: PlanId | null;
  sort: SortState | null;
  basis: Basis | null;
  lang: "de" | "en" | null;
  cap: CapId[] | null;
} {
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
  const capRaw = p.get("cap");
  const cap: CapId[] | null =
    capRaw === null
      ? null
      : Array.from(new Set(capRaw.split(",").filter((x): x is CapId => (CAP_IDS as readonly string[]).includes(x))));
  return { plan, sort, basis, lang, cap };
}
const params = readParams();

export default function App() {
  const [lang, setLang] = createSignal<Lang>(params.lang ?? defaultLang);
  const [dark, setDark] = createSignal(storedTheme === "dark");
  const [planId, setPlanId] = createSignal<PlanId>(params.plan ?? "goat");
  const [basis, setBasis] = createSignal<Basis>(params.basis ?? defaultBasis);
  const [sort, setSort] = createSignal<SortState>(params.sort ?? { field: "cost", dir: 1 });
  const [caps, setCaps] = createSignal<CapId[]>(params.cap ?? []);

  const t = () => i18n[lang()];
  const plan = () => data.plans.find((pl) => pl.id === planId()) ?? tabPlans[0] ?? data.plans[0]!;
  const planModels = createMemo(() => data.models.filter((m) => modelOnPlan(m, planId())));

  createEffect(() => {
    document.documentElement.lang = lang();
    localStorage.setItem("lang", lang());
  });

  createEffect(() => {
    const el = document.documentElement;
    if (dark()) {
      el.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      el.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  });

  createEffect(() => {
    localStorage.setItem("basis", basis());
  });

  createEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (planId() === "goat") p.delete("plan");
    else p.set("plan", planId());
    const s = sort();
    if (s.field === "cost" && s.dir === 1) p.delete("sort");
    else p.set("sort", `${s.field}:${s.dir === 1 ? "asc" : "desc"}`);
    if (basis() === defaultBasis) p.delete("basis");
    else p.set("basis", basis());
    if (lang() === defaultLang) p.delete("lang");
    else p.set("lang", lang());
    if (caps().length === 0) p.delete("cap");
    else p.set("cap", caps().join(","));
    const qs = p.toString();
    const url = (qs ? window.location.pathname + "?" + qs : window.location.pathname) + window.location.hash;
    history.replaceState(null, "", url);
  });

  const resetAll = () => {
    setPlanId("goat");
    setSort({ field: "cost", dir: 1 });
    setBasis(defaultBasis);
    setLang(defaultLang);
    setCaps([]);
    history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div class="min-h-screen w-full bg-base-100 text-base-content">
      <Header lang={lang()} setLang={setLang} dark={dark()} setDark={setDark} onReset={resetAll} />
      <main class="mx-auto max-w-5xl px-4 py-8">
        <Hero t={t()} plan={plan()} modelCount={planModels().length} />
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
        />
        <PlanComparison models={data.models} plans={data.plans} t={t()} />
        <ZdrNote t={t()} />
        <Changelog entries={changelogData.entries} t={t()} lang={lang()} />
        <Legal t={t()} />
      </main>
      <Footer t={t()} data={data} lang={lang()} />
    </div>
  );
}
