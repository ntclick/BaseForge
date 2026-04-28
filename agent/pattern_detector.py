"""Pattern detection: support/resistance, dump risk, consolidation breakout.

Stubs only — actual implementations land in Phase 2.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable


@dataclass
class SupportResistance:
    support: float
    resistance: float


def detect_levels(candles: Iterable, lookback: int = 100) -> SupportResistance:
    closes = [c.close for c in candles][-lookback:]
    if not closes:
        return SupportResistance(0.0, 0.0)
    return SupportResistance(support=min(closes), resistance=max(closes))


def is_dump_risk(holder_concentration_pct: float, recent_pump_pct: float) -> bool:
    return holder_concentration_pct > 5.0 or recent_pump_pct > 50.0
