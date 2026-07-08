/**
 * Client-safe view models + formatting for the dashboard. The server page
 * maps DB rows to the slim `DayData` payload; every card derives what it
 * shows from that plus the selected date.
 */

export interface DayData {
  date: string; // YYYY-MM-DD
  readiness: number | null;
  readinessBase: number | null;
  sleepScore: number | null;
  sleepScoreBase: number | null;
  sleepMinutes: number | null;
  sleepEfficiency: number | null;
  deepMinutes: number | null;
  remMinutes: number | null;
  lightMinutes: number | null;
  awakeMinutes: number | null;
  bedtime: string | null;
  wakeTime: string | null;
  restingHr: number | null;
  restingHrBase: number | null;
  hrv: number | null;
  hrvBase: number | null;
  steps: number | null;
  azm: number | null;
}

/* ---- status scales -------------------------------------------------------- */

/** Readiness bands → CSS color tokens (mockup: 70+ good, 50+ fair, else low). */
export function readinessColor(v: number | null): string {
  if (v == null) return "var(--faint)";
  if (v >= 70) return "var(--accent)";
  if (v >= 50) return "var(--warn)";
  return "var(--bad)";
}

export function readinessWord(v: number | null): string {
  if (v == null) return "No data";
  if (v >= 85) return "Prime";
  if (v >= 70) return "Good";
  if (v >= 50) return "Fair";
  return "Take it easy";
}

/** Signed % deviation from a rolling baseline, null-safe. */
export function pctVsBase(value: number | null, base: number | null): number | null {
  if (value == null || base == null || base === 0) return null;
  return ((value - base) / base) * 100;
}

/* ---- formatting ----------------------------------------------------------- */

export function fmtHM(minutes: number | null): string {
  if (minutes == null) return "–";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** "Tuesday, July 7" — tz-free on YYYY-MM-DD. */
export function fmtDayLong(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** "Jun 8" for chart axes. */
export function fmtDayShort(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
}

/** "08:41 AM" from an ISO instant, viewer-local. */
export function fmtSyncTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* ---- derived, over the slim payload --------------------------------------- */

const MOVE_STREAK_MIN_STEPS = 1000;

/** Consecutive days with meaningful movement, ending at `endDate`. */
export function moveStreak(days: DayData[], endDate: string): number {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let streak = 0;
  let date = endDate;
  while (true) {
    const day = byDate.get(date);
    if (!day || day.steps == null || day.steps < MOVE_STREAK_MIN_STEPS) break;
    streak += 1;
    const prev = new Date(`${date}T12:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    date = prev.toISOString().slice(0, 10);
  }
  return streak;
}

/** Trailing window of the series ending at (and including) `endDate`. */
export function trailing(days: DayData[], endDate: string, n: number): DayData[] {
  const upTo = days.filter((d) => d.date <= endDate);
  return upTo.slice(-n);
}
