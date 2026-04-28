"""Binance public API helpers — 24h ticker + funding rate snapshot.

Used by the test-alert endpoint to enrich the Telegram message with current
market context. No auth required (public endpoints).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import aiohttp

logger = logging.getLogger("baseforge.binance_market")

SPOT_BASE = "https://api.binance.com/api/v3"
FUTURES_BASE = "https://fapi.binance.com/fapi/v1"


@dataclass
class Ticker24h:
    symbol: str
    last_price: float
    price_change_pct: float       # 24h %
    high: float
    low: float
    volume_quote: float           # 24h quote volume in USD


@dataclass
class FundingInfo:
    symbol: str
    mark_price: float
    funding_rate: float           # decimal e.g. 0.0001
    next_funding_min: int


async def get_ticker_24h(symbol: str) -> Ticker24h | None:
    """24h ticker from Binance spot. Returns None if symbol not on spot."""
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{SPOT_BASE}/ticker/24hr?symbol={symbol}", timeout=aiohttp.ClientTimeout(total=5)) as r:
                if r.status != 200:
                    return None
                d = await r.json()
                return Ticker24h(
                    symbol=d["symbol"],
                    last_price=float(d["lastPrice"]),
                    price_change_pct=float(d["priceChangePercent"]),
                    high=float(d["highPrice"]),
                    low=float(d["lowPrice"]),
                    volume_quote=float(d["quoteVolume"]),
                )
    except Exception as exc:
        logger.warning("Binance spot ticker failed for %s: %s", symbol, exc)
        return None


async def get_funding(symbol: str) -> FundingInfo | None:
    """Current funding rate snapshot from Binance perpetual futures."""
    try:
        async with aiohttp.ClientSession() as s:
            async with s.get(f"{FUTURES_BASE}/premiumIndex?symbol={symbol}", timeout=aiohttp.ClientTimeout(total=5)) as r:
                if r.status != 200:
                    return None
                d = await r.json()
                import time
                next_ms = int(d.get("nextFundingTime", 0))
                now_ms = int(time.time() * 1000)
                next_min = max(0, (next_ms - now_ms) // 60_000)
                return FundingInfo(
                    symbol=d["symbol"],
                    mark_price=float(d["markPrice"]),
                    funding_rate=float(d["lastFundingRate"]),
                    next_funding_min=next_min,
                )
    except Exception as exc:
        logger.warning("Binance futures funding failed for %s: %s", symbol, exc)
        return None


def format_volume(quote_vol: float) -> str:
    if quote_vol >= 1_000_000_000:
        return f"${quote_vol / 1_000_000_000:.1f}B"
    if quote_vol >= 1_000_000:
        return f"${quote_vol / 1_000_000:.1f}M"
    if quote_vol >= 1_000:
        return f"${quote_vol / 1_000:.1f}k"
    return f"${quote_vol:.0f}"


def format_price(price: float) -> str:
    if price >= 1000:
        return f"${price:,.2f}"
    if price >= 1:
        return f"${price:,.4f}"
    return f"${price:.6f}"
