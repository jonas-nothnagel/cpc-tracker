"use client";

/**
 * "What this analysis covers" (removable — see the rollback note below).
 *
 * WHY THIS EXISTS: the two ARAP participants in the Panama focal-group session
 * (23 Jul 2026) rated the tool only partly useful "due to the absence of
 * specific tools for fisheries and aquaculture". Panama's sector taxonomy names
 * both aquaculture and marine-coastal systems, so a reader from ARAP sees their
 * sector listed and then finds no instrument behind it. An openly stated gap is
 * better than a reader concluding the tool has nothing for them and not knowing
 * why.
 *
 * WHAT IT SHOWS: the instruments in the corpus, grouped by the national
 * hierarchy from `@/lib/doc-taxonomy`, and then — the part that is new — what
 * the corpus does NOT contain, read from `countryConfig.coverageGaps`.
 *
 * WHY GAPS ARE DECLARED, NOT INFERRED: "no fisheries instrument" is a claim
 * about a country's policy corpus. Deriving it from an absence in the data
 * would make the tool assert something it cannot know (a sector may be covered
 * by an instrument nobody has supplied yet). So each gap is a sourced statement
 * in the country config, with the note recording who raised it.
 *
 * The wording is deliberately about the corpus, never about an institution:
 * "no instrument is part of this corpus", not "the sector has no policy"
 * (political-sensitivity guardrail).
 *
 * ROLLBACK: remove `coverageGaps` from the country config and this renders
 * nothing. Full removal is deleting this file and its single mount in
 * `sections/direction.tsx`.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getDocMediumLabel } from "@/lib/utils";
import {
  groupDocsByTier,
  hasDocTaxonomy,
  MAX_DOC_TIER,
} from "@/lib/doc-taxonomy";
import type { CountryConfig, PolicyDocumentType } from "@/types";

export interface CoverageGap {
  id: string;
  title?: string;
  text: string;
  /** Who raised the gap. Shown as provenance, never as a judgement. */
  source?: string;
}

/** Reads `coverageGaps` off a country config without widening `CountryConfig`
 *  for every consumer — the field is optional and only this panel needs it. */
export function readCoverageGaps(
  countryConfig: CountryConfig | null,
): CoverageGap[] {
  const raw = (countryConfig as { coverageGaps?: unknown } | null)?.coverageGaps;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (g): g is CoverageGap =>
      typeof g === "object" &&
      g !== null &&
      typeof (g as CoverageGap).id === "string" &&
      typeof (g as CoverageGap).text === "string",
  );
}

export function CoveragePanel({
  allDocs,
  countryConfig,
  onViewTargets,
}: {
  /** Every document in the corpus, including any hidden from the current view:
   *  this panel answers "what was analysed at all", not "what is on screen". */
  allDocs: PolicyDocumentType[];
  countryConfig: CountryConfig | null;
  /** Opens a document's targets. Optional so the panel still renders (as plain
   *  text) anywhere that cannot host the drawer. */
  onViewTargets?: (doc: PolicyDocumentType) => void;
}) {
  const t = useTranslations("briefing.coverage");
  const [open, setOpen] = useState(false);
  const gaps = useMemo(() => readCoverageGaps(countryConfig), [countryConfig]);
  const groups = useMemo(
    () => groupDocsByTier(countryConfig, allDocs),
    [countryConfig, allDocs],
  );
  const tiered = hasDocTaxonomy(countryConfig);

  // Nothing declared and nothing to group means there is nothing this panel can
  // say that the header does not already say.
  if (gaps.length === 0 && allDocs.length === 0) return null;

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-caption text-[var(--undp-gray)] underline underline-offset-2 hover:text-[var(--undp-black)] transition-colors"
      >
        {open ? t("hide") : t("show", { count: allDocs.length })}
      </button>

      {open && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <div>
            <p className="text-caption font-semibold text-[var(--undp-black)] mb-1.5">
              {t("includedHeading")}
            </p>
            <ul className="space-y-1.5">
              {groups.map((group) => (
                <li key={group.tier}>
                  {tiered && (
                    <p className="text-[11px] uppercase tracking-wider font-semibold text-[var(--undp-gray)]">
                      {group.tier > MAX_DOC_TIER
                        ? t("tierOther")
                        : t(`tier.${group.tier}` as "tier.1")}
                    </p>
                  )}
                  {/* Each instrument opens its own targets. This panel already
                      lists every document, so it is the second obvious way in
                      after the browse bar at the top of the page. */}
                  <p className="text-caption leading-snug text-[var(--undp-black)]">
                    {group.docIds.map((id, i) => (
                      <span key={id}>
                        {i > 0 && ", "}
                        {onViewTargets ? (
                          <button
                            type="button"
                            onClick={() => onViewTargets(id)}
                            className="underline decoration-dotted underline-offset-2 hover:text-[var(--undp-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--undp-blue)]"
                          >
                            {getDocMediumLabel(countryConfig, id)}
                          </button>
                        ) : (
                          getDocMediumLabel(countryConfig, id)
                        )}
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {gaps.length > 0 && (
            <div>
              <p className="text-caption font-semibold text-[var(--undp-black)] mb-1.5">
                {t("notCoveredHeading")}
              </p>
              <ul className="space-y-2.5">
                {gaps.map((gap) => (
                  <li key={gap.id}>
                    {gap.title && (
                      <p className="text-caption font-medium text-[var(--undp-black)]">
                        {gap.title}
                      </p>
                    )}
                    <p className="text-caption text-[var(--undp-gray)] leading-snug">
                      {gap.text}
                    </p>
                    {gap.source && (
                      <p className="text-caption text-[var(--undp-gray)]/80 italic leading-snug mt-0.5">
                        {gap.source}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-caption text-[var(--undp-gray)]/80 leading-snug">
                {t("gapsNote")}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
