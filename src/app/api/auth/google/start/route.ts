import { NextRequest, NextResponse } from "next/server";
import { buildAuthUrl, createOauthState } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/** Kicks off the Google OAuth flow (from onboarding or the reconnect banner). */
export async function GET(req: NextRequest) {
  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  return NextResponse.redirect(buildAuthUrl(redirectUri, createOauthState()));
}
