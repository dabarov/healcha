import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { generateDailySummary } from "@/lib/ai/summary";
import { nowIso, todayLocal } from "@/lib/dates";

export const dynamic = "force-dynamic";

/**
 * AI daily summary for the dashboard "today" panel. Cached per date in
 * daily_summaries; ?refresh=1 regenerates (e.g. after a sync).
 */
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? todayLocal();
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!refresh) {
    const cached = await db()
      .select()
      .from(schema.dailySummaries)
      .where(eq(schema.dailySummaries.date, date));
    if (cached[0]) {
      return NextResponse.json({ date, text: cached[0].text, cached: true });
    }
  }

  const text = await generateDailySummary(date);
  const row = { date, text, createdAt: nowIso() };
  await db()
    .insert(schema.dailySummaries)
    .values(row)
    .onConflictDoUpdate({ target: schema.dailySummaries.date, set: row });
  return NextResponse.json({ date, text, cached: false });
}
