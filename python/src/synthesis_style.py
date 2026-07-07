"""
Shared style validation + sanitization for the synthesis LLM steps.

The synthesis layer (doc-pair, corpus) writes user-facing prose. Two project
guardrails govern that prose (see CLAUDE.md):

- Negative-side vocabulary: synthesis outputs are review prompts, not
  verdicts. Prose says "potential misalignment" or "possible misalignment",
  never "tension", "contradiction", "friction", or "conflict", and never the
  phrase "flagged for review". Positive-side prose avoids "reinforces".
- Theme names are noun phrases naming a recurring pattern, never imperative
  recommendations ("Review land competition" reads as advice; "Land
  requirements of expansion incentives" reads as a finding).

Check functions return human-readable violation strings that the calling step
echoes back to the model in a single corrective retry ("CORRECTIONS
REQUIRED: ..."). `sanitize_prose` / `sanitize_name` are the deterministic
last-resort repairs applied after that retry, so a stubborn model can degrade
style but never ship banned vocabulary. Style problems never crash a run.

Lexical (English-word) checks gate on the pipeline output language
(`llm.get_language()` in (None, "en")); structural checks (word counts,
trailing period, dashes, one-sentence pathway) always run.
"""

from __future__ import annotations

import re

from .llm import get_language

# First words that make a theme name read as an instruction rather than a
# pattern. A name fails only when the SECOND word is not "of"/"and", so noun
# usages like "Use of governance and monitoring systems" survive.
IMPERATIVE_BLOCKLIST = frozenset({
    "review", "use", "embed", "link", "rely", "align", "strengthen", "ensure",
    "flag", "leverage", "coordinate", "integrate", "expand", "harmonize",
    "harmonise", "promote", "adopt", "establish", "build", "improve",
    "enhance", "prioritize", "prioritise", "monitor", "connect", "combine",
    "balance", "manage", "protect", "avoid", "reduce", "scale", "consider",
})

_NAME_SECOND_WORD_ALLOWED = {"of", "and"}

# As the SECOND token of a name, these signal the first word is a noun
# ("Balance between ...", "Link across ...") rather than an imperative verb.
# The last-resort sanitizer consults this before stripping a leading verb, so
# it never leaves a title that opens on a preposition ("Between conservation
# and ..."). Superset of _NAME_SECOND_WORD_ALLOWED (of/and never reach the
# sanitizer's strip branch, but listing them keeps the intent self-contained).
_NOUN_SIGNAL_NEXT_WORD = frozenset({
    "of", "and", "between", "across", "among", "amongst", "with", "for",
    "in", "on", "to", "from", "over", "under", "within", "against", "into",
    "versus", "vs", "or", "toward", "towards",
})

NAME_MIN_WORDS = 4
NAME_MAX_WORDS = 10

# Banned vocabulary in prose fields (word-boundary, case-insensitive). The
# suffix classes are deliberate: "contradict" is banned in every inflection,
# while "conflicts?" must NOT swallow words like "conflicting" via a missing
# boundary, and "must" must never match inside "mustard".
BANNED_VOCABULARY: list[tuple[str, re.Pattern[str]]] = [
    ("tension", re.compile(r"\btensions?\b", re.IGNORECASE)),
    ("contradiction", re.compile(r"\bcontradict\w*", re.IGNORECASE)),
    ("friction", re.compile(r"\bfrictions?\b", re.IGNORECASE)),
    ("conflict", re.compile(r"\bconflicts?\b", re.IGNORECASE)),
    ("flagged for review", re.compile(r"flagged\s+for\s+review", re.IGNORECASE)),
    ("reinforce", re.compile(r"\breinforc\w*", re.IGNORECASE)),
    ("should", re.compile(r"\bshould\b", re.IGNORECASE)),
    ("must", re.compile(r"\bmust\b", re.IGNORECASE)),
]

_DASH_RE = re.compile(r"[—–]")  # em dash, en dash

_PATHWAY_HEDGE_RE = re.compile(
    r"\b(could|may|worth a closer look)\b", re.IGNORECASE
)


def lexical_checks_enabled() -> bool:
    """English-word checks only make sense for English pipeline output."""
    return get_language() in (None, "en")


def _words(text: str) -> list[str]:
    return [w for w in re.split(r"\s+", text.strip()) if w]


def _starts_with_imperative(name: str) -> bool:
    words = _words(name)
    if not words:
        return False
    first = words[0].strip(",.;:").casefold()
    if first not in IMPERATIVE_BLOCKLIST:
        return False
    if len(words) >= 2 and words[1].strip(",.;:").casefold() in _NAME_SECOND_WORD_ALLOWED:
        return False
    return True


def check_prose(text: str, field: str) -> list[str]:
    """Vocabulary + dash violations for one prose value. Empty text passes."""
    violations: list[str] = []
    if not isinstance(text, str) or not text.strip():
        return violations
    if _DASH_RE.search(text):
        violations.append(f"{field}: contains an em or en dash; use commas or full stops")
    if lexical_checks_enabled():
        for label, pattern in BANNED_VOCABULARY:
            if pattern.search(text):
                violations.append(f'{field}: uses banned wording "{label}"')
    return violations


def check_theme_name(name: str, field: str = "name") -> list[str]:
    """Structural + imperative-verb checks for a theme/storyline name.

    Vocabulary is NOT checked here; run `check_prose` on the name separately
    so each violation is reported once.
    """
    if not isinstance(name, str) or not name.strip():
        return [f"{field}: missing or empty"]
    violations: list[str] = []
    words = _words(name)
    if not (NAME_MIN_WORDS <= len(words) <= NAME_MAX_WORDS):
        violations.append(
            f'{field} "{name}": needs {NAME_MIN_WORDS}-{NAME_MAX_WORDS} words, has {len(words)}'
        )
    if name.rstrip().endswith("."):
        violations.append(f'{field} "{name}": no trailing period')
    if lexical_checks_enabled() and _starts_with_imperative(name):
        violations.append(
            f'{field} "{name}": begins with the imperative verb "{words[0]}"; '
            f"name the recurring pattern as a noun phrase instead"
        )
    return violations


def check_pathway(text: str, field: str = "pathway") -> list[str]:
    """The pathway is exactly one hedged sentence."""
    if not isinstance(text, str) or not text.strip():
        return [f"{field}: missing or empty"]
    violations: list[str] = []
    stripped = text.strip()
    body = stripped[:-1] if stripped[-1] in ".!?" else stripped
    # Common abbreviations would false-positive the one-sentence check.
    body = re.sub(r"\b(e\.g\.|i\.e\.)", "eg", body, flags=re.IGNORECASE)
    if re.search(r"[.!?]\s", body):
        violations.append(f"{field}: exactly one sentence")
    if lexical_checks_enabled() and not _PATHWAY_HEDGE_RE.search(stripped):
        violations.append(
            f'{field}: hedge it with "could", "may", or "worth a closer look"'
        )
    return violations


def corrections_block(violations: list[str], limit: int = 40) -> str:
    """The retry suffix appended to the original user prompt.

    New content means a new cache key, so the corrective retry never re-reads
    the cached bad answer.
    """
    lines = "\n".join(f"- {v}" for v in violations[:limit])
    return (
        "\n\nCORRECTIONS REQUIRED:\n"
        "A previous attempt at this task violated the rules listed below. "
        "Produce the full JSON object again, fixing every listed issue and "
        "keeping everything else compliant:\n"
        f"{lines}"
    )


# ---------------------------------------------------------------------------
# Last-resort sanitizers
# ---------------------------------------------------------------------------

# Ordered: phrases before single words, plural before singular, longer
# inflections before shorter stems.
_SANITIZE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"flagged\s+for\s+review", re.IGNORECASE), "identified for review"),
    (re.compile(r"\b(?:tensions|contradictions|frictions|conflicts)\b", re.IGNORECASE),
     "potential misalignments"),
    (re.compile(r"\b(?:tension|contradiction|friction|conflict)\b", re.IGNORECASE),
     "potential misalignment"),
    (re.compile(r"\bcontradict(?:ing|ory)\b", re.IGNORECASE), "potentially misaligned"),
    (re.compile(r"\bcontradicts?\b", re.IGNORECASE), "may not align with"),
    (re.compile(r"\breinforcements\b", re.IGNORECASE), "alignments"),
    (re.compile(r"\breinforcement\b", re.IGNORECASE), "alignment"),
    (re.compile(r"\breinforces\b", re.IGNORECASE), "aligns with"),
    (re.compile(r"\breinforced\b", re.IGNORECASE), "aligned with"),
    (re.compile(r"\breinforcing\b", re.IGNORECASE), "aligning with"),
    (re.compile(r"\breinforce\b", re.IGNORECASE), "align with"),
    (re.compile(r"\bshould\b", re.IGNORECASE), "could"),
    (re.compile(r"\bmust\b", re.IGNORECASE), "may"),
]


def _preserve_case(replacement: str, matched: str) -> str:
    if matched[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def sanitize_prose(text: str) -> str:
    """Deterministically strip banned vocabulary and dashes from prose.

    Grammar can degrade slightly; that is the accepted cost of never shipping
    banned vocabulary after the corrective retry has already been spent.
    """
    if not isinstance(text, str) or not text:
        return text
    out = text
    for pattern, replacement in _SANITIZE_RULES:
        out = pattern.sub(
            lambda m, r=replacement: _preserve_case(r, m.group(0)), out
        )
    out = re.sub(r"\s*[—–]\s*", ", ", out)
    out = re.sub(r" {2,}", " ", out)
    return out


def sanitize_name(name: str) -> str:
    """Sanitize a theme name: prose rules, trailing period, imperative prefix."""
    if not isinstance(name, str) or not name.strip():
        return name
    out = sanitize_prose(name).strip().rstrip(".")
    if lexical_checks_enabled() and _starts_with_imperative(out):
        words = _words(out)
        # Strip the leading verb only when the remainder still opens on a
        # content word. If the next token is a preposition/conjunction, the
        # first word was a noun ("Balance between ...") and stripping would
        # leave a broken title; keep the name and let the logged style
        # warning stand instead of shipping a mangled one.
        nxt = words[1].strip(",.;:").casefold() if len(words) >= 2 else ""
        if nxt and nxt not in _NOUN_SIGNAL_NEXT_WORD:
            rest = words[1:]
            rest[0] = rest[0][:1].upper() + rest[0][1:]
            out = " ".join(rest)
    return out
