/**
 * Client wrapper for the ratings API.
 *
 * `setRating` POSTs to /api/ratings/[country]; throws on non-2xx so the
 * UI can roll back optimistic state. `exportRatings` formats the current
 * ratings map as a JSON snapshot and triggers a download for offline
 * inspection or sharing.
 */

import { downloadFile } from "@/lib/download";
import type { PairRating, RatingsByCountry } from "@/types";

interface RatingApiResponse {
  ok?: boolean;
  rating?: PairRating;
  error?: string;
}

export async function setRating(
  country: string,
  pairKey: string,
  rating: PairRating,
): Promise<PairRating> {
  const res = await fetch(`/api/ratings/${encodeURIComponent(country)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pairKey, rating }),
  });
  let body: RatingApiResponse = {};
  try {
    body = (await res.json()) as RatingApiResponse;
  } catch {
    // Empty / non-JSON response — fall through to status-based error.
  }
  if (!res.ok || !body.rating) {
    throw new Error(body.error ?? `rating write failed (HTTP ${res.status})`);
  }
  return body.rating;
}

export function exportRatings(
  country: string,
  ratings: RatingsByCountry,
): void {
  const payload = {
    country,
    exportedAt: new Date().toISOString(),
    version: 1,
    ratings,
  };
  downloadFile(
    `ratings-${country}-${Date.now()}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}
