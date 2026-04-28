"""CoinGecko news poller.

Polls /news every POLL_INTERVAL seconds and fires a `news` Alert for any
monitored token that appears in the headline. Dedup by article id — each
article only triggers once per token.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Callable, Awaitable

import aiohttp

from alert_generator import Alert

logger = logging.getLogger("baseforge.news")

POLL_INTERVAL = 300  # seconds between polls
CG_NEWS_URL = "https://api.coingecko.com/api/v3/news"
_CG_KEY = os.environ.get("COINGECKO_API_KEY", "")

# article_id → set of token symbols already alerted
_seen: dict[str, set[str]] = {}


NewsHandler = Callable[[str, Alert], Awaitable[None]]


def _extract_symbol_mentions(text: str, symbols: set[str]) -> set[str]:
    """Return symbols that appear as whole words in text (case-insensitive)."""
    text_upper = text.upper()
    found: set[str] = set()
    for sym in symbols:
        # Simple whole-word check: must be surrounded by non-alpha chars
        import re
        if re.search(r"(?<![A-Z])" + re.escape(sym.upper()) + r"(?![A-Z])", text_upper):
            found.add(sym)
    return found


class NewsMonitor:
    """Background poller. Call start() to kick off; holds a reference to
    a callback that receives (token_symbol, Alert).
    """

    def __init__(self, on_alert: NewsHandler):
        self.on_alert = on_alert
        self._watched: dict[str, str] = {}  # symbol → agent_id (last one wins)
        self._task: asyncio.Task | None = None

    def watch(self, symbol: str, agent_id: str) -> None:
        self._watched[symbol.upper()] = agent_id

    def unwatch(self, symbol: str) -> None:
        self._watched.pop(symbol.upper(), None)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop(), name="news-monitor")

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    async def _loop(self) -> None:
        while True:
            try:
                await self._poll()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("News poll error: %s", exc)
            await asyncio.sleep(POLL_INTERVAL)

    async def _poll(self) -> None:
        if not self._watched:
            return
        headers = {}
        if _CG_KEY:
            headers["x-cg-pro-api-key"] = _CG_KEY
        async with aiohttp.ClientSession() as session:
            async with session.get(CG_NEWS_URL, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    logger.warning("CoinGecko news %s", resp.status)
                    return
                data = await resp.json()

        articles = data if isinstance(data, list) else data.get("data", [])
        symbols = set(self._watched.keys())

        for article in articles:
            art_id = str(article.get("id") or article.get("url", ""))
            if not art_id:
                continue
            title = article.get("title", "")
            description = article.get("description", "") or ""
            text = f"{title} {description}"

            mentioned = _extract_symbol_mentions(text, symbols)
            already = _seen.get(art_id, set())
            new_mentions = mentioned - already

            for sym in new_mentions:
                alert = Alert(
                    type="news",
                    severity="info",
                    title=f"{sym} in the news",
                    detail=title[:200],
                    payload={"url": article.get("url", ""), "source": article.get("author", "")},
                )
                agent_id = self._watched.get(sym)
                try:
                    await self.on_alert(agent_id or sym, alert)
                    logger.info("News alert fired: %s → %s", sym, title[:80])
                except Exception as exc:
                    logger.error("News alert dispatch error: %s", exc)

            if new_mentions:
                _seen.setdefault(art_id, set()).update(new_mentions)

        # Prune old articles (keep last 500)
        if len(_seen) > 500:
            for old_id in list(_seen.keys())[:-500]:
                del _seen[old_id]
