"""
Mongolia Target Translation Script — one-off English → Mongolian back-translation.

Mongolia's 112 NDC / NBSAP / NAP / NRVTS / ILDN / SECTORAL policy targets were
extracted from Mongolia's *English-language* international submissions (NDC, the
English NBSAP, the NAP, etc.). No aligned Mongolian source text for these exists
in the repo, so verbatim restoration from a primary Mongolian document is NOT
feasible. This script therefore produces a **machine back-translation EN→MN**:
each English `text` is translated into Mongolian Cyrillic via Claude Opus 4.6
(through OpenRouter), labelled `textOriginalSource: "machine"` so the UI can be
honest about provenance.

The 41 FSS (Food Supply & Safety) targets already carry a *genuine* Mongolian
`textOriginal` (`language: "mn"`) lifted from the Mongolian-language resolution.
Those are left untouched except for stamping `textOriginalSource: "source"`.

The script UPDATES `python/data/mongolia-targets.json` in place (it is
git-tracked; a one-time pristine backup is written to
`mongolia-targets.json.bak` first). It applies the same R11.7-style validation
used by `translate_panama.py` (output-language detection + numeric diff +
acronym whitelist) and writes two sidecars:

    python/data/mongolia-translation-flags.json     — per-record review flags
    python/data/mongolia-translation-metadata.json  — reproducibility sidecar

The disk cache in `python/output/.cache/mongolia_target_translation/` keys
translations by (system+user+model), so a re-run with the same input is free
and deterministic.

Invocation:

    cd python && uv run python -m scripts.translate_mongolia_targets

Requirements:
    - `OPENROUTER_API_KEY` (or `LLM_API_KEY`) in the project-root `.env`
    - `python/data/mongolia-targets.json` present (153 records)
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
import logging
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from lingua import Language, LanguageDetectorBuilder

from src.config import LLM_MODEL
from src.llm import call_llm_batch

# ─── Logging setup ──────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("translate_mongolia_targets")

# ─── Paths ──────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "python" / "data"
TARGETS_PATH = DATA_DIR / "mongolia-targets.json"
BACKUP_PATH = DATA_DIR / "mongolia-targets.json.bak"
FLAGS_OUTPUT = DATA_DIR / "mongolia-translation-flags.json"
METADATA_OUTPUT = DATA_DIR / "mongolia-translation-metadata.json"

# ─── Translation config ─────────────────────────────────────────────────────

# Use the configured backend model: with AZURE_OPENAI_ENDPOINT set, the model
# name IS the Azure deployment (e.g. gpt-5.4), so a hardcoded OpenRouter slug
# 404s. Defaults to the OpenRouter model in dev.
TRANSLATION_MODEL = LLM_MODEL
TRANSLATION_TEMPERATURE = 0.0
CACHE_NAMESPACE = "mongolia_target_translation"

# Output-language gate. Mongolian (Cyrillic) and English (Latin) split cleanly,
# so a genuine Mongolian translation detects at ~1.0; anything below this is a
# review flag, not a hard failure.
MN_CONFIDENCE_THRESHOLD = 0.80

# Acronyms / units that must survive translation verbatim. Matched with word
# boundaries so short codes don't false-positive on substrings. The preflight at
# the start of the run drops whitelist entries with zero source hits so we don't
# chase ghosts (e.g. REDD+, LULUCF, OECM rarely appear in this corpus).
ACRONYM_WHITELIST = [
    "NDC",
    "NBSAP",
    "NAP",
    "NRVTS",
    "ILDN",
    "LDN",
    "BTR",
    "BER",
    "IPCC",
    "GLOBE",
    "GGA",
    "NbS",
    "REDD+",
    "UNFCCC",
    "CBD",
    "UNCCD",
    "SDG",
    "NR7",
    "CO₂",
    "LULUCF",
    "OECM",
    "GHG",
    "km²",
    "ha",
]

TRANSLATION_SYSTEM = (
    """You are a professional translator specialising in UN climate and biodiversity policy documents.
Translate the provided English text into Mongolian (Cyrillic script), faithful and in a formal government / policy register suitable for national policy analysis.

Hard rules:
- Preserve ALL numeric values, units and years exactly as written (percentages, hectares, km², tonnes, years, monetary amounts, counts). Do not add, drop, round or reformat any number.
- Preserve these acronyms and unit symbols VERBATIM in the Mongolian output; do NOT translate, expand, transliterate or change their capitalisation: """
    + ", ".join(ACRONYM_WHITELIST)
    + """.
- Keep structural elements intact: bullets, line breaks, numbered lists and colons stay where they were.
- Return ONLY the Mongolian translation. No commentary, no notes, no transliteration in brackets, no English gloss."""
)

TRANSLATION_USER = """Translate this text to Mongolian (Cyrillic):

{text}"""

# ─── Language detection ─────────────────────────────────────────────────────

_DETECTOR = LanguageDetectorBuilder.from_languages(
    Language.ENGLISH, Language.MONGOLIAN
).build()


def language_confidence(text: str, language: Language) -> float:
    """Return the detector's confidence (0-1) for `text` being in `language`."""
    if not text or not text.strip():
        return 0.0
    for result in _DETECTOR.compute_language_confidence_values(text):
        if result.language == language:
            return float(result.value)
    return 0.0


_CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")


def has_cyrillic(text: str) -> bool:
    return bool(_CYRILLIC_RE.search(text or ""))


# ─── Numeric diffing (verbatim from translate_panama.py) ────────────────────

# Match bare numbers like 1234, 12.5, 11,5 (European decimal), 30%, 5.277 million.
_NUMERIC_RE = re.compile(r"(\d{1,3}(?:[.,]\d{3})+|\d+[.,]\d+|\d+)(%)?")


def extract_numbers(text: str) -> set[str]:
    """
    Pull normalised numeric tokens out of `text`.

    Decimals are normalised to a dot separator: both "11,5%" and "11.5%"
    canonicalise to "11.5%". Thousand separators (longer groups) are stripped so
    "1,000" and "1.000" both canonicalise to "1000". A trailing "%" is preserved.
    Comparison is order-free because numbers can legitimately reorder during
    translation.

    Known limitation: a 3-digit decimal like "3.141" is ambiguous and will be
    read as thousand-separated (→ "3141"). Acceptable for policy targets, which
    typically round to 1-2 decimal places.
    """
    normalised: set[str] = set()
    for match in _NUMERIC_RE.finditer(text or ""):
        raw, pct = match.group(1), match.group(2) or ""
        if re.match(r"^\d+[.,]\d{1,2}$", raw):
            raw = raw.replace(",", ".")
        else:
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


# ─── Acronym preservation ───────────────────────────────────────────────────


def acronym_preflight(texts: list[str]) -> list[str]:
    """
    Drop acronyms that never appear in the source. Fast scan so we don't flag
    translations for missing acronyms that were never there.
    """
    all_source = " ".join(texts)
    active = [
        a
        for a in ACRONYM_WHITELIST
        if re.search(rf"(?<!\w){re.escape(a)}(?!\w)", all_source, re.IGNORECASE)
    ]
    logger.info(
        f"Acronym preflight: {len(active)}/{len(ACRONYM_WHITELIST)} active — {active}"
    )
    return active


def check_acronyms(
    source: str,
    translated: str,
    active_acronyms: list[str],
) -> list[str]:
    """Flag any whitelist acronym that appears in source but not (verbatim) in translation."""
    issues: list[str] = []
    for acronym in active_acronyms:
        pattern = rf"(?<!\w){re.escape(acronym)}(?!\w)"
        in_source = bool(re.search(pattern, source, re.IGNORECASE))
        in_target = bool(re.search(pattern, translated))
        if in_source and not in_target:
            issues.append(f"acronym '{acronym}' not preserved in translation")
    return issues


# ─── Hashing ────────────────────────────────────────────────────────────────


def sha256_of_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


# ─── Record partitioning ────────────────────────────────────────────────────


def partition_records(
    data: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Split the 153 records into:
      - genuine: the 41 FSS records that carry a real Mongolian `textOriginal`
        (`language: "mn"`). These are NOT translated.
      - translate: the 112 English-only records (no `textOriginal`). Their
        English `text` is machine-translated into Mongolian.

    Robust to re-runs: once stamped, records carry `textOriginalSource`
    ("source" → genuine, "machine" → translate), so re-running on an
    already-processed file re-derives the same buckets (and re-translation hits
    the disk cache, staying deterministic).
    """
    genuine: list[dict[str, Any]] = []
    translate: list[dict[str, Any]] = []
    for r in data:
        src = r.get("textOriginalSource")
        if src == "source":
            genuine.append(r)
        elif src == "machine":
            translate.append(r)
        elif r.get("textOriginal") and r.get("language") == "mn":
            genuine.append(r)
        elif not r.get("textOriginal"):
            translate.append(r)
        else:
            raise RuntimeError(
                f"Record {r.get('id')!r} fits neither bucket "
                f"(textOriginal set but language={r.get('language')!r}, "
                f"textOriginalSource={src!r}). Aborting to avoid corrupting data."
            )
    return genuine, translate


# ─── Translation ────────────────────────────────────────────────────────────


async def translate_texts(texts: list[str]) -> list[str]:
    """Batch-translate via the shared LLM client. Uses disk cache."""
    calls = [
        {
            "system": TRANSLATION_SYSTEM,
            "user": TRANSLATION_USER.format(text=t),
            "model": TRANSLATION_MODEL,
            "temperature": TRANSLATION_TEMPERATURE,
        }
        for t in texts
    ]
    return await call_llm_batch(
        calls,
        cache_namespace=CACHE_NAMESPACE,
        desc="Translate Mongolia targets EN→MN",
    )


# ─── Post-run structural assertions ─────────────────────────────────────────


def assert_invariants(
    data: list[dict[str, Any]],
    original_by_id: dict[str, dict[str, Any]],
    genuine_ids: set[str],
    translate_ids: set[str],
) -> None:
    """Hard invariants. Violations raise (and the caller restores the backup)."""
    assert len(data) == 153, f"expected 153 records, found {len(data)}"

    new_by_id = {r["id"]: r for r in data}
    assert set(new_by_id) == set(original_by_id), "record id set changed"
    assert len(new_by_id) == len(data), "duplicate ids introduced"
    assert genuine_ids | translate_ids == set(original_by_id), "partition gap"
    assert not (genuine_ids & translate_ids), "partition overlap"
    assert len(genuine_ids) == 41, f"expected 41 genuine records, got {len(genuine_ids)}"
    assert (
        len(translate_ids) == 112
    ), f"expected 112 translated records, got {len(translate_ids)}"

    for rid, new_rec in new_by_id.items():
        old_rec = original_by_id[rid]
        # No pre-existing field may be dropped.
        missing = set(old_rec) - set(new_rec)
        assert not missing, f"record {rid} lost pre-existing field(s): {sorted(missing)}"

    for rid in genuine_ids:
        new_rec = new_by_id[rid]
        old_rec = original_by_id[rid]
        assert (
            new_rec.get("textOriginal") == old_rec.get("textOriginal")
        ), f"genuine record {rid}: textOriginal was modified"
        assert (
            new_rec.get("textOriginalSource") == "source"
        ), f"genuine record {rid}: textOriginalSource != 'source'"
        assert new_rec.get("language") == "mn", f"genuine record {rid}: language != 'mn'"

    for rid in translate_ids:
        new_rec = new_by_id[rid]
        old_rec = original_by_id[rid]
        original = new_rec.get("textOriginal")
        assert isinstance(original, str) and original.strip(), (
            f"translated record {rid}: textOriginal empty"
        )
        assert has_cyrillic(original), (
            f"translated record {rid}: textOriginal has no Cyrillic (not Mongolian)"
        )
        assert new_rec.get("language") == "mn", f"translated record {rid}: language != 'mn'"
        assert (
            new_rec.get("textOriginalSource") == "machine"
        ), f"translated record {rid}: textOriginalSource != 'machine'"
        # English `text` must be left untouched.
        assert (
            new_rec.get("text") == old_rec.get("text")
        ), f"translated record {rid}: English text was modified"


# ─── Main ───────────────────────────────────────────────────────────────────


async def _run() -> None:
    if not TARGETS_PATH.exists():
        raise FileNotFoundError(f"Targets file not found: {TARGETS_PATH}")

    # One-time pristine backup. If it already exists we keep it (it is the
    # committed reproducibility baseline) and do not clobber it.
    if not BACKUP_PATH.exists():
        shutil.copy2(TARGETS_PATH, BACKUP_PATH)
        logger.info(f"Wrote one-time backup: {BACKUP_PATH.name}")
    else:
        logger.info(f"Backup already present, leaving as-is: {BACKUP_PATH.name}")

    # Exact start-of-run bytes, for restore-on-failure (never leave the file
    # half-edited).
    original_bytes = TARGETS_PATH.read_bytes()
    backup_sha = sha256_of_file(BACKUP_PATH)
    logger.info(f"Backup sha256: {backup_sha}")

    try:
        data = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise ValueError("mongolia-targets.json is not a JSON list")
        logger.info(f"Loaded {len(data)} records from {TARGETS_PATH.name}")

        original_by_id = {r["id"]: copy.deepcopy(r) for r in data}

        genuine, translate = partition_records(data)
        genuine_ids = {r["id"] for r in genuine}
        translate_ids = {r["id"] for r in translate}
        logger.info(
            f"Partition: {len(genuine)} genuine (FSS, source) / "
            f"{len(translate)} English-only (to translate)"
        )
        if len(genuine) != 41 or len(translate) != 112:
            raise RuntimeError(
                f"Unexpected partition {len(genuine)}/{len(translate)}; "
                "expected 41/112. Aborting."
            )

        active_acronyms = acronym_preflight([r["text"] for r in translate])

        # Translate the 112 English `text` fields → Mongolian.
        logger.info(
            f"Translating {len(translate)} English targets with {TRANSLATION_MODEL}…"
        )
        mn_texts = await translate_texts([r["text"] for r in translate])

        if any(not (t or "").strip() for t in mn_texts):
            n_empty = sum(1 for t in mn_texts if not (t or "").strip())
            raise RuntimeError(
                f"{n_empty} translation(s) came back empty — treating as an LLM "
                "failure and aborting (file will be restored)."
            )

        # ── Stamp genuine (FSS) records ──
        for r in genuine:
            r["textOriginalSource"] = "source"

        # ── Apply translations + validate ──
        all_flags: list[dict[str, Any]] = []
        for r, mn in zip(translate, mn_texts, strict=True):
            mn = (mn or "").strip()
            english = r["text"]

            r["textOriginal"] = mn
            r["language"] = "mn"
            r["textOriginalSource"] = "machine"

            reasons: list[str] = []

            # Output-language check: must read as Mongolian, not English.
            mn_conf = language_confidence(mn, Language.MONGOLIAN)
            en_conf = language_confidence(mn, Language.ENGLISH)
            if mn_conf < MN_CONFIDENCE_THRESHOLD or en_conf > mn_conf:
                reasons.append(
                    f"output Mongolian confidence {mn_conf:.2f} "
                    f"(English {en_conf:.2f}) — possible language drift / not Mongolian"
                )

            # Numeric drift between English source and Mongolian output.
            reasons.extend(diff_numbers(english, mn))

            # Acronym / unit preservation.
            reasons.extend(check_acronyms(english, mn, active_acronyms))

            if reasons:
                all_flags.append(
                    {
                        "id": r["id"],
                        "sourceDocument": r.get("sourceDocument"),
                        "sourceLabel": r.get("sourceLabel"),
                        "text": english,
                        "textOriginal": mn,
                        "reasons": reasons,
                    }
                )

        # ── Hard structural assertions BEFORE writing anything ──
        assert_invariants(data, original_by_id, genuine_ids, translate_ids)

        # ── Write sidecars ──
        FLAGS_OUTPUT.write_text(
            json.dumps(all_flags, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        logger.info(f"Wrote {len(all_flags)} flagged record(s) to {FLAGS_OUTPUT.name}")

        metadata = {
            "translationDirection": "en->mn",
            "provenanceNote": (
                "Machine back-translation EN→MN. Mongolia's NDC/NBSAP/NAP/NRVTS/"
                "ILDN/SECTORAL targets were extracted from English international "
                "submissions; no aligned Mongolian source text exists in-repo, so "
                "verbatim restoration was confirmed NOT feasible. The 41 FSS "
                "targets carry genuine Mongolian originals (textOriginalSource="
                "'source'); the 112 others are machine-translated "
                "(textOriginalSource='machine')."
            ),
            "model": TRANSLATION_MODEL,
            "temperature": TRANSLATION_TEMPERATURE,
            "promptSystem": TRANSLATION_SYSTEM,
            "promptUserTemplate": TRANSLATION_USER,
            "runDate": datetime.now(timezone.utc).isoformat(),
            "inputFile": str(TARGETS_PATH.relative_to(PROJECT_ROOT)),
            "inputBackupFile": str(BACKUP_PATH.relative_to(PROJECT_ROOT)),
            "inputBackupSha256": backup_sha,
            "totalRecords": len(data),
            "genuineRecords": len(genuine),
            "translatedRecords": len(translate),
            "flaggedRecords": len(all_flags),
            "acronymWhitelistActive": active_acronyms,
            "mongolianConfidenceThreshold": MN_CONFIDENCE_THRESHOLD,
            "cacheNamespace": CACHE_NAMESPACE,
        }
        METADATA_OUTPUT.write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        logger.info(f"Wrote reproducibility metadata to {METADATA_OUTPUT.name}")

        # ── Write the updated targets file (repo JSON convention) ──
        TARGETS_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        logger.info(f"Wrote updated targets to {TARGETS_PATH.name}")

        # ── Re-read from disk and re-assert (validates persisted bytes) ──
        reread = json.loads(TARGETS_PATH.read_text(encoding="utf-8"))
        assert_invariants(reread, original_by_id, genuine_ids, translate_ids)
        logger.info("Post-write assertions passed on re-read file.")

        logger.info(
            f"Done. {len(translate)} records translated, {len(genuine)} stamped as "
            f"source, {len(all_flags)} flagged. See {FLAGS_OUTPUT.name} for review."
        )

    except Exception:
        logger.error(
            "Run failed; restoring mongolia-targets.json to its start-of-run state "
            "so it is not left half-edited."
        )
        TARGETS_PATH.write_bytes(original_bytes)
        raise


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
