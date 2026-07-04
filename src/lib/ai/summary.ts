import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { addDays } from "@/lib/dates";
import { readinessVerdict } from "@/lib/baseline";
import { complete } from "./anthropic";

/**
 * The shared daily-summary generator — single source of truth for
 * interpretation. Used by both the Telegram morning brief and the dashboard
 * "today" panel.
 */

type Daily = typeof schema.metricsDaily.$inferSelect;

function pctVsBase(value: number | null, base: number | null): string | null {
  if (value == null || base == null || base === 0) return null;
  const pct = ((value - base) / base) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function fmt(v: number | null | undefined, unit = "", digits = 0): string {
  if (v == null) return "n/a";
  return `${v.toFixed(digits)}${unit}`;
}

/** Structured facts handed to the LLM (and rendered raw by /today). */
export async function buildDailyFacts(date: string): Promise<string | null> {
  const rows = await db()
    .select()
    .from(schema.metricsDaily)
    .where(eq(schema.metricsDaily.date, date));
  const d: Daily | undefined = rows[0];
  if (!d) return null;

  const yesterday = addDays(date, -1);
  const recentActivities = await db()
    .select()
    .from(schema.activities)
    .where(and(gte(schema.activities.date, addDays(date, -3)), lte(schema.activities.date, date)))
    .orderBy(desc(schema.activities.date));

  const lines: string[] = [
    `Date: ${date}`,
    `Readiness: ${fmt(d.readiness)} / 100 (verdict: ${readinessVerdict(d.readiness)}; baseline ${fmt(d.readinessBase)}, z ${fmt(d.readinessZ, "", 2)})`,
    `Sleep: score ${fmt(d.sleepScore)} (baseline ${fmt(d.sleepScoreBase)}, ${pctVsBase(d.sleepScore, d.sleepScoreBase) ?? "n/a"}), ` +
      `${fmt(d.sleepMinutes != null ? d.sleepMinutes / 60 : null, "h", 1)} total ` +
      `(deep ${fmt(d.deepMinutes, "m")}, REM ${fmt(d.remMinutes, "m")}, light ${fmt(d.lightMinutes, "m")}, awake ${fmt(d.awakeMinutes, "m")}), ` +
      `efficiency ${fmt(d.sleepEfficiency, "%")}, bed ${d.bedtime?.slice(11, 16) ?? "n/a"} wake ${d.wakeTime?.slice(11, 16) ?? "n/a"}`,
    `Resting HR: ${fmt(d.restingHr, " bpm")} (baseline ${fmt(d.restingHrBase, "", 1)}, ${pctVsBase(d.restingHr, d.restingHrBase) ?? "n/a"}, z ${fmt(d.restingHrZ, "", 2)})`,
    `HRV (RMSSD): ${fmt(d.hrv, " ms", 1)} (baseline ${fmt(d.hrvBase, "", 1)}, ${pctVsBase(d.hrv, d.hrvBase) ?? "n/a"}, z ${fmt(d.hrvZ, "", 2)})`,
    `SpO2: ${fmt(d.spo2, "%", 1)} | Respiratory rate: ${fmt(d.respRate, " br/min", 1)} (z ${fmt(d.respRateZ, "", 2)}) | Skin temp deviation: ${fmt(d.skinTempDelta, "°C", 2)}`,
    `Activity yesterday+today: steps ${fmt(d.steps)} (baseline ${fmt(d.stepsBase)}), AZM ${fmt(d.azm)}, active kcal ${fmt(d.caloriesActive)}`,
  ];
  if (d.irregularRhythmAlerts) {
    lines.push(`⚠ Irregular rhythm notifications today: ${d.irregularRhythmAlerts}`);
  }
  if (recentActivities.length) {
    lines.push(
      "Recent workouts (last 3 days): " +
        recentActivities
          .map(
            (a) =>
              `${a.date} ${a.activityType} ${fmt(a.durationMinutes, "m")}${a.avgHr ? ` avgHR ${fmt(a.avgHr)}` : ""}`,
          )
          .join("; "),
    );
  } else {
    lines.push("Recent workouts (last 3 days): none recorded");
  }
  lines.push(`Yesterday (${yesterday}) was the most recent full day of training data.`);
  return lines.join("\n");
}

const BRIEF_SYSTEM = `You write a personal morning health brief for one person, sent to their phone via Telegram. They train a 4-day upper/lower hypertrophy split.

Rules:
- Interpret, don't dump numbers. Every metric you mention must be framed against the 30-day baseline (e.g. "HRV 15% below your 30-day average"), which is provided.
- Structure: (1) lead with readiness + a one-line verdict (recovered / neutral / under-recovered), (2) last night's sleep in one or two lines, (3) resting HR + HRV vs baseline in one line, (4) flag any anomalies (irregular rhythm alerts, unusually high resting HR or resp rate, big skin-temp deviation) — omit this line entirely if there are none, (5) end with ONE actionable training suggestion for today tuned to the upper/lower split and recent workouts (e.g. under-recovered after a heavy lower day → cut volume ~20% or swap to the upper session / a rest day).
- Short and skimmable: max ~8 lines, plain sentences. A couple of fitting emoji are fine. No markdown headers, no bullets-of-bullets, no preamble like "Here is your brief".
- If data is missing (n/a), skip it silently rather than mentioning gaps, unless almost everything is missing — then say the sync looks incomplete.`;

export async function generateDailySummary(date: string): Promise<string> {
  const facts = await buildDailyFacts(date);
  if (!facts) {
    return `No data for ${date} yet — run a sync first.`;
  }
  return complete(BRIEF_SYSTEM, `Here are today's numbers:\n\n${facts}`, 700);
}
