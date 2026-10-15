"""Mongolia's aimag outlines for the contracts map, from Natural Earth.

Source: Natural Earth 1:10m Admin 1 (states, provinces), public domain
(naturalearthdata.com). Download it once:

  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson

then, from python/:

  .venv/bin/python scripts/build_aimag_geometry.py --source <that file> \\
      --out ../src/data/geo/mongolia-aimags.json

Keeps Mongolia's 22 features (21 aimags and Ulaanbaatar), simplified
(Douglas-Peucker) and rounded, each with a label point inside its own outline
and outside every other (Töv surrounds the capital).
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

Point = tuple[float, float]
Ring = list[Point]

TOLERANCE = 0.02  # degrees
DECIMALS = 3
# Layout overrides (project-defined): Töv surrounds the capital, so its
# computed point sits against Ulaanbaatar's border and its money would pile
# on the capital's. Its label moves into the west of the aimag.
OVERRIDES: dict[str, Point] = {"MN-047": (105.4, 47.0)}


def _dp(points: Ring, tol: float) -> Ring:
    """Douglas-Peucker on an open line."""
    if len(points) < 3:
        return points
    (x1, y1), (x2, y2) = points[0], points[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy)
    best_d, best_i = -1.0, 0
    for i in range(1, len(points) - 1):
        px, py = points[i]
        d = math.hypot(px - x1, py - y1) if norm == 0 else abs(dy * px - dx * py + x2 * y1 - y2 * x1) / norm
        if d > best_d:
            best_d, best_i = d, i
    if best_d > tol:
        return _dp(points[: best_i + 1], tol)[:-1] + _dp(points[best_i:], tol)
    return [points[0], points[-1]]


def simplify(ring: Ring, tol: float) -> Ring:
    """A closed ring, simplified, still closed and at least a triangle."""
    pts = [(float(x), float(y)) for x, y in ring]
    if pts[0] != pts[-1]:
        pts.append(pts[0])
    start = pts[0]
    # A closed ring is two open lines split at the vertex farthest from the start.
    far = max(range(len(pts) - 1), key=lambda i: math.hypot(pts[i][0] - start[0], pts[i][1] - start[1]))
    out = _dp(pts[: far + 1], tol)[:-1] + _dp(pts[far:], tol)
    if len(out) < 4:
        n = len(pts) - 1
        out = [pts[i] for i in sorted({0, n // 3, 2 * n // 3})] + [pts[0]]
    return out


def inside(p: Point, ring: Ring) -> bool:
    """Ray casting."""
    x, y = p
    hit = False
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def _area(ring: Ring) -> float:
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / 2


def _centroid(ring: Ring) -> Point:
    a = _area(ring)
    if a == 0:
        xs, ys = zip(*ring)
        return (sum(xs) / len(xs), sum(ys) / len(ys))
    cx = sum((x1 + x2) * (x1 * y2 - x2 * y1) for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / (6 * a)
    cy = sum((y1 + y2) * (x1 * y2 - x2 * y1) for (x1, y1), (x2, y2) in zip(ring, ring[1:])) / (6 * a)
    return (cx, cy)


def interior_point(ring: Ring, avoid: list[Ring], near: Point) -> Point:
    """The point inside `ring` and outside every `avoid` ring nearest to `near` (grid search)."""
    xs, ys = zip(*ring)
    best: tuple[float, Point] | None = None
    steps = 60
    for i in range(1, steps):
        for j in range(1, steps):
            p = (min(xs) + (max(xs) - min(xs)) * i / steps, min(ys) + (max(ys) - min(ys)) * j / steps)
            if inside(p, ring) and not any(inside(p, r) for r in avoid):
                d = math.hypot(p[0] - near[0], p[1] - near[1])
                if best is None or d < best[0]:
                    best = (d, p)
    return best[1] if best else near


def label_point(rings: list[Ring], avoid: list[Ring] | None = None) -> Point:
    """The centroid of the largest ring, moved inside it (and out of `avoid`) when it falls outside."""
    largest = max(rings, key=lambda r: abs(_area(r)))
    c = _centroid(largest)
    if inside(c, largest) and not any(inside(c, r) for r in (avoid or [])):
        return c
    return interior_point(largest, avoid or [], c)


def rings_of(geometry: dict) -> list[Ring]:
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [[(x, y) for x, y in ring] for poly in polys for ring in poly]


def outer_rings_of(geometry: dict) -> list[Ring]:
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [[(x, y) for x, y in poly[0]] for poly in polys]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args()

    data = json.loads(args.source.read_text())
    feats = [f for f in data["features"] if f["properties"].get("adm0_a3") == "MNG"]
    assert len(feats) == 22, f"expected 22 features, got {len(feats)}"

    outers = {f["properties"]["iso_3166_2"]: outer_rings_of(f["geometry"]) for f in feats}
    out = []
    for f in sorted(feats, key=lambda f: f["properties"]["iso_3166_2"]):
        code = f["properties"]["iso_3166_2"]
        others = [r for c, rings in outers.items() if c != code for r in rings]
        rings = [simplify(r, TOLERANCE) for r in rings_of(f["geometry"])]
        rings = [[(round(x, DECIMALS), round(y, DECIMALS)) for x, y in r] for r in rings]
        point = OVERRIDES.get(code) or label_point(outers[code], avoid=others)
        assert inside(point, max(outers[code], key=lambda r: abs(_area(r)))), code
        out.append(
            {
                "code": code,
                "name": f["properties"].get("name_en") or f["properties"]["name"],
                "point": [round(point[0], DECIMALS), round(point[1], DECIMALS)],
                "rings": [[[x, y] for x, y in r] for r in rings],
            }
        )

    payload = {
        "source": "Natural Earth 1:10m Admin 1, states and provinces (public domain), naturalearthdata.com",
        "features": out,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {args.out}: {len(out)} features, {args.out.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
