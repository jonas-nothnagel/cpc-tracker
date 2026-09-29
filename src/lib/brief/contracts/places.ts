import { NO_PLACE, type Contract } from "./model";

/** Where a contract's work happens: the one place it names, or NO_PLACE for
 *  none or several. */
export function placeKey(c: Contract): string {
  return c.place && c.place !== "several" ? c.place : NO_PLACE;
}
