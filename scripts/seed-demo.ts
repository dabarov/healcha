import "dotenv/config";
import { db, schema } from "../src/db/client";
import { addDays, nowIso, todayLocal } from "../src/lib/dates";
import { computeSleepScore, recomputeBaselines } from "../src/lib/baseline";

/**
 * Seeds ~60 days of plausible demo data so the dashboard, brief and
 * text-to-SQL can be tested locally without a Fitbit or Google Cloud setup.
 * The most recent INTRADAY_DAYS also get synthetic intraday heart rate, steps
 * and SpO2 so the derived charts (HR zones, nocturnal dip, activity rhythm,
 * overnight SpO2) render too.
 *
 * Refuses to run against a remote (libsql://) database unless --force is
 * passed — it's meant for a local file DB (TURSO_DATABASE_URL=file:local.db).
 */

const DAYS = 60;
const INTRADAY_DAYS = 35;

function gauss(mean: number, sd: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

interface DayMeta {
  date: string;
  restingHr: number;
  wakeMin: number;
  steps: number;
  workout: { startMin: number; endMin: number; avgHr: number } | null;
}

async function insertBatched<T>(
  rows: T[],
  chunk: number,
  insert: (batch: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunk) {
    await insert(rows.slice(i, i + chunk));
  }
}

/** Generate per-minute HR, hourly steps and overnight SpO2 for recent days. */
async function seedIntraday(metas: DayMeta[]): Promise<void> {
  const recent = metas.slice(-INTRADAY_DAYS);
  const hr: (typeof schema.heartRateIntraday.$inferInsert)[] = [];
  const steps: (typeof schema.stepsIntraday.$inferInsert)[] = [];
  const spo2: (typeof schema.spo2Intraday.$inferInsert)[] = [];
  const eveningBed = 23 * 60 + 15;
  // daytime step rhythm weights over hours 0..23 (commute / lunch / evening walk)
  const stepShape = [0, 0, 0, 0, 0, 0.01, 0.03, 0.07, 0.06, 0.05, 0.05, 0.06, 0.08,
    0.06, 0.05, 0.05, 0.06, 0.08, 0.09, 0.05, 0.03, 0.02, 0.01, 0];
  const shapeSum = stepShape.reduce((a, b) => a + b, 0);

  for (const m of recent) {
    const rhr = m.restingHr;
    for (let min = 0; min < 1440; min++) {
      const ts = `${m.date}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`;
      const asleep = min < m.wakeMin || min >= eveningBed;
      const inWorkout = m.workout && min >= m.workout.startMin && min < m.workout.endMin;
      let bpm: number;
      if (inWorkout && m.workout) {
        const p = Math.min(1, (min - m.workout.startMin) / 12); // warm-up ramp
        const target = m.workout.avgHr + (min - m.workout.startMin) * 0.25; // drift up
        bpm = rhr + (target - rhr) * (0.6 + 0.4 * p) + gauss(0, 6);
      } else if (asleep) {
        bpm = rhr - 5 + 3 * Math.sin(min / 90) + gauss(0, 2.4);
      } else {
        bpm = rhr + 10 + 5 * Math.sin((min - 720) / 200) + gauss(0, 5.5);
      }
      bpm = Math.max(38, Math.min(188, Math.round(bpm)));
      hr.push({ ts, date: m.date, bpm, source: "demo" });
    }

    // hourly steps
    for (let h = 0; h < 24; h++) {
      const w = stepShape[h] / shapeSum;
      const count = Math.max(0, Math.round(m.steps * w * gauss(1, 0.25)));
      if (count === 0) continue;
      steps.push({
        ts: `${m.date}T${pad(h)}:00:00`,
        endTs: `${m.date}T${pad(h)}:59:59`,
        date: m.date,
        count,
      });
    }

    // overnight SpO2, one reading / 5 min during the morning sleep block
    for (let min = 0; min < m.wakeMin; min += 5) {
      let pct = gauss(96.8, 0.7);
      if (Math.random() < 0.02) pct = gauss(89, 1.5); // occasional desaturation
      pct = Math.max(85, Math.min(100, Math.round(pct * 10) / 10));
      spo2.push({
        ts: `${m.date}T${pad(Math.floor(min / 60))}:${pad(min % 60)}:00`,
        date: m.date,
        percentage: pct,
      });
    }
  }

  await insertBatched(hr, 500, (b) =>
    db().insert(schema.heartRateIntraday).values(b).onConflictDoNothing(),
  );
  await insertBatched(steps, 500, (b) =>
    db().insert(schema.stepsIntraday).values(b).onConflictDoNothing(),
  );
  await insertBatched(spo2, 500, (b) =>
    db().insert(schema.spo2Intraday).values(b).onConflictDoNothing(),
  );
  console.log(
    `Seeded intraday: ${hr.length} HR, ${steps.length} step buckets, ${spo2.length} SpO2 readings (last ${INTRADAY_DAYS} days).`,
  );
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL ?? "";
  if (!url.startsWith("file:") && !process.argv.includes("--force")) {
    throw new Error(
      `Refusing to seed demo data into a remote DB (${url}). ` +
        `Use TURSO_DATABASE_URL=file:local.db, or pass --force if you really mean it.`,
    );
  }

  const today = todayLocal();
  const dates: string[] = [];
  const metas: DayMeta[] = [];
  const split = ["upper", "lower", "rest", "upper", "lower", "rest", "rest"];

  // Recovery drifts day to day (AR(1)) instead of being drawn independently —
  // otherwise HRV/RHR/sleep are uncorrelated and readiness ping-pongs between
  // 0 and 100, which no real body does.
  let recovery = 0;

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    dates.push(date);

    recovery = Math.max(-1.8, Math.min(1.8, 0.65 * recovery + gauss(0, 0.55)));
    // A fatigue dip two weeks ago makes baselines/z-scores interesting.
    const dip = i > 10 && i < 17 ? 1 : 0;
    const r = recovery - dip * 1.1;

    const sleepMinutes = Math.max(240, Math.round(gauss(430 + r * 22, 20)));
    const deep = Math.max(30, Math.round(gauss(80 + r * 10, 7)));
    const rem = Math.max(40, Math.round(gauss(95 + r * 10, 9)));
    const light = Math.max(60, sleepMinutes - deep - rem);
    const awake = Math.max(10, Math.round(gauss(38 - r * 6, 5)));
    const efficiency = Math.round((sleepMinutes / (sleepMinutes + awake)) * 1000) / 10;
    const sleepScore = computeSleepScore({
      minutesAsleep: sleepMinutes,
      deepMinutes: deep,
      remMinutes: rem,
      efficiency,
    });
    const bed = `${addDays(date, -1)}T23:${String(10 + Math.floor(Math.random() * 40)).padStart(2, "0")}:00`;
    const wake = `${date}T07:${String(Math.floor(Math.random() * 30)).padStart(2, "0")}:00`;

    const day = {
      date,
      restingHr: Math.round(gauss(55 - r * 1.4, 0.7) * 10) / 10,
      hrv: Math.round(gauss(46 + r * 5.5, 2.5) * 10) / 10,
      deepSleepHrv: Math.round(gauss(52 + r * 5.5, 3) * 10) / 10,
      spo2: Math.round(gauss(96.6, 0.5) * 10) / 10,
      respRate: Math.round(gauss(14.4 - r * 0.35, 0.25) * 10) / 10,
      skinTempDelta: Math.round(gauss(Math.max(0, -r) * 0.35, 0.2) * 100) / 100,
      sleepScore,
      sleepMinutes,
      deepMinutes: deep,
      remMinutes: rem,
      lightMinutes: light,
      awakeMinutes: awake,
      sleepEfficiency: efficiency,
      bedtime: bed,
      wakeTime: wake,
      steps: Math.max(1500, Math.round(gauss(9200 + r * 1400, 2200))),
      distanceMeters: Math.round(gauss(6800, 2000)),
      azm: Math.max(0, Math.round(gauss(48 + r * 12, 16))),
      caloriesTotal: Math.round(gauss(2600, 250)),
      caloriesActive: Math.round(gauss(700 + r * 120, 160)),
      irregularRhythmAlerts: 0,
      updatedAt: nowIso(),
    };
    await db()
      .insert(schema.metricsDaily)
      .values(day)
      .onConflictDoUpdate({ target: schema.metricsDaily.date, set: day });

    // Matching sleep session + workouts on the 4-day upper/lower split
    await db()
      .insert(schema.sleepSessions)
      .values({
        id: `demo-sleep-${date}`,
        date,
        startTime: bed,
        endTime: wake,
        sleepType: "NIGHT_SLEEP",
        minutesAsleep: sleepMinutes,
        minutesAwake: awake,
        deepMinutes: deep,
        lightMinutes: light,
        remMinutes: rem,
        efficiency,
        stages: null,
      })
      .onConflictDoNothing();

    const dayType = split[new Date(`${date}T12:00:00Z`).getUTCDay() % split.length];
    let workoutMeta: DayMeta["workout"] = null;
    if (dayType !== "rest" && !dip) {
      const avgHr = Math.round(gauss(dayType === "lower" ? 132 : 121, 6));
      const duration = Math.round(gauss(62, 8));
      workoutMeta = { startMin: 18 * 60, endMin: 18 * 60 + duration, avgHr };
      await db()
        .insert(schema.activities)
        .values({
          id: `demo-workout-${date}`,
          date,
          startTime: `${date}T18:00:00`,
          endTime: `${date}T${pad(18 + Math.floor(duration / 60))}:${pad(duration % 60)}:00`,
          activityType: "WEIGHTLIFTING",
          durationMinutes: duration,
          avgHr,
          calories: Math.round(gauss(420, 60)),
          azm: Math.round(gauss(35, 10)),
          hrZones: null,
          source: `demo (${dayType} day)`,
          raw: null,
        })
        .onConflictDoNothing();
    }

    const wakeMin = Number(wake.slice(11, 13)) * 60 + Number(wake.slice(14, 16));
    metas.push({ date, restingHr: day.restingHr, wakeMin, steps: day.steps, workout: workoutMeta });
  }

  console.log(`Seeded ${DAYS} days of demo data; generating intraday…`);
  await seedIntraday(metas);
  console.log("Computing baselines…");
  await recomputeBaselines(dates);
  console.log("Done. Run `npm run dev` and open http://localhost:3000");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
