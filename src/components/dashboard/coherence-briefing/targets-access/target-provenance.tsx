"use client";

/**
 * The link out to the source document, and — for reported actions — the report
 * they were read out of.
 *
 * WHY: the drawer already showed a labelled verbatim quote and a section line,
 * so "where is this stated" was half-answered. What was broken was the link
 * beside it: it rendered `sources[0].url` raw, and for 213 of Panama's 368
 * targets that URL is a UNDP SharePoint location. A Panamanian planner clicking
 * "Open the source" got a sign-in wall for a tenant they have no account in,
 * which reads as the tool having no link at all. `publicSourceUrl` resolves to
 * something openable, or to nothing.
 *
 * This component owns only the parts that are new. The quote and section markup
 * stays where it was, so deleting this system leaves the drawer's existing
 * provenance intact.
 *
 * NO PAGE NUMBERS: no country has `pages` on any source span, so nothing here
 * claims one. The quote is the locator.
 */

import { useTranslations } from "next-intl";
import { formatSourceRef } from "@/lib/source-ref";
import type { CountryConfig, Target } from "@/types";
import { publicSourceUrl } from "./public-source-url";

export function TargetProvenance({
  target,
  countryConfig,
}: {
  target: Target;
  countryConfig: CountryConfig | null;
}) {
  const t = useTranslations("briefing.provenance");
  const href = publicSourceUrl(target, countryConfig);

  // Reported actions cite the report rather than quoting a policy document.
  // Mitigation only: the config's ref is specific to the mitigation table
  // (Panama's names CTF-NDC Table 5) and the adaptation actions' own ref lives
  // on the BTR data file, which this component does not receive. Citing the
  // mitigation table for an adaptation action would be a wrong citation, so
  // those rows get none.
  const citation =
    target.sourceDocument === "BTR" && target.actionType !== "adaptation"
      ? formatSourceRef(countryConfig?.btrMitigationSourceRef)
      : undefined;

  if (!href && !citation) return null;

  return (
    <>
      {citation && (
        <p className="text-caption text-[var(--undp-gray)]">
          {t("citation", { ref: citation })}
        </p>
      )}
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-caption font-medium text-[var(--undp-blue)] hover:underline"
        >
          {t("openDocument")}
          <span aria-hidden="true"> ↗</span>
        </a>
      )}
    </>
  );
}
