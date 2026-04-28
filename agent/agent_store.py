"""Per-agent config + encrypted LLM key storage on disk.

Layout on the VPS (override with BASEFORGE_DATA_DIR):
    /var/lib/baseforge/agents/{agent_id}/
        config.json      - public config (token, thresholds, alert types)
        llm_key.enc      - AES-GCM encrypted LLM API key
"""

from __future__ import annotations

import json
import os
from base64 import b64decode, b64encode
from dataclasses import asdict, dataclass, field
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(os.environ.get("BASEFORGE_DATA_DIR", "/var/lib/baseforge")) / "agents"


@dataclass
class AgentConfig:
    agent_id: str
    token: str
    telegram_chat_id: str
    telegram_bot_token: str = ""   # BYOB: per-user bot. If empty, falls back to TELEGRAM_BOT_TOKEN env.
    trade_size_usd: float = 50_000
    volume_multiplier: float = 3.0
    rsi_oversold: float = 30
    rsi_overbought: float = 70
    funding_rate_threshold: float = 0.05
    enabled_alerts: list[str] = field(default_factory=list)
    report_interval_minutes: int = 0   # 0 = disabled. Otherwise send periodic snapshot every N minutes.
    llm_provider: str = "openai"
    status: str = "active"


def _agent_dir(agent_id: str) -> Path:
    p = ROOT / agent_id
    p.mkdir(parents=True, exist_ok=True)
    return p


def save_config(cfg: AgentConfig) -> None:
    path = _agent_dir(cfg.agent_id) / "config.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(asdict(cfg), indent=2))
    tmp.replace(path)


def load_config(agent_id: str) -> AgentConfig:
    raw = json.loads((_agent_dir(agent_id) / "config.json").read_text())
    return AgentConfig(**raw)


def _aesgcm() -> AESGCM:
    key = os.environ["ENCRYPTION_KEY"]
    return AESGCM(b64decode(key))


def save_llm_key(agent_id: str, plaintext: str) -> None:
    aes = _aesgcm()
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, plaintext.encode(), associated_data=agent_id.encode())
    blob = b64encode(nonce + ct).decode()
    (_agent_dir(agent_id) / "llm_key.enc").write_text(blob)


def load_llm_key(agent_id: str) -> str:
    blob = b64decode((_agent_dir(agent_id) / "llm_key.enc").read_text())
    nonce, ct = blob[:12], blob[12:]
    return _aesgcm().decrypt(nonce, ct, associated_data=agent_id.encode()).decode()
