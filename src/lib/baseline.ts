import { and, gte, lt, asc, inArray } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { addDays, nowIso } from "@/lib/dates";

/**
 * Baseline-relative analytics. Everything user-facing is expressed as
 * deviation from a rolling 30-day baseline (mean + std, excluding the day
 * itself), not as absolute numbers.
 */

const WINDOW_DAYS = 30;
const MIN_SAMPLES = 5; // need at least this many days before baselines mean anything

type DailyRow = typeof schema.metricsDaily.$inferSelect;

const BASELINE_METRICS = [
  { col: "restingHr", base: "restingHrBase", z: "restingHrZ" },
  { col: "hrv", base: "hrvBase", z: "hrvZ" },
  { col: "sleepScore", base: "sleepScoreBase", z: "sleepScoreZ" },
  { col: "sleepMinutes", base: "sleepMinutesBase", z: "sleepMinutesZ" },
  { col: "steps", base: "stepsBase", z: "stepsZ" },
  { col: "respRate", base: "respRateBase", z: "respRateZ" },
  { col: "readiness", base: "readinessBase", z: "readinessZ" },
] as const;

function meanSd(values: number[]): { mean: number; sd: number } | null {
  if (values.length < MIN_SAMPLES) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(values.length - 1, 1);
  return { mean, sd: Math.sqrt(variance) };
}

function zScore(value: number, mean: number, sd: number): number {
  if (sd < 1e-6) return 0;
  return (value - mean) / sd;
}

/**
 * Composite readiness score (0-100). The Google Health API does not expose
 * Fitbit's readiness/cardio-load, so we compute our own from deviations vs
 * the 30-day baseline: HRV up = good, resting HR up = bad, sleep quantity
 * and deep sleep up = good, elevated respiratory rate = bad.
 * 50 is "exactly your baseline".
 */
export function computeReadiness(row: {
  hrvZ?: number | null;
  restingHrZ?: number | null;
  sleepMinutesZ?: number | null;
  sleepScoreZ?: number | null;
  respRateZ?: number | null;
}): number | null {
  const parts: Array<[number | null | undefined, number]> = [
    [row.hrvZ, 15],
    [row.restingHrZ, -12],
    [row.sleepMinutesZ, 8],
    [row.sleepScoreZ, 6],
    [row.respRateZ != null ? Math.max(0, row.respRateZ) : null, -6],
  ];
  let score = 50;
  let used = 0;
  for (const [z, weight] of parts) {
    if (z == null) continue;
    score += Math.max(-2.5, Math.min(2.5, z)) * weight;
    used++;
  }
  if (used === 0) return null;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function readinessVerdict(readiness: number | null): string {
  if (readiness == null) return "unknown";
  if (readiness >= 60) return "recovered";
  if (readiness >= 40) return "neutral";
  return "under-recovered";
}

/**
 * Sleep score proxy (0-100), used because the Health API does not expose
 * Fitbit's sleep score: 50 pts duration (8h target), 25 pts restorative
 * share (deep+REM, 40% target), 25 pts efficiency.
 */
export function computeSleepScore(s: {
  minutesAsleep?: number | null;
  deepMinutes?: number | null;
  remMinutes?: number | null;
  efficiency?: number | null;
}): number | null {
  if (!s.minutesAsleep) return null;
  const duration = Math.min(1, s.minutesAsleep / 480) * 50;
  const restorativeShare =
    ((s.deepMinutes ?? 0) + (s.remMinutes ?? 0)) / Math.max(s.minutesAsleep, 1);
  const restorative = Math.min(1, restorativeShare / 0.4) * 25;
  const efficiency = Math.min(1, (s.efficiency ?? 90) / 95) * 25;
  return Math.round(duration + restorative + efficiency);
}

/**
 * Recomputes 30-day baselines, z-scores and readiness for the given dates
 * (ascending, so earlier days feed later readiness baselines).
 */
export async function recomputeBaselines(dates: string[]): Promise<void> {
  const sorted = [...new Set(dates)].sort();
  if (sorted.length === 0) return;

  for (const date of sorted) {
    const from = addDays(date, -WINDOW_DAYS);
    const window = await db()
      .select()
      .from(schema.metricsDaily)
      .where(and(gte(schema.metricsDaily.date, from), lt(schema.metricsDaily.date, date)))
      .orderBy(asc(schema.metricsDaily.date));
    const todayRows = await db()
      .select()
      .from(schema.metricsDaily)
      .where(inArray(schema.metricsDaily.date, [date]));
    const today = todayRows[0];
    if (!today) continue;

    const update: Record<string, number | string | null> = { updatedAt: nowIso() };
    const zs: Record<string, number | null> = {};

    for (const m of BASELINE_METRICS) {
      if (m.col === "readiness") continue; // handled after readiness is known
      const history = window
        .map((r) => r[m.col as keyof DailyRow] as number | null)
        .filter((v): v is number => v != null);
      const stats = meanSd(history);
      const value = today[m.col as keyof DailyRow] as number | null;
      if (stats && value != null) {
        update[m.base] = Math.round(stats.mean * 100) / 100;
        update[m.z] = Math.round(zScore(value, stats.mean, stats.sd) * 100) / 100;
        zs[m.z] = update[m.z] as number;
      } else {
        update[m.base] = stats ? Math.round(stats.mean * 100) / 100 : null;
        update[m.z] = null;
        zs[m.z] = null;
      }
    }

    const readiness = computeReadiness({
      hrvZ: zs.hrvZ,
      restingHrZ: zs.restingHrZ,
      sleepMinutesZ: zs.sleepMinutesZ,
      sleepScoreZ: zs.sleepScoreZ,
      respRateZ: zs.respRateZ,
    });
    update.readiness = readiness;

    const readinessHistory = window
      .map((r) => r.readiness)
      .filter((v): v is number => v != null);
    const rStats = meanSd(readinessHistory);
    if (rStats && readiness != null) {
      update.readinessBase = Math.round(rStats.mean * 100) / 100;
      update.readinessZ = Math.round(zScore(readiness, rStats.mean, rStats.sd) * 100) / 100;
    }

    await db()
      .update(schema.metricsDaily)
      .set(update)
      .where(inArray(schema.metricsDaily.date, [date]));
  }
}
