import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "wallet required" }, { status: 400 });

  const sb = supabaseServer().schema("baseforge");
  const { data: user } = await sb
    .from("users")
    .select("wallet_address, email, telegram_chat_id, identity_token_id")
    .eq("wallet_address", wallet.toLowerCase())
    .maybeSingle();

  return NextResponse.json({
    user: user
      ? {
          wallet: user.wallet_address,
          email: user.email,
          telegram_chat_id: user.telegram_chat_id,
          telegram_linked: !!user.telegram_chat_id,
          identity_token_id: user.identity_token_id?.toString() ?? null,
        }
      : null,
  });
}
