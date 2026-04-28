import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  telegram_chat_id: z.string().min(1),
  telegram_bot_token: z.string().min(1),
  token: z.string().optional(),
});

/**
 * Pre-mint test endpoint. Sends a Telegram message DIRECTLY via the user's
 * bot — no dependency on the agent service. This way users can verify their
 * bot+chat setup works even before the agent monitor is online.
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: "Invalid bot token or chat ID format." }, { status: 400 });
  }
  const { telegram_chat_id, telegram_bot_token, token = "BTC" } = body.data;

  const text = [
    `⚡ *BaseForge — ${token}*`,
    `_Test alert · setup verified_`,
    ``,
    `Your bot can reach this chat. Real alerts will look like this with`,
    `live price, indicators, and AI commentary attached.`,
    ``,
    `_Mint your agent NFT to start monitoring._`,
  ].join("\n");

  try {
    const r = await fetch(`https://api.telegram.org/bot${telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_chat_id,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json();
    if (!data.ok) {
      return NextResponse.json(
        { ok: false, error: data.description ?? "Telegram rejected the message" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    return NextResponse.json(
      { ok: false, error: `Network error reaching Telegram: ${msg}` },
      { status: 502 },
    );
  }
}
