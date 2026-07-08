"use client";

import { useMemo } from "react";
import { sleepBalance, socialJetlag } from "@/lib/derived";
import { moveStreak, trailing, type DayData } from "@/lib/view";

/** "Your day" row: steps vs goal + the personal fun stats. */
export default function DayStats({
  days,
  selectedDate,
  stepsGoal,
}: {
  days: DayData[];
  selectedDate: string;
  stepsGoal: number;
}) {
  const day = days.find((d) => d.date === selectedDate) ?? null;

  const { debt, need, jetlag, streak } = useMemo(() => {
    const rows30 = trailing(days, selectedDate, 30);
    const balance = sleepBalance(rows30);
    return {
      debt: balance.series.at(-1)?.debtHours ?? null,
      need: balance.need,
      jetlag: socialJetlag(rows30),
      streak: moveStreak(days, selectedDate),
    };
  }, [days, selectedDate]);

  const steps = day?.steps ?? null;
  const pct = steps != null ? Math.min(100, Math.round((steps / stepsGoal) * 100)) : 0;
  const remaining = steps != null ? Math.max(0, stepsGoal - steps) : null;
  const walkMin = remaining != null ? Math.max(5, Math.round(remaining / 100 / 5) * 5) : null;
  const stepsNote =
    steps == null
      ? "No step data for this day."
      : pct >= 100
        ? "Ring closed — goal reached. Keep the streak rolling."
        : `${pct}% to your daily ring — a brisk ${walkMin}-minute walk closes it.`;

  const shortNights = debt != null && need > 0 ? Math.max(1, Math.round(debt / (need / 60))) : null;
  const jetlagMin = jetlag.hours != null ? Math.round(jetlag.hours * 60) : null;

  const funStats = [
    {
      label: "Sleep debt",
      value: debt != null ? debt.toFixed(1) : "–",
      unit: "h",
      color: "var(--accent2)",
      note:
        debt == null
          ? "Needs a couple weeks of sleep data."
          : debt < 2
            ? "Nearly settled — your sleep bank is balanced."
            : `≈ ${shortNights} short night${shortNights === 1 ? "" : "s"} owed. One early bedtime pays most of it back.`,
    },
    {
      label: "Social jetlag",
      value: jetlag.hours != null ? jetlag.hours.toFixed(1) : "–",
      unit: "h",
      color: "var(--warn)",
      note:
        jetlagMin == null
          ? "Needs weekday and weekend nights to compare."
          : jetlagMin < 30
            ? "Weekend and weekday body clocks are nearly in sync."
            : `Your weekend body clock runs ~${jetlagMin} min off your weekday one.`,
    },
    {
      label: "Move streak",
      value: String(streak),
      unit: streak === 1 ? "day" : "days",
      color: "var(--accent)",
      note:
        streak === 0
          ? "Start one today — even a 5-min walk counts."
          : "Even a 5-min walk keeps it alive.",
    },
  ];

  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2.5 pl-0.5">
        <span className="head text-[15px] font-bold uppercase tracking-[0.06em]">
          Your day
        </span>
        <span className="text-xs" style={{ color: "var(--faint)" }}>
          the little things that make it yours
        </span>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        {/* steps */}
        <div className="card p-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="eyebrow">Steps</span>
            <span className="num text-xs" style={{ color: "var(--faint)" }}>
              goal {stepsGoal.toLocaleString()}
            </span>
          </div>
          <div className="mb-3 flex items-baseline gap-1.5">
            <span
              key={selectedDate}
              className="fade-in num text-[34px] font-bold leading-none"
              style={{ color: "var(--accent)" }}
            >
              {steps != null ? steps.toLocaleString() : "–"}
            </span>
          </div>
          <div
            className="mb-2.5 h-[9px] overflow-hidden rounded-[8px]"
            style={{ background: "var(--bg)" }}
          >
            <div
              className="h-full rounded-[8px]"
              style={{
                width: `${pct}%`,
                background: "var(--accent)",
                transition: "width 500ms var(--ease-out)",
              }}
            />
          </div>
          <p className="m-0 text-[12.5px] leading-normal" style={{ color: "var(--mut)" }}>
            {stepsNote}
          </p>
        </div>

        {/* fun stats */}
        {funStats.map((f) => (
          <div key={f.label} className="card flex flex-col p-5">
            <div className="mb-1 flex items-center gap-[7px]">
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full"
                style={{ background: f.color }}
              />
              <span className="eyebrow">{f.label}</span>
            </div>
            <div className="mb-2.5 mt-0.5 flex items-baseline gap-1.5">
              <span
                key={`${selectedDate}-${f.label}`}
                className="fade-in num text-[30px] font-bold leading-none"
              >
                {f.value}
              </span>
              <span className="num text-[13px]" style={{ color: "var(--faint)" }}>
                {f.unit}
              </span>
            </div>
            <p
              className="m-0 mt-auto text-xs leading-normal"
              style={{ color: "var(--mut)" }}
            >
              {f.note}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
