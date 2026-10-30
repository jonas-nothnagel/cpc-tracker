"""
A display overlay of a country's 7th National Report in another language, for
the brief's page in that language: Panama's report is in Spanish and its first
page is in English; Mongolia's is in English and has a Mongolian page.

    cd python && source .venv/bin/activate
    python -m scripts.translate_nr7 --iso3 PAN --source Spanish --target English --locale en
    python -m scripts.translate_nr7 --iso3 MNG --source English --target Mongolian --locale mn

Writes data/external/nr7_{iso3}.{locale}.json: the report's four narratives per
national target, and the name and note of every indicator the page shows. Machine
translation; the report's own wording stays in nr7_{iso3}.json and one click away
on the page. A passage the model returns empty keeps the report's wording, and a
passage that is only web addresses is not sent: it has nothing to translate.
Nothing here reaches the pipeline: it is display text, never an LLM input.

Every run appends its footprint to the ledger, cached calls included.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "external"
NAMESPACE = "nr7_translation_v1"

SYSTEM_TEMPLATE = (
    "You translate passages of a country's 7th National Report to the Convention on Biological Diversity "
    "from {source} into {target} for a policy brief. Translate faithfully and plainly: keep proper names, "
    "acronyms and programme names as they are, keep every number, date and unit, expand nothing that is not "
    "written out, add nothing and leave nothing out. If a passage is already in {target}, return it unchanged. "
    "Return ONLY the translation, no quotes, no notes."
)

# Report field -> the overlay's key (the page's `words`).
NARRATIVES = {
    "keyChallengesSummary": "challenges",
    "progressSummary": "progress",
    "mainActionsSummary": "actions",
    "actionEffectivenessSummary": "effectiveness",
}


def has_words(text: str) -> bool:
    """False for a passage of web addresses alone. Asked to translate one, the
    model replies with a request for the passage, which then reads as the report's."""
    return re.search(r"[^\W\d_]", re.sub(r"https?://\S+", "", text)) is not None


def passages(report: dict) -> list[tuple[tuple[str, str, str], str]]:
    """Each text to translate with where it goes: (section, id, key)."""
    out: list[tuple[tuple[str, str, str], str]] = []
    for item in report["progressItems"]:
        for field, key in NARRATIVES.items():
            if item.get(field) and has_words(item[field]):
                out.append((("targets", item["targetId"], key), item[field]))
    for indicator in report["indicators"]:
        shown = bool(indicator.get("comments")) or any(s.get("points") for s in indicator.get("series") or [])
        if not shown:
            continue
        if indicator.get("name"):
            out.append((("indicators", indicator["id"], "name"), indicator["name"]))
        if indicator.get("comments"):
            out.append((("indicators", indicator["id"], "comments"), indicator["comments"]))
    return out


def build_overlay(
    wanted: list[tuple[tuple[str, str, str], str]],
    translated: list[str],
    meta: dict,
) -> dict:
    overlay: dict = {"_meta": meta, "targets": {}, "indicators": {}}
    for ((section, ident, key), original), text in zip(wanted, translated):
        overlay[section].setdefault(ident, {})[key] = text.strip() or original
    return overlay


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--iso3", required=True)
    ap.add_argument("--source", required=True, help="Language of the report, e.g. Spanish")
    ap.add_argument("--target", required=True, help="Language of the page, e.g. English")
    ap.add_argument("--locale", required=True, help="The page's locale; names the overlay file")
    args = ap.parse_args()

    from src import config
    from src.footprint import append_event, electricity_zone
    from src.llm import call_llm_batch, get_footprint_tracker

    iso3 = args.iso3.lower()
    report = json.loads((DATA_DIR / f"nr7_{iso3}.json").read_text())
    wanted = passages(report)
    system = SYSTEM_TEMPLATE.format(source=args.source, target=args.target)
    calls = [{"system": system, "user": text, "temperature": 0.0, "max_tokens": 8000} for _, text in wanted]
    print(f"{len(calls)} passages, {sum(len(t) for _, t in wanted):,} characters")
    translated = asyncio.run(call_llm_batch(calls, cache_namespace=NAMESPACE, desc=f"NR7 {iso3} to {args.locale}"))
    meta = {
        "note": f"Machine translation from {args.source} for display only; the report's own wording is in nr7_{iso3}.json.",
        "model": config.LLM_MODEL,
        "date": datetime.now(timezone.utc).date().isoformat(),
        "system": system,
    }
    overlay = build_overlay(wanted, [t or "" for t in translated], meta)
    (DATA_DIR / f"nr7_{iso3}.{args.locale}.json").write_text(json.dumps(overlay, indent=1, ensure_ascii=False) + "\n")

    snap = get_footprint_tracker().snapshot()
    if int(snap.get("call_count", 0) or 0):
        append_event(
            component="dev_pipeline",
            provider="openai",
            model=config.LLM_MODEL,
            region=electricity_zone(),
            run_id=f"nr7-translation:{iso3}:{args.locale}",
            country=report.get("country"),
            call_count=int(snap.get("call_count", 0) or 0),
            cached_call_count=int(snap.get("cached_call_count", 0) or 0),
            energy_wh=float(snap.get("energy_wh", 0) or 0),
            water_ml=float(snap.get("water_ml", 0) or 0),
            co2_geq=float(snap.get("co2_geq", 0) or 0),
            minerals_ugsbeq=float(snap.get("minerals_ugsbeq", 0) or 0),
            source=snap.get("source", "unavailable"),
        )
    empty = sum(1 for t in translated if not (t or "").strip())
    print(f"footprint: {int(snap.get('call_count', 0) or 0)} calls booked; {empty} passages kept in the original")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
