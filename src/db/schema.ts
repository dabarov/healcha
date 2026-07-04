import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * Incremental-sync bookkeeping: one row per Google Health data type.
 * `lastSyncedThrough` is a civil (local-timezone) ISO timestamp or date —
 * the point up to which data has been successfully ingested.
 */
export const syncState = sqliteTable("sync_state", {
  dataType: text("data_type").primaryKey(),
  lastSyncedThrough: text("last_synced_through"),
  lastRunAt: text("last_run_at"),
  lastStatus: text("last_status"), // "ok" | "error"
  lastError: text("last_error"),
});

/** Single-user OAuth tokens. Refresh token is AES-256-GCM encrypted at rest. */
export const oauthTokens = sqliteTable("oauth_tokens", {
  id: integer("id").primaryKey(), // always 1
  accessToken: text("access_token"),
  accessTokenExpiresAt: text("access_token_expires_at"), // ISO UTC
  refreshTokenEnc: text("refresh_token_enc"),
  scope: text("scope"),
  updatedAt: text("updated_at"),
});

/**
 * One row per local-timezone day. This is the small, indexed rollup table the
 * dashboard and the AI querying read by default.
 *
 * `*Base` columns are the rolling 30-day baseline mean (excluding the day
 * itself); `*Z` columns are the z-score deviation from that baseline.
 */
export const metricsDaily = sqliteTable(
  "metrics_daily",
  {
    date: text("date").primaryKey(), // YYYY-MM-DD (local tz)

    restingHr: real("resting_hr"), // bpm
    hrv: real("hrv"), // nightly RMSSD, ms
    deepSleepHrv: real("deep_sleep_hrv"), // deep-sleep RMSSD, ms
    spo2: real("spo2"), // daily avg %
    respRate: real("resp_rate"), // breaths/min (sleep)
    skinTempDelta: real("skin_temp_delta"), // °C deviation from personal baseline

    sleepScore: real("sleep_score"), // 0-100 (computed proxy; see baseline.ts)
    sleepMinutes: real("sleep_minutes"),
    deepMinutes: real("deep_minutes"),
    remMinutes: real("rem_minutes"),
    lightMinutes: real("light_minutes"),
    awakeMinutes: real("awake_minutes"),
    sleepEfficiency: real("sleep_efficiency"), // % asleep of time in bed
    bedtime: text("bedtime"), // ISO local
    wakeTime: text("wake_time"), // ISO local

    steps: integer("steps"),
    distanceMeters: real("distance_meters"),
    azm: integer("azm"), // active zone minutes
    caloriesTotal: real("calories_total"),
    caloriesActive: real("calories_active"),

    readiness: real("readiness"), // 0-100 composite (see baseline.ts)
    irregularRhythmAlerts: integer("irregular_rhythm_alerts"),

    // 30-day baselines (mean) + z-scores for the key metrics
    restingHrBase: real("resting_hr_base"),
    restingHrZ: real("resting_hr_z"),
    hrvBase: real("hrv_base"),
    hrvZ: real("hrv_z"),
    sleepScoreBase: real("sleep_score_base"),
    sleepScoreZ: real("sleep_score_z"),
    sleepMinutesBase: real("sleep_minutes_base"),
    sleepMinutesZ: real("sleep_minutes_z"),
    stepsBase: real("steps_base"),
    stepsZ: real("steps_z"),
    respRateBase: real("resp_rate_base"),
    respRateZ: real("resp_rate_z"),
    readinessBase: real("readiness_base"),
    readinessZ: real("readiness_z"),

    updatedAt: text("updated_at"),
  },
  (t) => [index("idx_metrics_daily_date").on(t.date)],
);

/** Raw intraday heart rate (~5s resolution — thousands of rows/day). */
export const heartRateIntraday = sqliteTable(
  "heart_rate_intraday",
  {
    ts: text("ts").primaryKey(), // ISO local civil time
    date: text("date").notNull(), // YYYY-MM-DD (local tz)
    bpm: integer("bpm").notNull(),
    source: text("source"),
  },
  (t) => [index("idx_hr_intraday_date").on(t.date)],
);

/** Per-night sleep sessions with stage detail. */
export const sleepSessions = sqliteTable(
  "sleep_sessions",
  {
    id: text("id").primaryKey(), // data point name, or start ts fallback
    date: text("date").notNull(), // night attributed to wake-up date (local)
    startTime: text("start_time"),
    endTime: text("end_time"),
    sleepType: text("sleep_type"), // NIGHT_SLEEP | NAP
    minutesAsleep: real("minutes_asleep"),
    minutesAwake: real("minutes_awake"),
    deepMinutes: real("deep_minutes"),
    lightMinutes: real("light_minutes"),
    remMinutes: real("rem_minutes"),
    efficiency: real("efficiency"),
    stages: text("stages"), // JSON array of {stage, startTime, endTime}
  },
  (t) => [index("idx_sleep_sessions_date").on(t.date)],
);

/** Workouts / exercises (auto-detected + logged). */
export const activities = sqliteTable(
  "activities",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    activityType: text("activity_type"),
    durationMinutes: real("duration_minutes"),
    avgHr: real("avg_hr"),
    calories: real("calories"),
    azm: integer("azm"),
    hrZones: text("hr_zones"), // JSON
    source: text("source"),
    raw: text("raw"), // JSON of the original data point (small)
  },
  (t) => [index("idx_activities_date").on(t.date)],
);

export const spo2Intraday = sqliteTable(
  "spo2_intraday",
  {
    ts: text("ts").primaryKey(),
    date: text("date").notNull(),
    percentage: real("percentage").notNull(),
  },
  (t) => [index("idx_spo2_intraday_date").on(t.date)],
);

export const stepsIntraday = sqliteTable(
  "steps_intraday",
  {
    ts: text("ts").primaryKey(), // interval civil start
    endTs: text("end_ts"),
    date: text("date").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [index("idx_steps_intraday_date").on(t.date)],
);

/** Intraday HRV readings (in addition to the nightly daily summary). */
export const hrvReadings = sqliteTable(
  "hrv_readings",
  {
    ts: text("ts").primaryKey(),
    date: text("date").notNull(),
    rmssd: real("rmssd"),
  },
  (t) => [index("idx_hrv_readings_date").on(t.date)],
);

/** Irregular heart rhythm / AFib notifications. */
export const irregularRhythmEvents = sqliteTable(
  "irregular_rhythm_events",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    windowStart: text("window_start"),
    windowEnd: text("window_end"),
    raw: text("raw"),
  },
  (t) => [index("idx_irn_date").on(t.date)],
);

/** Cache of generated daily summaries (dashboard "today" panel + brief). */
export const dailySummaries = sqliteTable("daily_summaries", {
  date: text("date").primaryKey(),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull(),
});

/** Debug log of conversational AI queries. */
export const aiQueryLog = sqliteTable("ai_query_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: text("created_at").notNull(),
  question: text("question").notNull(),
  generatedSql: text("generated_sql"),
  rowCount: integer("row_count"),
  answer: text("answer"),
  error: text("error"),
});
