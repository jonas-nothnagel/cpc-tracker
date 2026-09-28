"""Where a public contract's work happens, read from its buyer and title."""

from __future__ import annotations

import sys
from pathlib import Path

# contract_places lives in python/scripts (not a package); put it on the path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from contract_places import place_of  # noqa: E402


def test_buyer_names_its_aimag():
    assert place_of("Ховд аймгийн Худалдан авах ажиллагааны газар", "Ундны ус") == "MN-043"


def test_title_slash_form():
    assert place_of("Төрийн худалдан авах ажиллагааны газар", "Эх үүсвэр /Ховд, Жаргалант сум/") == "MN-043"


def test_capital_by_district():
    assert place_of("Сүхбаатар дүүргийн Засаг даргын Тамгын газар", "Цэцэрлэгт хүрээлэн") == "MN-1"


def test_sukhbaatar_aimag_is_not_the_district():
    assert place_of("Сүхбаатар аймгийн Орон нутгийн өмчийн газар", "") == "MN-051"


def test_tov_needs_the_word_aimag():
    assert place_of("Төрийн худалдан авах ажиллагааны газар", "Төв цэвэрлэх байгууламж") is None
    assert place_of("Төв аймгийн Засаг даргын Тамгын газар", "") == "MN-047"


def test_a_list_of_aimags_is_several():
    assert place_of("Ойн газар", "Баянхонгор, Баян-Өлгий, Говь-Алтай, Ховд аймгуудын ойн санд") == "several"


def test_capital_in_capitals():
    assert place_of("Ойн газар", "УЛААНБААТАР ХОТЫН НОГООН БҮС") == "MN-1"


def test_no_place():
    assert place_of("Ойн газар", "Ойн цэвэрлэгээнд ашиглагдах машин") is None


def test_two_places_are_several():
    assert place_of("Ховд аймгийн газар", "Увс аймгийн ажил") == "several"
