/**
 * Sourced ministry/party acronym expansions for the Implementation slide's
 * neutral institution labels, keyed by country slug, then by the LOWERCASED
 * acronym as it appears in the source data.
 *
 * PROVENANCE (hard rule, see CLAUDE.md + `feedback_no_fabricated_labels`):
 * every value MUST trace to the country's own report (the BTR abbreviations
 * list). Never invent an expansion. An acronym with no entry here renders as
 * its raw string (see `normalizeOrg`) — honest, just unmerged.
 *
 * WHY THIS EXISTS: the BTR names the same ministry two ways — a full name in the
 * mitigation table (CTF Table 5) and an acronym in the adaptation table
 * (Table III.9). For Mongolia the environment ministry shows up as both "MET"
 * and "Ministry of Environment and Climate Change", and agriculture as both
 * "MOFALI" and "Ministry of Food Agriculture and Light Industry". Mapping the
 * acronym to the EXACT full-name string used elsewhere collapses them into one
 * label in the "Responsible institutions" context shown on action detail
 * (never a ranking — political-sensitivity guardrail). Values must match the
 * full-name string character-for-character.
 *
 * STATUS: Mongolia MET + MOFALI confirmed against the BTR1 (Dec 2025) tables by
 * the UNDP team (2026-06). MON / MOES (Mongolia) and the Panama acronyms remain
 * unverified, so they render raw until confirmed.
 */
export const ORG_ACRONYMS: Record<string, Record<string, string>> = {
  mongolia: {
    // Confirmed: the adaptation-table acronym is the same ministry as the
    // mitigation-table full name; values match that full name character-for-
    // character so the two collapse into one institution label.
    met: "Ministry of Environment and Climate Change",
    mofali: "Ministry of Food Agriculture and Light Industry",
    // Unverified (render raw until confirmed against the BTR1 abbreviations list):
    // mon: "...",
    // moes: "...",
  },
  panama: {
    // Unverified (render raw until confirmed against the Panama BTR):
    // miambiente: "Ministerio de Ambiente",
  },
};

/** The sourced acronym map for a country slug, or an empty map (raw render). */
export function orgAcronymsFor(
  countrySlug: string | null | undefined,
): Record<string, string> {
  if (!countrySlug) return {};
  return ORG_ACRONYMS[countrySlug.toLowerCase()] ?? {};
}
