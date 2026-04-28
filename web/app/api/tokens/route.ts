import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);

  const sb = supabaseServer().schema("baseforge");
  let query = sb
    .from("tokens")
    .select("id, coingecko_id, symbol, name, image_url, market_cap_rank, current_price, binance_symbol, has_futures")
    .not("binance_symbol", "is", null)
    .order("market_cap_rank", { ascending: true })
    .limit(limit);

  if (q) {
    // Search by symbol or name (case-insensitive)
    query = query.or(`symbol.ilike.%${q}%,name.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Tokens table refreshed by seed script (rare). Cache aggressively.
  const cacheControl = q
    ? "public, s-maxage=60, stale-while-revalidate=300"
    : "public, s-maxage=300, stale-while-revalidate=3600";
  return NextResponse.json({ tokens: data ?? [] }, { headers: { "Cache-Control": cacheControl } });
}
