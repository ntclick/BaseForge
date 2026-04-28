"""BaseForge agent service — FastAPI control plane + asyncio task supervisor.

Run via systemd: `python -m service` from /opt/baseforge-agent.

Port: AGENT_SERVICE_PORT (default 8200)
Auth: Bearer AGENT_SERVICE_TOKEN
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from collections import deque
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Deque

from fastapi import Depends, FastAPI, HTTPException, Response, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

import sys
sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))

from agent_store import AgentConfig, load_config, save_config
from alert_generator import UserConfig, evaluate
from binance_monitor import BinanceMonitor, Candle, FundingRate, Trade
from technical_analyzer import compute as compute_indicators
from binance_market import get_funding, get_ticker_24h
from llm_analysis import MarketFacts, generate_analysis as llm_generate
from news_monitor import NewsMonitor
from taapi_client import get_snapshot as taapi_snapshot
from telegram_dispatcher import TelegramConfig, is_snoozed, send, send_rich_test

PORT = int(os.environ.get("AGENT_SERVICE_PORT", "8200"))
SERVICE_TOKEN = os.environ.get("AGENT_SERVICE_TOKEN", "")
BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "https://baseforge.app")

logger = logging.getLogger("baseforge.service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

# ── Supervisor state ──────────────────────────────────────────────────────────

@dataclass
class AgentState:
    config: AgentConfig
    task: asyncio.Task
    report_task: asyncio.Task | None = None    # periodic snapshot reporter
    started_at: float = field(default_factory=time.time)
    last_alert_at: float = 0.0
    alert_count: int = 0
    error: str | None = None

_agents: dict[str, AgentState] = {}

# In-memory dedup: (agent_id, alert_type) → last fired timestamp
_dedup: dict[tuple[str, str], float] = {}
DEDUP_SECONDS = 30


# ── News monitor singleton ────────────────────────────────────────────────────

async def _dispatch_news_alert(agent_id_or_sym: str, alert) -> None:
    """Called by NewsMonitor for each new mention."""
    # Find agent by symbol when agent_id isn't directly known
    state = _agents.get(agent_id_or_sym)
    if state is None:
        # Fall back to symbol match
        for s in _agents.values():
            if s.config.token.upper() == agent_id_or_sym.upper():
                state = s
                break
    if state is None:
        return
    cfg = state.config
    if "news" not in cfg.enabled_alerts:
        return
    bot_token = cfg.telegram_bot_token or BOT_TOKEN
    tg_cfg = TelegramConfig(bot_token=bot_token, dashboard_url=DASHBOARD_URL)
    key = (cfg.agent_id, "news")
    now = time.time()
    if now - _dedup.get(key, 0) < DEDUP_SECONDS:
        return
    _dedup[key] = now
    if is_snoozed(cfg.telegram_chat_id, cfg.token):
        return
    ta_brief: str | None = None
    try:
        snap = await taapi_snapshot(f"{cfg.token}USDT", "1h")
        if snap is not None:
            ta_brief = snap.format_brief() or None
    except Exception:
        pass
    try:
        send(cfg.telegram_chat_id, alert, cfg.token, tg_cfg, ta_brief=ta_brief, agent_id=cfg.agent_id)
        state.last_alert_at = now
        state.alert_count += 1
    except Exception as exc:
        logger.error("News Telegram send failed: %s", exc)


_news_monitor: NewsMonitor | None = None


def _get_news_monitor() -> NewsMonitor:
    global _news_monitor
    if _news_monitor is None:
        _news_monitor = NewsMonitor(on_alert=_dispatch_news_alert)
    return _news_monitor


# ── Task runner ───────────────────────────────────────────────────────────────

async def _run_agent(cfg: AgentConfig) -> None:
    prev_snapshot = None
    # BYOB: prefer per-agent bot token, fall back to shared
    bot_token = cfg.telegram_bot_token or BOT_TOKEN
    tg_cfg = TelegramConfig(bot_token=bot_token, dashboard_url=DASHBOARD_URL)

    user_cfg = UserConfig(
        token=cfg.token,
        trade_size_usd=cfg.trade_size_usd,
        volume_multiplier=cfg.volume_multiplier,
        rsi_oversold=cfg.rsi_oversold,
        rsi_overbought=cfg.rsi_overbought,
        funding_rate_threshold=cfg.funding_rate_threshold,
        enabled=set(cfg.enabled_alerts),  # type: ignore[arg-type]
    )

    track_funding = "funding_rate" in cfg.enabled_alerts

    async def on_update(symbol: str, event: Candle | Trade | FundingRate, candles: Deque[Candle]) -> None:
        nonlocal prev_snapshot
        # Funding rate events bypass indicator computation (no candle data needed)
        if isinstance(event, FundingRate):
            alerts = evaluate(event, prev_snapshot, user_cfg, None) if prev_snapshot else []
            # Use a dummy snapshot fallback since evaluator needs one
            if not prev_snapshot:
                from alert_generator import Alert
                rate_pct = event.funding_rate * 100
                if "funding_rate" in user_cfg.enabled and abs(rate_pct) >= user_cfg.funding_rate_threshold:
                    direction = "long-paying" if rate_pct > 0 else "short-paying"
                    alerts = [Alert("funding_rate", "info", f"{cfg.token} funding {rate_pct:+.4f}% ({direction})", f"Mark ${event.mark_price:.4f}")]
                else:
                    alerts = []
        else:
            snapshot = compute_indicators(list(candles))
            if snapshot is None:
                return
            alerts = evaluate(event, snapshot, user_cfg, prev_snapshot)
            prev_snapshot = snapshot

        state = _agents.get(cfg.agent_id)
        for alert in alerts:
            key = (cfg.agent_id, alert.type)
            now = time.time()
            if now - _dedup.get(key, 0) < DEDUP_SECONDS:
                continue
            _dedup[key] = now
            if is_snoozed(cfg.telegram_chat_id, cfg.token):
                continue
            # Enrich with TAAPI 1h indicators (RSI/MACD/SuperTrend) when key is set
            ta_brief: str | None = None
            try:
                snap = await taapi_snapshot(f"{cfg.token}USDT", "1h")
                if snap is not None:
                    ta_brief = snap.format_brief() or None
            except Exception as exc:
                logger.warning("TAAPI enrichment failed: %s", exc)
            try:
                send(cfg.telegram_chat_id, alert, cfg.token, tg_cfg, ta_brief=ta_brief, agent_id=cfg.agent_id)
                if state:
                    state.last_alert_at = now
                    state.alert_count += 1
            except Exception as exc:
                logger.error("Telegram send failed: %s", exc)

    symbol = f"{cfg.token}USDT"
    monitor = BinanceMonitor(symbol, on_update, track_funding=track_funding)
    logger.info("Agent %s started monitoring %s", cfg.agent_id, symbol)
    try:
        await monitor.run()
    except asyncio.CancelledError:
        logger.info("Agent %s stopped", cfg.agent_id)
        raise
    except Exception as exc:
        state = _agents.get(cfg.agent_id)
        if state:
            state.error = str(exc)
        logger.exception("Agent %s crashed: %s", cfg.agent_id, exc)


async def _send_periodic_snapshot(cfg: AgentConfig) -> None:
    """Send a rich snapshot via the user's bot (regardless of events)."""
    bot_token = cfg.telegram_bot_token or BOT_TOKEN
    if not bot_token or not cfg.telegram_chat_id:
        return
    if is_snoozed(cfg.telegram_chat_id, cfg.token):
        return
    tg_cfg = TelegramConfig(bot_token=bot_token, dashboard_url=DASHBOARD_URL)
    ticker, funding, ta_brief, llm_text = await _enrich_market(cfg.token)
    thresholds = {
        "trade_size_usd": cfg.trade_size_usd,
        "volume_multiplier": cfg.volume_multiplier,
        "rsi_oversold": cfg.rsi_oversold,
        "rsi_overbought": cfg.rsi_overbought,
        "funding_rate_threshold": cfg.funding_rate_threshold,
    }
    try:
        send_rich_test(
            cfg.telegram_chat_id, tg_cfg,
            token=cfg.token,
            agent_id=cfg.agent_id,
            enabled_alerts=list(cfg.enabled_alerts),
            thresholds=thresholds,
            ticker=ticker, funding=funding, ta_brief=ta_brief, llm_analysis=llm_text,
        )
        state = _agents.get(cfg.agent_id)
        if state:
            state.last_alert_at = time.time()
            state.alert_count += 1
        logger.info("Periodic report sent for agent %s", cfg.agent_id)
    except Exception as exc:
        logger.error("Periodic report failed for %s: %s", cfg.agent_id, exc)


async def _periodic_reporter_loop(cfg: AgentConfig) -> None:
    """Background loop: send periodic snapshot every N minutes."""
    interval = cfg.report_interval_minutes * 60
    if interval <= 0:
        return
    # Wait one interval before the first report (don't spam right after creation)
    await asyncio.sleep(interval)
    while True:
        try:
            await _send_periodic_snapshot(cfg)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Reporter loop error: %s", exc)
        await asyncio.sleep(interval)


def _start_task(cfg: AgentConfig) -> AgentState:
    task = asyncio.create_task(_run_agent(cfg), name=f"agent-{cfg.agent_id}")
    report_task = None
    if cfg.report_interval_minutes > 0:
        report_task = asyncio.create_task(_periodic_reporter_loop(cfg), name=f"report-{cfg.agent_id}")
        logger.info("Started periodic reporter for %s every %d min", cfg.agent_id, cfg.report_interval_minutes)
    state = AgentState(config=cfg, task=task, report_task=report_task)
    _agents[cfg.agent_id] = state
    # Register with news monitor if news alerts enabled
    if "news" in cfg.enabled_alerts:
        nm = _get_news_monitor()
        nm.watch(cfg.token, cfg.agent_id)
        nm.start()
    return state


async def _stop_task(agent_id: str) -> None:
    state = _agents.pop(agent_id, None)
    if state:
        nm = _get_news_monitor()
        nm.unwatch(state.config.token)
        if state.report_task and not state.report_task.done():
            state.report_task.cancel()
        if not state.task.done():
            state.task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(state.task), timeout=5)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
    # Stop news monitor if no agents watching news
    if _news_monitor and not any("news" in s.config.enabled_alerts for s in _agents.values()):
        _news_monitor.stop()


# ── Startup: reload persisted agents ─────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    data_dir = __import__("pathlib").Path(os.environ.get("BASEFORGE_DATA_DIR", "/var/lib/baseforge")) / "agents"
    if data_dir.exists():
        for agent_dir in data_dir.iterdir():
            cfg_file = agent_dir / "config.json"
            if cfg_file.exists():
                try:
                    cfg = load_config(agent_dir.name)
                    if cfg.status == "active":
                        _start_task(cfg)
                        logger.info("Resumed agent %s", cfg.agent_id)
                except Exception as exc:
                    logger.warning("Could not resume agent %s: %s", agent_dir.name, exc)
    yield
    for agent_id in list(_agents.keys()):
        await _stop_task(agent_id)


app = FastAPI(title="BaseForge Agent Service", version="1.0.0", lifespan=lifespan)

# ── Auth ──────────────────────────────────────────────────────────────────────

bearer_scheme = HTTPBearer(auto_error=True)

def verify_token(creds: HTTPAuthorizationCredentials = Security(bearer_scheme)) -> None:
    if SERVICE_TOKEN and creds.credentials != SERVICE_TOKEN:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class CreateAgentRequest(BaseModel):
    agent_id: str
    token: str                      # e.g. "AERO"
    telegram_chat_id: str
    telegram_bot_token: str = ""    # BYOB; empty → use shared TELEGRAM_BOT_TOKEN env
    trade_size_usd: float = 50_000
    volume_multiplier: float = 3.0
    rsi_oversold: float = 30
    rsi_overbought: float = 70
    funding_rate_threshold: float = 0.05
    enabled_alerts: list[str] = []
    report_interval_minutes: int = 0


class UpdateAgentRequest(BaseModel):
    trade_size_usd: float | None = None
    volume_multiplier: float | None = None
    rsi_oversold: float | None = None
    rsi_overbought: float | None = None
    enabled_alerts: list[str] | None = None
    report_interval_minutes: int | None = None
    status: str | None = None       # "active" | "paused"


class AgentStatusResponse(BaseModel):
    agent_id: str
    token: str
    status: str
    uptime_seconds: float
    last_alert_at: float
    alert_count: int
    error: str | None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "agents": len(_agents)}


@app.post("/agents", status_code=status.HTTP_201_CREATED, dependencies=[Depends(verify_token)])
async def create_agent(body: CreateAgentRequest) -> dict:
    if body.agent_id in _agents:
        raise HTTPException(status_code=409, detail="Agent already running")

    cfg = AgentConfig(
        agent_id=body.agent_id,
        token=body.token,
        telegram_chat_id=body.telegram_chat_id,
        telegram_bot_token=body.telegram_bot_token,
        trade_size_usd=body.trade_size_usd,
        volume_multiplier=body.volume_multiplier,
        rsi_oversold=body.rsi_oversold,
        rsi_overbought=body.rsi_overbought,
        funding_rate_threshold=body.funding_rate_threshold,
        enabled_alerts=body.enabled_alerts,
        report_interval_minutes=body.report_interval_minutes,
        status="active",
    )
    save_config(cfg)
    _start_task(cfg)
    return {"agent_id": cfg.agent_id, "status": "started"}


@app.patch("/agents/{agent_id}", dependencies=[Depends(verify_token)])
async def update_agent(agent_id: str, body: UpdateAgentRequest) -> dict:
    # Load persisted config regardless of whether task is running
    try:
        cfg = load_config(agent_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")

    if body.trade_size_usd is not None:
        cfg.trade_size_usd = body.trade_size_usd
    if body.volume_multiplier is not None:
        cfg.volume_multiplier = body.volume_multiplier
    if body.rsi_oversold is not None:
        cfg.rsi_oversold = body.rsi_oversold
    if body.rsi_overbought is not None:
        cfg.rsi_overbought = body.rsi_overbought
    if body.enabled_alerts is not None:
        cfg.enabled_alerts = body.enabled_alerts
    if body.report_interval_minutes is not None:
        cfg.report_interval_minutes = body.report_interval_minutes
    if body.status is not None:
        cfg.status = body.status

    save_config(cfg)

    # Hot-reload: cancel old task and start fresh (or just stop if paused)
    await _stop_task(agent_id)
    if cfg.status == "active":
        _start_task(cfg)
        return {"agent_id": agent_id, "status": "restarted"}
    return {"agent_id": agent_id, "status": "paused"}


@app.delete("/agents/{agent_id}", dependencies=[Depends(verify_token)])
async def delete_agent(agent_id: str) -> Response:
    await _stop_task(agent_id)
    try:
        cfg = load_config(agent_id)
        cfg.status = "deleted"
        save_config(cfg)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")
    return Response(status_code=204)


@app.get("/agents/{agent_id}", dependencies=[Depends(verify_token)])
async def get_agent(agent_id: str) -> AgentStatusResponse:
    state = _agents.get(agent_id)
    if state:
        return AgentStatusResponse(
            agent_id=agent_id,
            token=state.config.token,
            status=state.config.status,
            uptime_seconds=time.time() - state.started_at,
            last_alert_at=state.last_alert_at,
            alert_count=state.alert_count,
            error=state.error,
        )
    # Not running — check disk
    try:
        cfg = load_config(agent_id)
        return AgentStatusResponse(
            agent_id=agent_id,
            token=cfg.token,
            status=cfg.status,
            uptime_seconds=0,
            last_alert_at=0,
            alert_count=0,
            error=None,
        )
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Agent not found")


class TestAlertRequest(BaseModel):
    """For pre-mint testing: send a test alert with arbitrary bot + chat."""
    telegram_chat_id: str
    telegram_bot_token: str = ""
    token: str = "BTC"
    enabled_alerts: list[str] = []
    thresholds: dict = {}


async def _enrich_market(token: str) -> tuple:
    """Fetch ticker + funding + TAAPI in parallel, then call Kimi for analysis.

    Returns (ticker, funding, ta_brief, llm_analysis).
    """
    symbol = f"{token}USDT"
    ticker, funding, taapi = await asyncio.gather(
        get_ticker_24h(symbol),
        get_funding(symbol),
        taapi_snapshot(symbol, "1h"),
        return_exceptions=True,
    )
    ticker = ticker if not isinstance(ticker, Exception) else None
    funding = funding if not isinstance(funding, Exception) else None
    taapi = taapi if not isinstance(taapi, Exception) else None
    ta_brief = taapi.format_brief() or None if taapi is not None else None

    # Kimi commentary (uses whatever data we managed to fetch)
    llm_text: str | None = None
    if ticker is not None:
        try:
            facts = MarketFacts(
                token=token,
                price=ticker.last_price,
                change_pct_24h=ticker.price_change_pct,
                volume_quote_24h=ticker.volume_quote,
                high_24h=ticker.high,
                low_24h=ticker.low,
                funding_rate=funding.funding_rate if funding else None,
                rsi_1h=taapi.rsi if taapi else None,
                macd_hist=taapi.macd_hist if taapi else None,
            )
            llm_text = await llm_generate(facts)
        except Exception as exc:
            logger.warning("LLM analysis failed: %s", exc)

    return (ticker, funding, ta_brief, llm_text)


@app.post("/test-bot", dependencies=[Depends(verify_token)])
async def test_bot(body: TestAlertRequest) -> dict:
    """Send a rich test alert via the provided bot. Used in the wizard before
    minting so users can verify their setup works.
    """
    bot_token = body.telegram_bot_token or BOT_TOKEN
    if not bot_token:
        raise HTTPException(status_code=400, detail="No bot token provided and no shared bot configured")
    tg_cfg = TelegramConfig(bot_token=bot_token, dashboard_url=DASHBOARD_URL)

    ticker, funding, ta_brief, llm_text = await _enrich_market(body.token)
    enabled = body.enabled_alerts or ["trade_size", "volume_spike", "rsi_extreme", "ema_cross", "bb_touch", "macd_cross"]
    try:
        send_rich_test(
            body.telegram_chat_id, tg_cfg,
            token=body.token,
            enabled_alerts=enabled,
            thresholds=body.thresholds or {},
            ticker=ticker, funding=funding, ta_brief=ta_brief, llm_analysis=llm_text,
        )
        return {"ok": True}
    except Exception as exc:
        logger.error("Test send failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Telegram send failed: {exc}")


@app.post("/agents/{agent_id}/test", dependencies=[Depends(verify_token)])
async def test_agent(agent_id: str) -> dict:
    """Rich test alert for an existing agent. Works any time after setup."""
    state = _agents.get(agent_id)
    if state is None:
        try:
            cfg = load_config(agent_id)
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="Agent not found")
    else:
        cfg = state.config

    bot_token = cfg.telegram_bot_token or BOT_TOKEN
    if not bot_token:
        raise HTTPException(status_code=400, detail="No bot token configured")
    tg_cfg = TelegramConfig(bot_token=bot_token, dashboard_url=DASHBOARD_URL)

    ticker, funding, ta_brief, llm_text = await _enrich_market(cfg.token)
    thresholds = {
        "trade_size_usd": cfg.trade_size_usd,
        "volume_multiplier": cfg.volume_multiplier,
        "rsi_oversold": cfg.rsi_oversold,
        "rsi_overbought": cfg.rsi_overbought,
        "funding_rate_threshold": cfg.funding_rate_threshold,
    }
    try:
        send_rich_test(
            cfg.telegram_chat_id, tg_cfg,
            token=cfg.token,
            agent_id=cfg.agent_id,
            enabled_alerts=list(cfg.enabled_alerts),
            thresholds=thresholds,
            ticker=ticker, funding=funding, ta_brief=ta_brief, llm_analysis=llm_text,
        )
        return {"ok": True}
    except Exception as exc:
        logger.error("Test send failed: %s", exc)
        raise HTTPException(status_code=502, detail=f"Telegram send failed: {exc}")


@app.get("/agents", dependencies=[Depends(verify_token)])
async def list_agents() -> list[dict]:
    return [
        {
            "agent_id": aid,
            "token": s.config.token,
            "status": s.config.status,
            "uptime_seconds": time.time() - s.started_at,
            "alert_count": s.alert_count,
        }
        for aid, s in _agents.items()
    ]


# ── Telegram snooze webhook ───────────────────────────────────────────────────

class TelegramUpdate(BaseModel):
    update_id: int
    callback_query: dict | None = None


@app.post("/telegram/webhook")
async def telegram_webhook(update: TelegramUpdate) -> dict:
    """Handle Telegram inline button callbacks (snooze + stop)."""
    from telegram_dispatcher import snooze as tg_snooze

    cb = update.callback_query
    if not cb:
        return {"ok": True}

    # Telegram uses 'data' (not 'callback_data') in real updates
    data = cb.get("data") or cb.get("callback_data", "")
    chat_id = str(cb["message"]["chat"]["id"])
    cb_id = cb.get("id", "")

    answer_text = "OK"

    if data.startswith("snooze:"):
        _, token, seconds_str = data.split(":", 2)
        tg_snooze(chat_id, token, int(seconds_str))
        logger.info("Snoozed %s for %s for %ss", token, chat_id, seconds_str)
        answer_text = f"💤 {token} snoozed for {int(seconds_str)//60}m"

    elif data.startswith("stop:"):
        agent_id = data.split(":", 1)[1]
        try:
            cfg = load_config(agent_id)
        except FileNotFoundError:
            answer_text = "Agent not found"
        else:
            cfg.status = "paused"
            save_config(cfg)
            await _stop_task(agent_id)
            logger.info("Agent %s paused via Telegram", agent_id)
            answer_text = f"⏸ {cfg.token} agent paused"

    # ACK the callback so Telegram clears the loading spinner on the button
    if cb_id:
        try:
            import requests as _r
            # Use the bot token from the message itself? We need the bot token.
            # The webhook is hit by Telegram which knows the bot, but we need to
            # answer via the right bot. Look up via the chat's agent.
            bot_token = _resolve_bot_token_for_chat(chat_id)
            if bot_token:
                _r.post(
                    f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery",
                    json={"callback_query_id": cb_id, "text": answer_text, "show_alert": False},
                    timeout=5,
                )
        except Exception as exc:
            logger.warning("answerCallbackQuery failed: %s", exc)

    return {"ok": True}


def _resolve_bot_token_for_chat(chat_id: str) -> str | None:
    """Find the bot token of any agent matching this chat_id (for ACK callbacks)."""
    for state in _agents.values():
        if state.config.telegram_chat_id == chat_id:
            return state.config.telegram_bot_token or BOT_TOKEN
    return BOT_TOKEN or None


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    main()
