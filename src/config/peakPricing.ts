/**
 * Peak-/Off-Peak-Auswertung — **eine** Quelle der Wahrheit für die UI.
 *
 * Die Regeln kommen ausschließlich aus den Daten (`data/latest.json`:
 * `peakRules` + `holidayCalendars`), nie aus hartkodierten Annahmen. Früher lagen
 * UTC-Fenster + `weekendOffPeakDaysBeijing` + `effectiveFromMs` hier als
 * Konstanten; jetzt werden sie aus der Quelle gescrapt.
 *
 * Semantik (identisch zu den Schwester-Repos, Spezifikation §2):
 *  1. Feiertag (in `rule.timezone`) mit `holidays.policy === "off-peak"` → Off-Peak.
 *  2. Wochentag (in `rule.timezone`) ∈ `peak.days` UND UTC-Stunde in `windowsUtc` → Peak.
 *  3. sonst Off-Peak.
 * Vor `effectiveFrom` gilt kein Peak (Vorlaufzeit) — als eigener Zustand markiert.
 *
 * **Inert:** Die Command-Code-Quelle nennt **keine** Feiertage (nur das
 * Wochenende), daher trägt keine Regel ein `holidays`-Objekt und Zweig 1 greift
 * nie. Er bleibt als optionale Verzweigung erhalten, damit die Auswertung
 * mehrquellig bleibt, falls die Quelle Feiertage künftig nennt.
 */

import type { HolidayCalendar, HolidayCalendars, PeakRule, PeakRules } from "../types";

/** Dokumentierter Peak-Faktor (Peak = 2× Off-Peak) für die Anzeige-Prosa. */
export const PEAK_FACTOR = 2;

/**
 * Normalisiert einen Modellnamen auf den `peakRules`-Schlüssel: Kleinschreibung,
 * **alle** Nicht-Alphanumerika entfernt. Muss im Scraper identisch verwendet
 * werden, damit `DeepSeek V4.1 Flash` → `deepseekv41flash` beidseitig matcht
 * (frühere Divergenz: der Punkt blieb stehen).
 */
export function peakKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function peakRuleFor(peakRules: PeakRules | undefined, name: string): PeakRule | undefined {
  if (!peakRules) return undefined;
  return peakRules[peakKey(name)];
}

export function holidayCalendarFor(
  calendars: HolidayCalendars | undefined,
  rule: PeakRule | undefined
): HolidayCalendar | undefined {
  if (!calendars || !rule?.holidays) return undefined;
  return calendars[rule.holidays.calendar];
}

/** "YYYY-MM-DD" des Zeitpunkts in der übergebenen IANA-Zone (SSR-sicher). */
export function localDateKey(now: number, timezone: string): string {
  // en-CA liefert kanonisch YYYY-MM-DD; timeZone macht die Zone explizit.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
}

/** ISO-Wochentag (1=Mo … 7=So) eines `YYYY-MM-DD`-Kalendertags. */
export function isoWeekday(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=So … 6=Sa
  return jsDay === 0 ? 7 : jsDay;
}

export interface PeakEvaluation {
  /** true = Peak, false = Off-Peak. */
  active: boolean;
  /** true = `now` liegt vor `effectiveFrom` (kein Peak, Vorlaufzeit). */
  beforeEffective: boolean;
  /** Lokaler Kalendertag in `rule.timezone` (für Debug/Tooltip). */
  localDate: string | null;
}

/** Wertet eine Regel zu einem Zeitpunkt aus. Ohne Regel immer Off-Peak. */
export function evaluatePeak(
  rule: PeakRule | undefined,
  calendars: HolidayCalendars | undefined,
  now: number
): PeakEvaluation {
  if (!rule) return { active: false, beforeEffective: false, localDate: null };

  if (rule.effectiveFrom) {
    const from = Date.parse(rule.effectiveFrom);
    if (Number.isFinite(from) && now < from) {
      return { active: false, beforeEffective: true, localDate: null };
    }
  }

  const localDate = localDateKey(now, rule.timezone);
  const weekday = isoWeekday(localDate);

  // Inerte Verzweigung (Quelle nennt keine Feiertage): greift nur, wenn eine
  // Regel tatsächlich `holidays` trägt und der Kalender vorliegt.
  const holiday = holidayCalendarFor(calendars, rule);
  if (rule.holidays?.policy === "off-peak" && holiday?.dates.includes(localDate)) {
    return { active: false, beforeEffective: false, localDate };
  }

  if (rule.peak.days.includes(weekday)) {
    const date = new Date(now);
    const hour = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
    const inWindow = rule.peak.windowsUtc.some(([start, end]) => hour >= start && hour < end);
    if (inWindow) return { active: true, beforeEffective: false, localDate };
  }

  return { active: false, beforeEffective: false, localDate };
}

/** true, wenn die Regel zu `now` im Peak liegt. */
export function isPeakActive(
  rule: PeakRule | undefined,
  calendars: HolidayCalendars | undefined,
  now: number
): boolean {
  return evaluatePeak(rule, calendars, now).active;
}

/** Phase-Text (Peak/Off-Peak) für den Tooltip. */
export function peakPhaseLabel(
  rule: PeakRule | undefined,
  calendars: HolidayCalendars | undefined,
  now: number,
  lang: "de" | "en"
): string {
  const evalResult = evaluatePeak(rule, calendars, now);
  if (evalResult.active) return lang === "de" ? "Peak" : "Peak";
  return lang === "de" ? "Off-Peak" : "Off-peak";
}

/* ------------------------------------------------------------------ */
/* Label-Erzeugung (Wochentags-Scope aus `days` generiert, keine Prosa) */
/* ------------------------------------------------------------------ */

const DAY_ABBR: Record<number, { de: string; en: string }> = {
  1: { de: "Mo", en: "Mon" },
  2: { de: "Di", en: "Tue" },
  3: { de: "Mi", en: "Wed" },
  4: { de: "Do", en: "Thu" },
  5: { de: "Fr", en: "Fri" },
  6: { de: "Sa", en: "Sat" },
  7: { de: "So", en: "Sun" },
};

const WEEK_PREFIX: Record<string, { de: string; en: string }> = {
  monday: { de: "Mo", en: "Mon" },
  mon: { de: "Mo", en: "Mon" },
  tuesday: { de: "Di", en: "Tue" },
  tue: { de: "Di", en: "Tue" },
  wednesday: { de: "Mi", en: "Wed" },
  wed: { de: "Mi", en: "Wed" },
  thursday: { de: "Do", en: "Thu" },
  thu: { de: "Do", en: "Thu" },
  friday: { de: "Fr", en: "Fri" },
  fri: { de: "Fr", en: "Fri" },
  saturday: { de: "Sa", en: "Sat" },
  sat: { de: "Sa", en: "Sat" },
  sunday: { de: "So", en: "Sun" },
  sun: { de: "So", en: "Sun" },
};

function dayEquivalents(day: number, lang: "de" | "en"): string[] {
  const abbr = DAY_ABBR[day][lang];
  const names = Object.entries(WEEK_PREFIX)
    .filter(([, v]) => v[lang] === abbr)
    .map(([k]) => k.slice(0, 3));
  return [abbr, ...names];
}

/**
 * Kompakter Wochentags-Scope aus ISO-Tagen: `[1..5]` → „Mo–Fr" / „Mon–Fri",
 * `[6,7]` → „Sa/So" / „Sat/Sun", beliebige Teilmengen als Komma-Liste.
 */
export function weekdayScopeLabel(days: number[], lang: "de" | "en"): string {
  const sorted = [...days].sort((a, b) => a - b);
  const sep = lang === "de" ? "/" : "/";
  const range = lang === "de" ? "–" : "–";
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 1) {
      const joiner = j - i === 1 ? sep : range;
      parts.push(`${DAY_ABBR[sorted[i]][lang]}${joiner}${DAY_ABBR[sorted[j]][lang]}`);
      i = j + 1;
    } else if (j - i === 0) {
      // Einzelner Tag, aber als „Sa/So"-Paar bündeln, wenn der nächste direkt folgt.
      if (sorted[j] === 6 && sorted[j + 1] === 7) {
        parts.push(`${DAY_ABBR[6][lang]}${sep}${DAY_ABBR[7][lang]}`);
        i = j + 2;
      } else {
        parts.push(DAY_ABBR[sorted[j]][lang]);
        i = j + 1;
      }
    } else {
      parts.push(DAY_ABBR[sorted[j]][lang]);
      i = j + 1;
    }
  }
  return parts.join(", ");
}

/**
 * Vollständige Coverage-Angabe aus der Regel: Peak-Tage + ganztägig Off-Peak-Tage.
 * Ersetzt die frühere hartkodierte „Mo–Fr · Sa/So Off-Peak"-Prosa.
 */
export function peakCoverageLabel(rule: PeakRule | undefined, lang: "de" | "en"): string {
  if (!rule) return lang === "de" ? "Zeiten laut Quelle" : "times per source";
  const peak = weekdayScopeLabel(rule.peak.days, lang);
  const off = rule.offPeak.days.length > 0 ? weekdayScopeLabel(rule.offPeak.days, lang) : "";
  if (!off) return lang === "de" ? `${peak} Peak` : `${peak} peak`;
  return lang === "de" ? `${peak} Peak · ${off} Off-Peak` : `${peak} peak · ${off} off-peak`;
}

/**
 * true, wenn der Namensteil der Abkürzungen erkannt wird (für Tests/Guards):
 * stellt sicher, dass generierte Coverage-Labels den Wochentag nennen.
 */
export function coverageMentionsDays(label: string, days: number[], lang: "de" | "en"): boolean {
  return days.every((d) => dayEquivalents(d, lang).some((eq) => label.includes(eq)));
}
