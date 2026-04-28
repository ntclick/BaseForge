"""Binance WebSocket monitor.

Connects to Binance public streams (aggTrade + kline_1m) for a given symbol,
maintains a rolling OHLCV buffer (default 200 candles), and dispatches each
update to a callback (typically the technical_analyzer + alert_generator).

Usage:
    monitor = BinanceMonitor("AEROUSDT", on_update=handle)
    await monitor.run()
"""

from __future__ import annotations

import asyncio
import json
from collections import deque
from dataclasses import dataclass
from typing import Awaitable, Callable, Deque

import websockets

WS_BASE = "wss://stream.binance.com:9443/ws"
WS_FUTURES = "wss://fstream.binance.com/ws"


@dataclass
class Candle:
    open_time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: int


@dataclass
class Trade:
    price: float
    qty: float
    is_buyer_maker: bool
    timestamp: int

    @property
    def usd_value(self) -> float:
        return self.price * self.qty


@dataclass
class FundingRate:
    funding_rate: float       # Binance "r" field (decimal, e.g. 0.0005)
    mark_price: float         # "p"
    next_funding_min: int     # minutes until next funding event


UpdateHandler = Callable[[str, Candle | Trade | FundingRate, Deque[Candle]], Awaitable[None]]


class BinanceMonitor:
    def __init__(
        self,
        symbol: str,
        on_update: UpdateHandler,
        buffer_size: int = 200,
        track_funding: bool = False,
    ):
        self.symbol = symbol.lower()
        self.on_update = on_update
        self.track_funding = track_funding
        self.candles: Deque[Candle] = deque(maxlen=buffer_size)

    async def run(self) -> None:
        tasks = [asyncio.create_task(self._run_spot())]
        if self.track_funding:
            tasks.append(asyncio.create_task(self._run_futures()))
        try:
            await asyncio.gather(*tasks)
        except asyncio.CancelledError:
            for t in tasks:
                t.cancel()
            raise

    async def _run_spot(self) -> None:
        streams = f"{self.symbol}@aggTrade/{self.symbol}@kline_1m"
        url = f"{WS_BASE}/{streams}"
        async for ws in websockets.connect(url, ping_interval=20):
            try:
                async for raw in ws:
                    await self._dispatch(json.loads(raw))
            except websockets.ConnectionClosed:
                continue

    async def _run_futures(self) -> None:
        # markPrice@1s — emits fundingRate, markPrice, nextFundingTime every 1s
        url = f"{WS_FUTURES}/{self.symbol}@markPrice@1s"
        async for ws in websockets.connect(url, ping_interval=20):
            try:
                async for raw in ws:
                    msg = json.loads(raw)
                    if msg.get("e") == "markPriceUpdate":
                        next_funding_ms = int(msg.get("T", 0))
                        now_ms = int(msg.get("E", 0))
                        next_min = max(0, (next_funding_ms - now_ms) // 60_000)
                        fr = FundingRate(
                            funding_rate=float(msg["r"]),
                            mark_price=float(msg["p"]),
                            next_funding_min=next_min,
                        )
                        await self.on_update(self.symbol.upper(), fr, self.candles)
            except websockets.ConnectionClosed:
                continue

    async def _dispatch(self, msg: dict) -> None:
        event = msg.get("e")
        if event == "aggTrade":
            trade = Trade(
                price=float(msg["p"]),
                qty=float(msg["q"]),
                is_buyer_maker=bool(msg["m"]),
                timestamp=int(msg["T"]),
            )
            await self.on_update(self.symbol.upper(), trade, self.candles)
        elif event == "kline":
            k = msg["k"]
            if not k["x"]:
                return
            candle = Candle(
                open_time=int(k["t"]),
                open=float(k["o"]),
                high=float(k["h"]),
                low=float(k["l"]),
                close=float(k["c"]),
                volume=float(k["v"]),
                close_time=int(k["T"]),
            )
            self.candles.append(candle)
            await self.on_update(self.symbol.upper(), candle, self.candles)


async def _print_handler(symbol: str, event: object, candles: Deque[Candle]) -> None:
    print(f"[{symbol}] {type(event).__name__}: {event} | buffer={len(candles)}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--symbol", default="AEROUSDT")
    args = parser.parse_args()
    asyncio.run(BinanceMonitor(args.symbol, _print_handler).run())
