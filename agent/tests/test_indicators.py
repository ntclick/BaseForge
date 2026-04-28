"""Smoke tests for the indicator engine.

Uses synthetic OHLCV data so tests are deterministic.
"""

from collections import deque

from binance_monitor import Candle
from technical_analyzer import compute


def _synth_candles(n: int = 100) -> deque:
    candles = deque(maxlen=n)
    price = 1.0
    for i in range(n):
        price *= 1.001 if i % 2 == 0 else 0.999
        candles.append(
            Candle(
                open_time=i,
                open=price,
                high=price * 1.01,
                low=price * 0.99,
                close=price,
                volume=1000 + i,
                close_time=i + 1,
            )
        )
    return candles


def test_compute_returns_none_when_too_few_candles():
    assert compute(deque([], maxlen=10)) is None


def test_compute_returns_snapshot_with_fields():
    snap = compute(_synth_candles(100))
    assert snap is not None
    assert snap.price > 0
    assert snap.ema_20 > 0
    assert 0 <= snap.rsi_14 <= 100
    assert snap.bb_upper >= snap.bb_mid >= snap.bb_lower
