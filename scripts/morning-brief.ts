import "dotenv/config";
import { syncHealthData } from "../src/lib/sync/syncHealthData";
import { generateDailySummary } from "../src/lib/ai/summary";
import { sendTelegramMessage } from "../src/lib/telegram/send";
import { todayLocal } from "../src/lib/dates";
import { ReauthRequiredError } from "../src/lib/google/oauth";

/**
 * GitHub Actions cron entrypoint: sync (so last night's sleep is in), then
 * generate + push the morning brief to Telegram.
 */
async function main() {
  try {
    const sync = await syncHealthData();
    console.log(
      `Synced ${sync.types.reduce((a, t) => a + t.count, 0)} points; ` +
        `${sync.types.filter((t) => t.status === "error").length} type errors`,
    );
  } catch (e) {
    if (e instanceof ReauthRequiredError) {
      // Telegram alert with re-auth link was already sent; still try to brief
      // from whatever data we have.
      console.error("Sync skipped: re-auth required");
    } else {
      throw e;
    }
  }

  const brief = await generateDailySummary(todayLocal());
  await sendTelegramMessage(`☀️ <b>Morning brief — ${todayLocal()}</b>\n\n${brief}`);
  console.log("Brief sent.");
}

main().catch(async (e) => {
  console.error(e);
  try {
    await sendTelegramMessage(`❌ Morning brief failed: ${e instanceof Error ? e.message : e}`);
  } catch {
    /* ignore */
  }
  process.exit(1);
});
