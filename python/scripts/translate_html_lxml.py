"""
Block-level HTML page translation (visible text only), preserving structure.

The methodology *experience* page is ~94KB but its VISIBLE text is only ~18KB,
split across ~275 leaf block elements plus a handful of label strings inside the
inline <script>. A whole-file one-shot LLM call times out; this translates each
leaf block's inner HTML (inline tags preserved) and the script's display strings
in small cached calls, then reserializes.

Invocation:
    cd python && uv run python -m scripts.translate_html_lxml \
        --in ../public/methodology-experience.html \
        --out ../public/methodology-experience.mn.html --locale mn

Validates structure (one <script>/<style>, size ratio, lang attr) before writing;
exits non-zero without writing on failure so the English fallback stays.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
from pathlib import Path

from lxml import html as lh

from src.config import LLM_MODEL
from src.llm import call_llm_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("translate_html_lxml")

LANG = {"es": "Spanish", "mn": "Mongolian (Cyrillic)"}
VOCAB = {
    "es": "Canonical terms: Potential misalignment = 'Posible desalineación'; Policy coherence = 'Coherencia de políticas'. Never 'contradicción'/'conflicto'/'tensión' for misalignment; use 'desalineación'. UNDP = 'PNUD'.",
    "mn": "Canonical terms: Potential misalignment = 'Болзошгүй үл нийцэл'; Policy coherence = 'Бодлогын уялдаа'. Never 'зөрчил'/'зөрчилдөөн' for misalignment; use 'үл нийцэл'. UNDP = 'НҮБ-ын Хөгжлийн Хөтөлбөр'.",
}
ACRONYMS = "NDC, NBSAP, NAP, NRVTS, ILDN, LDN, BTR, BER, IPCC, GLOBE, GGA, NbS, REDD+, UNFCCC, CBD, NR7, CO₂, LULUCF, OECM, MRV, STI"

# Leaf-block tags whose inner HTML we translate (inline tags inside are kept).
BLOCK = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "button",
         "figcaption", "summary", "caption", "label", "blockquote", "dt", "dd"}


def frag_sys(locale: str) -> str:
    return (
        f"Translate the VISIBLE TEXT of this HTML fragment into {LANG[locale]}. "
        "Preserve every HTML tag, attribute, and entity EXACTLY; translate only the human-readable text between/around tags. "
        "Keep all numbers and these acronyms verbatim: " + ACRONYMS + ". "
        + VOCAB[locale] +
        " Professional/institutional register. Return ONLY the translated fragment, no commentary, no code fences."
    )


def str_sys(locale: str) -> str:
    return (
        f"Translate this short UI label into {LANG[locale]}. Keep numbers and acronyms ("
        + ACRONYMS + ") verbatim. " + VOCAB[locale]
        + " Return ONLY the translation, no quotes, no commentary."
    )


def leaf_blocks(doc) -> list:
    out = []
    for el in doc.iter():
        if el.tag in BLOCK and not any(d.tag in BLOCK for d in el.iterdescendants()):
            inner = (el.text or "") + "".join(
                lh.tostring(c, encoding="unicode") for c in el
            )
            if re.search(r"[A-Za-z]", inner):
                out.append(el)
    return out


def set_inner(el, fragment_html: str) -> None:
    wrapped = f"<div>{fragment_html}</div>"
    try:
        parsed = lh.fragment_fromstring(wrapped)
    except Exception:
        return  # leave original on parse failure
    el.text = parsed.text
    for c in list(el):
        el.remove(c)
    for c in list(parsed):
        el.append(c)


async def amain() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--locale", required=True, choices=list(LANG))
    args = ap.parse_args()
    loc = args.locale
    src = Path(args.inp).read_text(encoding="utf-8")

    doc = lh.document_fromstring(src)
    doc.set("lang", loc)

    blocks = leaf_blocks(doc)
    inners = [
        (b.text or "") + "".join(lh.tostring(c, encoding="unicode") for c in b)
        for b in blocks
    ]
    logger.info(f"{len(blocks)} leaf blocks; translating inner HTML -> {loc}")
    block_tx = await call_llm_batch(
        [{"system": frag_sys(loc), "user": h, "model": LLM_MODEL, "temperature": 0.0, "max_tokens": 4000} for h in inners],
        cache_namespace=f"html_block_{loc}", desc=f"blocks {loc}",
    )
    for el, tx in zip(blocks, block_tx):
        if tx and tx.strip():
            set_inner(el, tx.strip())

    # <script> display strings: node labels t:/b: and PH/PHK dict values.
    scripts = doc.xpath("//script")
    if scripts:
        sc = scripts[0]
        js = sc.text or ""
        labels = sorted(set(re.findall(r'\b[tb]:\s*"((?:[^"\\]|\\.)+)"', js))
                        | set(re.findall(r'\b(?:ex|an|sy):\s*"((?:[^"\\]|\\.)+)"', js)))
        labels = [l for l in labels if re.search(r"[A-Za-z]", l)]
        if labels:
            logger.info(f"{len(labels)} script labels -> {loc}")
            lab_tx = await call_llm_batch(
                [{"system": str_sys(loc), "user": l, "model": LLM_MODEL, "temperature": 0.0, "max_tokens": 400} for l in labels],
                cache_namespace=f"html_label_{loc}", desc=f"labels {loc}",
            )
            for orig, tx in zip(labels, lab_tx):
                if tx and tx.strip():
                    safe = tx.strip().replace("\\", "\\\\").replace('"', '\\"')
                    js = js.replace(f'"{orig}"', f'"{safe}"')
            sc.text = js

    # internal brief link -> locale sibling
    for a in doc.xpath('//a[@href="/methodology-brief.html"]'):
        a.set("href", f"/methodology-brief.{loc}.html")

    out = "<!DOCTYPE html>\n" + lh.tostring(doc, encoding="unicode")
    # validate
    errs = []
    if out.count("<script") != src.count("<script"): errs.append("script count")
    if out.count("<style") != src.count("<style"): errs.append("style count")
    ratio = len(out) / max(len(src), 1)
    if not (0.6 <= ratio <= 1.8): errs.append(f"size ratio {ratio:.2f}")
    if f'lang="{loc}"' not in out: errs.append("lang attr")
    if errs:
        logger.error(f"VALIDATION FAILED ({errs}); not writing {args.out}")
        raise SystemExit(2)
    Path(args.out).write_text(out, encoding="utf-8")
    logger.info(f"Wrote {args.out} ({len(out)} bytes, ratio {ratio:.2f})")


if __name__ == "__main__":
    asyncio.run(amain())
