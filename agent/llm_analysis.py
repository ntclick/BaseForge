"""Kimi (Moonshot) LLM-based market commentary.

Given a snapshot of facts about a token, calls Kimi via the OpenAI-compatible
endpoint to produce a concise, professional 2-sentence analysis suitable for
inclusion in Telegram alerts.

If KIMI_API_KEY is unset or the call fails, returns None and dispatchers skip
the analysis section.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import aiohttp

logger = logging.getLogger("baseforge.llm")

KIMI_KEY = os.environ.get("KIMI_API_KEY", "")
KIMI_URL = "https://api.moonshot.ai/v1/chat/completions"
KIMI_MODEL = os.environ.get("KIMI_MODEL", "kimi-k2-0711-preview")


@dataclass
class MarketFacts:
    token: str
    price: float
    change_pct_24h: float
    volume_quote_24h: float
    funding_rate: float | None = None       # decimal, e.g. 0.0001
    rsi_1h: float | None = None
    macd_hist: float | None = None
    high_24h: float | None = None
    low_24h: float | None = None


async def generate_analysis(facts: MarketFacts) -> str | None:
    """Return a 1-2 sentence professional market commentary, or None on failure.

    Optimized for Telegram: ≤220 chars, no emoji, no first-person phrasing.
    """
    if not KIMI_KEY or KIMI_KEY in ("replace-me", ""):
        return None

    bullets: list[str] = []
    bullets.append(f"Spot price ${facts.price:,.4f}")
    bullets.append(f"24h change {facts.change_pct_24h:+.2f}%")
    if facts.high_24h and facts.low_24h:
        ratio = (facts.price - facts.low_24h) / max(0.0001, facts.high_24h - facts.low_24h)
        position = "near 24h high" if ratio > 0.85 else "near 24h low" if ratio < 0.15 else f"{ratio*100:.0f}% of 24h range"
        bullets.append(f"Position: {position}")
    bullets.append(f"24h volume ${facts.volume_quote_24h/1e6:,.1f}M")
    if facts.funding_rate is not None:
        side = "long-paying" if facts.funding_rate > 0 else "short-paying"
        bullets.append(f"Perp funding {facts.funding_rate*100:+.4f}% ({side})")
    if facts.rsi_1h is not None:
        zone = "oversold" if facts.rsi_1h < 30 else "overbought" if facts.rsi_1h > 70 else "neutral"
        bullets.append(f"RSI(1h) {facts.rsi_1h:.0f} ({zone})")
    if facts.macd_hist is not None:
        bullets.append(f"MACD histogram {facts.macd_hist:+.5f}")

    prompt = (
        f"You are a senior crypto desk analyst. Facts about {facts.token}/USDT:\n"
        + "\n".join(f"- {b}" for b in bullets)
        + "\n\nWrite exactly 2 short sentences (≤220 chars total) covering: "
        + "(1) current momentum/structure, (2) the single most important risk or "
        + "opportunity for the next 1-4h. Direct, professional, no emoji, no hedging "
        + "phrases like 'it appears' or 'we see'."
    )

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                KIMI_URL,
                headers={
                    "Authorization": f"Bearer {KIMI_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": KIMI_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": 120,
                    "temperature": 0.4,
                },
                timeout=aiohttp.ClientTimeout(total=12),
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.warning("Kimi %s: %s", resp.status, text[:200])
                    return None
                data = await resp.json()
                content = data["choices"][0]["message"]["content"].strip()
                # Trim to one line if model added extra blanks
                content = " ".join(content.split())
                return content[:280]
    except Exception as exc:
        logger.warning("Kimi call failed: %s", exc)
        return None
