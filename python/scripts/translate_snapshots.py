"""
AI-synthesis snapshot translation — English → per-locale narrative snapshots.

The dashboard renders the AI synthesis narratives (corpus themes, document-pair
storylines, sector storylines) in the user's locale by reading a sibling
`<file>.<locale>.json` next to each English source. Today only Mongolia ships
`.mn.json`; no country ships `.es.json`. This script generates those snapshots.

For each country output dir (`python/output/{country}/`) it reads three English
synthesis files and writes a translated copy per locale, translating ONLY the
prose fields on a strict whitelist and copying everything else (ids, counts,
confidence, taxonomy types, `states` maps, key order, every number) through
byte-for-byte.

Translated prose fields (whitelist — nothing else is touched):
  - corpus_themes.json:      storylines[].name, storylines[].description,
                             and the top-level summary_paragraph.
                             (a `states` map, if present, is left untouched)
  - doc_pair_synthesis.json: each item's synthesis.{storyline_name, reinforce,
                             clash, coordination_hint}
  - sector_synthesis.json:   list form, OR {synthesis:[...], states:{...}} object
                             form. For each item in the synthesis list,
                             synthesis.{storyline_name, reinforce, clash,
                             coordination_hint}. A `states` map is left untouched.

Items whose `synthesis` is null or carry a `synthesis_error` are copied through
unchanged.

Translation runs through Claude Opus 4.6 (via OpenRouter) at temperature 0.0,
with a per-locale disk cache so re-runs with identical input are free and
deterministic. After building each output the script validates structure (same
list lengths, same set of ids) and numeric fidelity per translated field
(`diff_numbers`); numeric drift is recorded in a sidecar, not crashed on. A
reproducibility sidecar `snapshot_translation_meta.{locale}.json` records the
model, temperature, prompts, run date, per-file counts, and any drift flags.

Invocation (run from the `python/` directory):

    cd python && uv run python -m scripts.translate_snapshots --country panama --locale es

Requirements:
    - `OPENROUTER_API_KEY` (or `LLM_API_KEY`) in the project-root `.env`
    - The country's English synthesis files under `python/output/{country}/`
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from src.config import LLM_MODEL, OUTPUT_DIR
from src.llm import call_llm_batch

# ─── Logging setup ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("translate_snapshots")

# ─── Translation config ─────────────────────────────────────────────────────

# Configured backend model: with AZURE_OPENAI_ENDPOINT set, this is the Azure
# deployment name (e.g. gpt-5.4); a hardcoded OpenRouter slug 404s on Azure.
TRANSLATION_MODEL = LLM_MODEL
TRANSLATION_TEMPERATURE = 0.0

# The three synthesis files we translate, with the structural "kind" that drives
# field collection. Kept as a list so output and sidecar iterate in this order.
SNAPSHOT_FILES = [
    "corpus_themes.json",
    "doc_pair_synthesis.json",
    "sector_synthesis.json",
]

# Acronyms that must survive translation verbatim (never translated or expanded).
# These feed the system prompt only; numeric fidelity is checked separately.
ACRONYMS = [
    "NDC", "NBSAP", "NAP", "BTR", "BER", "LDN", "ILDN", "FSS", "NRVTS", "IPCC",
    "GLOBE", "GGA", "NbS", "REDD+", "UNFCCC", "CBD", "SDG", "NR7", "CO₂",
    "LULUCF", "OECM",
]

# Per-locale settings: display name, an optional script note, and the canonical
# negative-side vocabulary rule (guardrail: never "contradiction/conflict/
# tension" equivalents; render "possible/potential misalignment" canonically).
LOCALES: dict[str, dict[str, str]] = {
    "es": {
        "name": "Spanish",
        "script_note": "",
        "vocab_rule": (
            'Render "possible misalignment" or "potential misalignment" as '
            '"posible desalineación". Never use "contradicción", "conflicto", '
            'or "tensión".'
        ),
    },
    "mn": {
        "name": "Mongolian",
        "script_note": " using the Mongolian Cyrillic script",
        "vocab_rule": (
            'Render "possible misalignment" or "potential misalignment" as '
            '"болзошгүй үл нийцэл". Never use "зөрчил" or "зөрчилдөөн".'
        ),
    },
}


def build_system_prompt(locale: str) -> str:
    """Build the locale-specific translation system prompt."""
    cfg = LOCALES[locale]
    target = cfg["name"]
    acronyms = ", ".join(ACRONYMS)
    return (
        f"You are a professional translator specialising in UN climate and "
        f"biodiversity policy documents.\n"
        f"Translate the provided English text into {target}{cfg['script_note']}, "
        f"in a faithful, professional, institutional register suitable for "
        f"policy makers.\n\n"
        f"Hard rules:\n"
        f"- Preserve ALL numbers, percentages, and units exactly as written. Do "
        f"not add, drop, or alter any number, and keep a percent sign attached to "
        f"its number.\n"
        f"- Preserve these acronyms VERBATIM, never translated, expanded, or "
        f"re-cased: {acronyms}.\n"
        f"- {cfg['vocab_rule']}\n"
        f"- Do not use em dashes.\n"
        f"- Keep structural elements intact: line breaks, lists, and colons stay "
        f"where they were.\n"
        f"- Return only the {target} translation. No commentary, no notes, no "
        f"quotation marks wrapping the result."
    )


USER_TEMPLATE = "Translate this text to {target}:\n\n{text}"


# ─── Numeric diffing (copied from scripts/translate_panama.py) ──────────────

# Match bare numbers like 1234, 12.5, 11,5 (Spanish decimal), 30%, 5.277 million.
# We capture the full numeric token so we can normalise and compare.
_NUMERIC_RE = re.compile(r"(\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d+|\d+)(%)?")


def extract_numbers(text: str) -> set[str]:
    """
    Pull normalised numeric tokens out of `text`.

    Decimals are normalised to a dot separator: both "11,5%" (Spanish) and
    "11.5%" (English) canonicalise to "11.5%". Thousand separators (longer
    groups) are stripped so "1,000" and "1.000" both canonicalise to "1000".
    A trailing "%" is preserved. Comparison is order-free because numbers
    can legitimately reorder during translation.

    Known limitation: a 3-digit decimal like "3.141" is ambiguous and will
    be read as thousand-separated (→ "3141"). Acceptable for policy targets,
    which typically round to 1-2 decimal places.
    """
    normalised: set[str] = set()
    for match in _NUMERIC_RE.finditer(text or ""):
        raw, pct = match.group(1), match.group(2) or ""
        # Decimal with 1-2 fraction digits (either separator): normalise to dot.
        if re.match(r"^\d+[.,]\d{1,2}$", raw):
            raw = raw.replace(",", ".")
        else:
            # Thousand separators or longer groups: strip to canonical integer.
            raw = raw.replace(".", "").replace(",", "")
        normalised.add(f"{raw}{pct}")
    return normalised


def diff_numbers(source: str, translated: str) -> list[str]:
    """Return human-readable descriptions of numeric tokens that drifted."""
    src_nums = extract_numbers(source)
    tgt_nums = extract_numbers(translated)
    missing = src_nums - tgt_nums
    extra = tgt_nums - src_nums
    issues: list[str] = []
    for n in sorted(missing):
        issues.append(f"number '{n}' missing from translation")
    for n in sorted(extra):
        issues.append(f"number '{n}' appears in translation but not source")
    return issues


# ─── Field collection ───────────────────────────────────────────────────────
#
# Each collector yields (container, key, locator) tuples pointing at exactly the
# prose strings on the whitelist. The container is the dict that holds the value,
# so writing back is `container[key] = translation`. The locator is a
# human-readable path used in drift flags.

_SYNTHESIS_FIELDS = ("storyline_name", "reinforce", "clash", "coordination_hint")


def _collect_corpus_themes(data: Any) -> list[tuple[dict, str, str]]:
    refs: list[tuple[dict, str, str]] = []
    storylines = data.get("storylines", []) if isinstance(data, dict) else []
    for i, story in enumerate(storylines):
        if not isinstance(story, dict):
            continue
        for key in ("name", "description"):
            val = story.get(key)
            if isinstance(val, str) and val.strip():
                refs.append((story, key, f"storylines[{i}].{key}"))
    if isinstance(data, dict):
        summary = data.get("summary_paragraph")
        if isinstance(summary, str) and summary.strip():
            refs.append((data, "summary_paragraph", "summary_paragraph"))
    return refs


def _synthesis_items(kind: str, data: Any) -> list[dict]:
    """Return the list of synthesis items for a doc_pair / sector file."""
    if kind == "sector_synthesis.json" and isinstance(data, dict):
        # Object form {synthesis:[...], states:{...}} — translate inside
        # synthesis[], leave states untouched.
        return data.get("synthesis", []) or []
    if isinstance(data, list):
        return data
    return []


def _collect_synthesis(kind: str, data: Any) -> list[tuple[dict, str, str]]:
    refs: list[tuple[dict, str, str]] = []
    for it in _synthesis_items(kind, data):
        if not isinstance(it, dict):
            continue
        syn = it.get("synthesis")
        # Null synthesis or a recorded synthesis_error → copy through unchanged.
        if not isinstance(syn, dict) or it.get("synthesis_error"):
            continue
        if kind == "doc_pair_synthesis.json":
            base = f"{it.get('doc_a')}<->{it.get('doc_b')}"
        else:
            base = str(it.get("category_id"))
        for key in _SYNTHESIS_FIELDS:
            val = syn.get(key)
            if isinstance(val, str) and val.strip():
                refs.append((syn, key, f"{base}.{key}"))
    return refs


def collect_refs(kind: str, data: Any) -> list[tuple[dict, str, str]]:
    refs: list[tuple[dict, str, str]] = []
    if kind == "corpus_themes.json":
        refs += _collect_corpus_themes(data)
    else:
        refs += _collect_synthesis(kind, data)
    # The document include/exclude toggle stores per-selection variants under a
    # `states` map (corpus_themes + sector_synthesis). Each value has the same
    # shape as the top level (corpus: {storylines,...}; sector: a synthesis
    # list), so its prose must be translated too — otherwise the storylines
    # shown for a non-default document selection render untranslated.
    states = data.get("states") if isinstance(data, dict) else None
    if isinstance(states, dict):
        for sk, sv in states.items():
            sub = (
                _collect_corpus_themes(sv)
                if kind == "corpus_themes.json"
                else _collect_synthesis(kind, sv)
            )
            for container, key, loc in sub:
                refs.append((container, key, f"states[{sk}].{loc}"))
    return refs


# ─── Structural identity helpers ────────────────────────────────────────────


def _skeleton(kind: str, data: Any) -> str:
    """
    Serialise `data` with every whitelisted prose field blanked to None.

    Two structures with identical non-prose content (ids, counts, confidence,
    taxonomy types, states maps, key order) produce identical skeletons. Used to
    prove the translated output altered nothing outside the whitelist.
    """
    clone = copy.deepcopy(data)
    for container, key, _loc in collect_refs(kind, clone):
        container[key] = None
    return json.dumps(clone, ensure_ascii=False, sort_keys=False)


def _id_set(kind: str, data: Any) -> set:
    """Stable identity set per file kind, for the explicit id-parity check."""
    if kind == "corpus_themes.json":
        storylines = data.get("storylines", []) if isinstance(data, dict) else []
        # Storylines have no stable id field (name is translated); identity is
        # positional, so compare the count via a range set.
        return set(range(len(storylines)))
    items = _synthesis_items(kind, data)
    if kind == "doc_pair_synthesis.json":
        return {(it.get("doc_a"), it.get("doc_b")) for it in items}
    return {it.get("category_id") for it in items}


# ─── Translation ────────────────────────────────────────────────────────────


async def translate_strings(
    texts: list[str], locale: str, cache_namespace: str, desc: str
) -> list[str]:
    """Batch-translate a list of strings via the shared LLM client (disk cached)."""
    if not texts:
        return []
    system = build_system_prompt(locale)
    target = LOCALES[locale]["name"]
    calls = [
        {
            "system": system,
            "user": USER_TEMPLATE.format(target=target, text=t),
            "model": TRANSLATION_MODEL,
            "temperature": TRANSLATION_TEMPERATURE,
        }
        for t in texts
    ]
    return await call_llm_batch(calls, cache_namespace=cache_namespace, desc=desc)


async def process_file(
    src_path: Path, kind: str, locale: str, cache_namespace: str
) -> tuple[Any, dict[str, Any]]:
    """
    Translate one snapshot file. Returns (output_structure, file_report).

    Raises AssertionError only on a structural mismatch (a code bug); numeric
    drift is recorded in the report, never raised.
    """
    source = json.loads(src_path.read_text(encoding="utf-8"))
    # Independent parse so the source stays pristine for source-text + validation.
    output = json.loads(src_path.read_text(encoding="utf-8"))

    refs_src = collect_refs(kind, source)
    refs_out = collect_refs(kind, output)
    assert len(refs_src) == len(refs_out), (
        f"{src_path.name}: ref count differs between source and output parses "
        f"({len(refs_src)} vs {len(refs_out)})"
    )

    source_texts = [container[key] for container, key, _loc in refs_src]
    locators = [loc for _c, _k, loc in refs_src]

    translations = await translate_strings(
        source_texts, locale, cache_namespace, desc=f"Translate {src_path.name} → {locale}"
    )

    drift_flags: list[dict[str, Any]] = []
    empty_fallbacks = 0
    for (container, key, _loc), src_text, locator, tr in zip(
        refs_out, source_texts, locators, translations, strict=True
    ):
        translated = (tr or "").strip()
        if not translated:
            # Defensive: keep the English source rather than emit an empty field.
            translated = src_text
            empty_fallbacks += 1
            drift_flags.append(
                {"locator": locator, "field": key, "issue": "empty translation; kept source text"}
            )
        container[key] = translated

        for issue in diff_numbers(src_text, translated):
            drift_flags.append({"locator": locator, "field": key, "issue": issue})

    # ── Validation ──────────────────────────────────────────────────────────
    # 1. Structural identity: everything outside the prose whitelist is byte-for
    #    -byte unchanged (ids, counts, confidence, taxonomy types, states, order).
    assert _skeleton(kind, source) == _skeleton(kind, output), (
        f"{src_path.name}: structural mismatch after translation — a non-prose "
        f"field changed. This is a bug, not drift."
    )
    # 2. Same list lengths + same set of ids (explicit, per spec).
    assert _id_set(kind, source) == _id_set(kind, output), (
        f"{src_path.name}: id/length set changed after translation."
    )

    report = {
        "items": len(_synthesis_items(kind, source))
        if kind != "corpus_themes.json"
        else len(source.get("storylines", [])),
        "fieldsTranslated": len(refs_out),
        "emptyFallbacks": empty_fallbacks,
        "numericDriftFlags": drift_flags,
    }
    return output, report


# ─── Main ───────────────────────────────────────────────────────────────────


async def amain(country: str, locale: str) -> None:
    if locale not in LOCALES:
        raise SystemExit(f"Unsupported locale '{locale}'. Choose from {list(LOCALES)}.")

    country_dir = OUTPUT_DIR / country
    if not country_dir.is_dir():
        raise SystemExit(
            f"Country output dir not found: {country_dir}. "
            f"Run the pipeline for '{country}' first."
        )

    cache_namespace = f"snapshot_translation_{locale}"
    target_name = LOCALES[locale]["name"]
    logger.info(
        f"Translating {country} snapshots → {locale} ({target_name}) "
        f"with {TRANSLATION_MODEL}"
    )

    file_reports: dict[str, Any] = {}
    written: list[str] = []

    for filename in SNAPSHOT_FILES:
        src_path = country_dir / filename
        if not src_path.exists():
            logger.warning(f"  {filename}: not found in {country_dir}; skipping.")
            file_reports[filename] = {"status": "missing"}
            continue

        output, report = await process_file(src_path, filename, locale, cache_namespace)

        out_path = src_path.with_suffix(f".{locale}.json")
        out_path.write_text(
            json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        written.append(out_path.name)
        file_reports[filename] = report
        n_drift = len(report["numericDriftFlags"])
        logger.info(
            f"  {filename}: {report['fieldsTranslated']} fields translated, "
            f"{n_drift} numeric-drift flag(s) → {out_path.name}"
        )

    # ── Reproducibility sidecar ──────────────────────────────────────────────
    total_fields = sum(
        r.get("fieldsTranslated", 0) for r in file_reports.values()
    )
    total_drift = sum(
        len(r.get("numericDriftFlags", [])) for r in file_reports.values()
    )
    metadata = {
        "country": country,
        "locale": locale,
        "targetLanguage": target_name,
        "model": TRANSLATION_MODEL,
        "temperature": TRANSLATION_TEMPERATURE,
        "promptSystem": build_system_prompt(locale),
        "promptUserTemplate": USER_TEMPLATE,
        "acronymsPreserved": ACRONYMS,
        "runDate": datetime.now(timezone.utc).isoformat(),
        "cacheNamespace": cache_namespace,
        "files": file_reports,
        "totalFieldsTranslated": total_fields,
        "totalNumericDriftFlags": total_drift,
    }
    meta_path = country_dir / f"snapshot_translation_meta.{locale}.json"
    meta_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    logger.info(f"Wrote sidecar → {meta_path.name}")

    logger.info(
        f"Done. {len(written)} file(s) translated, {total_fields} field(s) total, "
        f"{total_drift} numeric-drift flag(s). "
        + ("See sidecar for drift detail." if total_drift else "No numeric drift.")
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Translate AI-synthesis snapshots into a target locale."
    )
    parser.add_argument(
        "--country",
        required=True,
        help="Country id matching a python/output/{country}/ directory (e.g. panama).",
    )
    parser.add_argument(
        "--locale",
        required=True,
        choices=sorted(LOCALES),
        help="Target locale: es (Spanish) or mn (Mongolian).",
    )
    args = parser.parse_args()
    asyncio.run(amain(args.country, args.locale))


if __name__ == "__main__":
    main()
