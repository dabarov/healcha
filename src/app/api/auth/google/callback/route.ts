import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/google/oauth";
import { dashboardToken } from "@/lib/authToken";
import { env, APP_URL } from "@/lib/env";
import { sendTelegramMessage } from "@/lib/telegram/send";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = await dashboardToken(env("DASHBOARD_SECRET"));
  if (!code || state !== expected) {
    return new NextResponse("Invalid OAuth callback (bad state or missing code)", {
      status: 400,
    });
  }
  try {
    await exchangeCode(code, `${APP_URL()}/api/auth/google/callback`);
    await sendTelegramMessage("✅ Google Health re-authorized. Sync is back online.").catch(
      () => {},
    );
    return new NextResponse(
      "Google Health connected. You can close this tab — sync is back online.",
      { status: 200 },
    );
  } catch (e) {
    return new NextResponse(`OAuth exchange failed: ${e instanceof Error ? e.message : e}`, {
      status: 500,
    });
  }
}
