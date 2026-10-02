// Auswertungslogik der datengetriebenen Peak-Regeln (Spezifikation §2/§7).
// Importiert das TS-Modul direkt (Node ≥22 strippt Typen); keine Logik wird
// dupliziert — der Test prüft die **eine** Quelle der Wahrheit.
//
// Wichtig: Die Command-Code-Quelle nennt **keine** Feiertage (nur das Wochenende),
// daher liefert der Scraper keine Feiertagsdaten. Die Tests prüfen dieses Fehlen;
// die (inerte) optionale Feiertags-Verzweigung der Auswertung wird separat belegt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHolidays } from "../scripts/scrape.mjs";
import {
  evaluatePeak,
  isPeakActive,
  localDateKey,
  isoWeekday,
  peakKey,
  peakCoverageLabel,
  weekdayScopeLabel,
} from "../src/config/peakPricing.ts";

const RULE = {
  timezone: "Asia/Shanghai",
  peak: { days: [1, 2, 3, 4, 5], windowsUtc: [[1, 4], [6, 10]] },
  offPeak: { days: [6, 7], allDay: true },
};

// Referenzdaten: 2026-09-07 ist ein Montag, 2026-09-05 ein Samstag,
// 2026-10-01 (Nationalfeiertag) ein Donnerstag.
test("Kalenderbasis: 2026-09-07 = Montag, 2026-09-05 = Samstag, 2026-10-01 = Donnerstag", () => {
  assert.equal(isoWeekday("2026-09-07"), 1);
  assert.equal(isoWeekday("2026-09-05"), 6);
  assert.equal(isoWeekday("2026-09-06"), 7);
  assert.equal(isoWeekday("2026-10-01"), 4);
});

test("evaluatePeak: Werktag im Fenster → Peak", () => {
  const now = Date.parse("2026-09-07T02:00:00Z"); // Mo 10:00 Shanghai, UTC-Stunde 2
  assert.equal(isPeakActive(RULE, undefined, now), true);
});

test("evaluatePeak: Werktag außerhalb der Fenster → Off-Peak", () => {
  const now = Date.parse("2026-09-07T05:00:00Z"); // UTC-Stunde 5
  assert.equal(isPeakActive(RULE, undefined, now), false);
});

test("evaluatePeak: Wochenende → durchgehend Off-Peak (auch im Fenster)", () => {
  const sat = Date.parse("2026-09-05T02:00:00Z"); // Sa 10:00 Shanghai, UTC-Stunde 2
  const sun = Date.parse("2026-09-06T07:00:00Z"); // So 15:00 Shanghai, UTC-Stunde 7
  assert.equal(isPeakActive(RULE, undefined, sat), false);
  assert.equal(isPeakActive(RULE, undefined, sun), false);
});

test("keine Feiertagsdaten: 01.10.2026 (chinesischer Feiertag, Donnerstag) ist ein normaler Wochentag", () => {
  // `holidayCalendars` ist leer/absent — die Quelle nennt keine Feiertage.
  const now = Date.parse("2026-10-01T02:00:00Z"); // Do, UTC-Stunde 2 ∈ Fenster
  assert.equal(isPeakActive(RULE, undefined, now), true);
  assert.equal(isPeakActive(RULE, {}, now), true);
  assert.notEqual(peakCoverageLabel(RULE, "en"), ""); // Scope weiterhin generiert
});

test("evaluatePeak (inert): eine Regel MIT holidays + Kalender → Off-Peak am Feiertag", () => {
  // Belegt die optionale Verzweigung für den Fall, dass die Quelle Feiertage
  // künftig nennt — ohne dass heute solche Daten existieren.
  const rule = { ...RULE, holidays: { policy: "off-peak", calendar: "china" } };
  const cal = { china: { dates: ["2026-10-01"], coveredThrough: "2026-12-31" } };
  const now = Date.parse("2026-10-01T02:00:00Z"); // Do, im Fenster
  assert.equal(isPeakActive(RULE, undefined, now), true);
  assert.equal(isPeakActive(rule, cal, now), false);
});

test("parseHolidays: liefert holidays, wenn eine Notiz Feiertage MIT Land nennt", () => {
  assert.deepEqual(parseHolidays("excluding Chinese public holidays"), {
    policy: "off-peak",
    calendar: "china",
  });
  assert.equal(parseHolidays("Weekends - off-peak all day"), undefined);
  assert.throws(() => parseHolidays("excluding public holidays"), /Land/);
});

test("evaluatePeak: vor effectiveFrom → kein Peak, als Vorlaufzeit markiert", () => {
  const rule = { ...RULE, effectiveFrom: "2026-09-07T00:00:00Z" };
  const before = Date.parse("2026-09-06T02:00:00Z"); // Sa, wäre eh off-peak
  const res = evaluatePeak(rule, undefined, before);
  assert.equal(res.active, false);
  assert.equal(res.beforeEffective, true);
  const after = Date.parse("2026-09-07T02:00:00Z");
  assert.equal(evaluatePeak(rule, undefined, after).beforeEffective, false);
});

test("Zonenrand: 00:00 UTC = 08:00 Shanghai (gleicher lokaler Tag)", () => {
  const now = Date.parse("2026-09-07T00:00:00Z");
  assert.equal(localDateKey(now, "Asia/Shanghai"), "2026-09-07");
  assert.equal(isoWeekday(localDateKey(now, "Asia/Shanghai")), 1);
});

test("peakKey: Klein-/Alphanumerik-Normalisierung (Punkt-Bug behoben)", () => {
  assert.equal(peakKey("DeepSeek V4.1 Flash"), "deepseekv41flash");
  assert.equal(peakKey("deepseekv4.1flash"), "deepseekv41flash");
  assert.equal(peakKey("DeepSeek V4 Pro (latest)"), "deepseekv4prolatest");
});

test("Wochentags-Label wird aus days generiert", () => {
  assert.equal(weekdayScopeLabel([1, 2, 3, 4, 5], "de"), "Mo–Fr");
  assert.equal(weekdayScopeLabel([1, 2, 3, 4, 5], "en"), "Mon–Fri");
  assert.equal(weekdayScopeLabel([6, 7], "de"), "Sa/So");
  assert.equal(weekdayScopeLabel([6, 7], "en"), "Sat/Sun");
  assert.equal(peakCoverageLabel(RULE, "en"), "Mon–Fri peak · Sat/Sun off-peak");
});
