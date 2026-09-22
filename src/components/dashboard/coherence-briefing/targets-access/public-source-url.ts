/**
 * Resolve a link to the official document a target came from.
 *
 * WHY THIS IS NOT JUST `target.sources[0].url`: the source-span URLs are a mix
 * of genuinely public links and internal working locations, and which you get
 * depends on how that country's corpus was assembled.
 *
 *   Mongolia  87 spans, all public (unfccc.int, ort.cbd.int, legalinfo.mn)
 *   Panama    213 spans on undp.sharepoint.com + 36 on unfccc.int
 *   Sri Lanka none usable
 *
 * A SharePoint link is worse than no link for the audience this tool is built
 * for: a Panamanian planner clicking it gets a sign-in wall for a tenant they
 * have no account in. So the span URL is used only when its host is somewhere
 * anyone can actually reach, and otherwise we fall back to the country config's
 * document URL — which is curated per document and was verified to resolve.
 *
 * Returning `null` is a real outcome, not a failure: Sri Lanka has a public URL
 * for 2 of 8 documents, and a row with no link is honest where a dead one is not.
 */

import { getDocMeta } from "@/lib/utils";
import type { CountryConfig, Target } from "@/types";

/**
 * Hosts whose links require an account the tool's readers do not have.
 *
 * Matched on the registrable suffix, so `undp.sharepoint.com` and any other
 * tenant are both caught. Deliberately a denylist rather than an allowlist of
 * public hosts: new countries arrive with new legitimate government domains
 * (legalinfo.mn, mef.gob.pa, pancanal.com) and an allowlist would silently
 * swallow them, which is the opposite of the failure we want.
 */
export const PRIVATE_URL_HOSTS = [
  "sharepoint.com",
  "drive.google.com",
  "docs.google.com",
  "dropbox.com",
  "onedrive.live.com",
];

/** True when `url` points somewhere a reader outside the project can open. */
export function isPubliclyReachable(url: string | undefined | null): boolean {
  if (!url) return false;
  let host: string;
  try {
    const parsed = new URL(url);
    // Anything that is not plain web traffic (file://, blob:, a bare path that
    // failed to parse) is not something to hand a reader.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return !PRIVATE_URL_HOSTS.some(
    (bad) => host === bad || host.endsWith(`.${bad}`),
  );
}

/**
 * The best link to the document behind `target`, or `null` when there is none.
 *
 * Order: the target's own source span (most specific — Mongolia's spans point
 * at the exact instrument), then the country config's document URL, then
 * nothing.
 */
export function publicSourceUrl(
  target: Pick<Target, "sources" | "sourceDocument">,
  countryConfig: CountryConfig | null | undefined,
): string | null {
  for (const span of target.sources ?? []) {
    if (isPubliclyReachable(span.url)) return span.url as string;
  }
  const fromConfig = getDocMeta(countryConfig, target.sourceDocument).url;
  return isPubliclyReachable(fromConfig) ? (fromConfig as string) : null;
}
