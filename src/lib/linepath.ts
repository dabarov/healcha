/**
 * Smooth SVG line/area path builder (client-safe, no deps). Midpoint-anchored
 * cubic segments give the mockup's rounded "sporty" line without overshoot.
 */

export interface LinePath {
  d: string;
  area: string;
  last: [number, number];
  min: number;
  max: number;
  meanY: number;
}

export function buildLine(
  vals: number[],
  w: number,
  h: number,
  pad: number,
): LinePath | null {
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = max - min || 1;
  const n = vals.length;
  const X = (i: number) => pad + (i / (n - 1)) * (w - 2 * pad);
  const Y = (v: number) => pad + (1 - (v - min) / rng) * (h - 2 * pad);
  const pts = vals.map((v, i) => [X(i), Y(v)] as [number, number]);

  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = ((x0 + x1) / 2).toFixed(1);
    d += ` C ${cx} ${y0.toFixed(1)} ${cx} ${y1.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }
  const area =
    d +
    ` L ${pts[n - 1][0].toFixed(1)} ${(h - pad).toFixed(1)}` +
    ` L ${pts[0][0].toFixed(1)} ${(h - pad).toFixed(1)} Z`;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  return { d, area, last: pts[n - 1], min, max, meanY: Y(mean) };
}
