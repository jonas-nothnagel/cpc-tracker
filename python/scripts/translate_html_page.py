"""
Translate a self-contained static HTML page (visible text only) to a target
locale via the configured LLM, preserving all markup / CSS / JS structure.

Used for the methodology pages (`public/methodology-*.html`), whose visible
copy lives both in HTML text nodes AND as string values inside an inline
`<script>` (step labels), so a fragment-level find/replace is unsafe. We hand
the whole file to the model with strict structure-preservation rules and
validate the result before writing.

Invocation:
    cd python && uv run python -m scripts.translate_html_page \
        --in ../public/methodology-experience.html \
        --out ../public/methodology-experience.mn.html --locale mn

The result is validated (DOCTYPE + </html> present, one <script>/<style>,
balanced braces, size within 0.6-1.8x of the source, lang attr set). If
validation fails (e.g. the model truncated the output), nothing is written and
the script exits non-zero so the English fallback stays in place.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import re
from pathlib import Path

from src.config import LLM_MODEL
from src.llm import call_llm_batch

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("translate_html_page")

LOCALES = {
    "es": {
        "name": "Spanish",
        "lang": "es",
        "vocab": (
            "Use these canonical terms: Potential misalignment = 'Posible desalineación'; "
            "No alignment = 'Sin relación'; Partial = 'Parcial'; Medium = 'Media'; "
            "High = 'Alta'; Policy coherence = 'Coherencia de políticas'; "
            "Financial alignment = 'Alineación financiera'; Implementation progress = "
            "'Avance de la implementación'; UNDP = 'PNUD'. Never use 'contradicción', "
            "'conflicto' or 'tensión' for misalignment; use 'desalineación'."
        ),
    },
    "mn": {
        "name": "Mongolian (Cyrillic)",
        "lang": "mn",
        "vocab": (
            "Use these canonical terms: Potential misalignment = 'Болзошгүй үл нийцэл'; "
            "No alignment = 'Холбоо байхгүй'; Partial = 'Хэсэгчилсэн'; Medium = 'Дунд'; "
            "High = 'Өндөр'; Policy coherence = 'Бодлогын уялдаа'; Financial alignment = "
            "'Санхүүгийн уялдаа'; Implementation progress = 'Хэрэгжилтийн явц'; UNDP = "
            "'НҮБ-ын Хөгжлийн Хөтөлбөр'. Never use 'зөрчил' or 'зөрчилдөөн' for "
            "misalignment; use 'үл нийцэл'."
        ),
    },
}

ACRONYMS = "NDC, NBSAP, NAP, NRVTS, ILDN, LDN, BTR, BER, IPCC, GLOBE, GGA, NbS, REDD+, UNFCCC, CBD, NR7, CO₂, LULUCF, OECM"


def system_prompt(locale: str, brief_link_old: str, brief_link_new: str) -> str:
    cfg = LOCALES[locale]
    return f"""You translate a self-contained HTML page into {cfg['name']} for UNDP policymakers.

Output the COMPLETE translated HTML file and NOTHING else: no markdown fences, no commentary, start at <!DOCTYPE and end at </html>.

TRANSLATE all human-visible text:
- HTML text nodes, headings, captions, button labels, the <title>, and visible attributes (alt, title, aria-label, placeholder).
- Visible English string VALUES inside the <script> (e.g. step labels in object properties like t:"..." and b:"...", and phase dictionaries) — these render to the user, so translate them.

DO NOT change (keep byte-for-byte):
- Any HTML tag, attribute name, structure, or the entire <style> block.
- Class names, ids, data-* attributes, URLs/hrefs — EXCEPT change the link "{brief_link_old}" to "{brief_link_new}".
- Inside <script>: object KEYS / property names, variable & function names, logic, CSS selectors, and any string used as an id/class/key/url. Translate ONLY human-readable display strings.
- All numbers, percentages, years, and units exactly.
- Keep these acronyms verbatim: {ACRONYMS}.

Set the root element to <html lang="{cfg['lang']}">.
{cfg['vocab']}
Faithful, professional/institutional register. Do not add or remove content; do not add disclaimers. Preserve JS validity (mind quote escaping; preserve \\u00b7 and other escapes)."""


def extract_html(raw: str) -> str:
    """Pull the HTML document out of the model response (strip fences/preamble)."""
    s = raw.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\n", "", s)
        s = re.sub(r"\n```$", "", s).strip()
    i = s.find("<!DOCTYPE")
    if i == -1:
        i = s.find("<html")
    j = s.rfind("</html>")
    if i != -1 and j != -1:
        return s[i : j + len("</html>")]
    return s


def validate(out: str, src: str, lang: str) -> list[str]:
    errs: list[str] = []
    if "<!DOCTYPE" not in out[:200] and "<html" not in out[:200]:
        errs.append("missing DOCTYPE/<html> at start")
    if not out.rstrip().endswith("</html>"):
        errs.append("does not end with </html> (likely truncated)")
    if out.count("<script") != src.count("<script"):
        errs.append(f"<script> count {out.count('<script')} != source {src.count('<script')}")
    if out.count("<style") != src.count("<style"):
        errs.append(f"<style> count {out.count('<style')} != source {src.count('<style')}")
    if out.count("{") != out.count("}"):
        errs.append(f"unbalanced braces ({out.count('{')} vs {out.count('}')})")
    ratio = len(out) / max(len(src), 1)
    if not (0.6 <= ratio <= 1.8):
        errs.append(f"size ratio {ratio:.2f} out of range (likely truncated/garbled)")
    if f'lang="{lang}"' not in out:
        errs.append(f'lang="{lang}" not set')
    return errs


async def amain() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--locale", required=True, choices=list(LOCALES))
    args = ap.parse_args()

    src_path, out_path = Path(args.inp), Path(args.out)
    src = src_path.read_text(encoding="utf-8")
    base = src_path.name
    brief_old = "/methodology-brief.html"
    brief_new = f"/methodology-brief.{args.locale}.html"

    logger.info(f"Translating {base} -> {out_path.name} ({args.locale}) via {LLM_MODEL}, {len(src)} bytes")
    results = await call_llm_batch(
        [{
            "system": system_prompt(args.locale, brief_old, brief_new),
            "user": src,
            "model": LLM_MODEL,
            "temperature": 0.0,
            "max_tokens": 60000,
        }],
        cache_namespace=f"html_page_translation_{args.locale}",
        desc=f"Translate {base} {args.locale}",
    )
    out = extract_html(results[0] or "")
    errs = validate(out, src, args.locale)
    if errs:
        logger.error(f"VALIDATION FAILED, not writing {out_path.name}: {errs}")
        raise SystemExit(2)
    out_path.write_text(out, encoding="utf-8")
    logger.info(f"Wrote {out_path} ({len(out)} bytes, ratio {len(out)/len(src):.2f})")


if __name__ == "__main__":
    asyncio.run(amain())
