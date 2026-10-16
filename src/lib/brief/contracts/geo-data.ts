import mongolia from "@/data/geo/mongolia-aimags.json";
import type { GeoFile } from "./geo";

/** Outlines for the countries whose contracts can be placed on a map. The
 *  capital is too small an outline for its share of the money: it sits below
 *  the map, beside the contracts that name no single place. */
export const GEO: Record<string, GeoFile> = {
  mongolia: { ...(mongolia as unknown as GeoFile), band: ["MN-1"] },
};

/** Each place's own name in the country's language, by ISO 3166-2 code
 *  (the outlines carry Natural Earth's English names). */
const OWN_NAMES: Record<string, Record<string, Record<string, string>>> = {
  mongolia: {
    mn: {
      "MN-035": "Орхон",
      "MN-037": "Дархан-Уул",
      "MN-039": "Хэнтий",
      "MN-041": "Хөвсгөл",
      "MN-043": "Ховд",
      "MN-046": "Увс",
      "MN-047": "Төв",
      "MN-049": "Сэлэнгэ",
      "MN-051": "Сүхбаатар",
      "MN-053": "Өмнөговь",
      "MN-055": "Өвөрхангай",
      "MN-057": "Завхан",
      "MN-059": "Дундговь",
      "MN-061": "Дорнод",
      "MN-063": "Дорноговь",
      "MN-064": "Говьсүмбэр",
      "MN-065": "Говь-Алтай",
      "MN-067": "Булган",
      "MN-069": "Баянхонгор",
      "MN-071": "Баян-Өлгий",
      "MN-073": "Архангай",
      "MN-1": "Улаанбаатар",
    },
  },
};

/** A country's map with its places named in the page's language, where the
 *  country has them in it; null without a map. */
export function geoFor(countryId: string, locale: string): GeoFile | null {
  const geo = GEO[countryId];
  if (!geo) return null;
  const names = OWN_NAMES[countryId]?.[locale];
  if (!names) return geo;
  return { ...geo, features: geo.features.map((f) => ({ ...f, name: names[f.code] ?? f.name })) };
}
