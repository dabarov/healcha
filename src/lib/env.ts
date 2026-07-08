/** Read a required env var, throwing a clear error when missing. */
export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function envOr(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const APP_TIMEZONE = () =>
  process.env.APP_TIMEZONE || process.env.TZ || "UTC";

export const ANTHROPIC_MODEL = () =>
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

export const APP_URL = () =>
  (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/** Daily step goal for the "Your day" ring. Default 9000. */
export const STEPS_GOAL = () => {
  const g = Number(process.env.STEPS_GOAL);
  return Number.isFinite(g) && g > 0 ? Math.round(g) : 9000;
};

/** Age drives HR-max (Tanaka) for zone boundaries + TRIMP. Default 30. */
export const USER_AGE = () => {
  const a = Number(process.env.HEALCHA_AGE);
  return Number.isFinite(a) && a > 0 && a < 120 ? a : 30;
};

/**
 * Ignore all data before this local calendar date (YYYY-MM-DD) — e.g. after a
 * device switch or when older history is noise. Every dashboard query clamps
 * its window to this floor. Unset ⇒ no cutoff.
 */
export const DATA_START_DATE = (): string | null => {
  const v = process.env.DATA_START_DATE;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
};
