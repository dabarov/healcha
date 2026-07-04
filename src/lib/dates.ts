import { APP_TIMEZONE } from "./env";

/**
 * All "day" logic runs in APP_TIMEZONE. The Google Health API accepts civil
 * (device-local) time filters, so we work with civil strings throughout and
 * never need offset math.
 */

/** YYYY-MM-DD for an instant, in the app timezone. */
export function localDateStr(d: Date = new Date(), timeZone = APP_TIMEZONE()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** YYYY-MM-DDTHH:mm:ss for an instant, in the app timezone. */
export function localDateTimeStr(d: Date = new Date(), timeZone = APP_TIMEZONE()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // Intl can emit hour "24" at midnight; normalise.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}:${get("second")}`;
}

/** Date-string arithmetic on YYYY-MM-DD (UTC-safe: no tz involved). */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayLocal(): string {
  return localDateStr(new Date());
}

/**
 * The local calendar date a data point belongs to. Accepts either a civil
 * timestamp (no offset — trusted as already-local) or an RFC-3339 instant.
 */
export function dateOf(ts: string): string {
  // Civil timestamps look like 2026-07-04T07:12:00 (no Z / offset).
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/.test(ts) && !/[zZ]|[+-]\d{2}:\d{2}$/.test(ts)) {
    return ts.slice(0, 10);
  }
  return localDateStr(new Date(ts));
}

/** List of YYYY-MM-DD dates in [from, to] inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function nowIso(): string {
  return new Date().toISOString();
}
