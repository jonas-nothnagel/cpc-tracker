/**
 * True when the browser signals a data-saver preference (Network Information
 * API). Shared by the landing surfaces that opt out of optional downloads
 * (hero video, wheel prefetch) so they agree on the heuristic.
 */
export function saveDataRequested(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return conn?.saveData === true;
}
