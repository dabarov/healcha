"use client";

import {
  Area,
  Bar,
  BarChart,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { BandPoint } from "@/lib/queries";

/**
 * Chart building blocks. Marks per dataviz spec: 2px lines, hairline solid
 * gridlines, baseline band as a ~12% wash, bars ≤24px with rounded data-ends,
 * text in ink tokens (never series-colored).
 */

const INK2 = "#c3c2b7";
const MUTED = "#898781";
const GRID = "#2c2c2a";
const SURFACE = "#1a1a19";

const axisProps = {
  stroke: "transparent",
  tick: { fill: MUTED, fontSize: 11 },
  tickLine: false,
} as const;

function tooltipStyle() {
  return {
    contentStyle: {
      background: SURFACE,
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      fontSize: 12,
      color: INK2,
    },
    labelStyle: { color: "#fff", fontWeight: 600 },
    itemStyle: { color: INK2 },
  };
}

function shortDate(d: string): string {
  return d.slice(5); // MM-DD
}

export function BaselineChart({
  data,
  color,
  unit,
  valueName,
}: {
  data: BandPoint[];
  color: string;
  unit: string;
  valueName: string;
}) {
  const chartData = data.map((d) => ({
    ...d,
    band: d.low != null && d.high != null ? [d.low, d.high] : undefined,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={32} />
        <YAxis {...axisProps} domain={["auto", "auto"]} width={48} />
        <Tooltip
          {...tooltipStyle()}
          formatter={(value: unknown, name?: unknown) => {
            if (Array.isArray(value)) {
              return [`${Number(value[0]).toFixed(1)}–${Number(value[1]).toFixed(1)} ${unit}`, "baseline ±1σ"];
            }
            return [`${Number(value).toFixed(1)} ${unit}`, String(name ?? "")];
          }}
        />
        {/* 30-day baseline band: mean ± 1 SD as a quiet wash */}
        <Area
          type="monotone"
          dataKey="band"
          name="baseline ±1σ"
          stroke="none"
          fill={color}
          fillOpacity={0.12}
          connectNulls
          activeDot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="mean"
          name="30-day mean"
          stroke={MUTED}
          strokeWidth={1}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={valueName}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          dot={false}
          connectNulls
          activeDot={{ r: 4, stroke: SURFACE, strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export interface SleepStageRow {
  date: string;
  deep: number | null;
  rem: number | null;
  light: number | null;
  awake: number | null;
}

export function SleepStagesChart({ data }: { data: SleepStageRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={32} />
        <YAxis
          {...axisProps}
          width={48}
          tickFormatter={(v: number) => `${(v / 60).toFixed(0)}h`}
        />
        <Tooltip
          {...tooltipStyle()}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value: unknown, name?: unknown) => [`${Math.round(Number(value))} min`, String(name ?? "")]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: INK2 }} iconSize={10} />
        {/* surface-colored strokes stand in for the 2px stack gap */}
        <Bar dataKey="deep" name="Deep" stackId="s" fill="#3987e5" stroke={SURFACE} strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="rem" name="REM" stackId="s" fill="#9085e9" stroke={SURFACE} strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="light" name="Light" stackId="s" fill="#199e70" stroke={SURFACE} strokeWidth={1} maxBarSize={24} isAnimationActive={false} />
        <Bar dataKey="awake" name="Awake" stackId="s" fill="#52514e" stroke={SURFACE} strokeWidth={1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function BarsChart({
  data,
  dataKey,
  name,
  color,
  unit,
}: {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  name: string;
  color: string;
  unit: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="30%">
        <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
        <XAxis dataKey="date" {...axisProps} tickFormatter={shortDate} minTickGap={32} />
        <YAxis {...axisProps} width={48} />
        <Tooltip
          {...tooltipStyle()}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          formatter={(value: unknown) => [`${Math.round(Number(value)).toLocaleString()} ${unit}`, name]}
        />
        <Bar dataKey={dataKey} name={name} fill={color} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
