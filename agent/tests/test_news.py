"""Tests for the news monitor symbol-matching logic."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from news_monitor import _extract_symbol_mentions


def test_extracts_exact_symbol():
    text = "AERO rallies 15% as new DEX partnership is announced"
    result = _extract_symbol_mentions(text, {"AERO", "BTC", "ETH"})
    assert result == {"AERO"}


def test_no_false_positive_substring():
    # "BRETT" should not match "BRETTANY" or be confused with other tokens
    text = "Market update: BTC and ETH hold steady"
    result = _extract_symbol_mentions(text, {"BTC", "ETH", "AERO"})
    assert result == {"BTC", "ETH"}


def test_multiple_symbols():
    text = "BRETT and DEGEN both surge on Base chain news"
    result = _extract_symbol_mentions(text, {"BRETT", "DEGEN", "AERO"})
    assert "BRETT" in result
    assert "DEGEN" in result
    assert "AERO" not in result


def test_case_insensitive():
    text = "aero hits new ATH following partnership"
    result = _extract_symbol_mentions(text, {"AERO"})
    assert result == {"AERO"}


def test_empty_symbols():
    text = "AERO BTC"
    result = _extract_symbol_mentions(text, set())
    assert result == set()
