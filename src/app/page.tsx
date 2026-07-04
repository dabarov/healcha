import KpiCard from "@/components/KpiCard";
import SyncButton from "@/components/SyncButton";
import TodayPanel from "@/components/TodayPanel";
import { BaselineChart, BarsChart, SleepStagesChart } from "@/components/charts";
import { getDailySeries, getLastSync, withBaselineBand, type Daily } from "@/lib/queries";

export const dynamic = "force-dynamic";

function spark(rows: Daily[], key: keyof Daily): Array<number | null> {
  return rows.slice(-14).map((r) => (r[key] as number | null) ?? null);
}

function latestWith(rows: Daily[], key: keyof Daily): Daily | undefined {
  return [...rows].reverse().find((r) => r[key] != null);
}

export default async function Dashboard() {
  const [rows90, lastSync] = await Promise.all([getDailySeries(90), getLastSync()]);
  const rows30 = rows90.slice(-30);
  const rows14 = rows90.slice(-14);

  const readiness = latestWith(rows90, "readiness");
  const sleepScore = latestWith(rows90, "sleepScore");
  const restingHr = latestWith(rows90, "restingHr");
  const hrv = latestWith(rows90, "hrv");

  const sleepStageData = rows14.map((r) => ({
    date: r.date,
    deep: r.deepMinutes,
    rem: r.remMinutes,
    light: r.lightMinutes,
    awake: r.awakeMinutes,
  }));

  const empty = rows90.length === 0;

  return (
    <main className="mx-auto max-w-6xl p-4 sm:p-6 flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Health</h1>
        <div className="flex items-center gap-3">
          {lastSync.errors > 0 && (
            <span className="text-xs" style={{ color: "var(--bad)" }}>
              {lastSync.errors} sync error{lastSync.errors > 1 ? "s" : ""}
            </span>
          )}
          <SyncButton lastSync={lastSync.at} />
        </div>
      </header>

      {empty ? (
        <div className="card p-8 text-sm" style={{ color: "var(--ink-2)" }}>
          No data yet. Connect Google (npm run auth:google), then hit <b>Sync now</b>.
        </div>
      ) : (
        <>
          {/* KPI row */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Readiness"
              value={readiness?.readiness ?? null}
              unit="/100"
              baseline={readiness?.readinessBase ?? null}
              z={readiness?.readinessZ ?? null}
              upIsGood
              color="var(--c-readiness)"
              spark={spark(rows90, "readiness")}
            />
            <KpiCard
              label="Sleep score"
              value={sleepScore?.sleepScore ?? null}
              unit="/100"
              baseline={sleepScore?.sleepScoreBase ?? null}
              z={sleepScore?.sleepScoreZ ?? null}
              upIsGood
              color="var(--c-sleep)"
              spark={spark(rows90, "sleepScore")}
            />
            <KpiCard
              label="Resting HR"
              value={restingHr?.restingHr ?? null}
              unit="bpm"
              baseline={restingHr?.restingHrBase ?? null}
              z={restingHr?.restingHrZ ?? null}
              upIsGood={false}
              color="var(--c-rhr)"
              spark={spark(rows90, "restingHr")}
            />
            <KpiCard
              label="HRV"
              value={hrv?.hrv ?? null}
              unit="ms"
              digits={1}
              baseline={hrv?.hrvBase ?? null}
              z={hrv?.hrvZ ?? null}
              upIsGood
              color="var(--c-hrv)"
              spark={spark(rows90, "hrv")}
            />
          </section>

          {/* Today's AI summary */}
          <TodayPanel />

          {/* Trend charts */}
          <section className="grid lg:grid-cols-2 gap-4">
            <div className="card p-4">
              <h2 className="text-sm font-semibold mb-2">HRV — 90 days vs baseline</h2>
              <BaselineChart
                data={withBaselineBand(rows90, "hrv")}
                color="#199e70"
                unit="ms"
                valueName="HRV"
              />
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-semibold mb-2">Resting HR — 90 days vs baseline</h2>
              <BaselineChart
                data={withBaselineBand(rows90, "restingHr")}
                color="#e66767"
                unit="bpm"
                valueName="Resting HR"
              />
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-semibold mb-2">Sleep stages — last 14 nights</h2>
              <SleepStagesChart data={sleepStageData} />
            </div>
            <div className="card p-4 flex flex-col gap-2">
              <h2 className="text-sm font-semibold">Steps — last 30 days</h2>
              <BarsChart
                data={rows30.map((r) => ({ date: r.date, steps: r.steps }))}
                dataKey="steps"
                name="Steps"
                color="#c98500"
                unit="steps"
              />
              <h2 className="text-sm font-semibold mt-2">Active zone minutes</h2>
              <BarsChart
                data={rows30.map((r) => ({ date: r.date, azm: r.azm }))}
                dataKey="azm"
                name="AZM"
                color="#d95926"
                unit="min"
              />
            </div>
          </section>
        </>
      )}

      <footer className="py-4 text-center text-xs" style={{ color: "var(--muted)" }}>
        Data: Google Health API · baselines are rolling 30-day mean ± 1σ
      </footer>
    </main>
  );
}
