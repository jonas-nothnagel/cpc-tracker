"""Aimag outlines for the contracts map: simplification and label points."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from build_aimag_geometry import inside, label_point, simplify  # noqa: E402
from translate_contract_titles import pick_sample  # noqa: E402

SQUARE = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]


def test_simplify_drops_points_on_a_straight_edge():
    ring = [(0.0, 0.0), (0.5, 0.001), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0), (0.0, 0.0)]
    assert simplify(ring, 0.02) == SQUARE


def test_simplify_keeps_a_ring_closed_and_at_least_four_points():
    out = simplify(SQUARE, 5.0)
    assert out[0] == out[-1] and len(out) >= 4


def test_inside():
    assert inside((0.5, 0.5), SQUARE)
    assert not inside((1.5, 0.5), SQUARE)


def test_label_point_is_inside_the_largest_ring():
    small = [(10.0, 10.0), (10.1, 10.0), (10.1, 10.1), (10.0, 10.1), (10.0, 10.0)]
    x, y = label_point([small, SQUARE])
    assert inside((x, y), SQUARE)


def test_sample_is_seeded_and_skips_translated():
    titles = [f"t{i}" for i in range(100)]
    done = {"t1", "t2"}
    a = pick_sample(titles, done, 10, seed=7)
    assert a == pick_sample(titles, done, 10, seed=7)
    assert len(a) == 10 and not set(a) & done
