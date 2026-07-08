# healcha — UI Style Reference

**Voice: "sporty."** Train-with-your-data. Near-black canvas, one teal accent,
a single grotesque family (Archivo) doing every job, uppercase micro-labels,
big tabular numbers. Color is reserved for data and status — the chrome stays
dark and quiet. The dashboard is one screen: everything on it is live data,
and the calendar time-travels the whole page.

## Tokens — Colors

| token            | value                     | use                                    |
| ---------------- | ------------------------- | -------------------------------------- |
| `--bg`           | `#0a0b0d`                 | page canvas, insets (chart wells, input fills) |
| `--card`         | `#12161b`                 | card surfaces                          |
| `--border`       | `#212831`                 | 1px hairlines, chart grid              |
| `--track`        | `#212831`                 | empty ring / bar tracks                |
| `--text`         | `#f2f5f8`                 | primary ink                            |
| `--mut`          | `#94a0ad`                 | secondary copy (meanings, notes)       |
| `--faint`        | `#5b6570`                 | labels, axes, disabled                 |
| `--accent`       | `#22d3a0`                 | brand, recovered, primary CTA          |
| `--accent2`      | `#4f8ff5`                 | sleep / secondary series               |
| `--warn`         | `#f0b23e`                 | fair readiness, caution                |
| `--bad`          | `#ff5f56`                 | strained, resting-HR series, errors    |
| `--accent-soft`  | `rgba(34,211,160,.18)`    | selected calendar day, delta-pill bg   |
| `--glow`         | `rgba(34,211,160,.11)`    | ambient radial glow, top-right         |
| `--brief-bg/border` | teal at 6% / 30%       | the AI brief card only                 |

Readiness bands drive status color everywhere: **≥70 accent · ≥50 warn · <50
bad** (`readinessColor` in `src/lib/view.ts`).

## Tokens — Typography

One family: **Archivo** (400–800, `--font-archivo`). No face changes — hierarchy
comes from weight, size, case and tracking.

- Wordmark: 26px / 700 / -0.02em, accent color.
- Hero numbers: 30–44px / 700, `tabular-nums` (`.num`).
- Card titles: 15–16px / 600 (`.head`).
- Micro-labels (`.eyebrow`): 11px / 500 / uppercase / +0.07em, faint.
- Body & meanings: 12.5–15px / 400, `--mut`, line-height ~1.6.
- Buttons: 13px / 600 / uppercase / +0.06em.

## Tokens — Shape

Radius 14px cards · 8px pills/buttons · 7px calendar cells · 10px chat bubbles.
Borders are 1px `--border`; no shadows — depth comes from surface steps
(`--bg` → `--card`) and the single ambient glow.

## Motion

Strong curves, short durations, GPU-only properties:

- `--ease-out: cubic-bezier(0.23,1,0.32,1)` for entrances/feedback;
  `--ease-in-out: cubic-bezier(0.77,0,0.175,1)` for on-screen morphs.
- Press feedback: `scale(0.97)` on every pressable (`.btn`, `.chip`, `.tab-btn`,
  `.day-cell`), 140ms.
- Page sections rise in once, 40ms stagger (`.rise`, decorative only).
- Day travel re-keys values → 200ms opacity fade (`.fade-in` via
  `@starting-style`); the readiness ring **transitions** `stroke-dashoffset`
  600ms (interruptible, never restarts from zero).
- Trend tab switch remounts the plot: area fades, line draws in via
  `pathLength=1` dashoffset (`.draw-line`, 600ms).
- Chat bubbles enter with 6px rise + fade (`.bubble-in`).
- Hover states gated behind `(hover:hover) and (pointer:fine)`;
  `prefers-reduced-motion` strips transforms, keeps opacity.

## Layout

Max 1440px, 34–38px page padding. Two columns on `xl`: main `1fr` + right rail
`384px`, `gap: 14px`. Main: brief → readiness hero → 3 metric cards → "Your
day" (steps 1.4fr + 3 fun stats) → 30-day trend → sleep card. Rail: calendar →
chat. Stacks to one column below `xl`.

## Components

- **Brief card** — teal-washed card, pulse dot, uppercase title, ghost
  "Regenerate"; body is the cached AI daily summary for the selected day.
- **Readiness hero** — 150px ring (r=60, stroke 12, round caps), band-colored;
  delta pill vs 30-day baseline; three drivers with status dots.
- **Metric card** — eyebrow + delta %, 34px number, 42px sparkline
  (smooth bezier, `src/lib/linepath.ts`), one-sentence plain-English meaning.
- **Trend card** — segmented tabs (active = `--card` fill), 220px plot with
  hairline grid, dashed mean line, area fill at 10% alpha, 3px line, end dot.
- **Calendar** — 7-col grid, per-day readiness dot, selected = accent border +
  soft fill, future/no-data faint & disabled; footer echoes the selected day.
- **Chat** — inline card: greeting bubble, user bubbles in accent on dark text,
  assistant bubbles on `--bg`, suggestion chips, 42px square send button.

## Do / Don't

- **Do** express every metric relative to the personal 30-day baseline.
- **Do** keep copy jargon-free and second-person ("your body clock…").
- **Do** let charts be flat: no axis boxes, no legends where color + label do.
- **Don't** introduce a second accent for chrome; teal is the only brand color.
- **Don't** animate keyboard-driven actions or exceed ~300ms on UI motion.
- **Don't** use pure white or pure black; stay within the token ramp.
