/**
 * A country's outlines for the contracts map (Mongolia: Natural Earth 1:10m
 * admin-1, public domain; built by python/scripts/build_aimag_geometry.py)
 * and a plain projection that fits them into a box: equirectangular, with
 * longitudes scaled by the cosine of the middle latitude so the shapes read
 * true at the country's latitude.
 */

export interface GeoFeature {
  /** ISO 3166-2 code, as contracts name their place. */
  code: string;
  name: string;
  /** Where the feature's label and money go, inside its own outline. */
  point: [number, number];
  /** Outer rings and holes, [lon, lat]. */
  rings: [number, number][][];
}

export interface GeoFile {
  source: string;
  features: GeoFeature[];
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Projection {
  x: (lon: number) => number;
  y: (lat: number) => number;
  /** An SVG path of the feature's rings (draw with the even-odd rule). */
  path: (f: GeoFeature) => string;
  point: (f: GeoFeature) => [number, number];
}

export function fitProjection(geo: GeoFile, box: Box): Projection {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const f of geo.features) {
    for (const ring of f.rings) {
      for (const [lon, lat] of ring) {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const gw = Math.max(1e-9, (maxLon - minLon) * k);
  const gh = Math.max(1e-9, maxLat - minLat);
  const s = Math.min(box.w / gw, box.h / gh);
  const ox = box.x + (box.w - gw * s) / 2;
  const oy = box.y + (box.h - gh * s) / 2;
  const x = (lon: number) => ox + (lon - minLon) * k * s;
  const y = (lat: number) => oy + (maxLat - lat) * s;
  const path = (f: GeoFeature) =>
    f.rings
      .map((ring) => ring.map(([lon, lat], i) => `${i ? "L" : "M"}${x(lon).toFixed(1)},${y(lat).toFixed(1)}`).join("") + "Z")
      .join("");
  return { x, y, path, point: (f) => [x(f.point[0]), y(f.point[1])] };
}
