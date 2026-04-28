"""Integration tests for the agent service HTTP API.

Uses httpx AsyncClient + pytest-asyncio so no live Binance/Telegram connections needed.
"""

from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import pytest

# Point to a temp data dir so tests don't touch /var/lib
os.environ.setdefault("BASEFORGE_DATA_DIR", str(Path(__file__).parent / "_testdata"))
os.environ.setdefault("AGENT_SERVICE_TOKEN", "test-token")
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "fake-bot-token")
os.environ.setdefault("ENCRYPTION_KEY", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")  # 32-byte b64

sys.path.insert(0, str(Path(__file__).parent.parent))
sys.path.insert(0, str(Path(__file__).parent.parent / "service"))

from httpx import ASGITransport, AsyncClient

from service.__main__ import app  # noqa: E402

AUTH = {"Authorization": "Bearer test-token"}


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.anyio
async def test_auth_required():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/agents/missing-agent")
    assert r.status_code == 403


@pytest.mark.anyio
async def test_get_unknown_agent():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        r = await client.get("/agents/does-not-exist", headers=AUTH)
    assert r.status_code == 404


@pytest.mark.anyio
async def test_create_and_delete_agent(tmp_path, monkeypatch):
    monkeypatch.setenv("BASEFORGE_DATA_DIR", str(tmp_path))

    # Patch _run_agent so it doesn't open a live WebSocket
    import service.__main__ as svc
    async def fake_run(cfg):
        await asyncio.sleep(9999)

    monkeypatch.setattr(svc, "_run_agent", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Create
        r = await client.post("/agents", json={
            "agent_id": "test-aero",
            "token": "AERO",
            "telegram_chat_id": "12345",
            "enabled_alerts": ["trade_size", "rsi_extreme"],
        }, headers=AUTH)
        assert r.status_code == 201
        assert r.json()["status"] == "started"

        # Duplicate should 409
        r2 = await client.post("/agents", json={
            "agent_id": "test-aero",
            "token": "AERO",
            "telegram_chat_id": "12345",
        }, headers=AUTH)
        assert r2.status_code == 409

        # Get
        r3 = await client.get("/agents/test-aero", headers=AUTH)
        assert r3.status_code == 200
        assert r3.json()["token"] == "AERO"

        # Delete
        r4 = await client.delete("/agents/test-aero", headers=AUTH)
        assert r4.status_code == 204


@pytest.mark.anyio
async def test_update_agent_pauses(tmp_path, monkeypatch):
    monkeypatch.setenv("BASEFORGE_DATA_DIR", str(tmp_path))

    import service.__main__ as svc
    async def fake_run(cfg):
        await asyncio.sleep(9999)

    monkeypatch.setattr(svc, "_run_agent", fake_run)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        await client.post("/agents", json={
            "agent_id": "pause-test",
            "token": "BRETT",
            "telegram_chat_id": "99999",
        }, headers=AUTH)

        r = await client.patch("/agents/pause-test", json={"status": "paused"}, headers=AUTH)
        assert r.status_code == 200
        assert r.json()["status"] == "paused"

        # Task should be gone
        assert "pause-test" not in svc._agents
