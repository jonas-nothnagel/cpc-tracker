import { isStandaloneCountry } from "@/config/countries";

/** Whether a page offers uploads: only where Python can run (not on Vercel,
 *  see NEXT_PUBLIC_UPLOADS in next.config.ts), and never from a country
 *  shared on its own (Country X). Client-safe. */
export function uploadsAvailable(countryId?: string | null): boolean {
  if (process.env.NEXT_PUBLIC_UPLOADS === "0") return false;
  return !(countryId && isStandaloneCountry(countryId));
}
