import "dotenv/config";
import { bot } from "../src/lib/telegram/bot";
import { env } from "../src/lib/env";

/**
 * Runs the Telegram bot locally in long-polling mode — no public URL or
 * webhook needed. Deletes any configured webhook first (Telegram allows only
 * one delivery mode at a time); re-run `npm run telegram:webhook` afterwards
 * to point production back at Vercel.
 */
async function main() {
  const token = env("TELEGRAM_BOT_TOKEN");
  await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=true`);
  console.log("Webhook removed — running in polling mode. Ctrl+C to stop.");
  console.log("(Remember: npm run telegram:webhook to restore the Vercel webhook.)");

  const b = bot();
  process.once("SIGINT", () => b.stop("SIGINT"));
  process.once("SIGTERM", () => b.stop("SIGTERM"));
  await b.launch();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
