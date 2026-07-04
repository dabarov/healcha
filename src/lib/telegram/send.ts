import { env, envOr } from "@/lib/env";

/**
 * Minimal push-only Telegram helper (used by the morning brief, sync alerts
 * and the bot replies). Kept separate from the Telegraf bot so cron scripts
 * don't need the full bot wiring.
 */
export async function sendTelegramMessage(
  text: string,
  chatId: string = envOr("TELEGRAM_CHAT_ID", ""),
): Promise<void> {
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID not set");
  const token = env("TELEGRAM_BOT_TOKEN");
  // Telegram hard-caps messages at 4096 chars.
  const chunks = text.match(/[\s\S]{1,4000}/g) ?? [];
  for (const chunk of chunks) {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      // Retry once without parse_mode — LLM output occasionally contains
      // stray angle brackets that break Telegram's HTML parser.
      if (body.includes("can't parse entities")) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: chunk }),
        });
      } else {
        throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
      }
    }
  }
}
