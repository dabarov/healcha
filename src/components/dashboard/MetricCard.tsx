"use client";

import { buildLine } from "@/lib/linepath";

export interface Metric {
  label: string;
  value: string;
  unit: string;
  delta: { text: string; color: string } | null;
  spark: Array<number | null>;
  color: string;
  fill: string;
  meaning: string;
}

const W = 240;
const H = 42;

export default function MetricCard({
  metric,
  dateKey,
}: {
  metric: Metric;
  dateKey: string;
}) {
  const vals = metric.spark.filter((v): v is number => v != null);
  const line = buildLine(vals, W, H, 4);

  return (
    <div className="card min-w-0 p-5">
      <div className="mb-0.5 flex items-center justify-between">
        <span className="eyebrow">{metric.label}</span>
        {metric.delta && (
          <span
            key={`${dateKey}-delta`}
            className="fade-in num text-xs"
            style={{ color: metric.delta.color }}
          >
            {metric.delta.text}
          </span>
        )}
      </div>
      <div className="mb-0.5 mt-1.5 flex items-baseline gap-1.5">
        <span
          key={dateKey}
          className="fade-in num text-[34px] font-bold leading-none"
        >
          {metric.value}
        </span>
        <span className="num text-[13px]" style={{ color: "var(--faint)" }}>
          {metric.unit}
        </span>
      </div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="my-2 block"
        aria-hidden
      >
        {line && (
          <>
            <path d={line.area} fill={metric.fill} />
            <path
              d={line.d}
              fill="none"
              stroke={metric.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
      </svg>
      <p className="m-0 text-[12.5px] leading-normal" style={{ color: "var(--mut)" }}>
        {metric.meaning}
      </p>
    </div>
  );
}
