import { NextRequest, NextResponse } from "next/server";
import { googleClient, setGoogleClient } from "@/lib/config";
import { isGoogleConnected } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/** Onboarding state + Google OAuth client credentials. Local single-user app. */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    configured: googleClient() !== null,
    connected: await isGoogleConnected(),
    redirectUri: `${req.nextUrl.origin}/api/auth/google/callback`,
  });
}

export async function POST(req: NextRequest) {
  let body: { clientId?: unknown; clientSecret?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  if (!clientId.endsWith(".apps.googleusercontent.com") || !clientSecret) {
    return NextResponse.json(
      { error: "Expected a client ID ending in .apps.googleusercontent.com and a client secret" },
      { status: 400 },
    );
  }
  setGoogleClient(clientId, clientSecret);
  return NextResponse.json({ ok: true });
}
