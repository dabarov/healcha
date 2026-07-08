"use client";

import { useMemo, useState } from "react";
import { readinessColor, readinessWord, type DayData } from "@/lib/view";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function monthOf(date: string): string {
  return date.slice(0, 7);
}
function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
/** 0 = Monday … 6 = Sunday for the 1st of the month. */
function firstWeekday(month: string): number {
  return (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
}
function monthLabel(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}
function weekdayOf(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
  });
}

/**
 * Time-travel calendar: tapping a day re-points the whole dashboard at it.
 * Dot color = that day's readiness band.
 */
export default function MonthCalendar({
  days,
  today,
  selectedDate,
  onSelect,
}: {
  days: DayData[];
  today: string;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const minMonth = days.length ? monthOf(days[0].date) : monthOf(today);
  const maxMonth = monthOf(today);
  const [month, setMonth] = useState(monthOf(selectedDate));

  const cells = useMemo(() => {
    const out: Array<string | null> = Array.from(
      { length: firstWeekday(month) },
      () => null,
    );
    for (let d = 1; d <= daysInMonth(month); d++) {
      out.push(`${month}-${String(d).padStart(2, "0")}`);
    }
    return out;
  }, [month]);

  const selected = byDate.get(selectedDate);
  const r = selected?.readiness != null ? Math.round(selected.readiness) : null;
  const onThisDay =
    selectedDate === today
      ? `Today · ${readinessWord(r).toLowerCase()}`
      : `${readinessWord(r)} · ${weekdayOf(selectedDate)}`;

  return (
    <div className="card p-5">
      <div className="mb-3.5 flex items-center justify-between">
        <span key={month} className="fade-in head text-[15px] font-semibold">
          {monthLabel(month)}
        </span>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs sm:block" style={{ color: "var(--faint)" }}>
            Tap a day to look back
          </span>
          <button
            className="btn btn-ghost px-2"
            aria-label="Previous month"
            disabled={month <= minMonth}
            onClick={() => setMonth((m) => addMonths(m, -1))}
          >
            ←
          </button>
          <button
            className="btn btn-ghost px-2"
            aria-label="Next month"
            disabled={month >= maxMonth}
            onClick={() => setMonth((m) => addMonths(m, 1))}
          >
            →
          </button>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="eyebrow text-center" style={{ fontSize: 10 }}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => {
          if (!date) return <span key={`pad-${i}`} aria-hidden />;
          const day = byDate.get(date);
          const future = date > today;
          const hasData = !!day && !future;
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const dot = hasData ? readinessColor(day.readiness) : "transparent";
          return (
            <button
              key={date}
              disabled={!hasData}
              onClick={() => onSelect(date)}
              className="day-cell num flex aspect-square flex-col items-center justify-center gap-[3px] p-0"
              style={{
                borderRadius: "var(--pill-sm)",
                border: `1px solid ${isSelected ? "var(--accent)" : isToday ? "var(--faint)" : "var(--border)"}`,
                background: isSelected ? "var(--accent-soft)" : "transparent",
                cursor: hasData ? "pointer" : "default",
              }}
              aria-label={
                hasData
                  ? `${date}, readiness ${day.readiness != null ? Math.round(day.readiness) : "unknown"}`
                  : date
              }
              aria-pressed={isSelected}
            >
              <span
                className="text-xs"
                style={{
                  color: future || !day ? "var(--faint)" : "var(--text)",
                  fontWeight: isSelected ? 700 : 400,
                }}
              >
                {Number(date.slice(8))}
              </span>
              <span
                aria-hidden
                className="h-[5px] w-[5px] rounded-full"
                style={{ background: dot }}
              />
            </button>
          );
        })}
      </div>

      <div
        className="mt-3.5 flex items-center justify-between border-t pt-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <div className="eyebrow">Readiness that day</div>
          <div key={selectedDate} className="fade-in mt-0.5 text-[13px]" style={{ color: "var(--mut)" }}>
            {onThisDay}
          </div>
        </div>
        <div
          key={`${selectedDate}-num`}
          className="fade-in num text-[26px] font-bold"
          style={{ color: readinessColor(r) }}
        >
          {r ?? "–"}
        </div>
      </div>
    </div>
  );
}
