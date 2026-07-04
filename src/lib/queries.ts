import { desc, gte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { addDays, todayLocal } from "@/lib/dates";

/** Server-side data access for the dashboard. */

export type Daily = typeof schema.metricsDaily.$inferSelect;

export async function getDailySeries(days: number): Promise<Daily[]> {
  const from = addDays(todayLocal(), -(days - 1));
  const rows = await db()
    .select()
    .from(schema.metricsDaily)
    .where(gte(schema.metricsDaily.date, from));
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getLatestDaily(): Promise<Daily | null> {
  const rows = await db()
    .select()
    .from(schema.metricsDaily)
    .orderBy(desc(schema.metricsDaily.date))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLastSync(): Promise<{ at: string | null; errors: number }> {
  const rows = await db().select().from(schema.syncState);
  const at = rows
    .map((r) => r.lastRunAt)
    .filter((v): v is string => !!v)
    .sort()
    .at(-1) ?? null;
  const errors = rows.filter((r) => r.lastStatus === "error").length;
  return { at, errors };
}

export interface BandPoint {
  date: string;
  value: number | null;
  mean: number | null;
  low: number | null;
  high: number | null;
}

/**
 * Series + trailing 30-day baseline band (mean ± 1 SD) for a metric, computed
 * over the fetched rows so the shaded band always matches what's on screen.
 */
export function withBaselineBand(rows: Daily[], key: keyof Daily): BandPoint[] {
  return rows.map((row, i) => {
    const windowRows = rows.slice(Math.max(0, i - 30), i);
    const values = windowRows
      .map((r) => r[key] as number | null)
      .filter((v): v is number => v != null);
    let mean: number | null = null;
    let sd: number | null = null;
    if (values.length >= 5) {
      mean = values.reduce((a, b) => a + b, 0) / values.length;
      const m = mean;
      sd = Math.sqrt(
        values.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(values.length - 1, 1),
      );
    }
    return {
      date: row.date,
      value: (row[key] as number | null) ?? null,
      mean,
      low: mean != null && sd != null ? mean - sd : null,
      high: mean != null && sd != null ? mean + sd : null,
    };
  });
}
