import { NextResponse } from "next/server";
import { seedDemoData } from "@/lib/demo";

export const dynamic = "force-dynamic";

/** "Explore with demo data" from onboarding. Local file databases only. */
export async function POST() {
  try {
    await seedDemoData();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
