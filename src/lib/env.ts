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
