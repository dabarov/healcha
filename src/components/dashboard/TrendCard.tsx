"use client";

import { useState } from "react";
import { buildLine } from "@/lib/linepath";
import { fmtDayShort, type DayData } from "@/lib/view";

const W = 760;
const H = 220;
const PAD = 14;

type TabKey = "readiness" | "sleep" | "rhr" | "hrv";

interface TabMeta {
  key: TabKey;
  label: string;
  color: string;
  fill: string;
  pick: (d: DayData) => number | null;
  /** upIsGood drives the caption wording */
  upIsGood: boolean;
  noun: string;
}

const TABS: TabMeta[] = [
  {
    key: "readiness",
    label: "Readiness",
    color: "var(--accent)",
    fill: "rgba(34,211,160,0.10)",
    pick: (d) => d.readiness,
    upIsGood: true,
    noun: "Readiness",
  },
  {
    key: "sleep",
    label: "Sleep",
    color: "var(--accent2)",
    fill: "rgba(79,143,245,0.10)",
    pick: (d) => d.sleepScore,
    upIsGood: true,
    noun: "Sleep score",
  },
  {
    key: "rhr",
    label: "Resting HR",
    color: "var(--bad)",
    fill: "rgba(255,95,86,0.10)",
    pick: (d) => d.restingHr,
    upIsGood: false,
    noun: "Resting HR",
  },
  {
    key: "hrv",
    label: "HRV",
    color: "var(--accent)",
    fill: "rgba(34,211,160,0.10)",
    pick: (d) => d.hrv,
    upIsGood: true,
    noun: "HRV",
  },
];

function caption(tab: TabMeta, vals: number[]): string {
  if (vals.length < 5) return "Not enough history in this window yet.";
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const recent = vals.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vals.length);
  const pct = mean === 0 ? 0 : ((recent - mean) / Math.abs(mean)) * 100;
  if (Math.abs(pct) <= 3) return `${tab.noun} holding steady around your average.`;
  const rising = pct > 0;
  const good = rising === tab.upIsGood;
  const dir = rising ? "riding above" : "dipping below";
  return good
    ? `${tab.noun} ${dir} your 30-day average — trending the right way.`
    : `${tab.noun} ${dir} your 30-day average — recovery may be lagging.`;
}

export default function TrendCard({ rows }: { rows: DayData[] }) {
  const [tabKey, setTabKey] = useState<TabKey>("readiness");
  const tab = TABS.find((t) => t.key === tabKey)!;

  const points = rows
    .map((d) => ({ date: d.date, v: tab.pick(d) }))
    .filter((p): p is { date: string; v: number } => p.v != null);
  const vals = points.map((p) => p.v);
  const line = buildLine(vals, W, H, PAD);

  const yLabels = line
    ? [
        line.max,
        line.max - (line.max - line.min) / 3,
        line.min + (line.max - line.min) / 3,
        line.min,
      ].map((v) => Math.round(v).toString())
    : [];
  const gridYs = [0.15, 0.38, 0.62, 0.85].map((f) => (f * H).toFixed(0));
  const xLabels =
    points.length >= 2
      ? [
          points[0].date,
          points[Math.floor((points.length - 1) / 2)].date,
          points[points.length - 1].date,
        ].map(fmtDayShort)
      : [];

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="head mb-0.5 text-base font-semibold">30-day trend</div>
          <div key={tabKey} className="fade-in text-xs" style={{ color: "var(--faint)" }}>
            {caption(tab, vals)}
          </div>
        </div>
        <div
          className="flex gap-1.5 rounded-[8px] p-1"
          style={{ background: "var(--bg)", border: "1px solid var(--border)" }}
          role="tablist"
          aria-label="Trend metric"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === tabKey}
              data-active={t.key === tabKey}
              className="tab-btn"
              onClick={() => setTabKey(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {line ? (
        <div className="flex gap-3.5">
          <div
            className="num flex flex-col justify-between pb-[26px] pt-2 text-[11px]"
            style={{ color: "var(--faint)" }}
            aria-hidden
          >
            {yLabels.map((y, i) => (
              <span key={i}>{y}</span>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <svg
              width="100%"
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="block"
              role="img"
              aria-label={`${tab.label} over the last 30 days`}
            >
              {gridYs.map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2={W}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth="1"
                />
              ))}
              <line
                x1="0"
                y1={line.meanY.toFixed(1)}
                x2={W}
                y2={line.meanY.toFixed(1)}
                stroke="var(--faint)"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              {/* remount per tab: area fades, line draws itself in */}
              <g key={tabKey}>
                <path className="fade-in" d={line.area} fill={tab.fill} />
                <path
                  className="draw-line"
                  d={line.d}
                  pathLength={1}
                  fill="none"
                  stroke={tab.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  className="fade-in"
                  cx={line.last[0].toFixed(1)}
                  cy={line.last[1].toFixed(1)}
                  r="5"
                  fill={tab.color}
                  stroke="var(--card)"
                  strokeWidth="3"
                />
              </g>
            </svg>
            <div
              className="num mt-1.5 flex justify-between text-[11px]"
              style={{ color: "var(--faint)" }}
            >
              {xLabels.map((x, i) => (
                <span key={i}>{x}</span>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div
          className="grid h-[220px] place-items-center rounded-[10px] text-xs"
          style={{ background: "var(--bg)", color: "var(--faint)" }}
        >
          Not enough {tab.label} data in this window yet.
        </div>
      )}
    </div>
  );
}
