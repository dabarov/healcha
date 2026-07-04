/** Stat tile: label · value · delta vs 30-day baseline · sparkline. Server-rendered. */

interface Props {
  label: string;
  value: number | null;
  unit?: string;
  digits?: number;
  baseline: number | null;
  z: number | null;
  /** true when a higher value is good (HRV) — resting HR passes false */
  upIsGood: boolean;
  color: string; // CSS var reference for the sparkline / accent
  spark: Array<number | null>; // last ~14 days, oldest first
}

function Sparkline({ data, color }: { data: Array<number | null>; color: string }) {
  const values = data.filter((v): v is number => v != null);
  if (values.length < 2) return <div className="h-8" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const w = 120;
  const h = 32;
  const pts: string[] = [];
  data.forEach((v, i) => {
    if (v == null) return;
    const x = (i / (data.length - 1)) * (w - 8) + 4;
    const y = h - 5 - ((v - min) / span) * (h - 10);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  });
  const last = pts.at(-1)?.split(",").map(Number);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none" aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--surface)" />
          <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
        </>
      )}
    </svg>
  );
}

export default function KpiCard({
  label,
  value,
  unit = "",
  digits = 0,
  baseline,
  z,
  upIsGood,
  color,
  spark,
}: Props) {
  const deltaPct =
    value != null && baseline != null && baseline !== 0
      ? ((value - baseline) / baseline) * 100
      : null;
  const isGood = deltaPct != null ? (deltaPct >= 0) === upIsGood : null;
  const notable = z != null && Math.abs(z) >= 1;

  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold">
          {value != null ? value.toFixed(digits) : "–"}
        </span>
        {unit && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {unit}
          </span>
        )}
      </div>
      <div className="text-xs h-4" style={{ color: "var(--ink-2)" }}>
        {deltaPct != null ? (
          <span style={{ color: isGood ? "var(--good)" : "var(--bad)" }}>
            {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(0)}%{" "}
            <span style={{ color: "var(--muted)" }}>
              vs 30-day avg{notable ? " · unusual" : ""}
            </span>
          </span>
        ) : (
          <span style={{ color: "var(--muted)" }}>no baseline yet</span>
        )}
      </div>
      <Sparkline data={spark} color={color} />
    </div>
  );
}
