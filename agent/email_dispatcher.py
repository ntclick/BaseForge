"""Email dispatcher via Resend (https://resend.com).

Sends formatted alert emails. Mirrors telegram_dispatcher's interface so the
notify() fan-out is symmetrical.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

import requests

from alert_generator import Alert

API = "https://api.resend.com/emails"


@dataclass
class EmailConfig:
    api_key: str
    sender: str
    dashboard_url: str = "https://baseforge.app"


def _html(alert: Alert, token: str, dashboard_url: str) -> str:
    badge = {"info": "#3b82f6", "warn": "#f59e0b", "critical": "#ef4444"}[alert.severity]
    return f"""
<div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
  <div style="background: {badge}; color: white; padding: 16px; border-radius: 8px 8px 0 0;">
    <strong>{alert.title}</strong>
  </div>
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 16px; border-radius: 0 0 8px 8px;">
    <p style="color: #374151; margin: 0 0 12px 0;">{alert.detail or ''}</p>
    <a href="{dashboard_url}" style="display: inline-block; padding: 8px 16px; background: #111827; color: white; text-decoration: none; border-radius: 6px; font-size: 14px;">Open dashboard</a>
  </div>
  <p style="color: #9ca3af; font-size: 12px; text-align: center; margin-top: 12px;">BaseForge · {token}</p>
</div>
""".strip()


def send(to: str, alert: Alert, token: str, cfg: EmailConfig) -> dict:
    payload = {
        "from": cfg.sender,
        "to": [to],
        "subject": alert.title,
        "html": _html(alert, token, cfg.dashboard_url),
    }
    r = requests.post(
        API,
        json=payload,
        headers={"Authorization": f"Bearer {cfg.api_key}"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()
