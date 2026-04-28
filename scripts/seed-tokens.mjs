#!/usr/bin/env node
/**
 * Seed top 200 coins from CoinGecko into baseforge.tokens.
 * Cross-references Binance to mark which have spot/futures.
 *
 * Usage:
 *   node scripts/seed-tokens.mjs
 *
 * Reads from web/.env.local for SUPABASE_SECRET_KEY + NEXT_PUBLIC_SUPABASE_URL.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Tiny .env parser
function loadEnv(path) {
  const env = {};
  try {
    const content = readFileSync(path, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {}
  return env;
}

const env = {
  ...loadEnv(resolve(__dirname, "../.env")),
  ...loadEnv(resolve(__dirname, "../web/.env.local")),
  ...process.env,
};

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY;
const COINGECKO_KEY = env.COINGECKO_API_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY");
  process.exit(1);
}

// Base ecosystem tokens to include even if outside top 200 by market cap
// Format: [coingecko_id, symbol]
const BASE_ECOSYSTEM_IDS = [
  ["aerodrome-finance", "AERO"],
  ["brett", "BRETT"],
  ["degen-base", "DEGEN"],
  ["toshi", "TOSHI"],
  ["higher", "HIGHER"],
  ["base-god", "BASEGOD"],
  ["onchain-monkey", "OCM"],
  ["roost-coin", "ROOST"],
  ["base-dawgz", "DAWGZ"],
  ["luna-coin", "LUNA"],
  ["normie", "NORMIE"],
  ["skydrome", "SKY"],
  ["build-on-base", "BUILD"],
  ["mochi-market", "MOCHI"],
  ["basenji", "BENJI"],
];

console.log("⚡ Fetching top 200 coins from CoinGecko…");
const cgHeaders = COINGECKO_KEY ? { "x-cg-pro-api-key": COINGECKO_KEY } : {};
const cgUrl = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=200&page=1";
const cgRes = await fetch(cgUrl, { headers: cgHeaders });
if (!cgRes.ok) {
  console.error(`CoinGecko ${cgRes.status}: ${await cgRes.text()}`);
  process.exit(1);
}
const coins = await cgRes.json();
console.log(`✓ ${coins.length} coins fetched`);

// Fetch Base ecosystem coins not in top 200
const top200Ids = new Set(coins.map((c) => c.id));
const extraIds = BASE_ECOSYSTEM_IDS.filter(([id]) => !top200Ids.has(id)).map(([id]) => id);
if (extraIds.length > 0) {
  console.log(`⚡ Fetching ${extraIds.length} Base ecosystem tokens…`);
  const extraUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${extraIds.join(",")}&order=market_cap_desc&per_page=50&page=1`;
  const extraRes = await fetch(extraUrl, { headers: cgHeaders });
  if (extraRes.ok) {
    const extraCoins = await extraRes.json();
    coins.push(...extraCoins);
    console.log(`✓ Added ${extraCoins.length} Base ecosystem tokens`);
  }
}

console.log("⚡ Fetching Binance symbols (spot)…");
const binSpotRes = await fetch("https://api.binance.com/api/v3/exchangeInfo");
const binSpot = await binSpotRes.json();
const spotSymbols = new Set(binSpot.symbols.filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT").map((s) => s.baseAsset.toUpperCase()));

console.log("⚡ Fetching Binance symbols (futures)…");
const binFutRes = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
const binFut = await binFutRes.json();
const futSymbols = new Set(binFut.symbols.filter((s) => s.status === "TRADING" && s.quoteAsset === "USDT").map((s) => s.baseAsset.toUpperCase()));

const rows = coins.map((c) => {
  const sym = c.symbol.toUpperCase();
  const hasSpot = spotSymbols.has(sym);
  const hasFutures = futSymbols.has(sym);
  // Include binance_symbol for futures-only tokens too (funding rate monitoring)
  const binanceSymbol = hasSpot || hasFutures ? `${sym}USDT` : null;
  return {
    coingecko_id: c.id,
    symbol: sym,
    name: c.name,
    image_url: c.image,
    market_cap_rank: c.market_cap_rank,
    current_price: c.current_price,
    market_cap: c.market_cap,
    binance_symbol: binanceSymbol,
    has_futures: hasFutures,
    updated_at: new Date().toISOString(),
  };
});

console.log(`⚡ Upserting ${rows.length} tokens to Supabase…`);
const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/tokens?on_conflict=coingecko_id`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Profile": "baseforge",
    Prefer: "resolution=merge-duplicates,return=minimal",
  },
  body: JSON.stringify(rows),
});
if (!upsertRes.ok) {
  console.error(`Supabase ${upsertRes.status}: ${await upsertRes.text()}`);
  process.exit(1);
}

const withSpot = rows.filter((r) => r.binance_symbol).length;
const withFut = rows.filter((r) => r.has_futures).length;
console.log(`✅ Done. ${rows.length} tokens seeded — ${withSpot} on Binance spot, ${withFut} have futures (funding rate available).`);
