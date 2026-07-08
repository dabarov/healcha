"use client";

import { useMemo, useState } from "react";
import {
  fmtDayLong,
  fmtSyncTime,
  pctVsBase,
  readinessColor,
  trailing,
  type DayData,
} from "@/lib/view";
import BriefCard from "./BriefCard";
import ChatCard from "./ChatCard";
import DayStats from "./DayStats";
import MetricCard, { type Metric } from "./MetricCard";
import MonthCalendar from "./MonthCalendar";
import ReadinessHero from "./ReadinessHero";
import SleepCard from "./SleepCard";
import SyncNow from "./SyncNow";
import TrendCard from "./TrendCard";

export interface DashboardProps {
  days: DayData[]; // ascending by date
  today: string;
  lastSyncAt: string | null;
  syncErrors: number;
  stepsGoal: number;
}

function deltaOf(
  value: number | null,
  base: number | null,
  upIsGood: boolean,
): { text: string; color: string } | null {
  const pct = pctVsBase(value, base);
  if (pct == null) return null;
  const up = pct >= 0;
  const good = up === upIsGood;
  return {
    text: `${up ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%`,
    color: good ? "var(--accent)" : "var(--bad)",
  };
}

export default function Dashboard({
  days,
  today,
  lastSyncAt,
  syncErrors,
  stepsGoal,
}: DashboardProps) {
  const latestDate = days.at(-1)?.date ?? today;
  const [selectedDate, setSelectedDate] = useState(latestDate);

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const day = byDate.get(selectedDate) ?? null;
  const spark14 = useMemo(() => trailing(days, selectedDate, 14), [days, selectedDate]);
  const rows30 = useMemo(() => trailing(days, selectedDate, 30), [days, selectedDate]);

  const metrics: Metric[] = [
    {
      label: "Sleep score",
      value: day?.sleepScore != null ? String(Math.round(day.sleepScore)) : "–",
      unit: "/ 100",
      delta: deltaOf(day?.sleepScore ?? null, day?.sleepScoreBase ?? null, true),
      spark: spark14.map((d) => d.sleepScore),
      color: "var(--accent2)",
      fill: "rgba(79,143,245,0.12)",
      meaning:
        "How restful that night was overall. 70+ means your body got what it needed.",
    },
    {
      label: "Resting HR",
      value: day?.restingHr != null ? String(Math.round(day.restingHr)) : "–",
      unit: "bpm",
      delta: deltaOf(day?.restingHr ?? null, day?.restingHrBase ?? null, false),
      spark: spark14.map((d) => d.restingHr),
      color: "var(--bad)",
      fill: "rgba(255,95,86,0.12)",
      meaning:
        "Your heart rate at complete rest. Lower usually means more rested and fitter.",
    },
    {
      label: "HRV",
      value: day?.hrv != null ? day.hrv.toFixed(1) : "–",
      unit: "ms",
      delta: deltaOf(day?.hrv ?? null, day?.hrvBase ?? null, true),
      spark: spark14.map((d) => d.hrv),
      color: "var(--accent)",
      fill: "rgba(34,211,160,0.12)",
      meaning:
        "Variation between heartbeats. Higher often means better recovery and a relaxed nervous system.",
    },
  ];

  const syncedLabel = fmtSyncTime(lastSyncAt);

  return (
    <div
      className="relative mx-auto max-w-[1440px] overflow-hidden px-5 pb-11 pt-8 sm:px-9"
      style={{ background: "var(--bg)" }}
    >
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-[120px] -top-[160px] h-[520px] w-[520px] rounded-full"
        style={{ background: "radial-gradient(circle, var(--glow), transparent 70%)" }}
      />

      {/* header */}
      <header className="rise relative mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-baseline gap-3.5">
          <div
            className="head text-[26px] font-bold tracking-[-0.02em]"
            style={{ color: "var(--accent)" }}
          >
            healcha
          </div>
          <div className="hidden text-[13px] sm:block" style={{ color: "var(--faint)" }}>
            train with your data
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div key={selectedDate} className="fade-in head text-base font-semibold">
              {fmtDayLong(selectedDate)}
            </div>
            <div className="num text-xs" style={{ color: "var(--faint)" }} suppressHydrationWarning>
              {syncErrors > 0 ? (
                <span style={{ color: "var(--bad)" }}>
                  {syncErrors} sync error{syncErrors > 1 ? "s" : ""} ·{" "}
                </span>
              ) : null}
              {syncedLabel ? `Synced ${syncedLabel} · Google Health` : "Never synced"}
            </div>
          </div>
          <SyncNow />
        </div>
      </header>

      {days.length === 0 ? (
        <div className="card rise rise-1 p-6 text-sm" style={{ color: "var(--mut)" }}>
          No data yet. Connect Google with <code>npm run auth:google</code>, then hit{" "}
          <b style={{ color: "var(--text)" }}>Sync now</b> — or seed a local preview with{" "}
          <code>npm run seed</code>.
        </div>
      ) : (
        <div className="relative grid items-start gap-3.5 xl:grid-cols-[minmax(0,1fr)_384px]">
          {/* main column */}
          <div className="flex min-w-0 flex-col gap-3.5">
            <div className="rise rise-1">
              <BriefCard date={selectedDate} today={today} />
            </div>

            <div className="rise rise-2">
              <ReadinessHero day={day} />
            </div>

            <div className="rise rise-3 grid gap-3.5 sm:grid-cols-3">
              {metrics.map((m) => (
                <MetricCard key={m.label} metric={m} dateKey={selectedDate} />
              ))}
            </div>

            <div className="rise rise-4">
              <DayStats
                days={days}
                selectedDate={selectedDate}
                stepsGoal={stepsGoal}
              />
            </div>

            <div className="rise rise-5">
              <TrendCard rows={rows30} />
            </div>

            <div className="rise rise-5">
              <SleepCard day={day} />
            </div>
          </div>

          {/* right rail */}
          <div className="flex min-w-0 flex-col gap-3.5">
            <div className="rise rise-2">
              <MonthCalendar
                days={days}
                today={today}
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
              />
            </div>
            <div className="rise rise-3">
              <ChatCard />
            </div>
          </div>
        </div>
      )}

      <footer
        className="pt-8 text-center text-xs"
        style={{ color: "var(--faint)" }}
      >
        Data: Google Health API · baselines are rolling 30-day mean ± 1σ · estimates,
        not medical advice
      </footer>
    </div>
  );
}

export { readinessColor };
