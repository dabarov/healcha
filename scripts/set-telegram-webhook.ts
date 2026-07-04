import "dotenv/config";

/** Points the Telegram bot's webhook at the deployed Vercel app. */
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !appUrl || !secret) {
    throw new Error("TELEGRAM_BOT_TOKEN, APP_URL and TELEGRAM_WEBHOOK_SECRET must be set");
  }
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `${appUrl}/api/telegram`,
      secret_token: secret,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
  });
  console.log(await res.json());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
