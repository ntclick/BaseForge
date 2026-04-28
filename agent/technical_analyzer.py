"""Technical indicator calculations.

Wraps pandas-ta for EMA / RSI / Bollinger / MACD / volume z-score so the
alert engine works with a stable, typed snapshot rather than a raw DataFrame.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import pandas as pd
import pandas_ta as ta


@dataclass
class IndicatorSnapshot:
    price: float
    ema_20: float
    ema_50: float
    ema_200: float
    rsi_14: float
    bb_upper: float
    bb_mid: float
    bb_lower: float
    macd: float
    macd_signal: float
    macd_hist: float
    volume: float
    volume_sma_20: float
    volume_spike: float


def _candles_to_df(candles: Iterable) -> pd.DataFrame:
    rows = [
        {
            "open": c.open,
            "high": c.high,
            "low": c.low,
            "close": c.close,
            "volume": c.volume,
        }
        for c in candles
    ]
    return pd.DataFrame(rows)


def compute(candles: Iterable) -> IndicatorSnapshot | None:
    df = _candles_to_df(candles)
    if len(df) < 50:
        return None

    ema_20 = ta.ema(df["close"], length=20)
    ema_50 = ta.ema(df["close"], length=50)
    ema_200 = ta.ema(df["close"], length=200) if len(df) >= 200 else ema_50
    rsi = ta.rsi(df["close"], length=14)
    bb = ta.bbands(df["close"], length=20, std=2.0)
    macd = ta.macd(df["close"], fast=12, slow=26, signal=9)
    vol_sma = df["volume"].rolling(20).mean()

    last = -1
    return IndicatorSnapshot(
        price=float(df["close"].iloc[last]),
        ema_20=float(ema_20.iloc[last]),
        ema_50=float(ema_50.iloc[last]),
        ema_200=float(ema_200.iloc[last]),
        rsi_14=float(rsi.iloc[last]),
        bb_upper=float(bb[bb.columns[bb.columns.str.startswith("BBU_")][0]].iloc[last]),
        bb_mid=float(bb[bb.columns[bb.columns.str.startswith("BBM_")][0]].iloc[last]),
        bb_lower=float(bb[bb.columns[bb.columns.str.startswith("BBL_")][0]].iloc[last]),
        macd=float(macd["MACD_12_26_9"].iloc[last]),
        macd_signal=float(macd["MACDs_12_26_9"].iloc[last]),
        macd_hist=float(macd["MACDh_12_26_9"].iloc[last]),
        volume=float(df["volume"].iloc[last]),
        volume_sma_20=float(vol_sma.iloc[last]),
        volume_spike=float(df["volume"].iloc[last] / vol_sma.iloc[last])
        if vol_sma.iloc[last]
        else 0.0,
    )
