import { NextRequest, NextResponse } from "next/server";
import { consumeOauthState, exchangeCode } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !consumeOauthState(state)) {
    return new NextResponse("Invalid OAuth callback (bad state or missing code)", {
      status: 400,
    });
  }
  try {
    await exchangeCode(code, `${req.nextUrl.origin}/api/auth/google/callback`);
    // The flow runs in the system browser, so this page is what the user sees
    // there; the app window picks the new connection up on its next poll.
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>healcha</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#0a0b0d;color:#f2f5f8;font:15px/1.6 system-ui">
<div style="text-align:center"><div style="color:#22d3a0;font-size:22px;font-weight:700">healcha</div>
<p>Google connected. You can close this tab and head back to the app.</p></div>`,
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    return new NextResponse(`OAuth exchange failed: ${e instanceof Error ? e.message : e}`, {
      status: 500,
    });
  }
}
