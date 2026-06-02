"""Carbon footprint tracking for the LLM pipeline.

A cohesive, reusable module: an EcoLogits-based accumulator (``tracker``) plus
an append-only usage ledger (``ledger``) that disaggregates footprint by model,
component, and region. See ``docs/CARBON_METHODOLOGY.md``.
"""

from .ledger import LEDGER_SCHEMA, append_event, ledger_path
from .tracker import (
    FootprintTotals,
    FootprintTracker,
    estimate_footprint_from_counts,
    get_footprint_tracker,
)
from .zones import electricity_zone

__all__ = [
    "FootprintTotals",
    "FootprintTracker",
    "LEDGER_SCHEMA",
    "append_event",
    "electricity_zone",
    "estimate_footprint_from_counts",
    "get_footprint_tracker",
    "ledger_path",
]
