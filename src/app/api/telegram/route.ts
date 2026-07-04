import { NextRequest, NextResponse } from "next/server";
import { bot } from "@/lib/telegram/bot";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Telegram webhook. Authenticated with the secret token Telegram echoes back
 * in X-Telegram-Bot-Api-Secret-Token (set by scripts/set-telegram-webhook.ts).
 */
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-telegram-bot-api-secret-token");
  if (token !== env("TELEGRAM_WEBHOOK_SECRET")) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  const update = await req.json();
  try {
    await bot().handleUpdate(update);
  } catch (e) {
    // Always 200 so Telegram doesn't re-deliver the update in a retry storm.
    console.error("handleUpdate failed:", e);
  }
  return NextResponse.json({ ok: true });
}
