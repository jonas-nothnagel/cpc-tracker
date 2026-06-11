"""Probe expected cache-hit rates BEFORE a pipeline run burns hours and quota.

Two full recomputes happened by surprise (2026-05: cache lived in a deleted
worktree; 2026-06-11: the --language directive changed every system prompt and
orphaned all pre-language cache keys). This probe reconstructs a sample of the
exact prompts run_analysis would issue and reports, per expensive namespace,
how many would hit the disk cache, WITHOUT making any API call.

Run from python/:
    .venv/bin/python scripts/probe_cache.py --targets-file mongolia-targets.json
    .venv/bin/python scripts/probe_cache.py --targets-file panama-targets.json

Read the verdicts before launching: a COLD namespace recomputes at full cost.
`python/tests/test_probe_cache.py` guards the prompt reconstruction against
drift from the real pipeline construction.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import DATA_DIR, LLM_MODEL, OUTPUT_DIR  # noqa: E402
from src.llm import _augment_system_with_language, read_cache, set_language  # noqa: E402
from src.align import (  # noqa: E402
    ADVISOR_SYSTEM,
    ADVISOR_USER_TEMPLATE,
    ANALYST_SYSTEM,
    ANALYST_USER_TEMPLATE,
    DOC_TYPE_LABELS,
    build_analyst_call,
    generate_pairs,
)
from src.measure_align import (  # noqa: E402
    ADAPTATION_CONTEXT_NOTE,
    CROSS_TYPE_INTRO_FRAMING,
    MEASURE_ADVISOR_SYSTEM,
    MEASURE_ADVISOR_USER_TEMPLATE,
    MEASURE_INTRO_FRAMING,
    _side_label,
    generate_measure_pairs,
    measures_to_pseudo_targets,
)

# ── Prompt builders (mirror the pipeline byte-for-byte; drift-guarded) ───────


def analyst_call(t: dict) -> tuple[str, str]:
    """Delegates to align.build_analyst_call — the pipeline's own builder."""
    call = build_analyst_call(t)
    return call["system"], call["user"]


def advisor_call(
    ta: dict, tb: dict, decomp_a: str, decomp_b: str, labels: dict[str, str]
) -> tuple[str, str]:
    """Mirror of align.assess_alignment's per-pair prompt construction."""
    user = ADVISOR_USER_TEMPLATE.format(
        intro_framing="",
        target_1_type=labels.get(ta["sourceDocument"], ta["sourceDocument"]),
        target_1_decomp=decomp_a,
        target_2_type=labels.get(tb["sourceDocument"], tb["sourceDocument"]),
        target_2_decomp=decomp_b,
    )
    return ADVISOR_SYSTEM, user


def measure_analyst_call(pt: dict) -> tuple[str, str]:
    """Mirror of measure_align.decompose_measures' prompt construction."""
    text = pt["text"]
    if pt.get("actionType") == "adaptation":
        text = (
            "[ADAPTATION ACTION — frame Outcome as vulnerability reduction "
            "or adaptive-capacity gain, not CO2e.] "
            + text
        )
    user = ANALYST_USER_TEMPLATE.format(
        target_text=text,
        activities_block="",
        actions_block="",
        action_instruction="",
    )
    return ANALYST_SYSTEM, user


def measure_advisor_call(
    target: dict, measure: dict, decomp_t: str, decomp_m: str, labels: dict[str, str]
) -> tuple[str, str]:
    """Mirror of measure_align.assess_measure_alignment's prompt construction."""
    is_cross_type = "measureStatus" in target
    base_framing = CROSS_TYPE_INTRO_FRAMING if is_cross_type else MEASURE_INTRO_FRAMING
    adaptation_note = (
        ADAPTATION_CONTEXT_NOTE if measure.get("actionType") == "adaptation" else ""
    )
    user = MEASURE_ADVISOR_USER_TEMPLATE.format(
        intro_framing=base_framing + adaptation_note,
        target_1_type=_side_label(target, labels),
        target_1_decomp=decomp_t,
        target_2_type=_side_label(measure, labels),
        target_2_decomp=decomp_m,
    )
    return MEASURE_ADVISOR_SYSTEM, user


# ── Probe ────────────────────────────────────────────────────────────────────


def _hit(namespace: str, system: str, user: str) -> str | None:
    """Cache lookup with the same language augmentation call_llm applies."""
    return read_cache(namespace, _augment_system_with_language(system), user, LLM_MODEL)


def verdict(hits: int, n: int) -> str:
    if n == 0:
        return "n/a"
    if hits == n:
        return "WARM"
    if hits == 0:
        return "COLD  <- this step would recompute at full cost"
    return f"PARTIAL ({hits}/{n})"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--targets-file", default="mongolia-targets.json")
    parser.add_argument("--language", default="en", choices=["en", "es", "mn", "fr"])
    parser.add_argument("--sample", type=int, default=25)
    args = parser.parse_args()
    set_language(args.language)
    n = args.sample

    # Mirror run_analysis's derivation: "mongolia-targets.json" -> "mongolia",
    # and the upload-flow "targets.json" -> "" (outputs live directly in
    # OUTPUT_DIR, typically via CPC_OUTPUT_DIR).
    stem = re.sub(r"-?targets\.json$", "", args.targets_file)
    raw = json.loads((DATA_DIR / args.targets_file).read_text())
    targets = raw["targets"] if isinstance(raw, dict) else raw

    labels = DOC_TYPE_LABELS
    cfg_path = DATA_DIR / (
        f"{stem}-country-config.json" if stem else "country-config.json"
    )
    if cfg_path.exists():
        cc = json.loads(cfg_path.read_text())
        labels = {dt["id"]: dt["mediumLabel"] for dt in cc.get("documentTypes", [])}

    print(f"Probe: {stem} · language={args.language} · model={LLM_MODEL} · sample={n}\n")

    # 1. Target decompositions ("decompose"). Keep the cached content: the
    #    alignment prompts embed it, so misses here cascade. Lookups are
    #    memoized (write-back) because the same target recurs across pairs.
    decomp_cache: dict[str, str | None] = {}

    def target_decomp(t: dict) -> str | None:
        tid = t["id"]
        if tid not in decomp_cache:
            decomp_cache[tid] = _hit("decompose", *analyst_call(t))
        return decomp_cache[tid]

    sample_targets = targets[:n]
    for t in sample_targets:
        target_decomp(t)
    d_hits = sum(1 for v in decomp_cache.values() if v is not None)
    print(f"  decompose            {d_hits:>4}/{len(sample_targets):<4} {verdict(d_hits, len(sample_targets))}")

    # 2. Corpus alignment ("alignment_v2") on the first N generated pairs.
    pairs = generate_pairs(targets)[:n]
    a_hits = a_n = 0
    for ta, tb in pairs:
        da = target_decomp(ta)
        db = target_decomp(tb)
        if da is None or db is None:
            continue  # cannot reconstruct: counts as unknown, reported below
        a_n += 1
        if _hit("alignment_v2", *advisor_call(ta, tb, da, db, labels)) is not None:
            a_hits += 1
    note = "" if a_n == len(pairs) else f"  ({len(pairs) - a_n} unknowable: upstream decomp cold)"
    print(f"  alignment_v2         {a_hits:>4}/{a_n:<4} {verdict(a_hits, a_n)}{note}")

    # 3. Measure alignment ("measure_alignment_v3"), when BTR data exists.
    # OUTPUT_DIR honors CPC_OUTPUT_DIR, so the probe reads the same outputs
    # the run would (a hardcoded repo-local path would silently probe stale
    # or absent data in exactly the redirected setups that need the probe).
    btr_path = (OUTPUT_DIR / stem if stem else OUTPUT_DIR) / "btr_data.json"
    if btr_path.exists():
        btr = json.loads(btr_path.read_text())
        pseudo = measures_to_pseudo_targets(
            btr.get("mitigationMeasures", []), action_type="mitigation"
        )
        adp_path = DATA_DIR / f"{stem}-btr-adaptation.json"
        if adp_path.exists():
            pseudo = pseudo + measures_to_pseudo_targets(
                json.loads(adp_path.read_text()).get("actions", []),
                action_type="adaptation",
            )
        m_pairs = generate_measure_pairs(targets, pseudo)[:n]
        m_decomp_cache: dict[str, str | None] = {}
        m_hits = m_n = 0
        for ta, m in m_pairs:
            dt = target_decomp(ta)
            mid = m["id"]
            if mid not in m_decomp_cache:
                m_decomp_cache[mid] = _hit("decompose", *measure_analyst_call(m))
            dm = m_decomp_cache[mid]
            if dt is None or dm is None:
                continue
            m_n += 1
            if _hit(
                "measure_alignment_v3", *measure_advisor_call(ta, m, dt, dm, labels)
            ) is not None:
                m_hits += 1
        note = "" if m_n == len(m_pairs) else f"  ({len(m_pairs) - m_n} unknowable: upstream decomp cold)"
        print(f"  measure_alignment_v3 {m_hits:>4}/{m_n:<4} {verdict(m_hits, m_n)}{note}")

    print(
        "\nWARM = re-run is free for that step. COLD = full recompute "
        "(check model, --language, and that you are using the main checkout's cache)."
    )


if __name__ == "__main__":
    main()
