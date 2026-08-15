import type { Translation } from "./i18n";
import type { Deal } from "./types";

export function dealLabel(d: Deal | null, t: Translation): string {
  if (!d) return t.dealNone;
  if (d.free) return t.dealFree;
  return t.dealBadge.replace("{pct}", String(d.discountPercent));
}

export function dealNote(d: Deal | null, t: Translation): string {
  if (!d || d.free) return "";
  if (d.expires) return t.dealUntil.replace("{date}", d.expires);
  if (d.endsWhen) return t.dealEndsWhen.replace("{when}", d.endsWhen);
  return t.dealPermanent;
}

export function dealText(d: Deal | null, t: Translation): string {
  if (!d) return t.dealNone;
  const note = dealNote(d, t);
  return note ? `${dealLabel(d, t)} (${note})` : dealLabel(d, t);
}
