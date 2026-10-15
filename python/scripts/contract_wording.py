"""The agreed vocabulary for the AI's explanations of contracts against targets.

CLAUDE.md: the pipeline flags pairs for review and does not establish certain
contradictions, so its wording is "possible misalignment / possible conflict /
likely conflict", never "tension" or "contradiction". The team's vocabulary
rule also retires "friction" and the verbs "pull against" / "work against" for
the flagged relation. The August comparisons of contracts with targets predate
both rules; the bake rewords them with the rules below, deterministically and
without a model.

The explanations are formulaic (about twenty phrasings), so each rule names the
phrasing it rewrites. A strong qualifier ("direct", "concrete", "clear",
"substantive", "core") becomes "likely"; an unqualified noun becomes
"possible". "Contradiction" is always negated in the record ("rather than a
fundamental contradiction"), so it becomes "conflict" with its qualifiers kept.
"Work against" as a noun ("afforestation work against desertification") is
left alone: only the verb, after a modal or "to", is rewritten.
"""

from __future__ import annotations

import re
from typing import Callable

STRONG = r"(?:direct|concrete|clear|substantive|core)"
KIND = r"(implementation|delivery)"
MODAL = r"(can|could|would|may|might|will|to)"

# Any retired term left in a text (the outcome check in the tests and the bake).
BANNED = (
    r"(?i)\btensions?\b|\bcontradict\w*|\bfrictions?\b|\bclash\w*"
    r"|\b(?:pulls|pulling|works|working|runs|running)\s+(?:directly\s+)?against\b"
    r"|\b(?:pull|work|run)s?\s+directly\s+against\b"
    rf"|\b{MODAL}\s+(?:directly\s+)?(?:pull|work|run)\s+against\b"
)

Rule = tuple[str, str | Callable[[re.Match[str]], str]]

RULES: list[Rule] = [
    # A strong qualifier with the kind of conflict: "a concrete implementation tension".
    (rf"\b{STRONG}\s+{KIND}\s+(?:tension|friction|clash|contradiction)\b", r"likely \1 conflict"),
    (rf"\b{STRONG}\s+(\w+-level)\s+tension\b", r"likely \1 conflict"),
    (rf"\b{STRONG}\s+(?:opposing-)?goal\s+tension\b", "likely conflict between goals"),
    (rf"\b{STRONG}\s+emissions-reduction\s+tension\b", "likely conflict with emissions reduction"),
    (rf"\bmanageable\s+{KIND}\s+friction\b", r"manageable \1 misalignment"),
    # A strong qualifier alone: "a direct tension", "the core tension".
    (rf"\b{STRONG}\s+(?:tension|friction|clash)\b", "likely conflict"),
    (r"\bdirect\s+contradiction\b", "likely conflict"),
    # The kind of conflict alone: "an implementation tension".
    (rf"\b{KIND}\s+(?:tension|clash|contradiction)\b", r"possible \1 conflict"),
    (rf"\b{KIND}\s+friction\b", r"possible \1 misalignment"),
    (r"\bresource\s+clash\b", "resource conflict"),
    # With a determiner: "that tension", "the friction".
    (r"\b(the|this|that)\s+tension\b", r"\1 possible conflict"),
    (r"\b(the|this|that)\s+friction\b", r"\1 possible misalignment"),
    # Always negated in the record: "rather than a fundamental contradiction".
    (r"\bcontradictions\b", "conflicts"),
    (r"\bcontradiction\b", "conflict"),
    (r"\bcontradictory\s+to\b", "at odds with"),
    (r"\bcontradictory\b", "at odds"),
    (r"\btensions\b", "possible conflicts"),
    (r"\btension\b", "possible conflict"),
    (r"\bfrictions\b", "possible misalignments"),
    (r"\bfriction\b", "possible misalignment"),
    (r"\bclash(?:es)?\b", "possible conflict"),
    # The verbs for the flagged relation.
    (r"\bdirectly\s+(?:pulls|works|runs)\s+against\b", "likely conflicts with"),
    (r"\b(?:pulls|works|runs)\s+directly\s+against\b", "likely conflicts with"),
    (r"\b(?:pulls|works|runs)\s+against\b", "may conflict with"),
    (r"\b(rather\s+than|avoid)\s+(?:pulling|working|running)\s+against\b", r"\1 conflicting with"),
    (r"\b(?:pulling|working|running)\s+against\b", "potentially conflicting with"),
    (rf"\b{MODAL}\s+(directly\s+)?(?:pull|work|run)\s+against\b", r"\1 \2conflict with"),
    (rf"\b{MODAL}\s+(?:pull|work|run)\s+directly\s+against\b", r"\1 directly conflict with"),
]

# "an implementation tension" became "an possible implementation conflict".
ARTICLE = re.compile(r"\b([Aa])n\s+(likely|possible|potentially)\b")


def _keep_capital(replacement: str | Callable[[re.Match[str]], str]) -> Callable[[re.Match[str]], str]:
    def sub(m: re.Match[str]) -> str:
        new = replacement(m) if callable(replacement) else m.expand(replacement)
        return new[:1].upper() + new[1:] if m.group(0)[:1].isupper() else new

    return sub


COMPILED = [(re.compile(pattern, re.IGNORECASE), _keep_capital(repl)) for pattern, repl in RULES]


def agreed_wording(text: str) -> str:
    """The text with the retired terms rewritten in the agreed vocabulary."""
    for pattern, sub in COMPILED:
        text = pattern.sub(sub, text)
    return ARTICLE.sub(r"\1 \2", text)
