import { NextResponse } from "next/server";
import { buildAuthUrl } from "@/lib/google/oauth";
import { dashboardToken } from "@/lib/authToken";
import { env, APP_URL } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Kicks off the Google OAuth re-auth flow (linked from Telegram alerts). */
export async function GET() {
  const state = await dashboardToken(env("DASHBOARD_SECRET"));
  const redirectUri = `${APP_URL()}/api/auth/google/callback`;
  return NextResponse.redirect(buildAuthUrl(redirectUri, state));
}
