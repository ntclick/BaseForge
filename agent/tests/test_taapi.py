"""Unit tests for TAAPI parser + brief formatter (no network calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from taapi_client import _parse, TaSnapshot


def test_parse_full_payload():
    raw = {
        "data": [
            {"id": "rsi", "result": {"value": 35.4}},
            {"id": "macd", "result": {"valueMACD": 0.12, "valueMACDSignal": 0.10, "valueMACDHist": 0.02}},
            {"id": "bbands", "result": {"valueUpperBand": 1.10, "valueMiddleBand": 1.00, "valueLowerBand": 0.90}},
            {"id": "supertrend", "result": {"value": 0.95, "valueAdvice": "long"}},
        ]
    }
    snap = _parse(raw)
    assert snap.rsi == 35.4
    assert snap.macd == 0.12
    assert snap.macd_hist == 0.02
    assert snap.bb_upper == 1.10
    assert snap.supertrend_value == 1.0


def test_parse_partial_missing_indicators():
    raw = {"data": [{"id": "rsi", "result": {"value": 72.1}}]}
    snap = _parse(raw)
    assert snap.rsi == 72.1
    assert snap.macd is None
    assert snap.bb_upper is None


def test_format_brief_oversold():
    snap = TaSnapshot(rsi=22.0, macd_hist=-0.05, supertrend_value=-1.0)
    brief = snap.format_brief()
    assert "🟢" in brief
    assert "RSI 22" in brief
    assert "↓" in brief
    assert "short" in brief


def test_format_brief_overbought():
    snap = TaSnapshot(rsi=78.0, macd_hist=0.10, supertrend_value=1.0)
    brief = snap.format_brief()
    assert "🔴" in brief
    assert "↑" in brief
    assert "long" in brief


def test_format_brief_empty_when_all_none():
    snap = TaSnapshot()
    assert snap.format_brief() == ""
