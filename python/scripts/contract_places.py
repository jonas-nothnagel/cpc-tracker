"""Where a public contract's work happens, read from its buyer and title.

Mongolia's contract record names places in two ways: the buying body is often
a local government ("Ховд аймгийн Худалдан авах ажиллагааны газар", the
Khovd aimag procurement office), and titles often end in a location
("... /Ховд, Жаргалант сум/"). This module reads both with a gazetteer and a
few patterns. No AI: the same text always gives the same place.

Places are ISO 3166-2 codes, the codes of the aimag outlines the page draws
(Natural Earth admin-1): MN-043 is Khovd, MN-1 the capital, Ulaanbaatar.
A contract naming two or more places is "several"; one naming none is None.
"""

from __future__ import annotations

import re

# The 21 aimags as the record writes them, with the spelling variants found
# in it (hyphen, space, written together). Project-defined reference list of
# official names.
AIMAGS: dict[str, tuple[str, ...]] = {
    "MN-073": ("Архангай",),
    "MN-071": ("Баян-Өлгий", "Баян Өлгий", "Баянөлгий"),
    "MN-069": ("Баянхонгор",),
    "MN-067": ("Булган",),
    "MN-065": ("Говь-Алтай", "Говь Алтай", "Говьалтай"),
    "MN-064": ("Говьсүмбэр", "Говь-Сүмбэр", "Говь Сүмбэр"),
    "MN-037": ("Дархан-Уул", "Дархан Уул"),
    "MN-063": ("Дорноговь",),
    "MN-061": ("Дорнод",),
    "MN-059": ("Дундговь",),
    "MN-057": ("Завхан",),
    "MN-035": ("Орхон",),
    "MN-055": ("Өвөрхангай",),
    "MN-053": ("Өмнөговь",),
    "MN-051": ("Сүхбаатар",),
    "MN-049": ("Сэлэнгэ",),
    "MN-047": ("Төв",),
    "MN-046": ("Увс",),
    "MN-043": ("Ховд",),
    "MN-041": ("Хөвсгөл",),
    "MN-039": ("Хэнтий",),
}

CAPITAL = "MN-1"
SEVERAL = "several"

# The capital's districts. Sükhbaatar is also an aimag, so a district only
# counts when the word "district" follows it.
UB_DISTRICTS = (
    "Баянгол",
    "Баянзүрх",
    "Сонгинохайрхан",
    "Хан-Уул",
    "Хан Уул",
    "Чингэлтэй",
    "Налайх",
    "Багануур",
    "Багахангай",
    "Сүхбаатар",
)

_FLAGS = re.IGNORECASE


def _name(name: str) -> str:
    """A place name as a whole word: never inside a longer word."""
    return r"(?<!\w)" + re.escape(name)


# "<aimag> аймаг / аймгийн / аймгууд" (aimag, of the aimag, aimags), and the
# title forms "/<aimag>, <soum> сум/" and "(<aimag>, ...)".
_AIMAG_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    code: [
        p
        for n in names
        for p in (
            re.compile(_name(n) + r"\s*(?:аймгийн|аймаг|аймгууд)", _FLAGS),
            re.compile(r"[/(]\s*" + re.escape(n) + r"\s*[,/)]", _FLAGS),
        )
    ]
    for code, names in AIMAGS.items()
}
_ANY_AIMAG: dict[str, list[re.Pattern[str]]] = {
    code: [re.compile(_name(n) + r"(?!\w)", _FLAGS) for n in names] for code, names in AIMAGS.items()
}
_CAPITAL = re.compile(r"Нийслэл|Улаанбаатар|УБ\s*хот", _FLAGS)
_DISTRICTS = [re.compile(_name(d) + r"\s*(?:дүүрэг|дүүргийн)", _FLAGS) for d in UB_DISTRICTS]
_PLURAL = re.compile(r"аймгууд", _FLAGS)


def places_in(text: str | None) -> set[str]:
    """Every place a text names: aimag codes and the capital."""
    if not text:
        return set()
    hits = {code for code, patterns in _AIMAG_PATTERNS.items() if any(p.search(text) for p in patterns)}
    # "Баянхонгор, Баян-Өлгий, ... аймгуудын" (of the aimags): every aimag
    # named in the list counts, not only the one before the word.
    if _PLURAL.search(text):
        hits |= {code for code, patterns in _ANY_AIMAG.items() if any(p.search(text) for p in patterns)}
    if _CAPITAL.search(text) or any(p.search(text) for p in _DISTRICTS):
        hits.add(CAPITAL)
    return hits


def place_of(buyer: str | None, title: str | None) -> str | None:
    """The one place a contract names, "several", or None."""
    hits = places_in(buyer) | places_in(title)
    if not hits:
        return None
    if len(hits) > 1:
        return SEVERAL
    return next(iter(hits))
