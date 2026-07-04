import { sql } from "drizzle-orm";
import { db, schema } from "@/db/client";
import {
  civilEndTimeOf,
  civilTimeOf,
  civilToString,
  dailyRollUp,
  dateProtoToStr,
  listDataPoints,
  num,
  payloadOf,
  type DataPoint,
  type FilterKind,
} from "@/lib/google/healthApi";
import { ReauthRequiredError } from "@/lib/google/oauth";
import { addDays, dateOf, nowIso, todayLocal } from "@/lib/dates";
import { computeSleepScore, recomputeBaselines } from "@/lib/baseline";

/**
 * The single ingestion function. The dashboard "Sync now" button, the
 * Telegram /pull command and the GitHub Actions cron all call this — no
 * duplicated pull logic anywhere else.
 *
 * Incremental: reads sync_state per data type and pulls everything since the
 * last successful sync (with a 1-day overlap so late-finalizing data — last
 * night's sleep, revised daily summaries — gets corrected).
 * Idempotent: every write is an upsert on a natural key, so re-running or
 * overlapping runs never duplicate rows.
 */

export interface TypeResult {
  dataType: string;
  status: "ok" | "error";
  count: number;
  error?: string;
}

export interface SyncResult {
  ranAt: string;
  from: string;
  to: string;
  types: TypeResult[];
  affectedDates: string[];
}

const OVERLAP_DAYS = 1;

function lookbackDays(): number {
  return Number(process.env.SYNC_LOOKBACK_DAYS || 30);
}

// ---------------------------------------------------------------------------
// small parsing helpers (payload shapes are handled defensively — see README)
// ---------------------------------------------------------------------------

/** Duration → minutes. Accepts "3600s", "3600.5s", {seconds}, millis, plain seconds. */
function durationMinutes(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const m = v.match(/^([\d.]+)s$/);
    if (m) return Number(m[1]) / 60;
    const n = Number(v);
    return Number.isFinite(n) ? n / 60 : null;
  }
  if (typeof v === "number") return v / 60;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.seconds != null) return Number(o.seconds) / 60;
    if (o.millis != null) return Number(o.millis) / 60000;
  }
  return null;
}

/** First numeric leaf whose key matches, searched depth-first. */
function deepFindNumber(obj: unknown, keyPattern: RegExp, depth = 4): number | null {
  if (depth < 0 || obj == null || typeof obj !== "object") return null;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (keyPattern.test(k)) {
      const n = num(v);
      if (n != null) return n;
      const d = durationMinutes(v);
      if (d != null) return d;
    }
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v && typeof v === "object") {
      const found = deepFindNumber(v, keyPattern, depth - 1);
      if (found != null) return found;
    }
  }
  return null;
}

function minutesBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) && ms > 0 ? ms / 60000 : null;
}

async function upsertDaily(date: string, partial: Record<string, unknown>): Promise<void> {
  const values = { date, updatedAt: nowIso(), ...partial };
  await db()
    .insert(schema.metricsDaily)
    .values(values as typeof schema.metricsDaily.$inferInsert)
    .onConflictDoUpdate({
      target: schema.metricsDaily.date,
      set: { ...partial, updatedAt: nowIso() },
    });
}

async function chunkedUpsert<T extends Record<string, unknown>>(
  table: any,
  target: any,
  rows: T[],
  updateCols: string[],
): Promise<void> {
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const set: Record<string, unknown> = {};
    for (const c of updateCols) {
      set[c] = sql.raw(`excluded.${camelToSnake(c)}`);
    }
    // Intraday backfills push hundreds of thousands of rows to Turso; a
    // transient failure mid-stream shouldn't kill the whole data type.
    let attempt = 0;
    for (;;) {
      try {
        await db()
          .insert(table)
          .values(chunk as any)
          .onConflictDoUpdate({ target, set });
        break;
      } catch (e) {
        if (++attempt > 3) throw e;
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  }
}

function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

// ---------------------------------------------------------------------------
// per-type ingestion
// ---------------------------------------------------------------------------

type Handler = (points: DataPoint[], affected: Set<string>) => Promise<void>;

interface TypeConfig {
  dataType: string;
  kind: FilterKind;
  pageSize?: number;
  handler: Handler;
}

/** Sleep stage minutes from summary or stage list, whichever the payload has. */
function extractStages(p: Record<string, unknown>): {
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
  stagesJson: string | null;
} {
  const buckets: Record<string, number> = {};
  const add = (stage: string, minutes: number | null) => {
    if (minutes == null) return;
    const key = stage.toUpperCase();
    buckets[key] = (buckets[key] ?? 0) + minutes;
  };

  const summary = p.sleepSummary ?? p.stageSummary ?? p.sleepStageSummary;
  const summaryEntries = Array.isArray(summary)
    ? summary
    : summary && typeof summary === "object"
      ? Object.entries(summary).map(([stage, v]) => ({ stage, ...(v as object) }))
      : [];
  for (const e of summaryEntries as Array<Record<string, unknown>>) {
    const stage = String(e.stage ?? e.type ?? e.sleepStageType ?? "");
    const minutes =
      durationMinutes(e.totalDuration ?? e.duration) ??
      num(e.minutes) ??
      deepFindNumber(e, /duration|minutes/i, 2);
    if (stage) add(stage, minutes);
  }

  const stages = Array.isArray(p.sleepStages) ? (p.sleepStages as Array<Record<string, unknown>>) : [];
  if (Object.keys(buckets).length === 0) {
    for (const s of stages) {
      const stage = String(s.stage ?? s.type ?? s.sleepStageType ?? "");
      const interval = s.interval as Record<string, unknown> | undefined;
      const minutes =
        durationMinutes(s.duration) ??
        minutesBetween(
          civilToString(interval?.civilStartTime) ?? ((interval?.startTime as string) || null),
          civilToString(interval?.civilEndTime) ?? ((interval?.endTime as string) || null),
        );
      if (stage) add(stage, minutes);
    }
  }

  const pick = (...names: string[]) => {
    for (const n of names) if (buckets[n] != null) return Math.round(buckets[n]);
    return null;
  };
  return {
    deep: pick("DEEP"),
    light: pick("LIGHT"),
    rem: pick("REM"),
    awake: pick("AWAKE", "WAKE"),
    stagesJson: stages.length ? JSON.stringify(stages) : null,
  };
}

const handleSleep: Handler = async (points, affected) => {
  interface Night {
    asleep: number;
    row: typeof schema.sleepSessions.$inferInsert;
  }
  const mainPerDate = new Map<string, Night>();

  for (const dp of points) {
    const p = payloadOf(dp, "sleep");
    const start = civilTimeOf(p);
    const end = civilEndTimeOf(p);
    if (!end) continue;
    const date = dateOf(end); // night attributed to wake-up date
    const stages = extractStages(p);
    const sleepType = String(p.sleepType ?? "NIGHT_SLEEP");
    const inBed = minutesBetween(start, end);
    const awake = stages.awake ?? 0;
    const asleep =
      (stages.deep ?? 0) + (stages.light ?? 0) + (stages.rem ?? 0) ||
      (inBed != null ? Math.max(0, inBed - awake) : 0);
    const efficiency = inBed && asleep ? Math.round((asleep / inBed) * 1000) / 10 : null;

    const row: typeof schema.sleepSessions.$inferInsert = {
      id: String(dp.name ?? `${date}-${start ?? "unknown"}`),
      date,
      startTime: start,
      endTime: end,
      sleepType,
      minutesAsleep: asleep || null,
      minutesAwake: awake || null,
      deepMinutes: stages.deep,
      lightMinutes: stages.light,
      remMinutes: stages.rem,
      efficiency,
      stages: stages.stagesJson,
    };
    await db()
      .insert(schema.sleepSessions)
      .values(row)
      .onConflictDoUpdate({ target: schema.sleepSessions.id, set: row });

    affected.add(date);
    if (sleepType !== "NAP") {
      const existing = mainPerDate.get(date);
      if (!existing || (asleep ?? 0) > existing.asleep) {
        mainPerDate.set(date, { asleep: asleep ?? 0, row });
      }
    }
  }

  for (const [date, { row }] of mainPerDate) {
    const sleepScore = computeSleepScore({
      minutesAsleep: row.minutesAsleep,
      deepMinutes: row.deepMinutes,
      remMinutes: row.remMinutes,
      efficiency: row.efficiency,
    });
    await upsertDaily(date, {
      sleepMinutes: row.minutesAsleep,
      deepMinutes: row.deepMinutes,
      remMinutes: row.remMinutes,
      lightMinutes: row.lightMinutes,
      awakeMinutes: row.minutesAwake,
      sleepEfficiency: row.efficiency,
      bedtime: row.startTime,
      wakeTime: row.endTime,
      sleepScore,
    });
  }
};

const handleExercise: Handler = async (points, affected) => {
  for (const dp of points) {
    const p = payloadOf(dp, "exercise");
    const start = civilTimeOf(p);
    const end = civilEndTimeOf(p);
    if (!start) continue;
    const date = dateOf(start);
    const row: typeof schema.activities.$inferInsert = {
      id: String(dp.name ?? `${date}-${start}`),
      date,
      startTime: start,
      endTime: end,
      activityType: String(p.exerciseType ?? p.activityType ?? "UNKNOWN"),
      durationMinutes:
        durationMinutes((p as Record<string, unknown>).duration) ?? minutesBetween(start, end),
      avgHr: deepFindNumber(p, /averageHeartRate|avgHeartRate|meanHeartRate/i),
      calories: deepFindNumber(p, /calorie|energy/i),
      azm: deepFindNumber(p, /activeZoneMinutes/i),
      hrZones: p.exerciseMetadata ? JSON.stringify(p.exerciseMetadata) : null,
      source: JSON.stringify(dp.dataSource ?? null),
      raw: JSON.stringify(p).slice(0, 8000),
    };
    await db()
      .insert(schema.activities)
      .values(row)
      .onConflictDoUpdate({ target: schema.activities.id, set: row });
    affected.add(date);
  }
};

function dailyHandler(
  extract: (p: Record<string, unknown>) => Record<string, unknown> | null,
  dataType: string,
): Handler {
  return async (points, affected) => {
    for (const dp of points) {
      const p = payloadOf(dp, dataType);
      const date = dateProtoToStr(p.date) ?? (typeof p.date === "string" ? p.date : null);
      if (!date) continue;
      const partial = extract(p);
      if (!partial) continue;
      await upsertDaily(date, partial);
      affected.add(date);
    }
  };
}

const handleHeartRateIntraday: Handler = async (points, affected) => {
  const rows: Array<typeof schema.heartRateIntraday.$inferInsert> = [];
  for (const dp of points) {
    const p = payloadOf(dp, "heart-rate");
    const ts = civilTimeOf(p);
    const bpm = num(p.beatsPerMinute);
    if (!ts || bpm == null) continue;
    const date = dateOf(ts);
    rows.push({ ts, date, bpm, source: null });
    affected.add(date);
  }
  await chunkedUpsert(schema.heartRateIntraday, schema.heartRateIntraday.ts, rows, ["bpm"]);
};

const handleSpo2Intraday: Handler = async (points, affected) => {
  const rows: Array<typeof schema.spo2Intraday.$inferInsert> = [];
  for (const dp of points) {
    const p = payloadOf(dp, "oxygen-saturation");
    const ts = civilTimeOf(p);
    const pct = num(p.percentage);
    if (!ts || pct == null) continue;
    rows.push({ ts, date: dateOf(ts), percentage: pct });
    affected.add(dateOf(ts));
  }
  await chunkedUpsert(schema.spo2Intraday, schema.spo2Intraday.ts, rows, ["percentage"]);
};

const handleHrvIntraday: Handler = async (points, affected) => {
  const rows: Array<typeof schema.hrvReadings.$inferInsert> = [];
  for (const dp of points) {
    const p = payloadOf(dp, "heart-rate-variability");
    const ts = civilTimeOf(p);
    const rmssd =
      num(p.rmssd) ??
      num(p.heartRateVariabilityMilliseconds) ??
      deepFindNumber(p, /rootMeanSquare|rmssd|variabilityMilliseconds/i);
    if (!ts || rmssd == null) continue;
    rows.push({ ts, date: dateOf(ts), rmssd });
    affected.add(dateOf(ts));
  }
  await chunkedUpsert(schema.hrvReadings, schema.hrvReadings.ts, rows, ["rmssd"]);
};

const handleStepsIntraday: Handler = async (points, affected) => {
  const rows: Array<typeof schema.stepsIntraday.$inferInsert> = [];
  for (const dp of points) {
    const p = payloadOf(dp, "steps");
    const ts = civilTimeOf(p);
    const count = num(p.count);
    if (!ts || count == null) continue;
    rows.push({ ts, endTs: civilEndTimeOf(p), date: dateOf(ts), count });
    affected.add(dateOf(ts));
  }
  await chunkedUpsert(schema.stepsIntraday, schema.stepsIntraday.ts, rows, ["count", "endTs"]);
};

const handleIrn: Handler = async (points, affected) => {
  for (const dp of points) {
    const p = payloadOf(dp, "irregular-rhythm-notification");
    const win = (p.alertWindow ?? p.window) as Record<string, unknown> | undefined;
    const start =
      civilToString(win?.civilStartTime) ??
      ((win?.startTime as string) || null) ??
      civilTimeOf(p);
    if (!start) continue;
    const date = dateOf(start);
    const row: typeof schema.irregularRhythmEvents.$inferInsert = {
      id: String(dp.name ?? `${date}-${start}`),
      date,
      windowStart: start,
      windowEnd: civilToString(win?.civilEndTime) ?? ((win?.endTime as string) || null),
      raw: JSON.stringify(p).slice(0, 8000),
    };
    await db()
      .insert(schema.irregularRhythmEvents)
      .values(row)
      .onConflictDoUpdate({ target: schema.irregularRhythmEvents.id, set: row });
    affected.add(date);
  }
  // refresh per-day alert counts
  for (const date of affected) {
    const res = await db().$client.execute({
      sql: "SELECT COUNT(*) AS n FROM irregular_rhythm_events WHERE date = ?",
      args: [date],
    });
    await upsertDaily(date, { irregularRhythmAlerts: Number(res.rows[0]?.n ?? 0) });
  }
};

const LIST_TYPES: TypeConfig[] = [
  {
    dataType: "daily-resting-heart-rate",
    kind: "daily",
    handler: dailyHandler((p) => {
      const v = num(p.beatsPerMinute);
      return v != null ? { restingHr: v } : null;
    }, "daily-resting-heart-rate"),
  },
  {
    dataType: "daily-heart-rate-variability",
    kind: "daily",
    handler: dailyHandler((p) => {
      const hrv =
        num(p.averageHeartRateVariabilityMilliseconds) ??
        deepFindNumber(p, /averageHeartRateVariability/i);
      const deep =
        num(p.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds) ??
        deepFindNumber(p, /deepSleep.*Milliseconds/i);
      if (hrv == null && deep == null) return null;
      return { ...(hrv != null ? { hrv } : {}), ...(deep != null ? { deepSleepHrv: deep } : {}) };
    }, "daily-heart-rate-variability"),
  },
  {
    dataType: "daily-oxygen-saturation",
    kind: "daily",
    handler: dailyHandler((p) => {
      const v =
        num(p.averagePercentage) ?? num(p.percentage) ?? deepFindNumber(p, /percentage/i);
      return v != null ? { spo2: v } : null;
    }, "daily-oxygen-saturation"),
  },
  {
    dataType: "daily-respiratory-rate",
    kind: "daily",
    handler: dailyHandler((p) => {
      const v = num(p.breathsPerMinute) ?? deepFindNumber(p, /breathsPerMinute/i);
      return v != null ? { respRate: v } : null;
    }, "daily-respiratory-rate"),
  },
  {
    dataType: "daily-sleep-temperature-derivations",
    kind: "daily",
    handler: dailyHandler((p) => {
      const nightly = num(p.nightlyTemperatureCelsius);
      const baseline = num(p.baselineTemperatureCelsius);
      if (nightly == null) return null;
      const delta = baseline != null ? nightly - baseline : nightly;
      return { skinTempDelta: Math.round(delta * 100) / 100 };
    }, "daily-sleep-temperature-derivations"),
  },
  { dataType: "sleep", kind: "interval_end", pageSize: 25, handler: handleSleep },
  { dataType: "exercise", kind: "interval", pageSize: 25, handler: handleExercise },
  { dataType: "heart-rate", kind: "sample", pageSize: 10000, handler: handleHeartRateIntraday },
  { dataType: "oxygen-saturation", kind: "sample", pageSize: 5000, handler: handleSpo2Intraday },
  {
    dataType: "heart-rate-variability",
    kind: "sample",
    pageSize: 5000,
    handler: handleHrvIntraday,
  },
  { dataType: "steps", kind: "interval", pageSize: 10000, handler: handleStepsIntraday },
  { dataType: "irregular-rhythm-notification", kind: "none", handler: handleIrn },
];

/** Daily totals come from dailyRollUp — accurate merged aggregates per day. */
// Rollup values arrive nested under the camelCase type key, with string
// numbers and typed field names (verified against the live API):
//   steps: {countSum}, distance: {millimetersSum}, totalCalories: {kcalSum},
//   activeEnergyBurned: {kcalSum},
//   activeZoneMinutes: {sumInFatBurnHeartZone, sumInCardioHeartZone, sumInPeakHeartZone}
const ROLLUP_TYPES: Array<{
  dataType: string;
  column: string;
  round?: boolean;
  extract: (v: Record<string, unknown>) => number | null;
}> = [
  {
    dataType: "steps",
    column: "steps",
    round: true,
    extract: (v) => num(v.countSum) ?? deepFindNumber(v, /count/i),
  },
  {
    dataType: "active-zone-minutes",
    column: "azm",
    round: true,
    // Fitbit AZM: fat-burn minutes count once, cardio/peak count double.
    extract: (v) => {
      const fat = num(v.sumInFatBurnHeartZone);
      const cardio = num(v.sumInCardioHeartZone);
      const peak = num(v.sumInPeakHeartZone);
      if (fat == null && cardio == null && peak == null) {
        return deepFindNumber(v, /minutes/i);
      }
      return (fat ?? 0) + 2 * ((cardio ?? 0) + (peak ?? 0));
    },
  },
  {
    dataType: "distance",
    column: "distanceMeters",
    extract: (v) => {
      const mm = num(v.millimetersSum);
      if (mm != null) return mm / 1000;
      return num(v.metersSum) ?? deepFindNumber(v, /meters/i);
    },
  },
  {
    dataType: "total-calories",
    column: "caloriesTotal",
    extract: (v) => num(v.kcalSum) ?? deepFindNumber(v, /kcal|calorie|energy/i),
  },
  {
    dataType: "active-energy-burned",
    column: "caloriesActive",
    extract: (v) => num(v.kcalSum) ?? deepFindNumber(v, /kcal|calorie|energy/i),
  },
];

// ---------------------------------------------------------------------------
// the sync itself
// ---------------------------------------------------------------------------

async function getSinceDate(dataType: string, today: string): Promise<string> {
  const rows = await db().select().from(schema.syncState);
  const row = rows.find((r) => r.dataType === dataType);
  if (row?.lastSyncedThrough) {
    return addDays(row.lastSyncedThrough.slice(0, 10), -OVERLAP_DAYS);
  }
  return addDays(today, -lookbackDays());
}

async function setSyncState(
  dataType: string,
  status: "ok" | "error",
  through: string | null,
  error?: string,
): Promise<void> {
  const row = {
    dataType,
    lastRunAt: nowIso(),
    lastStatus: status,
    lastError: error ?? null,
    ...(through ? { lastSyncedThrough: through } : {}),
  };
  await db()
    .insert(schema.syncState)
    .values(row)
    .onConflictDoUpdate({ target: schema.syncState.dataType, set: row });
}

export async function syncHealthData(opts?: { full?: boolean }): Promise<SyncResult> {
  const today = todayLocal();
  const to = addDays(today, 1); // exclusive civil end
  const results: TypeResult[] = [];
  const affected = new Set<string>();
  let earliestFrom = today;

  for (const cfg of LIST_TYPES) {
    const from = opts?.full
      ? addDays(today, -lookbackDays())
      : await getSinceDate(cfg.dataType, today);
    if (from < earliestFrom) earliestFrom = from;
    try {
      const points = await listDataPoints(cfg.dataType, {
        kind: cfg.kind,
        from,
        to,
        pageSize: cfg.pageSize,
      });
      const relevant =
        cfg.kind === "none"
          ? points.filter((dp) => {
              const t = civilTimeOf(payloadOf(dp, cfg.dataType));
              return !t || dateOf(t) >= from;
            })
          : points;
      await cfg.handler(relevant, affected);
      await setSyncState(cfg.dataType, "ok", today);
      results.push({ dataType: cfg.dataType, status: "ok", count: relevant.length });
    } catch (e) {
      if (e instanceof ReauthRequiredError) throw e; // nothing else will work either
      const msg = e instanceof Error ? e.message : String(e);
      await setSyncState(cfg.dataType, "error", null, msg);
      results.push({ dataType: cfg.dataType, status: "error", count: 0, error: msg });
    }
  }

  // Daily totals via dailyRollUp over the widest window any type re-synced.
  for (const r of ROLLUP_TYPES) {
    try {
      const points = await dailyRollUp(r.dataType, earliestFrom, today);
      let count = 0;
      for (const p of points) {
        const date =
          civilToString(p.civilStartTime)?.slice(0, 10) ??
          (typeof p.startTime === "string" ? dateOf(p.startTime) : "");
        if (!date) continue;
        const value = r.extract(payloadOf(p as DataPoint, r.dataType));
        if (value == null) continue;
        await upsertDaily(date, { [r.column]: r.round ? Math.round(value) : value });
        affected.add(date);
        count++;
      }
      await setSyncState(`rollup:${r.dataType}`, "ok", today);
      results.push({ dataType: `rollup:${r.dataType}`, status: "ok", count });
    } catch (e) {
      if (e instanceof ReauthRequiredError) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      await setSyncState(`rollup:${r.dataType}`, "error", null, msg);
      results.push({ dataType: `rollup:${r.dataType}`, status: "error", count: 0, error: msg });
    }
  }

  await recomputeBaselines([...affected]);

  return {
    ranAt: nowIso(),
    from: earliestFrom,
    to: today,
    types: results,
    affectedDates: [...affected].sort(),
  };
}
