"use client";

import { fmtHM, type DayData } from "@/lib/view";

const STAGES = [
  { key: "deepMinutes", name: "Deep", color: "var(--accent2)", note: "physical repair" },
  { key: "remMinutes", name: "REM", color: "var(--accent)", note: "mind & memory" },
  { key: "lightMinutes", name: "Light", color: "rgba(79,143,245,0.5)", note: "the in-between" },
  { key: "awakeMinutes", name: "Awake", color: "var(--warn)", note: "brief stirs" },
] as const;

function clockOf(ts: string | null): string {
  return ts && ts.length >= 16 ? ts.slice(11, 16) : "–";
}

export default function SleepCard({ day }: { day: DayData | null }) {
  const mins = STAGES.map((s) => ({
    ...s,
    minutes: (day?.[s.key] as number | null) ?? null,
  }));
  const total = mins.reduce((a, s) => a + (s.minutes ?? 0), 0);
  const hasStages = total > 0;

  const asleepH = day?.sleepMinutes != null ? (day.sleepMinutes / 60).toFixed(1) : null;
  const inBed =
    day?.sleepMinutes != null
      ? day.sleepMinutes + (day.awakeMinutes ?? 0)
      : null;
  const eff = day?.sleepEfficiency != null ? Math.round(day.sleepEfficiency) : null;
  const awake = day?.awakeMinutes ?? null;
  const stirNote =
    awake == null ? "" : awake <= 20 ? " · barely woke up" : ` · ${fmtHM(awake)} awake`;

  return (
    <div className="card p-5">
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <div>
          <div className="head mb-0.5 text-base font-semibold">That night&apos;s sleep</div>
          <div key={day?.date} className="fade-in text-xs" style={{ color: "var(--faint)" }}>
            {inBed != null
              ? `${fmtHM(inBed)} in bed${eff != null ? ` · ${eff}% efficiency` : ""}${stirNote}`
              : "No sleep recorded for this night."}
          </div>
        </div>
        <div className="num text-[22px] font-bold" style={{ color: "var(--accent2)" }}>
          {asleepH ?? "–"}
          <span className="text-[13px]" style={{ color: "var(--faint)" }}>
            h
          </span>
        </div>
      </div>

      {hasStages ? (
        <>
          <div className="mb-3.5 flex h-4 overflow-hidden rounded-[8px]">
            {mins
              .filter((s) => (s.minutes ?? 0) > 0)
              .map((s) => (
                <div
                  key={s.name}
                  style={{
                    width: `${((s.minutes as number) / total) * 100}%`,
                    background: s.color,
                    transition: "width 400ms var(--ease-in-out)",
                  }}
                />
              ))}
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            {mins.map((s) => (
              <div key={s.name}>
                <div className="mb-[3px] flex items-center gap-[7px]">
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-[2px]"
                    style={{ background: s.color }}
                  />
                  <span className="text-xs" style={{ color: "var(--mut)" }}>
                    {s.name}
                  </span>
                </div>
                <div
                  key={`${day?.date}-${s.name}`}
                  className="fade-in num pl-[15px] text-[15px] font-semibold"
                >
                  {s.minutes != null ? fmtHM(s.minutes) : "–"}
                </div>
                <div className="pl-[15px] text-[11px]" style={{ color: "var(--faint)" }}>
                  {s.note}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : day?.sleepMinutes != null ? (
        /* device reports no stage detail — show the night's shape instead */
        <div className="flex flex-wrap gap-x-7 gap-y-3">
          {[
            { label: "Went to bed", value: clockOf(day.bedtime) },
            { label: "Woke up", value: clockOf(day.wakeTime) },
            { label: "Time asleep", value: fmtHM(day.sleepMinutes) },
            {
              label: "Efficiency",
              value: eff != null ? `${eff}%` : "–",
            },
          ].map((s) => (
            <div key={s.label}>
              <div className="eyebrow mb-[3px]">{s.label}</div>
              <div
                key={`${day.date}-${s.label}`}
                className="fade-in num text-[15px] font-semibold"
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="grid h-[88px] place-items-center rounded-[10px] text-xs"
          style={{ background: "var(--bg)", color: "var(--faint)" }}
        >
          No sleep recorded for this night.
        </div>
      )}
    </div>
  );
}
