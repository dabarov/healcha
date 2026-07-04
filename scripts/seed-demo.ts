import "dotenv/config";
import { db, schema } from "../src/db/client";
import { addDays, nowIso, todayLocal } from "../src/lib/dates";
import { computeSleepScore, recomputeBaselines } from "../src/lib/baseline";

/**
 * Seeds ~60 days of plausible demo data so the dashboard, brief and
 * text-to-SQL can be tested locally without a Fitbit or Google Cloud setup.
 *
 * Refuses to run against a remote (libsql://) database unless --force is
 * passed — it's meant for a local file DB (TURSO_DATABASE_URL=file:local.db).
 */

const DAYS = 60;

function gauss(mean: number, sd: number): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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
  const split = ["upper", "lower", "rest", "upper", "lower", "rest", "rest"];

  for (let i = DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    dates.push(date);

    // A mild fatigue dip two weeks ago makes baselines/z-scores interesting.
    const dip = i > 10 && i < 17 ? 1 : 0;

    const sleepMinutes = Math.max(240, Math.round(gauss(430 - dip * 50, 35)));
    const deep = Math.max(30, Math.round(gauss(80 - dip * 15, 12)));
    const rem = Math.max(40, Math.round(gauss(95 - dip * 15, 15)));
    const light = Math.max(60, sleepMinutes - deep - rem);
    const awake = Math.max(10, Math.round(gauss(38 + dip * 10, 8)));
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
      restingHr: Math.round(gauss(55 + dip * 4, 1.6) * 10) / 10,
      hrv: Math.round(gauss(46 - dip * 10, 6) * 10) / 10,
      deepSleepHrv: Math.round(gauss(52 - dip * 10, 7) * 10) / 10,
      spo2: Math.round(gauss(96.6, 0.5) * 10) / 10,
      respRate: Math.round(gauss(14.4 + dip * 0.8, 0.4) * 10) / 10,
      skinTempDelta: Math.round(gauss(dip * 0.4, 0.25) * 100) / 100,
      sleepScore,
      sleepMinutes,
      deepMinutes: deep,
      remMinutes: rem,
      lightMinutes: light,
      awakeMinutes: awake,
      sleepEfficiency: efficiency,
      bedtime: bed,
      wakeTime: wake,
      steps: Math.max(1500, Math.round(gauss(9200 - dip * 2500, 2800))),
      distanceMeters: Math.round(gauss(6800, 2000)),
      azm: Math.max(0, Math.round(gauss(48 - dip * 20, 22))),
      caloriesTotal: Math.round(gauss(2600, 250)),
      caloriesActive: Math.round(gauss(700 - dip * 200, 200)),
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
    if (dayType !== "rest" && !dip) {
      await db()
        .insert(schema.activities)
        .values({
          id: `demo-workout-${date}`,
          date,
          startTime: `${date}T18:00:00`,
          endTime: `${date}T19:05:00`,
          activityType: "WEIGHTLIFTING",
          durationMinutes: Math.round(gauss(62, 8)),
          avgHr: Math.round(gauss(dayType === "lower" ? 132 : 121, 6)),
          calories: Math.round(gauss(420, 60)),
          azm: Math.round(gauss(35, 10)),
          hrZones: null,
          source: `demo (${dayType} day)`,
          raw: null,
        })
        .onConflictDoNothing();
    }
  }

  console.log(`Seeded ${DAYS} days of demo data; computing baselines…`);
  await recomputeBaselines(dates);
  console.log("Done. Run `npm run dev` and open http://localhost:3000");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
