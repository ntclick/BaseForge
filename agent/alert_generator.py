"""Alert rule engine.

Pure function: takes (event, indicator snapshot, user config) → list of Alerts.
No I/O. The caller is responsible for dedup persistence and dispatch.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from technical_analyzer import IndicatorSnapshot

AlertType = Literal[
    "trade_size",
    "volume_spike",
    "ema_cross",
    "rsi_extreme",
    "bb_touch",
    "macd_cross",
    "support_resistance",
    "dump_risk",
    "funding_rate",
    "news",
]
Severity = Literal["info", "warn", "critical"]


@dataclass
class Alert:
    type: AlertType
    severity: Severity
    title: str
    detail: str
    payload: dict = field(default_factory=dict)


@dataclass
class UserConfig:
    token: str
    trade_size_usd: float = 50_000
    volume_multiplier: float = 3.0
    rsi_oversold: float = 30
    rsi_overbought: float = 70
    funding_rate_threshold: float = 0.05  # in % per 8h period (0.05% = elevated)
    enabled: set[AlertType] = field(default_factory=set)


def evaluate(
    event,
    snapshot: IndicatorSnapshot,
    config: UserConfig,
    prev: IndicatorSnapshot | None = None,
) -> list[Alert]:
    alerts: list[Alert] = []
    enabled = config.enabled

    # Trade size
    if "trade_size" in enabled and hasattr(event, "usd_value"):
        if event.usd_value >= config.trade_size_usd:
            direction = "SELL" if event.is_buyer_maker else "BUY"
            alerts.append(
                Alert(
                    type="trade_size",
                    severity="info",
                    title=f"{config.token} {direction} ${event.usd_value:,.0f}",
                    detail=f"Price ${event.price:.4f}",
                    payload={"direction": direction, "usd": event.usd_value},
                )
            )

    # Volume spike
    if "volume_spike" in enabled and snapshot.volume_spike >= config.volume_multiplier:
        alerts.append(
            Alert(
                type="volume_spike",
                severity="warn",
                title=f"{config.token} volume {snapshot.volume_spike:.1f}x average",
                detail=f"Volume {snapshot.volume:,.0f} vs SMA20 {snapshot.volume_sma_20:,.0f}",
                payload={"multiplier": snapshot.volume_spike},
            )
        )

    # EMA cross (needs prev)
    if "ema_cross" in enabled and prev:
        prev_diff = prev.ema_20 - prev.ema_50
        cur_diff = snapshot.ema_20 - snapshot.ema_50
        if prev_diff <= 0 < cur_diff:
            alerts.append(Alert("ema_cross", "info", f"{config.token} EMA20 crossed above EMA50 (bullish)", "Trend shift up"))
        elif prev_diff >= 0 > cur_diff:
            alerts.append(Alert("ema_cross", "warn", f"{config.token} EMA20 crossed below EMA50 (bearish)", "Trend shift down"))

    # RSI extremes
    if "rsi_extreme" in enabled:
        if snapshot.rsi_14 < config.rsi_oversold:
            alerts.append(Alert("rsi_extreme", "info", f"{config.token} RSI {snapshot.rsi_14:.1f} oversold", "Potential buy"))
        elif snapshot.rsi_14 > config.rsi_overbought:
            alerts.append(Alert("rsi_extreme", "warn", f"{config.token} RSI {snapshot.rsi_14:.1f} overbought", "Potential sell"))

    # Bollinger touch
    if "bb_touch" in enabled:
        if snapshot.price >= snapshot.bb_upper:
            alerts.append(Alert("bb_touch", "warn", f"{config.token} at upper band", "Potential sell signal"))
        elif snapshot.price <= snapshot.bb_lower:
            alerts.append(Alert("bb_touch", "info", f"{config.token} at lower band", "Potential buy signal"))

    # Funding rate (event has .funding_rate attribute when from markPrice stream)
    if "funding_rate" in enabled and hasattr(event, "funding_rate"):
        rate_pct = event.funding_rate * 100  # Binance returns as decimal (0.0005 = 0.05%)
        if abs(rate_pct) >= config.funding_rate_threshold:
            direction = "long-paying" if rate_pct > 0 else "short-paying"
            severity = "warn" if abs(rate_pct) > config.funding_rate_threshold * 2 else "info"
            alerts.append(
                Alert(
                    type="funding_rate",
                    severity=severity,
                    title=f"{config.token} funding {rate_pct:+.4f}% ({direction})",
                    detail=f"Mark ${event.mark_price:.4f} · next funding in {event.next_funding_min}m",
                    payload={"rate_pct": rate_pct, "mark_price": event.mark_price},
                )
            )

    # MACD cross
    if "macd_cross" in enabled and prev:
        prev_h = prev.macd - prev.macd_signal
        cur_h = snapshot.macd - snapshot.macd_signal
        if prev_h <= 0 < cur_h:
            alerts.append(Alert("macd_cross", "info", f"{config.token} MACD bullish cross", "Momentum up"))
        elif prev_h >= 0 > cur_h:
            alerts.append(Alert("macd_cross", "warn", f"{config.token} MACD bearish cross", "Momentum down"))

    return alerts
