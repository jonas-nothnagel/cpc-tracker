/**
 * The brief's pages are built once for every reader, when the site is
 * deployed, so the server never sees the choices a link carries (documents,
 * policy area, sections, the explorer's centre, the currency, an open
 * contract): each page reads them from its address once it has loaded.
 */

/** A link's parameters as a page reads them: a name that repeats keeps
 *  every value. */
export type LinkParams = Record<string, string | string[] | undefined>;

export function linkParams(search: string): LinkParams {
  // A map, so a name an object already has (`constructor`, `__proto__`) reads
  // like any other.
  const params = new Map<string, string | string[]>();
  for (const [key, value] of new URLSearchParams(search)) {
    const had = params.get(key);
    params.set(key, had === undefined ? value : [...(Array.isArray(had) ? had : [had]), value]);
  }
  return Object.fromEntries(params);
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
