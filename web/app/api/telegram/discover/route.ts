import { NextResponse } from "next/server";
import { z } from "zod";

const Body = z.object({
  bot_token: z.string().regex(/^\d+:[A-Za-z0-9_-]{30,}$/, "Invalid Telegram bot token format"),
});

/**
 * Validate the bot token + try to discover the chat_id of the user who recently
 * messaged the bot (typically /start). The user creates a bot via @BotFather,
 * messages their own bot once, then pastes the token here.
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  const { bot_token } = body.data;

  // 1. getMe — verify token works + get bot username
  const meRes = await fetch(`https://api.telegram.org/bot${bot_token}/getMe`);
  const me = await meRes.json();
  if (!me.ok) {
    return NextResponse.json(
      { error: `Telegram rejected token: ${me.description ?? "unknown"}` },
      { status: 400 }
    );
  }

  // 2. getUpdates — find a chat_id from any recent message
  const upRes = await fetch(`https://api.telegram.org/bot${bot_token}/getUpdates?limit=20`);
  const updates = await upRes.json();
  let chatId: string | null = null;
  if (updates.ok && Array.isArray(updates.result)) {
    // Pick the most recent message/callback chat (private chats only)
    for (const upd of [...updates.result].reverse()) {
      const chat = upd.message?.chat ?? upd.callback_query?.message?.chat;
      if (chat?.type === "private" && chat?.id) {
        chatId = String(chat.id);
        break;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    bot_username: me.result.username,
    bot_name: me.result.first_name,
    chat_id: chatId,
    hint: chatId
      ? null
      : `Open Telegram, find @${me.result.username}, send /start, then click "Re-discover" here.`,
  });
}
