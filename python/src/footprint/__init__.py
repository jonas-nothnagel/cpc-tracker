"""Carbon footprint tracking for the LLM pipeline.

A cohesive, reusable module: an EcoLogits-based accumulator (``tracker``) plus
an append-only usage ledger (``ledger``) that disaggregates footprint by model,
component, and region. See ``docs/CARBON_METHODOLOGY.md``.
"""

from .tracker import (
    FootprintTotals,
    FootprintTracker,
    estimate_footprint_from_counts,
    get_footprint_tracker,
)

__all__ = [
    "FootprintTotals",
    "FootprintTracker",
    "estimate_footprint_from_counts",
    "get_footprint_tracker",
]
