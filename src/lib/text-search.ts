/**
 * Client-side text matching for browsing a document's targets.
 *
 * The corpus is multilingual and mixed-script: a Panamanian target reads
 * "reducción", a Sri Lankan one carries Sinhala alongside its English
 * translation, and a Mongolian one is Cyrillic. Three consequences shape this
 * module:
 *
 *  - accents are stripped, so "reduccion" finds "reducción" and "cotiere"
 *    finds "côtière" without the reader switching keyboard layouts;
 *  - the original-language text is searched alongside the English, so a
 *    national colleague can type in their own language;
 *  - punctuation is left alone, so a query like "30%" matches literally.
 *
 * Normalising is the expensive part (Panama's longest document is 206 targets
 * of roughly 574 characters each), so callers build the haystack once per
 * document and reuse it for every keystroke.
 */

import type { Target } from "@/types";

/**
 * Lowercase, and strip combining marks from Latin letters so accented and
 * unaccented spellings match.
 *
 * The Latin restriction is not incidental. Cyrillic Й and Ё also decompose,
 * into И and Е plus a combining mark, so stripping marks everywhere would fold
 * й into и, which is a different letter: Mongolian "ой" (forest) would become
 * "ои". Accents are optional spelling in the languages this serves; those
 * Cyrillic marks are not.
 *
 * Deliberately `toLowerCase` and not `toLocaleLowerCase`: no locale in this
 * product needs locale-specific casing, and the Turkish dotted-i rule would
 * break matching for everyone else.
 */
export function normaliseForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{Diacritic}+/gu, "$1")
    .normalize("NFC")
    .toLowerCase();
}

/**
 * Everything about a target a reader might search for, normalised into one
 * string: its reference label, its text in both languages, and any activities
 * or actions listed under it.
 */
export function buildTargetHaystack(target: Target): string {
  return normaliseForSearch(
    [
      target.sourceLabel,
      target.text,
      target.textOriginal,
      target.sourceLabelOriginal,
      target.activities,
      target.actions,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Every whitespace-separated word in the query must appear somewhere in the
 * haystack, in any order, so "water 2030" narrows rather than requiring the two
 * to sit side by side. An empty query matches everything.
 */
export function matchesTargetQuery(haystack: string, query: string): boolean {
  const tokens = normaliseForSearch(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((token) => haystack.includes(token));
}
