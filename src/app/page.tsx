import Dashboard from "@/components/dashboard/Dashboard";
import { getDailySeries, getLastSync } from "@/lib/queries";
import { STEPS_GOAL } from "@/lib/env";
import { todayLocal } from "@/lib/dates";
import type { DayData } from "@/lib/view";

export const dynamic = "force-dynamic";

/**
 * Thin data-fetcher: everything visual + interactive (day travel, trend tabs,
 * chat) lives in the client Dashboard, fed one slim serializable payload.
 */
export default async function Page() {
  const [rows, lastSync] = await Promise.all([getDailySeries(365), getLastSync()]);
  const today = todayLocal();

  const days: DayData[] = rows
    .filter((r) => r.date <= today)
    .map((r) => ({
      date: r.date,
      readiness: r.readiness,
      readinessBase: r.readinessBase,
      sleepScore: r.sleepScore,
      sleepScoreBase: r.sleepScoreBase,
      sleepMinutes: r.sleepMinutes,
      sleepEfficiency: r.sleepEfficiency,
      deepMinutes: r.deepMinutes,
      remMinutes: r.remMinutes,
      lightMinutes: r.lightMinutes,
      awakeMinutes: r.awakeMinutes,
      bedtime: r.bedtime,
      wakeTime: r.wakeTime,
      restingHr: r.restingHr,
      restingHrBase: r.restingHrBase,
      hrv: r.hrv,
      hrvBase: r.hrvBase,
      steps: r.steps,
      azm: r.azm,
    }));

  return (
    <main className="min-h-dvh" style={{ background: "var(--bg)" }}>
      <Dashboard
        days={days}
        today={today}
        lastSyncAt={lastSync.at}
        syncErrors={lastSync.errors}
        stepsGoal={STEPS_GOAL()}
      />
    </main>
  );
}
