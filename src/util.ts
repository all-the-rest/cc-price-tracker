export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  if (n >= 1) return "$" + n.toFixed(2);
  const s = n.toFixed(6);
  return "$" + s.replace(/0+$/, "").replace(/\.$/, "");
}

export function fmtDate(iso: string, lang: "de" | "en"): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(d);
}

export function fmtDateOnly(iso: string, lang: "de" | "en"): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(lang === "de" ? "de-DE" : "en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(d);
}

export function formatModelName(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function modelOnPlan(m: { availability: { go: boolean; goat: boolean; pro: boolean; provider: boolean; max: boolean; team: boolean } }, planId: string): boolean {
  if (planId === "max10" || planId === "max20") return m.availability.max;
  return m.availability[planId as keyof typeof m.availability];
}

export function fmtContextWindow(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}M`;
  }
  if (n >= 1000) {
    const v = n / 1000;
    return `${v >= 10 ? Math.round(v) : Math.round(v * 10) / 10}K`;
  }
  return String(n);
}
