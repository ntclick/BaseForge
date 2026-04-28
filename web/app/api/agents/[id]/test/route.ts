import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

/**
 * Send a test alert via the agent's configured user-owned bot.
 * Calls Telegram directly — no dependency on the agent monitor service
 * being online. Pulls live price + 24h ticker from Binance public API
 * for a richer message.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer().schema("baseforge");

  // Load agent + owning user (for bot_token + chat_id)
  const { data: agent, error } = await sb
    .from("agents")
    .select("id, name, token_symbol, status, config, nft_token_id, user_id")
    .eq("id", id)
    .neq("status", "deleted")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: user } = await sb
    .from("users")
    .select("telegram_chat_id, telegram_bot_token")
    .eq("id", agent.user_id as string)
    .single();

  if (!user?.telegram_bot_token || !user?.telegram_chat_id) {
    return NextResponse.json(
      { error: "No Telegram bot configured for this agent's owner. Add a bot in Settings." },
      { status: 400 },
    );
  }

  // Live price from Binance public API (no auth)
  const symbol = `${agent.token_symbol}USDT`;
  let priceLine = "";
  try {
    const t = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (t.ok) {
      const d = await t.json();
      const price = Number(d.lastPrice);
      const pct = Number(d.priceChangePercent);
      const vol = Number(d.quoteVolume);
      const arrow = pct >= 0 ? "🟢↗" : "🔴↘";
      const fmtPrice = price >= 1000 ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : `$${price.toPrecision(4)}`;
      const fmtVol = vol >= 1e9 ? `$${(vol/1e9).toFixed(1)}B` : `$${(vol/1e6).toFixed(1)}M`;
      priceLine = `💵 *${fmtPrice}*  ${arrow} *${pct.toFixed(2)}%* (24h)\n📊 Vol ${fmtVol}\n`;
    }
  } catch { /* skip price line if Binance unreachable */ }

  // Watching for: list
  const cfg = (agent.config ?? {}) as {
    enabled_alerts?: string[];
    trade_size_usd?: number;
    volume_multiplier?: number;
    rsi_oversold?: number;
    rsi_overbought?: number;
    funding_rate_threshold?: number;
  };
  const enabled = cfg.enabled_alerts ?? [];
  const labels: string[] = [];
  if (enabled.includes("trade_size"))   labels.push(`  🐋 Whale trade ≥ *$${(cfg.trade_size_usd ?? 50000).toLocaleString()}*`);
  if (enabled.includes("volume_spike")) labels.push(`  📈 Volume *${cfg.volume_multiplier ?? 3}×* avg`);
  if (enabled.includes("rsi_extreme"))  labels.push(`  🌡 RSI < *${cfg.rsi_oversold ?? 30}* or > *${cfg.rsi_overbought ?? 70}*`);
  if (enabled.includes("ema_cross"))    labels.push("  🎯 EMA20 × EMA50 crossover");
  if (enabled.includes("bb_touch"))     labels.push("  📉📈 Bollinger band touch");
  if (enabled.includes("macd_cross"))   labels.push("  〽️ MACD signal cross");
  if (enabled.includes("funding_rate")) labels.push(`  ⚡ Funding rate ±*${cfg.funding_rate_threshold ?? 0.05}%*`);
  if (enabled.includes("news"))         labels.push(`  📰 News mentions of *${agent.token_symbol}*`);

  const text = [
    `⚡ *BaseForge — ${agent.token_symbol}/USDT*${agent.nft_token_id ? `  · #${agent.nft_token_id}` : ""}`,
    `_Test alert · setup verified_`,
    ``,
    priceLine,
    `*Watching for:*`,
    ...(labels.length ? labels : ["  _No alert types enabled — configure in dashboard_"]),
  ].filter(Boolean).join("\n");

  try {
    const r = await fetch(`https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.telegram_chat_id,
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
