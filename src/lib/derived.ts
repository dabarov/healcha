import type { Daily } from "@/lib/queries";

/**
 * Derived, scientifically-grounded metrics computed from the stored Fitbit /
 * Google Health data. Everything here is a pure function over daily rollups or
 * pre-aggregated intraday buckets (the SQL lives in queries.ts). Personal
 * rolling baselines are preferred over population cutoffs; screening-only
 * signals (SpO2 desats, skin-temp flags) are labelled as hints, not diagnoses.
 */

/* ------------------------------------------------------------------ helpers */

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Minutes past midnight for an ISO local timestamp; can exceed 24h for
 * post-midnight bedtimes when `wrap` shifts the clock (see sleepMidpoint). */
function clockMinutes(iso: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Day-of-week (0=Sun) for a YYYY-MM-DD date, tz-free. */
function dow(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/* Structural row shapes so sleep-timing math is reusable from client code
 * (the dashboard passes a slim serialized payload, not full Daily rows). */
export interface SleepTimingRow {
  date: string;
  bedtime: string | null;
  wakeTime: string | null;
}
export interface SleepNightRow extends SleepTimingRow {
  sleepMinutes: number | null;
}

/**
 * Sleep midpoint as minutes on a night-centered clock: bedtime the evening
 * before is negative-ish, small hours are 0–360, so the average is stable
 * across midnight. Returns minutes where 0 = midnight, 180 = 03:00.
 */
export function sleepMidpoint(row: SleepTimingRow): number | null {
  let bed = clockMinutes(row.bedtime);
  const wake = clockMinutes(row.wakeTime);
  if (bed == null || wake == null) return null;
  // Bedtime in the evening (e.g. 23:10 = 1390) → shift to negative side.
  if (bed > 12 * 60) bed -= 24 * 60;
  return (bed + wake) / 2;
}

function fmtClock(minutesFromMidnight: number): string {
  let m = Math.round(minutesFromMidnight);
  while (m < 0) m += 24 * 60;
  m %= 24 * 60;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/* ---------------------------------------------------- 1. recovery quadrant */

export interface QuadrantPoint {
  date: string;
  hrvZ: number;
  rhrZ: number;
  latest: boolean;
}

/**
 * HRV z-score (x) vs resting-HR z-score (y). Upper-left (HRV↑, RHR↓) = well
 * recovered; lower-right (HRV↓, RHR↑) = strain. Parasympathetic-saturation
 * caveat: in very fit users a low-HRV / low-RHR reading can be benign — we
 * surface the quadrant, we don't score it.
 */
export function recoveryQuadrant(rows: Daily[]): QuadrantPoint[] {
  const pts = rows
    .filter((r) => r.hrvZ != null && r.restingHrZ != null)
    .map((r) => ({
      date: r.date,
      hrvZ: r.hrvZ as number,
      rhrZ: r.restingHrZ as number,
      latest: false,
    }));
  if (pts.length) pts[pts.length - 1].latest = true;
  return pts;
}

export function quadrantVerdict(p: QuadrantPoint | undefined): string {
  if (!p) return "not enough baseline yet";
  const hi = p.hrvZ >= 0.3;
  const lo = p.hrvZ <= -0.3;
  const rhrHi = p.rhrZ >= 0.3;
  const rhrLo = p.rhrZ <= -0.3;
  if (hi && rhrLo) return "well recovered";
  if (lo && rhrHi) return "under strain";
  if (lo && rhrLo) return "low HRV, low RHR — ambiguous";
  return "near baseline";
}

/* ------------------------------------------------------- 2. sleep balance */

export interface SleepBalancePoint {
  date: string;
  /** cumulative sleep debt over the trailing 14 nights, in hours */
  debtHours: number;
  /** rolling 14-night SD of sleep midpoint, in minutes (consistency) */
  midpointSd: number | null;
}

const SLEEP_NEED_MIN = 465; // ~7.75h fallback need if we can't estimate

/** Personal sleep need = mean of the top third of nightly sleep over the window. */
function estimateSleepNeed(rows: SleepNightRow[]): number {
  const mins = rows
    .map((r) => r.sleepMinutes)
    .filter((v): v is number => v != null)
    .sort((a, b) => b - a);
  if (mins.length < 5) return SLEEP_NEED_MIN;
  const top = mins.slice(0, Math.max(3, Math.ceil(mins.length / 3)));
  return mean(top);
}

/**
 * Rolling 14-night sleep debt (cumulative deficit vs personal need) and
 * midpoint SD (lower = more regular circadian timing, a stronger mortality
 * predictor than duration).
 */
export function sleepBalance(rows: SleepNightRow[]): {
  need: number;
  series: SleepBalancePoint[];
} {
  const need = estimateSleepNeed(rows);
  const series: SleepBalancePoint[] = rows.map((row, i) => {
    const window = rows.slice(Math.max(0, i - 13), i + 1);
    let debt = 0;
    for (const r of window) {
      if (r.sleepMinutes != null) debt += Math.max(0, need - r.sleepMinutes);
    }
    const mids = window
      .map(sleepMidpoint)
      .filter((v): v is number => v != null);
    return {
      date: row.date,
      debtHours: Math.round((debt / 60) * 10) / 10,
      midpointSd: mids.length >= 4 ? Math.round(sd(mids)) : null,
    };
  });
  return { need, series };
}

/* --------------------------------------------------------- 3. social jetlag */

export interface SocialJetlag {
  hours: number | null;
  weekdayMidpoint: number | null; // minutes from midnight
  weekendMidpoint: number | null;
  weekdayLabel: string;
  weekendLabel: string;
}

/** |weekend sleep midpoint − weekday sleep midpoint|, over the given rows. */
export function socialJetlag(rows: SleepTimingRow[]): SocialJetlag {
  const wk: number[] = [];
  const we: number[] = [];
  for (const r of rows) {
    const mid = sleepMidpoint(r);
    if (mid == null) continue;
    // Attribute the night to its wake-up day; Sat/Sun wake = free day.
    const d = dow(r.date);
    (d === 0 || d === 6 ? we : wk).push(mid);
  }
  const wkM = wk.length ? mean(wk) : null;
  const weM = we.length ? mean(we) : null;
  const hours =
    wkM != null && weM != null ? Math.round((Math.abs(weM - wkM) / 60) * 10) / 10 : null;
  return {
    hours,
    weekdayMidpoint: wkM,
    weekendMidpoint: weM,
    weekdayLabel: wkM != null ? fmtClock(wkM) : "–",
    weekendLabel: weM != null ? fmtClock(weM) : "–",
  };
}

/* ------------------------------------------------- 4. sleep schedule raster */

export interface SleepBar {
  date: string;
  /** minutes from a 18:00 anchor to bed / wake, so evening→morning reads L→R */
  start: number | null;
  end: number | null;
  bedLabel: string;
  wakeLabel: string;
  durationH: number | null;
}

const RASTER_ANCHOR = 18 * 60; // 18:00 previous evening

/** Per-night in-bed span on an 18:00-anchored axis for a raster/Gantt view. */
export function sleepRaster(rows: Daily[]): SleepBar[] {
  return rows.map((r) => {
    let bed = clockMinutes(r.bedtime);
    let wake = clockMinutes(r.wakeTime);
    let start: number | null = null;
    let end: number | null = null;
    if (bed != null) {
      if (bed < RASTER_ANCHOR) bed += 24 * 60; // early-morning bedtime wraps
      start = bed - RASTER_ANCHOR;
    }
    if (wake != null) end = wake + 24 * 60 - RASTER_ANCHOR;
    const durationH =
      start != null && end != null ? Math.round(((end - start) / 60) * 10) / 10 : null;
    return {
      date: r.date,
      start,
      end,
      bedLabel: r.bedtime ? fmtClock(clockMinutes(r.bedtime) as number) : "–",
      wakeLabel: r.wakeTime ? fmtClock(clockMinutes(r.wakeTime) as number) : "–",
      durationH,
    };
  });
}

/* --------------------------------------------------------- 5. HR zones (age) */

export const HR_ZONES = [
  { key: "z1", name: "Z1 · warm-up", lo: 0.5, color: "var(--c-hrv)" },
  { key: "z2", name: "Z2 · fat burn", lo: 0.6, color: "var(--c-readiness)" },
  { key: "z3", name: "Z3 · aerobic", lo: 0.7, color: "var(--c-steps)" },
  { key: "z4", name: "Z4 · threshold", lo: 0.8, color: "var(--c-azm)" },
  { key: "z5", name: "Z5 · max", lo: 0.9, color: "var(--c-rhr)" },
] as const;

export function hrMax(age: number): number {
  return Math.round(208 - 0.7 * age); // Tanaka — more accurate than 220−age
}

/**
 * Karvonen zone for a single bpm sample given personal resting HR and age.
 * Returns 0 (below Z1) … 5.
 */
export function karvonenZone(bpm: number, restingHr: number, age: number): number {
  const reserve = hrMax(age) - restingHr;
  if (reserve <= 0) return 0;
  const pct = (bpm - restingHr) / reserve;
  let zone = 0;
  for (let i = 0; i < HR_ZONES.length; i++) if (pct >= HR_ZONES[i].lo) zone = i + 1;
  return zone;
}

/* ---------------------------------------------------- 6. training load / ACWR */

export interface Workout {
  date: string;
  activityType: string | null;
  durationMinutes: number | null;
  avgHr: number | null;
  calories: number | null;
}

export interface LoadPoint {
  date: string;
  load: number; // daily TRIMP (0 on rest days)
  acute: number | null; // 7-day sum
  chronic: number | null; // 28-day sum ÷ 4
  acwr: number | null;
}

/** Banister TRIMP for one session. HRr clamped to [0,1]. */
export function trimp(
  durationMin: number,
  avgHr: number,
  restingHr: number,
  age: number,
): number {
  const hrr = Math.max(0, Math.min(1, (avgHr - restingHr) / (hrMax(age) - restingHr)));
  return Math.round(durationMin * hrr * 0.64 * Math.exp(1.92 * hrr));
}

/**
 * Daily training load (summed session TRIMP) and the acute:chronic workload
 * ratio (7-day vs 28-day). Sweet spot 0.8–1.3; >1.5 is a spike/danger flag.
 */
export function trainingLoad(
  dates: string[],
  workouts: Workout[],
  restingHrByDate: Map<string, number>,
  fallbackRestingHr: number,
  age: number,
): LoadPoint[] {
  const loadByDate = new Map<string, number>();
  for (const w of workouts) {
    if (w.durationMinutes == null || w.avgHr == null) continue;
    const rhr = restingHrByDate.get(w.date) ?? fallbackRestingHr;
    const t = trimp(w.durationMinutes, w.avgHr, rhr, age);
    loadByDate.set(w.date, (loadByDate.get(w.date) ?? 0) + t);
  }
  const loads = dates.map((d) => loadByDate.get(d) ?? 0);
  return dates.map((date, i) => {
    const acuteArr = loads.slice(Math.max(0, i - 6), i + 1);
    const chronicArr = loads.slice(Math.max(0, i - 27), i + 1);
    const acute = acuteArr.reduce((a, b) => a + b, 0);
    const chronic = (chronicArr.reduce((a, b) => a + b, 0) / chronicArr.length) * 7;
    const acwr = chronic > 0 && i >= 13 ? Math.round((acute / chronic) * 100) / 100 : null;
    return { date, load: loads[i], acute, chronic: Math.round(chronic), acwr };
  });
}

export function acwrVerdict(acwr: number | null): {
  label: string;
  tone: "good" | "bad" | "muted";
} {
  if (acwr == null) return { label: "building baseline", tone: "muted" };
  if (acwr > 1.5) return { label: "spike — ease off", tone: "bad" };
  if (acwr >= 0.8 && acwr <= 1.3) return { label: "in the sweet spot", tone: "good" };
  if (acwr < 0.8) return { label: "detraining", tone: "muted" };
  return { label: "elevated", tone: "bad" };
}

/* ---------------------------------------------------- 7. skin-temp / illness */

export interface StrainPoint {
  date: string;
  skinTempDelta: number | null;
  respRateZ: number | null;
  restingHrZ: number | null;
  /** true when several strain signals fire together (screening hint only) */
  flag: boolean;
}

/**
 * Multi-signal strain/illness early-warning ribbon: skin-temp deviation with
 * respiratory-rate and resting-HR z-scores. Flags when temp is >+0.5°C AND at
 * least one of resp/RHR is elevated — a hint to rest, not a diagnosis.
 */
export function strainSignals(rows: Daily[]): StrainPoint[] {
  return rows.map((r) => {
    const temp = r.skinTempDelta;
    const respHi = (r.respRateZ ?? 0) >= 1;
    const rhrHi = (r.restingHrZ ?? 0) >= 1;
    const flag = temp != null && temp > 0.5 && (respHi || rhrHi);
    return {
      date: r.date,
      skinTempDelta: temp ?? null,
      respRateZ: r.respRateZ ?? null,
      restingHrZ: r.restingHrZ ?? null,
      flag,
    };
  });
}

/* ------------------------------------------------------------- misc format */

export { fmtClock };
