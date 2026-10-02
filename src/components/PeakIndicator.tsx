import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Translation } from "../i18n";
import type { HolidayCalendars, PeakRule } from "../types";
import { evaluatePeak, holidayCalendarFor, peakCoverageLabel } from "../config/peakPricing";
import Tooltip from "./Tooltip";

export { peakKey, peakRuleFor } from "../config/peakPricing";

export const normalizePeakModel = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

export const isPeakTier = (tier: string | null): boolean => /^(?:off[- ]?peak|peak)$/i.test(tier ?? "");

export const isPeakNamedTier = (tier: string | null): boolean => /^peak$/i.test(tier ?? "");

export function isPeakActive(
  rule: PeakRule | undefined,
  calendars: HolidayCalendars | undefined,
  now: number
): boolean {
  return evaluatePeak(rule, calendars, now).active;
}

export function isTierActive(
  tier: string | null,
  rule: PeakRule | undefined,
  calendars: HolidayCalendars | undefined,
  now: number
): boolean {
  if (!isPeakTier(tier)) return true;
  const inPeak = isPeakActive(rule, calendars, now);
  return isPeakNamedTier(tier) ? inPeak : !inPeak;
}

/** UTC-Offset (ms) der Zone zum Zeitpunkt `utcMs`. */
function tzOffsetMs(timezone: string, utcMs: number): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const { type, value } of dtf.formatToParts(new Date(utcMs))) parts[type] = value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - utcMs;
}

/** UTC-Zeitstempel der lokalen Mitternacht eines `YYYY-MM-DD` in der Zone. */
function zonedMidnightUtc(dateKey: string, timezone: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  let guess = target;
  for (let i = 0; i < 2; i++) guess = target - tzOffsetMs(timezone, guess);
  return guess;
}

function addDaysKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function nextTransition(
  rule: PeakRule | undefined,
  calendars: HolidayCalendars | undefined,
  now: number
): number | null {
  if (!rule) return null;
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const candidates = new Set<number>();
  if (rule.effectiveFrom) {
    const from = Date.parse(rule.effectiveFrom);
    if (Number.isFinite(from)) candidates.add(from);
  }
  const date = new Date(now);
  const localToday = addDaysKey(new Date(now).toISOString().slice(0, 10), 0);
  // UTC-Tagesbasis für die Fenstergrenzen + lokale Mitternachten in der Regel-Zone.
  for (let offset = -1; offset <= 11; offset++) {
    const base = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset);
    for (const [start, end] of rule.peak.windowsUtc) {
      candidates.add(base + start * hourMs);
      candidates.add(base + end * hourMs);
    }
    candidates.add(base + dayMs);
  }
  // Lokale Mitternachten in der Regel-Zone (Wochentags-/Feiertagswechsel).
  const cal = holidayCalendarFor(calendars, rule);
  for (let offset = -1; offset <= 12; offset++) {
    candidates.add(zonedMidnightUtc(addDaysKey(localToday, offset), rule.timezone));
  }
  if (cal) {
    for (const hd of cal.dates) candidates.add(zonedMidnightUtc(hd, rule.timezone));
  }
  const current = evaluatePeak(rule, calendars, now);
  const sorted = [...candidates].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  for (const timestamp of sorted) {
    if (timestamp <= now) continue;
    const next = evaluatePeak(rule, calendars, timestamp);
    if (next.active !== current.active || next.beforeEffective !== current.beforeEffective) {
      return timestamp;
    }
  }
  return null;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatUtcRange(ranges: [number, number][]): string {
  return ranges.map(([start, end]) => `${String(start).padStart(2, "0")}:00–${String(end).padStart(2, "0")}:00`).join(", ");
}

function formatLocalRange(ranges: [number, number][], now: number): string {
  const current = new Date(now);
  const formatter = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return ranges
    .map(([start, end]) => {
      const startDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), start));
      const endDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), end));
      return `${formatter.format(startDate)}–${formatter.format(endDate)}`;
    })
    .join(", ");
}

interface PeakIndicatorProps {
  tier: string;
  rule?: PeakRule;
  calendars?: HolidayCalendars;
  now: number;
  t: Translation;
  lang: "de" | "en";
}

export default function PeakIndicator(props: PeakIndicatorProps) {
  const evaluation = () => evaluatePeak(props.rule, props.calendars, props.now);
  const active = () => evaluation().active;
  const transition = () => nextTransition(props.rule, props.calendars, props.now);
  const countdown = () => {
    const timestamp = transition();
    return timestamp === null ? "–" : formatDuration(timestamp - props.now);
  };
  const phase = () => {
    if (evaluation().beforeEffective) return props.t.peakPreEffective;
    return active() ? props.t.peak : props.t.offPeak;
  };
  const tooltip = () =>
    props.t.peakTooltip
      .replace("{phase}", phase())
      .replace("{utc}", formatUtcRange(props.rule?.peak.windowsUtc ?? []))
      .replace("{local}", formatLocalRange(props.rule?.peak.windowsUtc ?? [], props.now))
      .replace("{countdown}", countdown())
      .replace("{coverage}", peakCoverageLabel(props.rule, props.lang));

  return (
    <Tooltip tip={tooltip()} class="inline-flex items-center gap-1 leading-none">
      <span class="icon-[material-symbols--schedule] h-4 w-4 shrink-0 self-center" aria-hidden="true" />
      <span class="leading-none">{props.tier}</span>
      <Show when={props.now > 0}>
        <span class="leading-none tabular-nums text-base-content/60">· {countdown()}</span>
      </Show>
    </Tooltip>
  );
}

/**
 * Live-Uhr für Peak/Off-Peak. Startet mit 0 (Server-Render + erster
 * Client-Render stimmen dadurch überein) und liefert die echte Zeit erst nach
 * dem Mount — so gibt es keinen Hydration-Mismatch durch die Uhrzeit.
 */
export function usePeakClock() {
  const [now, setNow] = createSignal(0);
  onMount(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  return now;
}
