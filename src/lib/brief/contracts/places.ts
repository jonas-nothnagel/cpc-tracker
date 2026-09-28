import { isGreen, NO_PLACE, type Contract, type TierTotals } from "./model";

/** Where the money for nature or climate lands: one row per place a
 *  contract names; contracts naming none or several go to NO_PLACE. */

export interface PlaceRow {
  id: string;
  principal: TierTotals;
  significant: TierTotals;
}

export function placeKey(c: Contract): string {
  return c.place && c.place !== "several" ? c.place : NO_PLACE;
}

/** Places by money mainly for nature or climate, then side benefit; the
 *  unnamed last. */
export function placeRows(contracts: Contract[]): PlaceRow[] {
  const rows = new Map<string, PlaceRow>();
  for (const c of contracts) {
    if (!isGreen(c)) continue;
    const id = placeKey(c);
    let r = rows.get(id);
    if (!r) {
      r = { id, principal: { contracts: 0, value: 0 }, significant: { contracts: 0, value: 0 } };
      rows.set(id, r);
    }
    const t = c.tier === "principal" ? r.principal : r.significant;
    t.contracts += 1;
    t.value += c.value;
  }
  const places = [...rows.values()].filter((r) => r.id !== NO_PLACE);
  places.sort((a, b) => b.principal.value - a.principal.value || b.significant.value - a.significant.value || a.id.localeCompare(b.id));
  const rest = rows.get(NO_PLACE);
  return rest ? [...places, rest] : places;
}

/** The two places with the largest shares of the money mainly for nature or
 *  climate (of all of it, named or not). Never the unnamed. */
export function placeFinding(
  rows: PlaceRow[],
  principalTotal: number,
): { first: { id: string; share: number }; second: { id: string; share: number } | null } | null {
  const named = rows.filter((r) => r.id !== NO_PLACE && r.principal.value > 0);
  if (named.length === 0 || principalTotal <= 0) return null;
  const at = (r: PlaceRow) => ({ id: r.id, share: r.principal.value / principalTotal });
  return { first: at(named[0]), second: named[1] ? at(named[1]) : null };
}
