import type { Basis, Model, PeakHours, Plan, PlanId } from "./types";
import { formatRequests, fmt, modelOnPlan } from "./util";
import { fieldPrice, requestsPerMonth } from "./weighted";
import { peakRangesFor } from "./components/PeakIndicator";
import { PEAK_PRICING_RULES } from "./config/peakPricing";

/**
 * Share-card logic ("TOP information" assumption):
 * TOP = top-ranked models on the active plan by total requests/month (desc).
 * Each row also shows the $/1M input/output prices in the active basis for
 * context. Never a per-request ($/req) or per-month ($) figure anywhere.
 * Pure functions (no DOM) so the SVG string can be rendered in the dialog
 * preview, copied, downloaded, or rasterized to PNG via canvas.
 */

export type ShareMetric = "requests";
export type ShareTheme = "dark" | "light";
export type ShareSize = "og" | "twitter" | "portrait" | "story";

export interface ShareConfig {
  plan: PlanId;
  metric: ShareMetric;
  topN: number;
  basis: Basis;
  theme: ShareTheme;
  size: ShareSize;
  brand: boolean;
  timestamp: boolean;
}

export const SHARE_DEFAULTS: ShareConfig = {
  plan: "goat",
  metric: "requests",
  topN: 5,
  basis: "list",
  theme: "dark",
  size: "og",
  brand: true,
  timestamp: true,
};

export const SHARE_SIZES: Record<ShareSize, { w: number; h: number; label: string }> = {
  og: { w: 1200, h: 630, label: "OG 1200×630" },
  twitter: { w: 1200, h: 675, label: "Twitter 1200×675" },
  portrait: { w: 1080, h: 1350, label: "IG 4:5 1080×1350" },
  story: { w: 1080, h: 1920, label: "Story 9:16 1080×1920" },
};

/** Bare custom-domain source shown in the card footer (repo's Pages domain, public/CNAME). */
export const SHARE_SOURCE = "cc-pricing.all-the.rest";

/**
 * Automatic TOP-X count per preset (same as ocgo, no manual selection):
 * landscape (OG/Twitter) = Top 5, no constraints; portrait (IG 4:5/Story)
 * = Top 8 with per-row constraint lines + compact constraints block instead
 * of filler models.
 */
export function autoShareTopN(size: ShareSize): number {
  return size === "portrait" || size === "story" ? 8 : 5;
}

export interface ShareRow {
  name: string;
  value: number | null;
  display: string;
  inPrice: number | null;
  outPrice: number | null;
  priceDisplay: string;
  /** UTC peak windows of this model from the source data (empty = omit, never guess). */
  peak: [number, number][];
}

/** Total requests/month for ranking (the only share metric). */
export function shareValue(m: Model, basis: Basis, plan: Plan): number | null {
  return requestsPerMonth(m, basis, plan);
}

/** $/1M input/output prices in the active basis, shown alongside for context. */
export function sharePrices(m: Model, basis: Basis, plan: Plan): { input: number | null; output: number | null } {
  return { input: fieldPrice(m, "input", basis, plan), output: fieldPrice(m, "output", basis, plan) };
}

export function formatShareValue(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "–";
  if (!Number.isFinite(v)) return "∞";
  return formatRequests(v, "en");
}

export function formatSharePrice(input: number | null, output: number | null): string {
  return `${fmt(input)} in · ${fmt(output)} out /1M`;
}

/** Ranked TOP-N models for a plan by total requests/month (desc); nulls (and NaN) always sort last. */
export function topModels(
  models: Model[],
  plan: Plan,
  basis: Basis,
  topN: number,
  peakHours?: PeakHours,
): ShareRow[] {
  const rows = models
    .filter((m) => modelOnPlan(m, plan.id))
    .map((m) => {
      const value = shareValue(m, basis, plan);
      const { input, output } = sharePrices(m, basis, plan);
      return {
        name: m.name,
        value,
        display: formatShareValue(value),
        inPrice: input,
        outPrice: output,
        priceDisplay: formatSharePrice(input, output),
        peak: peakHours ? peakRangesFor(peakHours, m.name) : [],
      };
    });
  rows.sort((a, b) => {
    const av = a.value;
    const bv = b.value;
    const aBad = av === null || Number.isNaN(av);
    const bBad = bv === null || Number.isNaN(bv);
    if (aBad && bBad) return a.name.localeCompare(b.name);
    if (aBad) return 1;
    if (bBad) return -1;
    if (av === bv) return a.name.localeCompare(b.name);
    return (bv as number) - (av as number);
  });
  return rows.slice(0, Math.max(1, Math.min(10, topN)));
}

/** Localized last-update stamp (date + intraday time — fetchedAt intraday
 * runs always carry one). UTC-anchored so the card reads identically
 * everywhere; the "UTC" suffix makes the zone explicit. */
export function formatShareStamp(fetchedAt: string, lang: "de" | "en"): string {
  const dt = new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(fetchedAt));
  return `${dt} UTC`;
}

export function metricLabel(lang: "de" | "en"): string {
  return lang === "de" ? "Top Requests/Monat" : "Top requests/mo";
}

/** Per-row constraint hint for portrait cards (max one line per row). Nulls (provider plan) → no-limits note. */
export function limitHint(plan: Plan, lang: "de" | "en"): string {
  const { h5, weekly } = plan.limits;
  if (h5 === null && weekly === null) return lang === "de" ? "Keine Limits" : "No limits";
  const f = (v: number | null) => (v === null ? "–" : String(v));
  return lang === "de" ? `5h-Limit: ${f(h5)} · Wochen-Limit: ${f(weekly)}` : `5h limit: ${f(h5)} · weekly limit: ${f(weekly)}`;
}

/** Compact constraints line for the portrait footer block (limits; stand/domain handled by caller toggles). */
export function limitsBlock(plan: Plan, lang: "de" | "en"): string {
  const { h5, weekly, monthly } = plan.limits;
  if (h5 === null && weekly === null && monthly === null)
    return lang === "de" ? "Keine Limits" : "No limits";
  const f = (v: number | null) => (v === null ? "–" : String(v));
  return lang === "de"
    ? `Limits (Credits): 5h ${f(h5)} · Woche ${f(weekly)} · Monat ${f(monthly)}`
    : `Limits (credits): 5h ${f(h5)} · week ${f(weekly)} · month ${f(monthly)}`;
}

/**
 * Peak/Off-Peak rule: whenever peak pricing is stated on the card, the UTC
 * window times AND the weekday coverage must be stated too — never a bare
 * "Peak"/"Off-Peak". Coverage is sourced from PEAK_PRICING_RULES (weekends
 * Sat+Sun off-peak in Beijing time, windows apply Mon–Fri); anything else
 * falls back to an explicit "per source" marker instead of guessing.
 */
function formatPeakWindows(windows: [number, number][]): string {
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return windows.map(([s, e]) => `${hh(s)}–${hh(e)}`).join(", ") + " UTC";
}

function peakCoverage(lang: "de" | "en"): string {
  const w = [...PEAK_PRICING_RULES.weekendOffPeakDaysBeijing].sort((a, b) => a - b);
  if (w.length === 2 && w[0] === 0 && w[1] === 6) {
    return lang === "de" ? "Mo–Fr · Sa/So Off-Peak" : "Mon–Fri · Sat/Sun off-peak";
  }
  return lang === "de" ? "Zeiten laut Quelle" : "times per source";
}

/** Full peak note for one model ("Peak <windows> · <coverage>"); empty when the source names no windows. */
export function peakNote(windows: [number, number][], lang: "de" | "en"): string {
  if (windows.length === 0) return "";
  return `Peak ${formatPeakWindows(windows)} · ${peakCoverage(lang)}`;
}

/** Per-row constraint line (max one): plan limits + the model's peak note when the source has windows. */
export function constraintLine(plan: Plan, peak: [number, number][], lang: "de" | "en"): string {
  const base = limitHint(plan, lang);
  const note = peakNote(peak, lang);
  return note ? `${base} · ${note}` : base;
}

/** Union of peak windows across rows (deduplicated) for the footer block line; empty = omit. */
export function peakBlockLine(rows: ShareRow[], lang: "de" | "en"): string {
  const seen = new Map<string, [number, number]>();
  for (const r of rows) for (const w of r.peak) seen.set(`${w[0]}-${w[1]}`, w);
  const windows = [...seen.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (windows.length === 0) return "";
  return lang === "de"
    ? `Peak-Modelle: ${formatPeakWindows(windows)} · ${peakCoverage(lang)}`
    : `Peak models: ${formatPeakWindows(windows)} · ${peakCoverage(lang)}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const MEDALS = ["#fbbf24", "#cbd5e1", "#d97706"];

/** Build a standalone SVG share card (system fonts only, no external assets). */
export function buildShareSvg(opts: {
  rows: ShareRow[];
  plan: Plan;
  config: ShareConfig;
  fetchedAt: string;
  lang: "de" | "en";
}): string {
  const { rows, plan, config, fetchedAt, lang } = opts;
  const { w, h } = SHARE_SIZES[config.size];
  const dark = config.theme === "dark";
  const bg = dark ? "#1d232a" : "#ffffff";
  const bg2 = dark ? "#191e24" : "#f1f5f9";
  const fg = dark ? "#f2f4f7" : "#0f172a";
  const muted = dark ? "#9aa5b1" : "#64748b";
  const accent = dark ? "#7dd3fc" : "#1d4ed8";
  const bar = dark ? "#38bdf8" : "#2563eb";
  const line = dark ? "#2a323c" : "#e2e8f0";

  const pad = w >= 1500 ? 72 : 56;
  const headerH = 148;
  // Portrait cards get a compact constraints block (limits line, plus a peak
  // line when any row has source peak windows) in the footer zone; the
  // divider stays glued above the brand/stand line.
  const portrait = config.size === "portrait" || config.size === "story";
  const peakT = portrait ? peakBlockLine(rows, lang) : "";
  const footBase = config.brand || config.timestamp ? 64 : 24;
  const footerH = footBase + (portrait ? (peakT ? 56 : 30) : 0);
  const listAvailTop = headerH + 8;
  const listAvailH = h - listAvailTop - footerH;
  // Cap row height so small top-N on tall cards doesn't blow up; center block.
  const rowH = rows.length > 0 ? Math.min(listAvailH / rows.length, 118) : listAvailH;
  const listTop = listAvailTop + Math.max(0, (listAvailH - rowH * rows.length) / 2);
  const fs = Math.round(Math.max(16, Math.min(w >= 1500 ? 30 : 26, rowH * 0.32)));
  const small = Math.round(fs * 0.72);
  const constr = Math.max(13, Math.round(small * 0.75));
  const medalR = Math.min(rowH * 0.22, 26);
  const showBar = rowH >= 54;
  // Wide cards have room for longer names; narrow cards truncate earlier.
  const maxName = w >= 1500 ? 44 : 28;
  const finiteMax = Math.max(
    0,
    ...rows.map((r) => (typeof r.value === "number" && Number.isFinite(r.value) ? Math.abs(r.value) : 0)),
  );
  const barMax = finiteMax > 0 ? finiteMax : 1;

  const title = lang === "de" ? "Command Code · Preis-Tracking" : "Command Code · Price Tracker";
  const metricT = metricLabel(lang);
  const basisT = config.basis === "list" ? (lang === "de" ? "Listenpreis" : "list") : config.basis === "full" ? (lang === "de" ? "Volles Guthaben" : "full credit") : lang === "de" ? "Was du zahlst" : "what you pay";
  const dateT = formatShareStamp(fetchedAt, lang);
  const asOf = lang === "de" ? `Stand ${dateT} · ${plan.name} · ${basisT}` : `As of ${dateT} · ${plan.name} · ${basisT}`;

  const rowSvg = rows
    .map((r, i) => {
      const y = listTop + i * rowH;
      // Infinity (e.g. free models with unlimited requests) gets a full bar.
      const v = r.value === Infinity ? barMax : typeof r.value === "number" && Number.isFinite(r.value) ? Math.abs(r.value) : 0;
      const frac = barMax > 0 ? v / barMax : 0;
      const bw = Math.max(8, Math.min(1, frac) * (w - pad * 2 - 320));
      const medal = MEDALS[i] ?? line;
      const cy = Math.round(y + rowH / 2);
      const nameX = pad + Math.round(medalR + 12);
      // Portrait rows carry max one constraint line: name up, limits + peak note below, bar under it.
      const nameY = portrait ? cy - 16 : Math.round(y + rowH / 2 + (showBar ? -2 : small * 0.36));
      const barY = portrait ? cy + 14 : Math.round(y + rowH / 2 + 10);
      const hintT = portrait ? constraintLine(plan, r.peak, lang) : "";
      // Roomy rows: requests big on top, $/1M in/out price small below.
      // Compact rows: single combined line so nothing overflows vertically.
      const values = showBar
        ? `<text x="${w - pad}" y="${cy - 6}" text-anchor="end" font-size="${fs}" font-weight="700" fill="${fg}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(r.display)}</text>
        <text x="${w - pad}" y="${cy + small + 4}" text-anchor="end" font-size="${small}" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(r.priceDisplay)}</text>`
        : `<text x="${w - pad}" y="${Math.round(y + rowH / 2 + small * 0.3)}" text-anchor="end" font-size="${fs}" font-weight="700" fill="${fg}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(r.display)}<tspan font-size="${small}" font-weight="400" fill="${muted}"> · ${esc(r.priceDisplay)}</tspan></text>`;
      return `<g>
        <circle cx="${pad}" cy="${cy}" r="${Math.round(medalR)}" fill="${i < 3 ? medal : "none"}" stroke="${i < 3 ? medal : muted}" stroke-width="2"/>
        <text x="${pad}" y="${Math.round(y + rowH / 2 + small * 0.36)}" text-anchor="middle" font-size="${small}" font-weight="700" fill="${i < 3 ? (dark ? "#1d232a" : "#ffffff") : muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${i + 1}</text>
        <text x="${nameX}" y="${nameY}" font-size="${fs}" font-weight="600" fill="${fg}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(r.name.length > maxName ? r.name.slice(0, maxName - 1) + "…" : r.name)}</text>
        ${portrait ? `<text x="${nameX}" y="${cy + 6}" font-size="${constr}" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(hintT)}</text>` : ""}
        ${showBar ? `<rect x="${nameX}" y="${barY}" width="${Math.round(bw)}" height="10" rx="5" fill="${bar}" opacity="0.85"/>` : ""}
        ${values}
      </g>`;
    })
    .join("");

  const footerT = config.brand ? SHARE_SOURCE : "";
  const stampT = config.timestamp ? (lang === "de" ? `Stand ${dateT}` : `As of ${dateT}`) : "";
  const limitsT = portrait ? limitsBlock(plan, lang) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)} – ${esc(metricT)}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <rect width="${w}" height="${headerH}" fill="${bg2}"/>
  <rect y="${headerH - 2}" width="${w}" height="2" fill="${accent}" opacity="0.7"/>
  <text x="${pad}" y="58" font-size="30" font-weight="800" fill="${fg}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(title)}</text>
  <text x="${pad}" y="96" font-size="24" font-weight="600" fill="${accent}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(metricT)}</text>
  <text x="${pad}" y="124" font-size="18" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(asOf)}</text>
  ${rowSvg}
  ${rows.length === 0 ? `<text x="${pad}" y="${listTop + 40}" font-size="24" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">–</text>` : ""}
  ${portrait ? `<text x="${pad}" y="${h - footerH + 26}" font-size="16" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(limitsT)}</text>` : ""}
  ${peakT ? `<text x="${pad}" y="${h - footerH + 50}" font-size="16" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(peakT)}</text>` : ""}
  ${config.brand || config.timestamp ? `<line x1="${pad}" y1="${h - footBase + 6}" x2="${w - pad}" y2="${h - footBase + 6}" stroke="${line}" stroke-width="1"/>` : ""}
  <text x="${pad}" y="${h - 22}" font-size="18" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(footerT)}</text>
  <text x="${w - pad}" y="${h - 22}" text-anchor="end" font-size="18" fill="${muted}" font-family="system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">${esc(stampT)}</text>
</svg>`;
}

/** Independent dialog/card language (separate from the main-UI lang). */
export type ShareLang = "de" | "en";
export const SHARE_LANG_KEY = "cc-share-lang";

export function shareLangFromParams(p: URLSearchParams): ShareLang | null {
  const l = p.get("sh_lang");
  return l === "de" || l === "en" ? l : null;
}

/** Serialize config into share-link query params (prefix sh_). Metric is always requests, so no sh_metric. */
export function shareToParams(c: ShareConfig, lang?: ShareLang): URLSearchParams {
  const p = new URLSearchParams();
  p.set("sh_plan", c.plan);
  p.set("sh_n", String(c.topN));
  p.set("sh_basis", c.basis);
  p.set("sh_theme", c.theme);
  p.set("sh_size", c.size);
  if (!c.brand) p.set("sh_brand", "0");
  if (!c.timestamp) p.set("sh_stamp", "0");
  if (lang === "de" || lang === "en") p.set("sh_lang", lang);
  return p;
}

const PLAN_IDS = ["go", "goat", "pro", "provider", "max10", "max20"] as const;

/** Parse share-link params; returns null when no sh_* param is present. Old sh_metric values are ignored (requests only). Legacy sh_n is tolerated but ignored — the TOP-X count is automatic per preset (landscape Top 5, portrait Top 8). */
export function shareFromParams(p: URLSearchParams): ShareConfig | null {
  const has = ["sh_plan", "sh_metric", "sh_n", "sh_basis", "sh_theme", "sh_size", "sh_brand", "sh_stamp", "sh_lang"].some((k) => p.get(k) !== null);
  if (!has) return null;
  const plan = p.get("sh_plan");
  const basis = p.get("sh_basis");
  const theme = p.get("sh_theme");
  const sizeRaw = p.get("sh_size");
  const size: ShareSize =
    sizeRaw === "twitter" || sizeRaw === "portrait" || sizeRaw === "story" || sizeRaw === "og"
      ? sizeRaw
      : SHARE_DEFAULTS.size;
  return {
    plan: (PLAN_IDS as readonly string[]).includes(plan ?? "") ? (plan as PlanId) : SHARE_DEFAULTS.plan,
    metric: "requests",
    topN: autoShareTopN(size),
    basis: basis === "list" || basis === "full" || basis === "paid" ? basis : SHARE_DEFAULTS.basis,
    theme: theme === "light" || theme === "dark" ? theme : SHARE_DEFAULTS.theme,
    size,
    brand: p.get("sh_brand") !== "0",
    timestamp: p.get("sh_stamp") !== "0",
  };
}

/** Rasterize an SVG string to a PNG blob at the card's native size. */
export function svgToPngBlob(svg: string, w: number, h: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg rasterization failed"));
    };
    img.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
