"""TAAPI.io client — bulk fetch RSI/MACD/BBands/SuperTrend for an enrichment layer.

Used by the alert dispatcher to attach broader context (1h timeframe) to the
real-time tick-level alerts coming from the WebSocket monitor.

If TAAPI_KEY is unset, get_snapshot() returns None and dispatchers skip enrichment.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import aiohttp

logger = logging.getLogger("baseforge.taapi")

TAAPI_KEY = os.environ.get("TAAPI_KEY", "")
BULK_URL = "https://api.taapi.io/bulk"

# In-memory cache: (symbol, interval) → (timestamp, snapshot)
_cache: dict[tuple[str, str], tuple[float, "TaSnapshot"]] = {}
CACHE_TTL = 60  # seconds — TAAPI free tier rate-limits, cache per symbol


@dataclass
class TaSnapshot:
    rsi: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    macd_hist: float | None = None
    bb_upper: float | None = None
    bb_mid: float | None = None
    bb_lower: float | None = None
    supertrend: float | None = None
    supertrend_value: float | None = None  # 1 = long, -1 = short

    def format_brief(self) -> str:
        """One-line summary suitable for Telegram message footer."""
        parts: list[str] = []
        if self.rsi is not None:
            tone = "🔴" if self.rsi > 70 else "🟢" if self.rsi < 30 else "⚪"
            parts.append(f"{tone} RSI {self.rsi:.0f}")
        if self.macd_hist is not None:
            arrow = "↑" if self.macd_hist > 0 else "↓"
            parts.append(f"MACD {arrow}")
        if self.supertrend_value is not None:
            parts.append("ST " + ("long" if self.supertrend_value > 0 else "short"))
        return " · ".join(parts)


async def get_snapshot(symbol: str, interval: str = "1h") -> TaSnapshot | None:
    """Fetch RSI/MACD/BBands/SuperTrend for a Binance symbol on the given interval.

    `symbol` accepts either "AEROUSDT" or "AERO/USDT" — normalized internally.
    """
    if not TAAPI_KEY:
        return None

    import time as _t
    key = (symbol.upper(), interval)
    now = _t.time()
    cached = _cache.get(key)
    if cached and now - cached[0] < CACHE_TTL:
        return cached[1]

    pair = symbol.upper()
    if "/" not in pair and pair.endswith("USDT"):
        pair = f"{pair[:-4]}/USDT"

    payload = {
        "secret": TAAPI_KEY,
        "construct": {
            "exchange": "binance",
            "symbol": pair,
            "interval": interval,
            "indicators": [
                {"indicator": "rsi", "id": "rsi"},
                {"indicator": "macd", "id": "macd"},
                {"indicator": "bbands", "id": "bbands"},
                {"indicator": "supertrend", "id": "supertrend"},
            ],
        },
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(BULK_URL, json=payload, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                if resp.status != 200:
                    logger.warning("TAAPI %s for %s", resp.status, pair)
                    return None
                data = await resp.json()
    except Exception as exc:
        logger.warning("TAAPI fetch failed for %s: %s", pair, exc)
        return None

    snapshot = _parse(data)
    _cache[key] = (now, snapshot)
    return snapshot


def _parse(data: dict) -> TaSnapshot:
    """Parse TAAPI bulk response into a TaSnapshot."""
    snap = TaSnapshot()
    results = data.get("data", [])
    by_id = {r.get("id"): r.get("result", {}) for r in results if r.get("result")}

    if "rsi" in by_id:
        snap.rsi = by_id["rsi"].get("value")
    if "macd" in by_id:
        m = by_id["macd"]
        snap.macd = m.get("valueMACD")
        snap.macd_signal = m.get("valueMACDSignal")
        snap.macd_hist = m.get("valueMACDHist")
    if "bbands" in by_id:
        b = by_id["bbands"]
        snap.bb_upper = b.get("valueUpperBand")
        snap.bb_mid = b.get("valueMiddleBand")
        snap.bb_lower = b.get("valueLowerBand")
    if "supertrend" in by_id:
        s = by_id["supertrend"]
        snap.supertrend = s.get("value")
        # TAAPI returns valueAdvice "long"/"short" — map to ±1
        advice = s.get("valueAdvice", "").lower()
        snap.supertrend_value = 1.0 if advice == "long" else (-1.0 if advice == "short" else None)
    return snap
