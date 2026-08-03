import {
  getDocFriendlyName,
  getDocFullLabel,
  getDocLabel,
} from "@/lib/utils";
import type { CountryConfig } from "@/types";

/**
 * Document name for the finding headline: short enough for one claim
 * sentence, human enough to read cold. Prefers the friendly name (the
 * parenthetical inside mediumLabel, e.g. "Nature Pledge Roadmap"); when that
 * is just the document code, falls back to the full label with any trailing
 * parenthetical stripped ("Food Supply and Security Measures (Parliament
 * Resolution 36, June 2022)" -> "Food Supply and Security Measures"). The
 * untrimmed full name still appears in the card's source lines, so the
 * expansion-on-first-use rule stays satisfied on the same page.
 */
export function findingDocName(
  countryConfig: CountryConfig | null | undefined,
  docId: string,
  opts?: {
    /** Non-English locales: friendly names are English config glosses, while
     *  full labels carry the native document names (e.g. Panama's Spanish
     *  titles); prefer the stripped full name there. */
    preferNative?: boolean;
  },
): string {
  const friendly = getDocFriendlyName(countryConfig, docId);
  const short = getDocLabel(countryConfig, docId);
  const full = getDocFullLabel(countryConfig, docId)
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  if (opts?.preferNative) return full || friendly || docId;
  if (friendly && friendly !== docId && friendly !== short) return friendly;
  return full || friendly || docId;
}
