"""Taxonomies a country sets for itself.

A country may ship `{country}-taxonomies.json` beside its targets file. Each
entry of its `taxonomies` list is classified like a global lens, under its own
`taxonomyType`, through the same ranked classifier and the same cache rules.
`replaces` names a global lens the country's own one stands in for on that
country only (Sri Lanka's adaptation sectors replace the GGA areas); the
pipeline then skips that global lens for the country. Countries without the
file get the global lenses exactly as before.

The file is a pipeline input: names and descriptions reach the classification
prompt, so they must trace to the country's own source and carry `_source`
provenance (guardrail: no LLM-drafted content in pipeline inputs).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

# Global lenses a country taxonomy may stand in for.
REPLACEABLE_LENSES = frozenset({"sector", "globe", "gga", "hr"})

# Types the global lenses, their sub-levels and the country-config / BTR lenses
# already write into classifications.json; a country taxonomy may not reuse one.
RESERVED_TAXONOMY_TYPES = REPLACEABLE_LENSES | {"nbs", "globe_sub", "country", "adaptation_goal"}


def load_country_taxonomies(path: Path) -> list[dict[str, Any]]:
    """The country's own taxonomies, in file order; [] when the file is absent.

    Raises ValueError on a malformed file rather than classifying against it.
    """
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    taxonomies = raw.get("taxonomies")
    if not isinstance(taxonomies, list):
        raise ValueError(f"{path.name}: expected a 'taxonomies' list")

    seen_types: set[str] = set()
    seen_ids: set[str] = set()
    for tax in taxonomies:
        ttype = tax.get("taxonomyType")
        if not isinstance(ttype, str) or not ttype:
            raise ValueError(f"{path.name}: a taxonomy has no taxonomyType")
        if ttype in RESERVED_TAXONOMY_TYPES:
            raise ValueError(f"{path.name}: taxonomyType '{ttype}' is reserved for a global lens")
        if ttype in seen_types:
            raise ValueError(f"{path.name}: taxonomyType '{ttype}' appears twice")
        seen_types.add(ttype)

        replaces = tax.get("replaces")
        if replaces is not None and replaces not in REPLACEABLE_LENSES:
            raise ValueError(
                f"{path.name}: '{ttype}' replaces '{replaces}', not one of {sorted(REPLACEABLE_LENSES)}"
            )

        categories = tax.get("categories")
        if not isinstance(categories, list) or not categories:
            raise ValueError(f"{path.name}: '{ttype}' has no categories")
        for c in categories:
            cid = c.get("id")
            if not isinstance(cid, str) or not cid:
                raise ValueError(f"{path.name}: '{ttype}' has a category without an id")
            if cid in seen_ids:
                raise ValueError(f"{path.name}: category id '{cid}' appears twice")
            seen_ids.add(cid)
            for field in ("name", "description"):
                value = c.get(field)
                if not isinstance(value, str) or not value.strip():
                    raise ValueError(f"{path.name}: category '{cid}' has no {field}")
    return taxonomies


def replaced_lenses(taxonomies: Sequence[dict[str, Any]]) -> set[str]:
    """Global lenses the country's own taxonomies stand in for."""
    return {t["replaces"] for t in taxonomies if t.get("replaces")}
