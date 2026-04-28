import { NextResponse } from "next/server";
import { z } from "zod";
import { agentClient } from "@/lib/agent-client";

const Body = z.object({
  telegram_chat_id: z.string().min(1),
  telegram_bot_token: z.string().optional(),
  token: z.string().optional(),
});

/** Pre-mint test endpoint. User can verify bot+chat works before spending gas. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }
  try {
    const r = await agentClient.testBot(body.data);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "test failed" },
      { status: 502 },
    );
  }
}
