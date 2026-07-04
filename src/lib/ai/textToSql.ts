import { db, libsql, schema } from "@/db/client";
import { nowIso, todayLocal } from "@/lib/dates";
import { complete } from "./llm";

/**
 * Conversational querying: free-text question → LLM-generated SQL →
 * read-only execution → LLM-formatted answer.
 *
 * Guardrails: single statement, SELECT/WITH only, mutation keywords
 * rejected, row cap enforced. Generated SQL can never mutate the DB.
 */

const MAX_ROWS = 200;

const SCHEMA_DOC = `SQLite (Turso/libSQL) schema. All dates are local-timezone strings YYYY-MM-DD; timestamps are local ISO strings.

metrics_daily — ONE ROW PER DAY. Prefer this table for almost every question.
  date TEXT PK, resting_hr REAL (bpm), hrv REAL (nightly RMSSD ms), deep_sleep_hrv REAL,
  spo2 REAL (%), resp_rate REAL (breaths/min), skin_temp_delta REAL (°C vs personal baseline),
  sleep_score REAL (0-100), sleep_minutes REAL, deep_minutes REAL, rem_minutes REAL,
  light_minutes REAL, awake_minutes REAL, sleep_efficiency REAL (%),
  bedtime TEXT, wake_time TEXT,
  steps INTEGER, distance_meters REAL, azm INTEGER (active zone minutes),
  calories_total REAL, calories_active REAL,
  readiness REAL (0-100 composite recovery score; >=60 recovered, <40 under-recovered),
  irregular_rhythm_alerts INTEGER,
  -- 30-day baselines: <metric>_base = rolling mean, <metric>_z = z-score deviation
  resting_hr_base, resting_hr_z, hrv_base, hrv_z, sleep_score_base, sleep_score_z,
  sleep_minutes_base, sleep_minutes_z, steps_base, steps_z, resp_rate_base, resp_rate_z,
  readiness_base, readiness_z (all REAL)

sleep_sessions — per-night detail: id TEXT PK, date TEXT (wake-up date), start_time, end_time,
  sleep_type ('NIGHT_SLEEP'|'NAP'), minutes_asleep, minutes_awake, deep_minutes, light_minutes,
  rem_minutes, efficiency, stages (JSON)

activities — workouts: id TEXT PK, date TEXT, start_time, end_time, activity_type TEXT
  (e.g. WEIGHTLIFTING, RUNNING, WALKING), duration_minutes REAL, avg_hr REAL, calories REAL,
  azm INTEGER, hr_zones (JSON)

heart_rate_intraday — huge (~5s resolution): ts TEXT PK, date TEXT, bpm INTEGER.
  Only use when the question truly needs intraday resolution; always filter by date.
spo2_intraday(ts PK, date, percentage) / steps_intraday(ts PK, end_ts, date, count) /
hrv_readings(ts PK, date, rmssd) — same warning.
irregular_rhythm_events(id PK, date, window_start, window_end)

Notes:
- "leg day"/"lower day" ≈ activities with activity_type containing WEIGHT/STRENGTH on that date; the user follows a 4-day upper/lower split but sessions are not labeled upper/lower — say so if asked to distinguish.
- date arithmetic: date(date, '-7 day'), strftime. Today is {TODAY}.
- Always ORDER BY and LIMIT sensibly.`;

const SQL_SYSTEM = `You translate a personal-health question into ONE SQLite SELECT statement.

Output ONLY the SQL — no prose, no code fences.
Hard rules: a single statement; must start with SELECT or WITH; read-only (no INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/ATTACH/PRAGMA/REPLACE); include a LIMIT of at most ${MAX_ROWS}; round floats with ROUND(...,1) where helpful; prefer metrics_daily over intraday tables.`;

const ANSWER_SYSTEM = `You answer a personal health question given the SQL result of a query over the user's own Fitbit history. Be concise (2-6 sentences or a short list), include the actual numbers, frame values against baseline columns when present, and note briefly if the data looks sparse. Plain text, no markdown headers.`;

class UnsafeSqlError extends Error {}

const FORBIDDEN =
  /\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|begin|commit|rollback|savepoint)\b/i;

export function sanitizeSql(raw: string): string {
  let sqlText = raw
    .trim()
    .replace(/^```(sql)?/i, "")
    .replace(/```$/, "")
    .trim();
  // single statement: strip one trailing semicolon, reject any others
  sqlText = sqlText.replace(/;\s*$/, "");
  if (sqlText.includes(";")) throw new UnsafeSqlError("Multiple statements are not allowed");
  if (!/^\s*(select|with)\b/i.test(sqlText)) {
    throw new UnsafeSqlError("Only SELECT queries are allowed");
  }
  if (FORBIDDEN.test(sqlText)) {
    throw new UnsafeSqlError("Query contains a forbidden keyword");
  }
  if (!/\blimit\s+\d+/i.test(sqlText)) {
    sqlText = `${sqlText} LIMIT ${MAX_ROWS}`;
  }
  return sqlText;
}

export interface AskResult {
  answer: string;
  sql?: string;
  rowCount?: number;
}

export async function askHealthQuestion(question: string): Promise<AskResult> {
  const schemaDoc = SCHEMA_DOC.replace("{TODAY}", todayLocal());
  let generated: string | undefined;
  try {
    generated = await complete(
      SQL_SYSTEM,
      `${schemaDoc}\n\nQuestion: ${question}`,
      600,
    );
    const safeSql = sanitizeSql(generated);

    const result = await libsql().execute(safeSql);
    const rows = result.rows.slice(0, MAX_ROWS).map((r) => {
      const obj: Record<string, unknown> = {};
      result.columns.forEach((c, i) => (obj[c] = r[i]));
      return obj;
    });

    const answer = await complete(
      ANSWER_SYSTEM,
      `Question: ${question}\n\nSQL used:\n${safeSql}\n\nResult rows (JSON, ${rows.length} rows):\n${JSON.stringify(rows).slice(0, 12000)}`,
      700,
    );

    await db().insert(schema.aiQueryLog).values({
      createdAt: nowIso(),
      question,
      generatedSql: safeSql,
      rowCount: rows.length,
      answer: answer.slice(0, 4000),
    });

    return { answer, sql: safeSql, rowCount: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db()
      .insert(schema.aiQueryLog)
      .values({ createdAt: nowIso(), question, generatedSql: generated, error: msg })
      .catch(() => {});
    if (e instanceof UnsafeSqlError) {
      return { answer: `I couldn't turn that into a safe read-only query (${msg}). Try rephrasing.` };
    }
    return { answer: `Sorry, that query failed: ${msg}` };
  }
}
