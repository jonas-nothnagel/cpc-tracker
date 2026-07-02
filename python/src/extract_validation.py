"""
Shared text normalisation, similarity, and quote-verification helpers.

Used by BOTH the extraction pipeline (src/extract.py) and the evaluation
harness (scripts/eval_extraction.py) so the shipped quote validator and the
eval metric are literally the same code. Pure text functions only: no LLM,
no file I/O, no third-party dependencies.

Vocabulary:
  quote match level — how strongly a claimed verbatim quote can be located
    in the parsed document text:
      "exact"      whitespace-collapsed quote is a substring of the
                   whitespace-collapsed document (punctuation intact)
      "normalized" aggressively normalised quote is a substring of the
                   normalised document (case, accents, punctuation folded)
      "fuzzy"      >= QUOTE_FUZZY_THRESHOLD of the quote's word n-grams
                   appear in the document
      "not_found"  none of the above
"""

from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher
from typing import Any

# Word n-gram size for quote containment / overlap. 8 consecutive words is
# long enough that a match is essentially never coincidental, short enough
# that PDF line-break artifacts inside a long quote still leave most n-grams
# intact.
QUOTE_NGRAM = 8

# Fraction of a quote's n-grams that must appear in the document for a
# "fuzzy" match (tolerates OCR-free PDF artifacts and small transcription
# typos in curated data, e.g. "serbvicios").
QUOTE_FUZZY_THRESHOLD = 0.8

# Curly quotes, dash variants, and soft hyphens unified before matching.
# Policy PDFs mix these freely; they are layout, not content.
_CHAR_MAP = str.maketrans({
    "‘": "'", "’": "'", "‚": "'", "‛": "'",
    "“": '"', "”": '"', "„": '"',
    "«": '"', "»": '"',
    "–": "-", "—": "-", "−": "-",
    "­": "",  # soft hyphen
    " ": " ",  # no-break space
})

# A soft hyphen (U+00AD) marks a discretionary line break inside a word;
# whatever whitespace follows it is layout. Must run BEFORE whitespace
# folding, or "preven\xad\ntiva" becomes "preven tiva" instead of
# "preventiva" (observed in the PNSH PDF text layer).
_SOFT_HYPHEN_RE = re.compile("­\\s*")

# "restora-\ntion" -> "restoration" (hyphenation at a line break is a PDF
# layout artifact).
_DEHYPHENATE_RE = re.compile(r"(\w)-\s*\n\s*(\w)")
# Any run of non-word characters (unicode-aware; underscore included) folds
# to a single space, so punctuation differences never break a match.
_NON_WORD_RE = re.compile(r"[\W_]+", re.UNICODE)
_WS_RE = re.compile(r"\s+")


def collapse_whitespace(text: str) -> str:
    """Collapse whitespace runs to single spaces (content untouched)."""
    return _WS_RE.sub(" ", text).strip()


def normalise_for_matching(text: str) -> str:
    """Aggressive normalisation for quote and similarity matching.

    Unifies quote/dash variants, de-hyphenates PDF line breaks, strips
    accents (NFKD + combining-mark removal, keeps Cyrillic intact),
    casefolds, and folds punctuation runs to single spaces. NOT for display;
    matching only.
    """
    text = _SOFT_HYPHEN_RE.sub("", text)
    text = text.translate(_CHAR_MAP)
    text = _DEHYPHENATE_RE.sub(r"\1\2", text)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.casefold()
    text = _NON_WORD_RE.sub(" ", text)
    return text.strip()


def word_ngrams(norm_text: str, n: int = QUOTE_NGRAM) -> set[str]:
    """Set of word n-grams of a normalised text.

    Texts shorter than n words yield the whole phrase as a single entry so
    short quotes still participate in containment/overlap checks.
    """
    words = norm_text.split()
    if not words:
        return set()
    if len(words) < n:
        return {" ".join(words)}
    return {" ".join(words[i : i + n]) for i in range(len(words) - n + 1)}


def ngram_jaccard(a_norm: str, b_norm: str, n: int = QUOTE_NGRAM) -> float:
    """Jaccard overlap of two normalised texts' word n-gram sets."""
    a_set, b_set = word_ngrams(a_norm, n), word_ngrams(b_norm, n)
    if not a_set or not b_set:
        return 0.0
    return len(a_set & b_set) / len(a_set | b_set)


class MatchCorpus:
    """A pre-normalised haystack for repeated containment checks.

    Build once per document; `quote_match_level` and `containment` then run
    in (amortised) linear time per quote.
    """

    def __init__(self, text: str, n: int = QUOTE_NGRAM):
        self.n = n
        self.collapsed = collapse_whitespace(text)
        self.norm = normalise_for_matching(text)
        self.ngrams = word_ngrams(self.norm, n)

    def containment(self, needle: str) -> float:
        """Fraction of the needle's word n-grams present in the corpus.

        Needles shorter than n words fall back to substring containment
        (1.0 or 0.0).
        """
        needle_norm = normalise_for_matching(needle)
        words = needle_norm.split()
        if not words:
            return 0.0
        if len(words) < self.n:
            return 1.0 if needle_norm in self.norm else 0.0
        grams = word_ngrams(needle_norm, self.n)
        hits = sum(1 for g in grams if g in self.ngrams)
        return hits / len(grams)

    def quote_match_level(self, quote: str) -> str:
        """Classify how strongly a claimed verbatim quote appears in the corpus."""
        if not quote.strip():
            return "not_found"
        if collapse_whitespace(quote) in self.collapsed:
            return "exact"
        norm = normalise_for_matching(quote)
        if norm and norm in self.norm:
            return "normalized"
        if self.containment(quote) >= QUOTE_FUZZY_THRESHOLD:
            return "fuzzy"
        return "not_found"


def text_similarity(a: str, b: str) -> float:
    """Similarity in [0, 1] between two target texts.

    Max of three signals on normalised text:
      - difflib sequence ratio (order-sensitive)
      - token-set Jaccard (keeps reordered-but-same-content from scoring low)
      - damped token containment of the shorter text in the longer (a terse
        curated target fully contained in a verbose extracted one IS the same
        target; damped by 0.9 so exact matches still rank above containment
        matches)
    Cheap quick-ratio prefilter skips the quadratic pass on clearly
    unrelated pairs.
    """
    na, nb = normalise_for_matching(a), normalise_for_matching(b)
    if not na or not nb:
        return 0.0
    ta, tb = set(na.split()), set(nb.split())
    token_jaccard = 0.0
    containment = 0.0
    overlap = 0
    if ta and tb:
        overlap = len(ta & tb)
        token_jaccard = overlap / len(ta | tb)
        # Containment needs a minimum absolute overlap: sharing 2 generic
        # tokens must not read as "same target".
        if overlap >= 3:
            containment = 0.9 * overlap / min(len(ta), len(tb))
    ratio = 0.0
    # Character-level ratio is only trustworthy when the token sets already
    # overlap somewhat: unrelated English sentences routinely reach ~0.5 char
    # similarity, which would drown the token signals.
    if token_jaccard >= 0.2:
        sm = SequenceMatcher(None, na, nb)
        if sm.real_quick_ratio() >= 0.3 and sm.quick_ratio() >= 0.3:
            ratio = sm.ratio()
    return max(ratio, token_jaccard, containment)


def validate_quotes_in_document(
    targets: list[dict[str, Any]],
    corpus: MatchCorpus,
) -> int:
    """Verify every claimed verbatim quote actually occurs in the document.

    Stamps `_quoteMatch` on each `sources[]` and `activitySources[]` entry
    (values: exact | normalized | fuzzy | not_found). Targets with at least
    one `not_found` quote get a `_provenanceFlag` line appended. Never drops
    or rewrites anything: flagging is a review prompt, the human decides.

    Returns the number of quotes classified as not_found.
    """
    not_found = 0
    for target in targets:
        missing_idx: list[int] = []
        for i, src in enumerate(target.get("sources") or []):
            if not isinstance(src, dict):
                continue
            level = corpus.quote_match_level(str(src.get("sourceText", "")))
            src["_quoteMatch"] = level
            if level == "not_found":
                missing_idx.append(i)
                not_found += 1
        for entry in target.get("activitySources") or []:
            if not isinstance(entry, dict) or not entry.get("sourceText"):
                continue
            level = corpus.quote_match_level(str(entry["sourceText"]))
            entry["_quoteMatch"] = level
            if level == "not_found":
                not_found += 1
        if missing_idx:
            note = (
                "QUOTE NOT FOUND — sources["
                + ", ".join(str(i) for i in missing_idx)
                + "] could not be located in the parsed document text"
            )
            existing = target.get("_provenanceFlag")
            target["_provenanceFlag"] = f"{existing}; {note}" if existing else note
    return not_found
