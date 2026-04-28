import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";

type EnabledAlert = "trade_size" | "volume_spike" | "rsi_extreme" | "ema_cross" | "bb_touch" | "macd_cross" | "funding_rate" | "news";

type Cfg = {
  enabled_alerts?: EnabledAlert[];
  trade_size_usd?: number;
  volume_multiplier?: number;
  rsi_oversold?: number;
  rsi_overbought?: number;
  funding_rate_threshold?: number;
};

type Snapshot = {
  symbol: string;
  price?: number;
  pct24h?: number;
  vol24h?: number;
  high24h?: number;
  low24h?: number;
  marketCap?: number;
  rank?: number;
  fundingPct?: number;
  rsi1h?: number;
};

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseServer().schema("baseforge");

  // Optional body lets the edit page send the user's CURRENT form state
  // (unsaved checkboxes / thresholds) so the test reflects what they're
  // about to save — not whatever was last persisted.
  let bodyOverride: Cfg | null = null;
  try {
    const txt = await req.text();
    if (txt && txt.length > 1) {
      const parsed = JSON.parse(txt);
      if (parsed?.config) bodyOverride = parsed.config as Cfg;
    }
  } catch { /* no body, fall back to DB */ }

  const { data: agent, error } = await sb
    .from("agents")
    .select("id, name, token_symbol, status, config, nft_token_id, user_id")
    .eq("id", id).neq("status", "deleted").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: user } = await sb
    .from("users")
    .select("telegram_chat_id, telegram_bot_token")
    .eq("id", agent.user_id as string).single();
  if (!user?.telegram_bot_token || !user?.telegram_chat_id) {
    return NextResponse.json({ error: "No Telegram bot configured." }, { status: 400 });
  }

  // Body override wins over DB config so user can preview unsaved changes
  const cfg: Cfg = bodyOverride ?? ((agent.config ?? {}) as Cfg);
  const symbol = agent.token_symbol as string;

  // Look up coingecko_id from seeded tokens
  const { data: tokenRow } = await sb
    .from("tokens").select("coingecko_id").eq("symbol", symbol).maybeSingle();

  const snap = await fetchSnapshot(symbol, tokenRow?.coingecko_id as string | undefined);

  const text = buildMessage({
    agent: { name: agent.name as string, token: symbol, tokenId: agent.nft_token_id as string | null },
    cfg,
    snap,
  });

  try {
    const r = await fetch(`https://api.telegram.org/bot${user.telegram_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: user.telegram_chat_id, text, parse_mode: "Markdown", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await r.json();
    if (!data.ok) return NextResponse.json({ ok: false, error: data.description ?? "Telegram error" }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "network error" }, { status: 502 });
  }
}

/** Pull live market data from multiple sources in parallel — pick what works. */
async function fetchSnapshot(symbol: string, coingeckoId?: string): Promise<Snapshot> {
  const snap: Snapshot = { symbol };
  const results = await Promise.allSettled([
    fetchBinanceTicker(`${symbol}USDT`),
    fetchBinanceFunding(`${symbol}USDT`),
    coingeckoId ? fetchCoinGecko(coingeckoId) : Promise.resolve(null),
    fetchTaapiRsi(`${symbol}/USDT`),
  ]);

  const [bt, bf, cg, rsi] = results;
  if (bt.status === "fulfilled" && bt.value) Object.assign(snap, bt.value);
  if (bf.status === "fulfilled" && bf.value) Object.assign(snap, bf.value);
  // Use CoinGecko as fallback for fields Binance didn't provide
  if (cg.status === "fulfilled" && cg.value) {
    if (snap.price === undefined) snap.price = cg.value.price;
    if (snap.pct24h === undefined) snap.pct24h = cg.value.pct24h;
    if (snap.vol24h === undefined) snap.vol24h = cg.value.vol24h;
    snap.marketCap = cg.value.marketCap;
    snap.rank = cg.value.rank;
  }
  if (rsi.status === "fulfilled" && rsi.value !== null) snap.rsi1h = rsi.value;

  return snap;
}

async function fetchBinanceTicker(pair: string): Promise<Partial<Snapshot> | null> {
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    return {
      price: Number(d.lastPrice),
      pct24h: Number(d.priceChangePercent),
      vol24h: Number(d.quoteVolume),
      high24h: Number(d.highPrice),
      low24h: Number(d.lowPrice),
    };
  } catch { return null; }
}

async function fetchBinanceFunding(pair: string): Promise<Partial<Snapshot> | null> {
  try {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${pair}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = await r.json();
    return { fundingPct: Number(d.lastFundingRate) * 100 };
  } catch { return null; }
}

async function fetchCoinGecko(id: string): Promise<{ price: number; pct24h: number; vol24h: number; marketCap: number; rank: number } | null> {
  try {
    const key = process.env.Coingeko_API_KEY || process.env.COINGECKO_API_KEY;
    const headers: Record<string, string> = {};
    if (key) headers["x-cg-pro-api-key"] = key;
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${id}`,
      { headers, signal: AbortSignal.timeout(6000) },
    );
    if (!r.ok) return null;
    const arr = await r.json();
    const d = arr?.[0];
    if (!d) return null;
    return {
      price: Number(d.current_price),
      pct24h: Number(d.price_change_percentage_24h),
      vol24h: Number(d.total_volume),
      marketCap: Number(d.market_cap),
      rank: Number(d.market_cap_rank),
    };
  } catch { return null; }
}

async function fetchTaapiRsi(pair: string): Promise<number | null> {
  const key = process.env.TAAPI_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://api.taapi.io/rsi?secret=${encodeURIComponent(key)}&exchange=binance&symbol=${encodeURIComponent(pair)}&interval=1h`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (!r.ok) return null;
    const d = await r.json();
    return typeof d.value === "number" ? d.value : null;
  } catch { return null; }
}

function fmtPrice(p?: number): string {
  if (p === undefined) return "—";
  if (p >= 1000) return `$${p.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (p >= 1)    return `$${p.toFixed(4)}`;
  return `$${p.toPrecision(4)}`;
}
function fmtBig(v?: number): string {
  if (v === undefined) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

function buildMessage(opts: { agent: { name: string; token: string; tokenId: string | null }; cfg: Cfg; snap: Snapshot }): string {
  const { agent, cfg, snap } = opts;
  const enabled = cfg.enabled_alerts ?? [];
  const lines: string[] = [];

  lines.push(`⚡ *${agent.name}* · ${agent.token}/USDT${agent.tokenId ? ` · #${agent.tokenId}` : ""}`);
  lines.push(`_Test alert · live snapshot_`);
  lines.push("");

  // Live snapshot
  if (snap.price !== undefined) {
    const arrow = (snap.pct24h ?? 0) >= 0 ? "🟢↗" : "🔴↘";
    lines.push(`💵 *${fmtPrice(snap.price)}*  ${arrow} *${(snap.pct24h ?? 0).toFixed(2)}%* (24h)`);
    if (snap.vol24h !== undefined) {
      const hl = snap.high24h && snap.low24h ? ` · H ${fmtPrice(snap.high24h)} · L ${fmtPrice(snap.low24h)}` : "";
      lines.push(`📊 Vol ${fmtBig(snap.vol24h)}${hl}`);
    }
    if (snap.marketCap !== undefined) lines.push(`🏷 MC ${fmtBig(snap.marketCap)}${snap.rank ? ` · rank #${snap.rank}` : ""}`);
  } else {
    lines.push(`📊 _Live price unavailable for ${agent.token}/USDT_`);
  }
  if (snap.fundingPct !== undefined) {
    const side = snap.fundingPct > 0 ? "long-paying" : "short-paying";
    lines.push(`⚡ Funding *${snap.fundingPct.toFixed(4)}%* (${side})`);
  }
  if (snap.rsi1h !== undefined) {
    const zone = snap.rsi1h < 30 ? "🟢 oversold" : snap.rsi1h > 70 ? "🔴 overbought" : "⚪ neutral";
    lines.push(`📈 RSI(1h) *${snap.rsi1h.toFixed(0)}* ${zone}`);
  }

  lines.push("");
  lines.push("*Watching for · current vs threshold:*");

  // Per-alert match — tell user what would fire RIGHT NOW
  for (const alert of enabled) {
    lines.push(formatAlertCheck(alert, cfg, snap, agent.token));
  }
  if (enabled.length === 0) lines.push("  _No alert types enabled — configure in dashboard_");

  return lines.join("\n");
}

function formatAlertCheck(alert: EnabledAlert, cfg: Cfg, snap: Snapshot, token: string): string {
  switch (alert) {
    case "trade_size": {
      const thr = cfg.trade_size_usd ?? 10000;
      return `  🐋 Whale trade ≥ *${fmtBig(thr)}* — _watching live trades_`;
    }
    case "volume_spike": {
      const mult = cfg.volume_multiplier ?? 2;
      return `  📈 Volume *${mult}×* avg — _comparing vs 20-candle SMA_`;
    }
    case "rsi_extreme": {
      const lo = cfg.rsi_oversold ?? 30;
      const hi = cfg.rsi_overbought ?? 70;
      if (snap.rsi1h !== undefined) {
        const fires = snap.rsi1h < lo || snap.rsi1h > hi;
        return `  🌡 RSI < *${lo}* or > *${hi}* — current *${snap.rsi1h.toFixed(0)}* ${fires ? "✓ would fire" : "○ in range"}`;
      }
      return `  🌡 RSI < *${lo}* or > *${hi}*`;
    }
    case "ema_cross":  return "  🎯 EMA20 × EMA50 crossover — _on each closed 1m candle_";
    case "bb_touch":   return "  📉📈 Price hits Bollinger band (20, 2σ)";
    case "macd_cross": return "  〽️ MACD signal cross";
    case "funding_rate": {
      const thr = cfg.funding_rate_threshold ?? 0.03;
      if (snap.fundingPct !== undefined) {
        const fires = Math.abs(snap.fundingPct) >= thr;
        return `  ⚡ Funding rate ±*${thr}%* — current *${snap.fundingPct.toFixed(4)}%* ${fires ? "✓ would fire" : "○ in range"}`;
      }
      return `  ⚡ Funding rate ±*${thr}%*`;
    }
    case "news":       return `  📰 News mentions of *${token}* — CoinGecko news every 5m`;
    default:           return `  • ${alert}`;
  }
}
