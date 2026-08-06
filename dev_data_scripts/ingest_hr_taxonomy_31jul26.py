"""Ingest the human rights themes taxonomy into python/data/categories.json.

Source: docs/updated_human_rights.xlsx, sheet "Sheet1" — a long-form table of
(Theme, Descriptive action) rows, 9 themes / 40 bullets. That workbook is the
machine-readable form of the UNDP review document
"Human rights themes for AI Flagship Policy Coherence Tracker"
(docs/Human rights categories for AI Flagship Policy Coherence Analzyer.pdf),
circulated to UNDP human rights experts for comment in July 2026.

Shape decision (31 Jul 2026): FLAT — one category per theme, with the theme's
descriptive-action bullets concatenated into its `description`. Not two-level.
Bullets inside a theme overlap heavily (two Indigenous Peoples bullets both
cover free, prior and informed consent), so classifying at bullet level would
force arbitrary splits. The workbook's own helper formulas (Sheet2 cols C-G)
concatenate theme + bullets into one prompt string, which is the data owner's
intended shape. Flat also means zero bespoke classifier code: the generic
`rank_classification` handles it exactly as it does GGA.

`block` records the rights/issues vs "Groups" split that the source PDF draws
with a section banner. It is DISPLAY-ONLY: `build_rank_user_message` renders
only `- {id}: {name} -- {description}`, so `block` never reaches an LLM prompt.

Verbatim rule (CLAUDE.md: no LLM-drafted content in pipeline inputs): theme
names and bullet text are copied exactly from the sheet. Two source quirks are
preserved deliberately rather than "corrected":
  - one Environmental Human Rights Defenders bullet still says "NBSAPs" where
    the rest of the sheet was generalised to "national policies";
  - the "Descriptive actions:" lead-in is the sheet's own column header, not
    project-invented framing.

NOTE docs/hr-terms.csv is a SUPERSEDED extraction of the older UN EMG guidance
and must not be used: ~18 of its rows carry the wrong section label (content
from sections 2 and 3 filed under "8"), the section 5 substantive-rights table
is missing, and footnote text plus page numbers are glued into several bullets.

Idempotent: re-running rewrites hr_categories in place and produces
byte-identical output. Re-run after expert comments land; the row/bullet
assertions below fail loudly if the sheet has drifted, so changes surface
instead of being silently absorbed.

Usage: uv run --directory python python ../dev_data_scripts/ingest_hr_taxonomy_31jul26.py
"""

import json
import sys
from pathlib import Path

import openpyxl

REPO = Path(__file__).resolve().parent.parent
XLSX = REPO / "docs/updated_human_rights.xlsx"
CATEGORIES_JSON = REPO / "python/data/categories.json"

SHEET = "Sheet1"
EXPECTED_THEMES = 9
EXPECTED_BULLETS = 40

# Theme label (verbatim sheet value) -> (category id, display block).
# `block` mirrors the source PDF's split between rights/issues themes and the
# themes it groups under a "Groups" banner (rights-holder groups).
THEME_MAP: dict[str, tuple[str, str]] = {
    "Information and education": ("hr_information_education", "rights"),
    "Free, meaningful and active public participation": ("hr_participation", "rights"),
    "Access to justice": ("hr_access_justice", "rights"),
    "Indigenous Peoples and local communities": (
        "hr_indigenous_local_communities",
        "groups",
    ),
    "Gender equality": ("hr_gender_equality", "groups"),
    "Children and youth": ("hr_children_youth", "groups"),
    "Environmental Human Rights Defenders": ("hr_defenders", "groups"),
    "Businesses": ("hr_business", "groups"),
    "Rights of Persons with Disabilities": ("hr_disabilities", "groups"),
}

SOURCE_NOTE = (
    "UNDP, \"Human rights themes for AI Flagship Policy Coherence Tracker\" "
    "(docs/Human rights categories for AI Flagship Policy Coherence Analzyer.pdf), "
    "draft circulated for comment among UNDP human rights experts, July 2026. "
    "Theme names and descriptive-action bullets are verbatim from the "
    "machine-readable companion docs/updated_human_rights.xlsx, sheet \"Sheet1\" "
    "(9 themes, 40 bullets); the \"Descriptive actions\" lead-in is that sheet's "
    "own column header. The document states it builds on the UN Environment "
    "Management Group's \"Guidance on integrating human rights in National "
    "Biodiversity Strategy and Action Plans (NBSAPs)\" (April 2023, "
    "https://unemg.org/wp-content/uploads/2023/04/Guidance-on-integrating-human-rights-in-National-Biodiversity-Strategy-and-Action-Plans-NBSAPs.pdf) "
    "but expands beyond the KMGBF to national policies generally. The `block` "
    "field is display-only and records the source PDF's rights/issues vs "
    "\"Groups\" section split; it is not sent to the classifier. "
    "STATUS: DRAFT UNDER EXPERT REVIEW — not a final taxonomy. Regenerate with "
    "dev_data_scripts/ingest_hr_taxonomy_31jul26.py when comments land."
)


def _clean(text: str) -> str:
    """Collapse whitespace and drop the sheet's trailing list separator.

    Unicode punctuation (curly apostrophes, en dashes) is preserved as-is:
    descriptions must stay verbatim.
    """
    return " ".join(str(text).split()).rstrip(";").strip()


def main() -> int:
    wb = openpyxl.load_workbook(XLSX, data_only=True, read_only=True)
    rows = list(wb[SHEET].iter_rows(values_only=True))
    header = [_clean(h) if h is not None else "" for h in rows[0]]
    if header[:2] != ["Theme", "Descriptive actions"]:
        print(f"ABORT: unexpected header in {SHEET}: {header[:2]}")
        return 1

    # Group bullets by theme, preserving sheet order within each theme.
    grouped: dict[str, list[str]] = {}
    order: list[str] = []
    for row in rows[1:]:
        if not row or row[0] is None:
            continue
        theme = _clean(row[0])
        bullet = _clean(row[1]) if len(row) > 1 and row[1] is not None else ""
        if not theme or not bullet:
            continue
        if theme not in grouped:
            grouped[theme] = []
            order.append(theme)
        grouped[theme].append(bullet)

    unknown = [t for t in order if t not in THEME_MAP]
    if unknown:
        print(f"ABORT: sheet has themes not in THEME_MAP (taxonomy drift?): {unknown}")
        return 1
    missing = [t for t in THEME_MAP if t not in grouped]
    if missing:
        print(f"ABORT: THEME_MAP themes absent from sheet: {missing}")
        return 1

    total_bullets = sum(len(v) for v in grouped.values())
    if len(order) != EXPECTED_THEMES or total_bullets != EXPECTED_BULLETS:
        print(
            f"ABORT: expected {EXPECTED_THEMES} themes / {EXPECTED_BULLETS} bullets, "
            f"got {len(order)} / {total_bullets}. The source sheet has changed — "
            "review the diff, then update EXPECTED_* and THEME_MAP deliberately."
        )
        return 1

    categories = []
    for theme in order:
        cat_id, block = THEME_MAP[theme]
        bullets = grouped[theme]
        categories.append(
            {
                "id": cat_id,
                "name": theme,
                "description": "Descriptive actions:\n"
                + "\n".join(f"- {b}" for b in bullets),
                "block": block,
                "source": (
                    f"docs/updated_human_rights.xlsx, sheet \"{SHEET}\", "
                    f"{len(bullets)} rows for theme \"{theme}\" — verbatim"
                ),
            }
        )

    data = json.loads(CATEGORIES_JSON.read_text(encoding="utf-8"))
    replacing = "hr_categories" in data
    data["_sources"]["hr_categories"] = SOURCE_NOTE
    data["hr_categories"] = categories
    CATEGORIES_JSON.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    verb = "Replaced" if replacing else "Added"
    print(f"{verb} hr_categories: {len(categories)} themes, {total_bullets} bullets")
    for cat in categories:
        n = cat["description"].count("\n- ")
        print(f"  {cat['id']:<34} [{cat['block']:<6}] {n} bullets  {cat['name']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
