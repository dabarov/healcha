import { desc, gte } from "drizzle-orm";
import { db, libsql, schema } from "@/db/client";
import { addDays, todayLocal } from "@/lib/dates";
import { DATA_START_DATE } from "@/lib/env";
import { HR_ZONES, karvonenZone, type Workout } from "@/lib/derived";

/** Server-side data access for the dashboard. */

export type Daily = typeof schema.metricsDaily.$inferSelect;

/**
 * Start of a `days`-long lookback window, clamped to DATA_START_DATE so older,
 * irrelevant history (e.g. before a device switch) never enters the dashboard.
 */
function windowStart(days: number): string {
  const from = addDays(todayLocal(), -(days - 1));
  const cutoff = DATA_START_DATE();
  return cutoff && cutoff > from ? cutoff : from;
}

export async function getDailySeries(days: number): Promise<Daily[]> {
  const from = windowStart(days);
  const rows = await db()
    .select()
    .from(schema.metricsDaily)
    .where(gte(schema.metricsDaily.date, from));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getLatestDaily(): Promise<Daily | null> {
  const rows = await db()
    .select()
    .from(schema.metricsDaily)
    .orderBy(desc(schema.metricsDaily.date))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLastSync(): Promise<{ at: string | null; errors: number }> {
  const rows = await db().select().from(schema.syncState);
  const at = rows
    .map((r) => r.lastRunAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1) ?? null;
  const errors = rows.filter((r) => r.lastStatus === "error").length;
  return { at, errors };
}

export async function getWorkouts(days: number): Promise<Workout[]> {
  const from = windowStart(days);
  const rows = await db()
    .select()
    .from(schema.activities)
    .where(gte(schema.activities.date, from))
    .orderBy(schema.activities.date);
  return rows.map((r) => ({
    date: r.date,
    activityType: r.activityType,
    durationMinutes: r.durationMinutes,
    avgHr: r.avgHr,
    calories: r.calories,
  }));
}

/* ----------------------------------------------- intraday-derived analytics */

export interface HrDipPoint {
  date: string;
  dayHr: number | null;
  nightHr: number | null;
  dipPct: number | null;
}

/**
 * Nocturnal heart-rate dip: mean sleeping HR vs mean daytime HR per night.
 * A dip <10% ("non-dipping") is associated with cardiovascular risk.
 */
export async function getNocturnalHrDip(days: number): Promise<HrDipPoint[]> {
  const from = windowStart(days);
  const c = libsql();
  const [dayRes, nightRes] = await Promise.all([
    c.execute({
      sql: `SELECT date, AVG(bpm) AS hr FROM heart_rate_intraday
            WHERE date >= ? AND CAST(substr(ts,12,2) AS INTEGER) BETWEEN 9 AND 20
            GROUP BY date`,
      args: [from],
    }),
    c.execute({
      sql: `SELECT s.date AS date, AVG(h.bpm) AS hr
            FROM sleep_sessions s JOIN heart_rate_intraday h
              ON h.ts >= s.start_time AND h.ts <= s.end_time
            WHERE s.date >= ? AND s.sleep_type = 'NIGHT_SLEEP'
            GROUP BY s.date`,
      args: [from],
    }),
  ]);
  const day = new Map<string, number>();
  for (const r of dayRes.rows) if (r.hr != null) day.set(String(r.date), Number(r.hr));
  const night = new Map<string, number>();
  for (const r of nightRes.rows) if (r.hr != null) night.set(String(r.date), Number(r.hr));
  const dates = [...new Set([...day.keys(), ...night.keys()])].sort();
  return dates.map((date) => {
    const d = day.get(date) ?? null;
    const n = night.get(date) ?? null;
    const dipPct = d != null && n != null && d > 0 ? ((d - n) / d) * 100 : null;
    return {
      date,
      dayHr: d != null ? Math.round(d) : null,
      nightHr: n != null ? Math.round(n) : null,
      dipPct: dipPct != null ? Math.round(dipPct * 10) / 10 : null,
    };
  });
}

export interface ZoneDay {
  date: string;
  z1: number;
  z2: number;
  z3: number;
  z4: number;
  z5: number;
}

/**
 * Minutes per HR zone per day (Karvonen, personal resting HR + age). Bins
 * per-minute average HR so it's robust to the raw intraday sample rate.
 */
export async function getHrZoneMinutes(days: number, age: number): Promise<ZoneDay[]> {
  const from = windowStart(days);
  const res = await libsql().execute({
    sql: `SELECT h.date AS date, substr(h.ts,1,16) AS minute,
                 AVG(h.bpm) AS bpm, m.resting_hr AS rhr
          FROM heart_rate_intraday h JOIN metrics_daily m ON m.date = h.date
          WHERE h.date >= ? AND m.resting_hr IS NOT NULL
          GROUP BY h.date, substr(h.ts,1,16)`,
    args: [from],
  });
  const byDate = new Map<string, ZoneDay>();
  for (const r of res.rows) {
    const date = String(r.date);
    if (r.bpm == null || r.rhr == null) continue;
    const zone = karvonenZone(Number(r.bpm), Number(r.rhr), age);
    if (zone === 0) continue;
    let z = byDate.get(date);
    if (!z) {
      z = { date, z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 };
      byDate.set(date, z);
    }
    const key = HR_ZONES[zone - 1].key as "z1" | "z2" | "z3" | "z4" | "z5";
    z[key] += 1; // one per-minute bucket = ~1 minute
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface StepsHourCell {
  date: string;
  hour: number;
  steps: number;
}

/** Steps summed by (date, hour) for the activity-rhythm heatmap. */
export async function getStepsHourly(days: number): Promise<StepsHourCell[]> {
  const from = windowStart(days);
  const res = await libsql().execute({
    sql: `SELECT date, CAST(substr(ts,12,2) AS INTEGER) AS hour, SUM(count) AS steps
          FROM steps_intraday WHERE date >= ?
          GROUP BY date, hour`,
    args: [from],
  });
  return res.rows
    .filter((r) => r.steps != null)
    .map((r) => ({
      date: String(r.date),
      hour: Number(r.hour),
      steps: Number(r.steps),
    }));
}

export interface Spo2Night {
  date: string;
  min: number | null;
  avg: number | null;
  belowNinety: number; // readings < 90% (T90 proxy)
}

/** Per-night SpO2 minimum, average and a below-90% count (SDB screening hint). */
export async function getSpo2Nightly(days: number): Promise<Spo2Night[]> {
  const from = windowStart(days);
  const res = await libsql().execute({
    sql: `SELECT date, MIN(percentage) AS lo, AVG(percentage) AS av,
                 SUM(CASE WHEN percentage < 90 THEN 1 ELSE 0 END) AS below
          FROM spo2_intraday WHERE date >= ?
          GROUP BY date`,
    args: [from],
  });
  return res.rows.map((r) => ({
    date: String(r.date),
    min: r.lo != null ? Math.round(Number(r.lo) * 10) / 10 : null,
    avg: r.av != null ? Math.round(Number(r.av) * 10) / 10 : null,
    belowNinety: r.below != null ? Number(r.below) : 0,
  }));
}

export interface BandPoint {
  date: string;
  value: number | null;
  mean: number | null;
  low: number | null;
  high: number | null;
}

/**
 * Series + trailing 30-day baseline band (mean ± 1 SD) for a metric, computed
 * over the fetched rows so the shaded band always matches what's on screen.
 */
export function withBaselineBand(rows: Daily[], key: keyof Daily): BandPoint[] {
  return rows.map((row, i) => {
    const windowRows = rows.slice(Math.max(0, i - 30), i);
    const values = windowRows
      .map((r) => r[key] as number | null)
      .filter((v): v is number => v != null);
    let mean: number | null = null;
    let sd: number | null = null;
    if (values.length >= 5) {
      mean = values.reduce((a, b) => a + b, 0) / values.length;
      const m = mean;
      sd = Math.sqrt(
        values.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(values.length - 1, 1),
      );
    }
    return {
      date: row.date,
      value: (row[key] as number | null) ?? null,
      mean,
      low: mean != null && sd != null ? mean - sd : null,
      high: mean != null && sd != null ? mean + sd : null,
    };
  });
}
