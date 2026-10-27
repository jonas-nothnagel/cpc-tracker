"""The shared spending record of a country's Biodiversity Expenditure Review (BER).

Step 1 of the BER plan ("Show the money"). One adapter per country
(scripts/build_ber_<country>.py) reads the review's own workbook, keeps its
lines by the review's own rule and writes `python/data/<country>-ber.json`.
No AI touches an amount.

The file keeps the fields the pipeline and the existing views read
(`programs`, `expenditure`, `currency`, `unit`, `period`) and adds `record`:
the review, its years with the budget levels each holds, its lines with plan,
actual and counted amounts per year and level, the checks against the
review's published totals, and plain-language notes. `expenditure` holds the
complete years only, so no view adds a year that covers one budget level to a
year that covers another.

An adapter calls `require_reproduced` before it writes: one published total
missed and nothing is written.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import DATA_DIR

RECORD_VERSION = 1

# Amounts are stored in the record's unit to this many decimals: below one
# tögrög for billions, one hundredth of a balboa for millions.
DECIMALS = 9


class ReconciliationError(RuntimeError):
    """A published total the record does not reproduce."""


@dataclass(frozen=True)
class Check:
    """One published total and the figure the record gives for it."""

    what: str
    source: str
    published: float
    reproduced: float
    # Absolute, in the record's unit. Exact sources get a rounding allowance
    # only; a report that prints rounded figures gets half its last digit.
    tolerance: float
    # Set for a check repeated cell by cell (a rule such as weighted = gross x
    # weight): every cell is enforced, and the record keeps one line per rule.
    rule: str = ""

    @property
    def difference(self) -> float:
        return self.reproduced - self.published

    @property
    def ok(self) -> bool:
        return abs(self.difference) <= self.tolerance

    def as_json(self) -> dict[str, Any]:
        return {
            "what": self.what,
            "source": self.source,
            "published": self.published,
            "reproduced": round(self.reproduced, DECIMALS),
            "difference": round(self.difference, DECIMALS),
            "ok": self.ok,
        }


def checks_json(checks: Iterable[Check]) -> list[dict[str, Any]]:
    """The checks as the record keeps them: every published total in full,
    and one line per cell-by-cell rule with how many cells it held and its
    largest difference."""
    out: list[dict[str, Any]] = []
    rules: dict[str, list[Check]] = {}
    for check in checks:
        if check.rule:
            rules.setdefault(check.rule, []).append(check)
        else:
            out.append(check.as_json())
    for rule, cells in rules.items():
        worst = max(cells, key=lambda c: abs(c.difference))
        out.append(
            {
                "what": rule,
                "source": cells[0].source.split(", row")[0],
                "cells": len(cells),
                "largestDifference": round(worst.difference, DECIMALS),
                "ok": all(c.ok for c in cells),
            }
        )
    return out


def require_reproduced(checks: Iterable[Check]) -> None:
    """Raise unless every published total is reproduced within its tolerance."""
    failed = [c for c in checks if not c.ok]
    if failed:
        lines = "\n".join(
            f"  {c.what}: published {c.published} ({c.source}), reproduced {c.reproduced:.9f}, "
            f"difference {c.difference:+.9f}"
            for c in failed
        )
        raise ReconciliationError(f"{len(failed)} published total(s) not reproduced; nothing written:\n{lines}")


def amount(value: float) -> float:
    """An amount as stored in the record."""
    rounded = round(float(value), DECIMALS)
    return 0.0 if rounded == 0 else rounded


def berdata_view(
    lines: Iterable[Mapping[str, Any]],
    complete_years: list[str],
    *,
    type_of: Mapping[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """`programs` and `expenditure` for the pipeline and the existing views:
    one entry per line, its counted amount per complete year (all levels)."""
    programs: list[dict[str, Any]] = []
    expenditure: list[dict[str, Any]] = []
    for line in lines:
        values: dict[str, float] = {}
        for year in complete_years:
            by_level = (line.get("amounts") or {}).get(year) or {}
            values[year] = amount(sum((cell or {}).get("counted", 0.0) for cell in by_level.values()))
        program: dict[str, Any] = {
            "code": line["code"],
            "name": line["name"],
            "description": line.get("description", ""),
            "type": (type_of or {}).get(line["code"], "environmental"),
        }
        programs.append(program)
        expenditure.append({"code": line["code"], "name": line["name"], "values": values})
    return programs, expenditure


def usd_rates(iso3: str) -> dict[str, float]:
    """Local currency per US$ by year, from python/data/fx-rates.json."""
    payload = json.loads((DATA_DIR / "fx-rates.json").read_text())
    return {year: float(rate) for year, rate in payload[iso3]["perUsd"].items()}


def write_record(path: Path, payload: Mapping[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def reconciliation_markdown(country: str, record: Mapping[str, Any]) -> str:
    """The checks as a short report: every published total and the figure reproduced."""
    checks = record.get("checks", [])
    ok = sum(1 for c in checks if c.get("ok"))
    unit = f"{record.get('unit', '')} {record.get('currency', '')}".strip()
    rows = [
        (
            f"| {c['what']} ({c['cells']:,} cells) | | | {c['largestDifference']:+.9f} | {'yes' if c['ok'] else 'NO'} | {c['source']} |"
            if "cells" in c
            else f"| {c['what']} | {c['published']:,.6f} | {c['reproduced']:,.6f} | {c['difference']:+.9f} | {'yes' if c['ok'] else 'NO'} | {c['source']} |"
        )
        for c in checks
    ]
    notes = "\n".join(f"- {n}" for n in record.get("notes", []))
    return "\n".join(
        [
            f"# {country}: reconciliation with the review's published totals",
            "",
            f"{ok} of {len(checks)} published totals reproduced (amounts in {unit}).",
            "",
            "| What | Published | Reproduced | Difference | Reproduced | Source |",
            "|---|---:|---:|---:|---|---|",
            *rows,
            "",
            "## Notes",
            "",
            notes or "- None.",
            "",
        ]
    )
