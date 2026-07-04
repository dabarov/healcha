import { Telegraf, type Context } from "telegraf";
import { desc, gte } from "drizzle-orm";
import { db, schema } from "@/db/client";
import { env } from "@/lib/env";
import { addDays, todayLocal } from "@/lib/dates";
import { syncHealthData } from "@/lib/sync/syncHealthData";
import { generateDailySummary } from "@/lib/ai/summary";
import { askHealthQuestion } from "@/lib/ai/textToSql";
import { ReauthRequiredError } from "@/lib/google/oauth";

/**
 * Telegraf bot, run in webhook mode from the Next.js route handler
 * (src/app/api/telegram/route.ts). Single-user: every update from a chat
 * other than TELEGRAM_CHAT_ID is ignored.
 */

let _bot: Telegraf | undefined;

function fmtNum(v: number | null, digits = 0): string {
  return v == null ? "–" : v.toFixed(digits);
}

function trend(z: number | null): string {
  if (z == null) return "";
  if (z >= 1) return " ↑↑";
  if (z >= 0.4) return " ↑";
  if (z <= -1) return " ↓↓";
  if (z <= -0.4) return " ↓";
  return " →";
}

async function guard(ctx: Context): Promise<boolean> {
  const allowed = String(ctx.chat?.id) === env("TELEGRAM_CHAT_ID");
  if (!allowed && ctx.chat) {
    await ctx.reply("This is a personal bot.");
  }
  return allowed;
}

export function bot(): Telegraf {
  if (_bot) return _bot;
  const b = new Telegraf(env("TELEGRAM_BOT_TOKEN"), {
    handlerTimeout: 270_000, // long syncs; Vercel maxDuration governs the hard cap
  });

  b.command(["start", "help"], async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.reply(
      [
        "🩺 Your health assistant",
        "",
        "/pull — sync latest Fitbit data now",
        "/today — today's brief (readiness, sleep, HRV vs baseline)",
        "/week — 7-day table of key metrics",
        "/trends — 30-day trend snapshot",
        "/help — this message",
        "",
        "Or just ask me anything about your history, e.g.:",
        "“how's my HRV trending this month?”",
        "“worst sleep nights in the last 30 days”",
        "“resting HR on days after weightlifting”",
      ].join("\n"),
    );
  });

  b.command("pull", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.reply("⏳ Syncing from Google Health API…");
    try {
      const res = await syncHealthData();
      const errors = res.types.filter((t) => t.status === "error");
      const points = res.types.reduce((a, t) => a + t.count, 0);
      let msg = `✅ Synced ${points} data points across ${res.types.length} types (${res.from} → ${res.to}).`;
      if (errors.length) {
        msg += `\n⚠️ ${errors.length} type(s) failed: ${errors.map((e) => e.dataType).join(", ")}`;
      }
      await ctx.reply(msg);
    } catch (e) {
      if (e instanceof ReauthRequiredError) return; // alert already sent with re-auth link
      await ctx.reply(`❌ Sync failed: ${e instanceof Error ? e.message : e}`);
    }
  });

  b.command("today", async (ctx) => {
    if (!(await guard(ctx))) return;
    await ctx.reply("⏳ Building today's brief…");
    const text = await generateDailySummary(todayLocal());
    await ctx.reply(text);
  });

  b.command("week", async (ctx) => {
    if (!(await guard(ctx))) return;
    const rows = await db()
      .select()
      .from(schema.metricsDaily)
      .where(gte(schema.metricsDaily.date, addDays(todayLocal(), -6)))
      .orderBy(desc(schema.metricsDaily.date));
    if (!rows.length) {
      await ctx.reply("No data in the last 7 days — try /pull first.");
      return;
    }
    const lines = rows.map(
      (r) =>
        `<b>${r.date.slice(5)}</b>  rdy ${fmtNum(r.readiness)}  slp ${fmtNum(
          r.sleepMinutes != null ? r.sleepMinutes / 60 : null,
          1,
        )}h  hrv ${fmtNum(r.hrv)}  rhr ${fmtNum(r.restingHr)}  ${fmtNum(r.steps)} st`,
    );
    await ctx.replyWithHTML(["📅 Last 7 days", ...lines].join("\n"));
  });

  b.command("trends", async (ctx) => {
    if (!(await guard(ctx))) return;
    const rows = await db()
      .select()
      .from(schema.metricsDaily)
      .where(gte(schema.metricsDaily.date, addDays(todayLocal(), -29)))
      .orderBy(desc(schema.metricsDaily.date));
    if (!rows.length) {
      await ctx.reply("No data in the last 30 days — try /pull first.");
      return;
    }
    const avg = (f: (r: (typeof rows)[number]) => number | null) => {
      const vs = rows.map(f).filter((v): v is number => v != null);
      return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
    };
    const latest = rows[0];
    const lines = [
      "📈 30-day snapshot (latest vs 30-day avg)",
      `Readiness: ${fmtNum(latest.readiness)} vs ${fmtNum(avg((r) => r.readiness))}${trend(latest.readinessZ)}`,
      `HRV: ${fmtNum(latest.hrv, 1)} vs ${fmtNum(avg((r) => r.hrv), 1)} ms${trend(latest.hrvZ)}`,
      `Resting HR: ${fmtNum(latest.restingHr, 1)} vs ${fmtNum(avg((r) => r.restingHr), 1)} bpm${trend(latest.restingHrZ)}`,
      `Sleep: ${fmtNum(latest.sleepMinutes != null ? latest.sleepMinutes / 60 : null, 1)} vs ${fmtNum(
        (() => {
          const a = avg((r) => r.sleepMinutes);
          return a != null ? a / 60 : null;
        })(),
        1,
      )} h${trend(latest.sleepMinutesZ)}`,
      `Steps: ${fmtNum(latest.steps)} vs ${fmtNum(avg((r) => r.steps))}${trend(latest.stepsZ)}`,
    ];
    await ctx.reply(lines.join("\n"));
  });

  // Free-text → text-to-SQL Q&A
  b.on("text", async (ctx) => {
    if (!(await guard(ctx))) return;
    const question = ctx.message.text.trim();
    if (question.startsWith("/")) return; // unknown command
    await ctx.sendChatAction("typing");
    const { answer } = await askHealthQuestion(question);
    await ctx.reply(answer);
  });

  b.catch(async (err, ctx) => {
    console.error("Bot error:", err);
    try {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : "Something went wrong"}`);
    } catch {
      /* ignore */
    }
  });

  _bot = b;
  return b;
}
