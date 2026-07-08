"use client";

import { useEffect, useState } from "react";
import {
  fmtHM,
  pctVsBase,
  readinessColor,
  readinessWord,
  type DayData,
} from "@/lib/view";

const R = 60;
const CIRC = 2 * Math.PI * R;

/** Driver status color vs its rolling baseline (±3% ≈ normal). */
function toneVsBase(
  value: number | null,
  base: number | null,
  upIsGood: boolean,
): string {
  const pct = pctVsBase(value, base);
  if (pct == null) return "var(--faint)";
  if (Math.abs(pct) <= 3) return "var(--accent)";
  const good = pct >= 0 === upIsGood;
  return good ? "var(--accent)" : Math.abs(pct) <= 7 ? "var(--warn)" : "var(--bad)";
}

export default function ReadinessHero({ day }: { day: DayData | null }) {
  // Draw the ring in from empty on first paint; later changes retarget the
  // same transition (interruptible, no restart-from-zero).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const value = day?.readiness != null ? Math.round(day.readiness) : null;
  const color = readinessColor(value);
  const offset = value != null ? CIRC * (1 - value / 100) : CIRC;

  const base = day?.readinessBase ?? null;
  const delta = value != null && base != null ? Math.round(value - base) : null;
  const deltaUp = (delta ?? 0) >= 0;

  const drivers = [
    {
      label: "Sleep",
      value: day?.sleepMinutes != null ? fmtHM(day.sleepMinutes) : "–",
      color:
        day?.sleepScore != null ? readinessColor(day.sleepScore) : "var(--faint)",
    },
    {
      label: "Resting HR",
      value: day?.restingHr != null ? `${Math.round(day.restingHr)} bpm` : "–",
      color: toneVsBase(day?.restingHr ?? null, day?.restingHrBase ?? null, false),
    },
    {
      label: "HRV",
      value: day?.hrv != null ? `${day.hrv.toFixed(1)} ms` : "–",
      color: toneVsBase(day?.hrv ?? null, day?.hrvBase ?? null, true),
    },
  ];

  return (
    <div className="card flex flex-col items-center gap-7 p-5 sm:flex-row">
      <div className="relative shrink-0">
        <svg width="150" height="150" viewBox="0 0 150 150" role="img" aria-label={`Readiness ${value ?? "unknown"} out of 100`}>
          <circle cx="75" cy="75" r={R} fill="none" stroke="var(--track)" strokeWidth="12" />
          <circle
            cx="75"
            cy="75"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={mounted ? offset : CIRC}
            transform="rotate(-90 75 75)"
            style={{
              transition:
                "stroke-dashoffset 600ms var(--ease-out), stroke 300ms ease",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div
            key={day?.date}
            className="fade-in num text-[44px] font-bold leading-none"
            style={{ color }}
          >
            {value ?? "–"}
          </div>
          <div className="num text-xs" style={{ color: "var(--faint)" }}>
            / 100
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <span className="head text-xl font-semibold">
            Readiness · {readinessWord(value)}
          </span>
          {delta != null && (
            <span
              className="num rounded-[8px] px-2.5 py-[3px] text-xs"
              style={{
                color: deltaUp ? "var(--accent)" : "var(--bad)",
                background: deltaUp ? "var(--accent-soft)" : "var(--bad-soft)",
              }}
            >
              {deltaUp ? "▲" : "▼"} {Math.abs(delta)} vs 30-day
            </span>
          )}
        </div>
        <p
          className="m-0 mb-3.5 max-w-[560px] text-sm leading-[1.6]"
          style={{ color: "var(--mut)" }}
        >
          A single 0–100 score for how ready your body is to take on stress today.
          It rolls up your sleep, resting heart rate and HRV so you don&apos;t have to
          read each number yourself.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {drivers.map((d) => (
            <div key={d.label}>
              <div className="eyebrow mb-1">{d.label}</div>
              <div className="flex items-center gap-[7px]">
                <span
                  aria-hidden
                  className="h-[7px] w-[7px] rounded-full"
                  style={{
                    background: d.color,
                    transition: "background-color 300ms ease",
                  }}
                />
                <span key={`${day?.date}-${d.label}`} className="fade-in num text-sm font-semibold">
                  {d.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
