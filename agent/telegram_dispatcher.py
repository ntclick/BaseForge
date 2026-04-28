"""Telegram bot dispatcher.

Sends formatted alerts to a user's chat with inline action buttons
(View Dashboard / Manage / Snooze 1h). Honors per-user snooze state.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

import requests

from alert_generator import Alert

API_BASE = "https://api.telegram.org"


@dataclass
class TelegramConfig:
    bot_token: str
    dashboard_url: str = "https://baseforge.app"


def _escape_markdown(text: str) -> str:
    """Escape characters that confuse Telegram Markdown v1 parser."""
    # Markdown v1: only *, _, `, [ are special. Escape underscores in body text
    # to avoid stray italic. Keep asterisks because we add them ourselves.
    return text.replace("_", "\\_").replace("`", "\\`")


def _format(alert: Alert, token: str, ta_brief: str | None = None) -> str:
    icon = {"info": "🔔", "warn": "⚠️", "critical": "🚨"}[alert.severity]
    body = f"{icon} *{alert.title}*\n{alert.detail}"
    if ta_brief:
        body += f"\n\n_{ta_brief}_"
    return body


def send(
    chat_id: str,
    alert: Alert,
    token: str,
    cfg: TelegramConfig,
    ta_brief: str | None = None,
    agent_id: str | None = None,
) -> dict:
    payload: dict = {
        "chat_id": chat_id,
        "text": _format(alert, token, ta_brief),
        "parse_mode": "Markdown",
    }
    url = (cfg.dashboard_url or "").strip()
    has_real_url = url.startswith("https://") and "baseforge.app" not in url
    # Action row: Snooze always, Stop when agent_id available, Dashboard when URL real.
    buttons: list[dict] = [{"text": "💤 Snooze 1h", "callback_data": f"snooze:{token}:3600"}]
    if agent_id:
        buttons.append({"text": "⏸ Stop agent", "callback_data": f"stop:{agent_id}"})
    if has_real_url:
        buttons.insert(0, {"text": "📋 Dashboard", "url": f"{url}/dashboard"})
    payload["reply_markup"] = {"inline_keyboard": [buttons]}
    r = requests.post(f"{API_BASE}/bot{cfg.bot_token}/sendMessage", json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


def send_rich_test(
    chat_id: str,
    cfg: TelegramConfig,
    *,
    token: str,
    agent_id: str | None = None,
    nft_token_id: str | None = None,
    enabled_alerts: list[str] | None = None,
    thresholds: dict | None = None,
    ticker=None,         # Ticker24h | None
    funding=None,        # FundingInfo | None
    ta_brief: str | None = None,
    llm_analysis: str | None = None,    # 2-sentence Kimi-generated commentary
) -> dict:
    """Send a rich, info-dense test alert. Includes current price, 24h change,
    indicator readings, funding rate, and the full list of alert rules being
    watched. Used by the test endpoints (pre-mint and post-mint).
    """
    enabled = enabled_alerts or []
    thresholds = thresholds or {}

    # Header
    lines: list[str] = [
        f"⚡ *BaseForge — {token}/USDT*"
    ]
    if nft_token_id:
        lines[-1] += f"  · #{nft_token_id}"
    lines.append("_Test alert · setup verified_")
    lines.append("")

    # Market snapshot
    if ticker is not None:
        from binance_market import format_price, format_volume
        pct = ticker.price_change_pct
        arrow = "🟢↗" if pct >= 0 else "🔴↘"
        lines.append(f"💵 *{format_price(ticker.last_price)}*  {arrow} *{pct:+.2f}%* (24h)")
        lines.append(f"📊 Vol {format_volume(ticker.volume_quote)} · H {format_price(ticker.high)} · L {format_price(ticker.low)}")
    else:
        lines.append(f"📊 _Live price unavailable for {token}/USDT_")

    if ta_brief:
        lines.append(f"📈 {ta_brief}")

    if funding is not None:
        rate_pct = funding.funding_rate * 100
        side = "long-paying" if rate_pct > 0 else "short-paying" if rate_pct < 0 else "neutral"
        lines.append(f"⚡ Funding *{rate_pct:+.4f}%* ({side}) · next {funding.next_funding_min}m")

    # AI commentary section
    if llm_analysis:
        lines.append("")
        lines.append("🧠 *Analyst note*")
        lines.append(f"_{_escape_markdown(llm_analysis)}_")

    lines.append("")

    # Watching for
    if enabled:
        lines.append("*Watching for:*")
        labels = _labels_for_alerts(enabled, thresholds, token)
        lines.extend(labels)
    else:
        lines.append("_No alert types enabled yet — configure in dashboard_")

    if agent_id:
        lines.append("")
        lines.append(f"`agent {agent_id[:8]}…`")

    text = "\n".join(lines)

    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
        "disable_web_page_preview": True,
    }
    # Build inline keyboard. Snooze + Stop are callback buttons (always work).
    # Dashboard/Configure are URL buttons — only show when DASHBOARD_URL is real.
    rows: list[list[dict]] = []
    url = (cfg.dashboard_url or "").strip()
    if url.startswith("https://") and "baseforge.app" not in url:
        agent_path = f"/agents/{agent_id}" if agent_id else "/dashboard"
        rows.append([
            {"text": "📋 Dashboard", "url": f"{url}/dashboard"},
            {"text": "⚙ Configure", "url": f"{url}{agent_path}"},
        ])
    action_row: list[dict] = [{"text": "💤 Snooze 1h", "callback_data": f"snooze:{token}:3600"}]
    if agent_id:
        action_row.append({"text": "⏸ Stop agent", "callback_data": f"stop:{agent_id}"})
    rows.append(action_row)
    payload["reply_markup"] = {"inline_keyboard": rows}

    r = requests.post(f"{API_BASE}/bot{cfg.bot_token}/sendMessage", json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


def _labels_for_alerts(enabled: list[str], t: dict, token: str) -> list[str]:
    """Pretty-print each enabled alert type with its threshold."""
    out: list[str] = []
    if "trade_size" in enabled:
        size = t.get("trade_size_usd", 50000)
        out.append(f"  🐋 Whale trade ≥ *${int(size):,}*")
    if "volume_spike" in enabled:
        mult = t.get("volume_multiplier", 3)
        out.append(f"  📈 Volume *{mult}×* avg")
    if "rsi_extreme" in enabled:
        lo = int(t.get("rsi_oversold", 30))
        hi = int(t.get("rsi_overbought", 70))
        out.append(f"  🌡 RSI < *{lo}* or > *{hi}*")
    if "ema_cross" in enabled:
        out.append("  🎯 EMA20 × EMA50 crossover")
    if "bb_touch" in enabled:
        out.append("  📉📈 Price hits Bollinger band")
    if "macd_cross" in enabled:
        out.append("  〽️ MACD signal cross")
    if "funding_rate" in enabled:
        thr = t.get("funding_rate_threshold", 0.05)
        out.append(f"  ⚡ Funding rate ±*{thr}%*")
    if "news" in enabled:
        out.append(f"  📰 News mentions of *{token}*")
    if "support_resistance" in enabled:
        out.append("  🧱 Support / resistance break")
    if "dump_risk" in enabled:
        out.append("  ⚠️ Dump risk (holder concentration)")
    return out


_snoozes: dict[tuple[str, str], float] = {}


def snooze(chat_id: str, token: str, seconds: int) -> None:
    _snoozes[(chat_id, token)] = time.time() + seconds


def is_snoozed(chat_id: str, token: str) -> bool:
    until = _snoozes.get((chat_id, token), 0)
    return time.time() < until
