import { NextResponse } from "next/server";
import { syncHealthData } from "@/lib/sync/syncHealthData";
import { ReauthRequiredError } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/** Shared sync endpoint used by the dashboard "Sync now" button. */
export async function POST() {
  try {
    const result = await syncHealthData();
    return NextResponse.json(result);
  } catch (e) {
    const status = e instanceof ReauthRequiredError ? 409 : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status },
    );
  }
}
