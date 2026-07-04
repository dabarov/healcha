import { getAccessToken } from "./oauth";

/**
 * Thin client for the Google Health API (https://health.googleapis.com/v4) —
 * the replacement for the legacy Fitbit Web API. Only the read surface is
 * used: list (raw points, paginated) and dailyRollUp (daily aggregates).
 */

const BASE = "https://health.googleapis.com/v4";

export type FilterKind =
  | "interval" // {type}.interval.civil_start_time
  | "interval_end" // sleep supports only end-time filters
  | "sample" // {type}.sample_time.civil_time
  | "daily" // {type}.date
  | "none"; // no server-side filter (filter client-side)

/** JSON payloads come back with camelCase keys. */
export type DataPoint = Record<string, unknown>;

function camelCase(dataType: string): string {
  return dataType.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

async function healthFetch(path: string, init?: RequestInit): Promise<Response> {
  let token = await getAccessToken();
  let res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    // Access token may have been revoked between refresh checks — refresh once.
    token = await getAccessToken();
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  }
  if (res.status === 429 || res.status >= 500) {
    const retryAfter = Number(res.headers.get("retry-after") ?? 5);
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    });
  }
  return res;
}

/**
 * Builds an AIP-160 filter for "everything with civil time in [from, to)".
 * `from`/`to` are civil strings (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss).
 */
function buildFilter(prefix: string, kind: FilterKind, from: string, to: string): string | null {
  switch (kind) {
    case "interval":
      return `${prefix}.interval.civil_start_time >= "${from}" AND ${prefix}.interval.civil_start_time < "${to}"`;
    case "interval_end":
      return `${prefix}.interval.civil_end_time >= "${from}" AND ${prefix}.interval.civil_end_time < "${to}"`;
    case "sample":
      return `${prefix}.sample_time.civil_time >= "${from}" AND ${prefix}.sample_time.civil_time < "${to}"`;
    case "daily":
      return `${prefix}.date >= "${from.slice(0, 10)}" AND ${prefix}.date < "${to.slice(0, 10)}"`;
    case "none":
      return null;
  }
}

export interface ListOptions {
  kind: FilterKind;
  /** civil from (inclusive) / to (exclusive) */
  from: string;
  to: string;
  pageSize?: number;
}

/**
 * Lists all data points of a type in a civil time range, following
 * nextPageToken until exhausted (heart rate arrives at ~5s resolution, so
 * this can span many pages).
 *
 * The docs show both camelCase and snake_case filter prefixes; we try
 * camelCase first and retry once with snake_case if the API rejects it.
 */
export async function listDataPoints(dataType: string, opts: ListOptions): Promise<DataPoint[]> {
  const prefixes = [camelCase(dataType), dataType.replace(/-/g, "_")];
  let lastError: string | null = null;

  for (const prefix of prefixes) {
    const filter = buildFilter(prefix, opts.kind, opts.from, opts.to);
    const points: DataPoint[] = [];
    let pageToken: string | undefined;
    let failedFilter = false;

    do {
      const params = new URLSearchParams();
      if (filter) params.set("filter", filter);
      if (opts.pageSize) params.set("pageSize", String(opts.pageSize));
      if (pageToken) params.set("pageToken", pageToken);
      const res = await healthFetch(
        `/users/me/dataTypes/${dataType}/dataPoints?${params.toString()}`,
      );
      if (!res.ok) {
        const body = await res.text();
        lastError = `${res.status} ${body.slice(0, 500)}`;
        if (res.status === 400 && filter) {
          failedFilter = true; // try the other prefix casing
          break;
        }
        throw new Error(`list ${dataType} failed: ${lastError}`);
      }
      const data = (await res.json()) as { dataPoints?: DataPoint[]; nextPageToken?: string };
      points.push(...(data.dataPoints ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    if (!failedFilter) return points;
  }
  throw new Error(`list ${dataType} failed with both filter casings: ${lastError}`);
}

export interface RollupPoint {
  civilStartTime?: string;
  startTime?: string;
  [k: string]: unknown;
}

/** Daily aggregates via dailyRollUp: one point per local day in [from, to]. */
export async function dailyRollUp(
  dataType: string,
  fromDate: string,
  toDate: string,
): Promise<RollupPoint[]> {
  const res = await healthFetch(`/users/me/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      range: {
        start: { date: isoToDateObj(fromDate) },
        end: { date: isoToDateObj(toDate) },
      },
      windowSizeDays: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`dailyRollUp ${dataType} failed: ${res.status} ${body.slice(0, 500)}`);
  }
  const data = (await res.json()) as { rollupDataPoints?: RollupPoint[] };
  return data.rollupDataPoints ?? [];
}

function isoToDateObj(d: string): { year: number; month: number; day: number } {
  const [year, month, day] = d.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

/**
 * Extracts the per-type payload from a data point. The list response wraps
 * each point's typed value either inline or under a camelCase key
 * (e.g. { name, dataSource, sleep: {...} }) — handle both defensively.
 */
export function payloadOf(dp: DataPoint, dataType: string): Record<string, unknown> {
  const key = camelCase(dataType);
  const nested = dp[key];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return dp as Record<string, unknown>;
}

/** Civil timestamp of a sample/interval point, preferring civil over physical time. */
export function civilTimeOf(payload: Record<string, unknown>): string | null {
  const sample = payload.sampleTime as Record<string, unknown> | undefined;
  if (sample) {
    return (sample.civilTime as string) ?? (sample.physicalTime as string) ?? (sample.time as string) ?? null;
  }
  const interval = payload.interval as Record<string, unknown> | undefined;
  if (interval) {
    return (interval.civilStartTime as string) ?? (interval.startTime as string) ?? null;
  }
  return null;
}

export function civilEndTimeOf(payload: Record<string, unknown>): string | null {
  const interval = payload.interval as Record<string, unknown> | undefined;
  if (interval) {
    return (interval.civilEndTime as string) ?? (interval.endTime as string) ?? null;
  }
  return null;
}

/** Google Date proto {year, month, day} → YYYY-MM-DD. */
export function dateProtoToStr(d: unknown): string | null {
  if (!d || typeof d !== "object") return null;
  const { year, month, day } = d as { year?: number; month?: number; day?: number };
  if (!year || !month || !day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
