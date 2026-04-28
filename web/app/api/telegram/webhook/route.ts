import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/**
 * Telegram webhook endpoint.
 *
 * Configure once via:
 *   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://baseforge.app/api/telegram/webhook&secret_token=<SECRET>"
 *
 * Handles:
 *  - /start <wallet_address> — links the Telegram chat_id to a user row
 *  - /start (no payload) — replies with chat_id so user can paste manually as fallback
 *  - callback_query snooze:<token>:<seconds> — records snooze state
 */

const TG_API = "https://api.telegram.org";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";

async function tgSend(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`${TG_API}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
}

export async function POST(req: Request) {
  // Verify secret token if configured
  if (SECRET) {
    const provided = req.headers.get("x-telegram-bot-api-secret-token");
    if (provided !== SECRET) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const update = await req.json();

  // 1. /start <wallet> message
  const message = update.message;
  if (message?.text?.startsWith("/start")) {
    const chatId = String(message.chat.id);
    const parts = message.text.trim().split(/\s+/);
    const payload = parts[1]?.toLowerCase();

    if (payload && /^0x[a-f0-9]{40}$/.test(payload)) {
      // Valid Ethereum address → link to user (upsert)
      const sb = supabaseServer().schema("baseforge");
      const { data: existing } = await sb
        .from("users")
        .select("id")
        .eq("wallet_address", payload)
        .maybeSingle();
      if (existing) {
        await sb.from("users").update({ telegram_chat_id: chatId }).eq("id", existing.id);
      } else {
        await sb.from("users").insert({ wallet_address: payload, telegram_chat_id: chatId });
      }
      await tgSend(
        chatId,
        `✅ *Connected*\n\nYour Telegram is linked to wallet \`${payload.slice(0, 6)}…${payload.slice(-4)}\`.\n\nYou'll receive BaseForge alerts here.`,
      );
    } else {
      // Plain /start — reply with chat_id for manual paste
      await tgSend(
        chatId,
        `Hi! Your chat_id is \`${chatId}\`.\n\nTo connect: open BaseForge and click "Connect Telegram", or paste this id manually.`,
      );
    }
    return NextResponse.json({ ok: true });
  }

  // 2. Callback query (snooze button)
  const cb = update.callback_query;
  if (cb?.data?.startsWith("snooze:")) {
    const chatId = String(cb.message.chat.id);
    const [, token, seconds] = cb.data.split(":");
    // Forward to agent service so its in-memory snooze state knows
    try {
      await fetch(`${process.env.AGENT_SERVICE_URL}/telegram/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.AGENT_SERVICE_TOKEN}`,
        },
        body: JSON.stringify({
          update_id: update.update_id,
          callback_query: { callback_data: cb.data, message: cb.message },
        }),
      });
    } catch (err) {
      console.warn("Failed to forward snooze to agent service:", err);
    }
    await fetch(`${TG_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: cb.id,
        text: `Snoozed ${token} for ${Math.round(Number(seconds) / 60)}m`,
      }),
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ status: "telegram webhook live" });
}
