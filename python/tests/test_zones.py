"""Electricity-mix zone resolution for region-accurate footprint."""

from __future__ import annotations

from src.footprint.zones import electricity_zone


def test_default_usa(monkeypatch):
    monkeypatch.delenv("CPC_ELECTRICITY_ZONE", raising=False)
    assert electricity_zone() == "USA"


def test_override(monkeypatch):
    monkeypatch.setenv("CPC_ELECTRICITY_ZONE", "FRA")
    assert electricity_zone() == "FRA"
