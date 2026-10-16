"""Country X's reported actions and reviewed spending, de-identified from Mongolia.

Country X (`countryx`) is the fictional demonstration country: its policy
targets are real published text pooled from several countries and
de-identified. This script gives it the two layers a pilot country has beyond
coherence, copied from Mongolia's records and stripped of everything that
names Mongolia:

- Reported actions: the 15 mitigation measures (CTF Table 5) and 24 adaptation
  actions (Table III.9) of Mongolia's first Biennial Transparency Report
  (December 2025). The wording stays the report's own, except for the
  replacements listed in REPLACEMENTS (places, agencies, programmes and
  companies become generic terms) and ORGS (responsible institutions).
- Reviewed spending: the budget lines of Mongolia's BIOFIN Biodiversity
  Expenditure Review with spending in its two complete years, 2020 and 2021
  (python/data/mongolia-ber.json; the review's later years each cover only one
  level of the budget). Codes are renumbered, amounts converted to US$ at an
  indicative 3,450 MNT per US$ (the rate used in the October 2026 BER
  re-scoping) and rounded to US$10,000.

Every replacement is project-defined and listed here; nothing is generated.
The written files call the data illustrative and name no source country, and
the build fails if any Mongolian name survives (LEAK_TERMS). No API calls: the
comparisons with Country X's targets run in scripts/align_actions_and_budget.py.

Run from python/:  .venv/bin/python scripts/build_countryx_layers.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUTPUT = ROOT / "output"

SOURCE_BTR = OUTPUT / "mongolia" / "gpt-5-4" / "btr_data.json"
SOURCE_ADAPTATION = DATA / "mongolia-btr-adaptation.json"
SOURCE_BER = DATA / "mongolia-ber.json"

OUT_BTR = OUTPUT / "countryx" / "btr_data.json"
OUT_ADAPTATION = DATA / "countryx-btr-adaptation.json"
OUT_BER = DATA / "countryx-ber.json"

# The review's two complete years (each later year covers one budget level only).
BER_YEARS = ("2020", "2021")
MNT_PER_USD = 3450
# All public spending in the same years, bn MNT: State plus local budgets,
# gross, from the review's workbook (BER_1112.xlsx), as reconciled in the
# October 2026 BER re-scoping. The review's lines are 1.51% and 1.46% of it.
PUBLIC_SPENDING_BN_MNT = {"2020": 13893.0, "2021": 15662.0}

# Exact phrases first, in order, then general terms. Each pair is
# (pattern, replacement); patterns are regular expressions.
REPLACEMENTS: list[tuple[str, str]] = [
    # Excel line breaks carried into the CTF text.
    (r"\s*_x000d_\s*", " "),
    # Named plants, sites and places in the measures' objectives.
    (r"Erdeneburen hydropower plant \(HPP-90 MW\)", "a 90 MW hydropower plant"),
    (r"at Amgalan Thermal Power Plant", "at a thermal power plant"),
    (r"at the location of ['‘’]Narangiin Enger['‘’] landfill site", "at the location of a central landfill site"),
    (r"at the Moringiin Davaa waste dumping site", "at a waste dumping site"),
    (r"at the Tsagaandavaa landfill site", "at a landfill site"),
    (r"\s*\(such as [^)]*\) and Khujirt soum center of Uvurkhangai Province", " and one district center"),
    (r"in 5 aimag centers \([^)]*\)", "in 5 provincial centers"),
    (r"Implement MNS ISO-50001", "Implement ISO-50001"),
    (r"private housing in ger areas", "private housing in peri-urban settlement areas"),
    # Agencies, programmes and partners named in the actions' progress notes.
    (r"IRIMHE, Institute of Geo-ecology are", "The national meteorology and hydrology research institute and an institute of geo-ecology are"),
    (r"integrated with ['‘’]Billion Tree['‘’] initiatives", "integrated with national tree-planting initiatives"),
    (r"the Sustainable Resilient Ecosystem and Agriculture Management in Mongolia \(STREAM\+\) Project", "a sustainable and resilient ecosystem and agriculture management project"),
    (r"the European Forest Partnership", "an international forest partnership"),
    (r"Environmental outlook of MECC", "the environment ministry's Environmental Outlook"),
    (r"of the Environment and Tourism Minister", "of the Minister of Environment"),
    (r"NAMEM with collaboration of NEMA", "The national meteorological agency in collaboration with the national emergency management agency"),
    (r"NEMA conducts", "The national emergency management agency conducts"),
    (r"MET is working", "The Ministry of Environment is working"),
    (r"Mongolian Children's Council", "the national children's council"),
    (r"Mongolian Red Cross Society", "the national Red Cross Society"),
    (r"Oyu Tolgoi LLC", "a mining company"),
    (r"Mongolian Sustainable Development Bridge", "a national sustainable development NGO"),
    (r"Caritas Czech Republic in Mongolia", "Caritas Czech Republic"),
    (r"the President of Mongolia", "the President"),
    (r"the Scout Association of Mongolia", "the national Scout Association"),
    (r"the Youth for Climate and Clean Air Network \(YOUCCAN\)", "a youth network for climate and clean air"),
    (r"inter-Soum", "inter-district"),
    (r"\baimag Departments\b", "provincial Departments"),
    # General terms.
    (r"\bMongolia[’']s\b", "the country’s"),
    (r"\bMongolia\b", "the country"),
    (r"\bMongolian\b", "national"),
    (r"\bUlaanbaatar [Cc]ity\b", "the capital city"),
    (r"\bUlaanbaatar\b", "the capital"),
    (r"\baimag centers\b", "provincial centers"),
    (r"\baimags\b", "provinces"),
    (r"\baimag\b", "province"),
    (r"\bAimag\b", "Provincial"),
    (r"\bsoums\b", "districts"),
    (r"\bsoum\b", "district"),
    (r"\bsaxaul\b", "dryland"),
    # The house style keeps em dashes out of displayed text: a spaced one
    # reads as a colon, a pair around an aside as commas.
    (r"\s+—\s+", ": "),
    (r"—", ", "),
]

# Responsible institutions as the source names them -> the name shown.
# Acronyms with no confirmed expansion (MON, MOES) are left out rather than
# guessed; the brief and the AI comparisons never read these fields.
ORGS: dict[str, str | None] = {
    "Ministry of Energy": "Ministry of Energy",
    "Ministry of Mining and Heavy Industry": "Ministry of Mining",
    "Ministry of Road and Transportation": "Ministry of Road and Transportation",
    "Ministry of Urban Development Construction and Housing": "Ministry of Construction and Housing",
    "Ulaanbaatar Mayor's Office (UB CMO)": "Capital City Mayor's Office",
    "Ministry of Food Agriculture and Light Industry": "Ministry of Food and Agriculture",
    "Ministry of Environment and Climate Change": "Ministry of Environment and Climate Change",
    "Water Supply and Sewerage Authority of Ulaanbaatar City": "Water Supply and Sewerage Authority of the capital city",
    "MOFALI": "Ministry of Food and Agriculture",
    "MET": "Ministry of Environment",
    "Aimag Governors' Office": "Provincial Governors' Office",
    "Water Agency": "Water Agency",
    "MOES": None,
    "MON": None,
    "NEMA": "National Emergency Management Agency",
    "NAMEM": "National meteorological agency",
    "Emergency management departments of capital city and local administration": "Emergency management departments of capital city and local administration",
    "Research institutions": "Research institutions",
    "research institutions": "research institutions",
    "universities": "universities",
    "Universities": "Universities",
    "colleges": "colleges",
    "Aimag public health departments": "Provincial public health departments",
    "Governor's secretariat of capital city and aimags": "Governor's secretariat of capital city and provinces",
    "Department of family, children and youth": "Department of family, children and youth",
    "National Committee for children": "National Committee for children",
    "Mongolian Scout association": "National Scout association",
}

# Any of these in a written file fails the build: names in any case, the
# source's acronyms as written (so "met" or "stream" in plain English pass).
LEAK_NAMES = [
    r"Mongol\w*", "Ulaanbaatar", "Ulan Bator", "aimags?", "soums?", "Gobi", r"Govi\w*", "saxaul", "ger",
    "dzud", "Khural", r"tugr[iö]k\w*", "togrog", "Oyu", "Tolgoi", "Tavan", r"Erdene\w*", "Amgalan",
    "Narangiin", "Moringiin", "Tsagaandavaa", "Khujirt", "Arkhangai", r"Bayan\w*", "Bulgan", "Darkhan",
    "Dornod", "Dornogovi", "Dundgovi", "Govisumber", "Khentii", "Khovd", r"Kh[uö]vsg[uö]l", "Orkhon",
    "Selenge", "Sukhbaatar", "Umnugovi", "Uvs", "Uvurkhangai", "Zavkhan", "Tuul", "Kherlen", "Khangai",
    "Bogd", "Chinggis", "Genghis", "Sainshand", "Choir", "Baganuur", "Nalaikh", "Billion Tree",
    "Agriculture and Light Industry", "Mining and Heavy Industry", "YOUCCAN",
]
LEAK_ACRONYMS = ["UB", "MNT", "MET", "MOFALI", "MOES", "MON", "MECC", "NAMEM", "IRIMHE", "STREAM", "₮"]
_EDGE = (r"(?<![\w-])(?:", r")(?![\w-])")
LEAK = [
    re.compile(_EDGE[0] + "|".join(LEAK_NAMES) + _EDGE[1], re.IGNORECASE),
    re.compile(_EDGE[0] + "|".join(re.escape(a) for a in LEAK_ACRONYMS) + _EDGE[1]),
]

CAPITALISE = re.compile(r"(^|[.!?]\s+)the (country|capital|national)\b")


def mask(text: str) -> str:
    """The source text with every listed replacement applied, sentences
    starting with a capital."""
    out = text
    for pattern, replacement in REPLACEMENTS:
        out = re.sub(pattern, replacement, out)
    out = CAPITALISE.sub(lambda m: f"{m.group(1)}The {m.group(2)}", out)
    return re.sub(r"\s{2,}", " ", out).strip()


def org_list(names: list[str]) -> list[str]:
    """Institutions as shown: each mapped through ORGS, the unconfirmed left out."""
    shown = []
    for name in names:
        if name not in ORGS:
            raise SystemExit(f"Unlisted institution {name!r}: add it to ORGS")
        if ORGS[name]:
            shown.append(ORGS[name])
    return shown


MITIGATION_FIELDS = ("name", "description", "objectives", "instrumentType", "status", "sector", "gasesAffected", "startYear")
ADAPTATION_FIELDS = ("id", "actionType", "adaptationGoal", "sector", "name", "description", "outcome", "indicator",
                     "implementationStatus", "status", "objectives", "instrumentType", "gasesAffected", "startYear")
TEXT_FIELDS = {"name", "description", "objectives", "outcome", "indicator", "implementationStatus"}


def masked_fields(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key in fields:
        if key not in row:
            continue
        value = row[key]
        out[key] = mask(value) if key in TEXT_FIELDS and isinstance(value, str) else value
    return out


PROVENANCE_BTR = (
    "Illustrative, for the fictional Country X: reported actions (mitigation measures and adaptation actions) "
    "copied from one pilot country's Biennial Transparency Report, with places, agencies, programmes and "
    "companies replaced by generic terms (python/scripts/build_countryx_layers.py). Not any real country's report."
)
PROVENANCE_BER = (
    "Illustrative, for the fictional Country X: budget lines and spending copied from one pilot country's "
    "BIOFIN Biodiversity Expenditure Review, its two complete years (2020 and 2021), renumbered, converted to "
    "US$ at an indicative rate and rounded to US$10,000 (python/scripts/build_countryx_layers.py). "
    "Not any real country's spending."
)


def build_btr(source: dict[str, Any]) -> dict[str, Any]:
    measures = []
    for m in source["mitigationMeasures"]:
        row = masked_fields(m, MITIGATION_FIELDS)
        # A mitigation measure names one implementing institution.
        row["implementingEntity"] = ", ".join(org_list([m["implementingEntity"]])) if m.get("implementingEntity") else ""
        row["reductionEstimates"] = m.get("reductionEstimates") or {}
        measures.append(row)
    return {"_provenance": PROVENANCE_BTR, "sourceFile": "illustrative", "mitigationMeasures": measures}


def build_adaptation(source: dict[str, Any]) -> dict[str, Any]:
    actions = []
    for a in source["actions"]:
        row = masked_fields(a, ADAPTATION_FIELDS)
        orgs = org_list(a.get("responsibleOrgs") or [])
        row["implementingEntity"] = ", ".join(orgs)
        row["responsibleOrgs"] = orgs
        row["reductionEstimates"] = {}
        section = (a.get("source") or {}).get("section")
        row["source"] = {
            "sourceText": ". ".join(mask(a[k]) for k in ("name", "description", "implementationStatus") if a.get(k)),
            **({"section": section} if section else {}),
            "document": "Biennial Transparency Report (illustrative), Action Plan of the Nationally Determined Contribution",
        }
        actions.append(row)
    return {
        "_provenance": PROVENANCE_BTR,
        "sourceRef": {
            "document": "Biennial Transparency Report (illustrative)",
            "section": "Action Plan of the Nationally Determined Contribution",
        },
        "groupingLabel": "Adaptation goal of the NDC action plan",
        "adaptationGoals": [{"id": g["id"], "description": mask(g["description"])} for g in source["adaptationGoals"]],
        "actions": actions,
    }


def to_usd_million(bn_mnt: float | None) -> float | None:
    return None if bn_mnt is None else round(bn_mnt * 1000 / MNT_PER_USD, 2)


def build_ber(source: dict[str, Any]) -> dict[str, Any]:
    spend = {e["code"]: e.get("values", {}) for e in source["expenditure"]}
    programs, expenditure = [], []
    for p in source["programs"]:
        values = {y: spend.get(p["code"], {}).get(y) for y in BER_YEARS}
        if not any(v for v in values.values()):
            continue
        code = f"P{len(programs) + 1:02d}"
        programs.append({
            "code": code,
            "name": mask(p["name"]),
            "description": mask(p.get("description", "")),
            "type": p.get("type", "environmental"),
        })
        expenditure.append({"code": code, "name": mask(p["name"]), "values": {y: to_usd_million(v) for y, v in values.items()}})
    return {
        "_provenance": PROVENANCE_BER,
        "programs": programs,
        "expenditure": expenditure,
        "currency": "US$",
        "unit": "million",
        "period": {"start": int(BER_YEARS[0]), "end": int(BER_YEARS[-1])},
        # What the reviewed lines are part of, for "out of how much": all
        # public spending in the same years and unit. The pipeline ignores it.
        "scope": {
            "publicSpending": {y: to_usd_million(PUBLIC_SPENDING_BN_MNT[y]) for y in BER_YEARS},
            "illustrative": True,
        },
    }


def leaks(payload: Any) -> list[str]:
    """Every name from the source country found in a payload or text."""
    text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return sorted({m.group(0) for pattern in LEAK for m in pattern.finditer(text)})


def write(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


def main() -> None:
    btr = build_btr(json.loads(SOURCE_BTR.read_text()))
    adaptation = build_adaptation(json.loads(SOURCE_ADAPTATION.read_text()))
    ber = build_ber(json.loads(SOURCE_BER.read_text()))
    found = {name: leaks(p) for name, p in (("btr", btr), ("adaptation", adaptation), ("ber", ber))}
    if any(found.values()):
        sys.exit(f"Names from the source country survive: {found}")
    OUT_BTR.parent.mkdir(parents=True, exist_ok=True)
    write(OUT_BTR, btr)
    write(OUT_ADAPTATION, adaptation)
    write(OUT_BER, ber)
    print(
        f"{len(btr['mitigationMeasures'])} mitigation measures, {len(adaptation['actions'])} adaptation actions, "
        f"{len(ber['programs'])} budget lines ({', '.join(BER_YEARS)})"
    )


if __name__ == "__main__":
    main()
