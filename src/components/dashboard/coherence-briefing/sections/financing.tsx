"use client";

/**
 * Financing — the Level 2 slide. One question: how much of the policy does this
 * budget have a budget line for, and which targets does it leave with none?
 *
 * What the pipeline (budget_align.py) actually does, stated honestly: it matches
 * each policy target to the budget's own lines (programmes) on the same goal,
 * keeping only HIGH-confidence thematic matches. So a target "has a matching
 * budget line" when a FUNDED programme (spend > 0) is judged HIGH against it.
 * This shows where a budget line EXISTS for a target, NOT that money is actually
 * spent on it, and is distinct from the policy-to-policy coherence elsewhere.
 *
 * Left column:
 *   - HEADLINE: names the budget and how much of the policy it matches.
 *   - BODY: grounds the numbers (N targets across the documents, M matched).
 *   - A per-DOCUMENT dot-map: one uniform dot per target, filled = has a
 *     matching budget line, hollow = none. Open a document to see both sides:
 *     the targets with a matching line (and which line), and the targets with
 *     none.
 *
 * Right column (FinancingCenterpiece): the budget object itself. What it is,
 * where the money concentrates, and how much of the plan went unspent.
 *
 * NOTE: "reviewed biodiversity spending" is BER-specific (the only budget wired
 * today, and deliberately framed as a snapshot review, not the whole budget). If
 * a non-biodiversity budget is ever added, revisit the headline noun.
 */

import { SlideFrame } from "../slide-frame";
import type {
  BudgetCoverage,
  BudgetCoverageDoc,
  FinancingCoherenceSummary,
} from "@/lib/financing-coherence";
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig } from "@/types";

export const FINANCING_SECTION_ID = "financing";

export function FinancingSection({
  summary,
  commitmentCount,
  coverage,
  countryConfig,
  countryName,
}: {
  summary: FinancingCoherenceSummary;
  commitmentCount: number;
  coverage: BudgetCoverage | null;
  countryConfig: CountryConfig | null;
  countryName: string;
}) {
  const sentence = composeSentence(
    coverage,
    summary,
    commitmentCount,
    countryName,
  );
  return (
    <SlideFrame
      id={FINANCING_SECTION_ID}
      eyebrow="Where does money meet ambition?"
      headline={sentence.headline}
      body={sentence.body}
      evidence={
        coverage && coverage.byDocument.length > 0 ? (
          <DocumentCoverage coverage={coverage} countryConfig={countryConfig} />
        ) : undefined
      }
    />
  );
}

// Per-document dot-map of where the budget has a matching line. Each dot is one
// target: filled = has a matching budget line, hollow = none. Opening a
// document shows BOTH sides (matched targets with their line, and unmatched).
function DocumentCoverage({
  coverage,
  countryConfig,
}: {
  coverage: BudgetCoverage;
  countryConfig: CountryConfig | null;
}) {
  return (
    <div>
      <p className="text-[12px] leading-relaxed text-[var(--undp-gray)] mb-2.5 max-w-prose">
        Each dot is one policy target. Open a document to see which of its
        targets have a matching budget line and which have none.
      </p>

      <ul className="space-y-3">
        {coverage.byDocument.map((d) => (
          <DocCoverageRow key={d.doc} doc={d} countryConfig={countryConfig} />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-[var(--undp-gray)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--undp-gray)]"
          />
          has a matching budget line
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--undp-gray)]"
          />
          no matching budget line
        </span>
      </div>

      <p className="mt-3 text-[11px] italic text-[var(--undp-gray)] max-w-prose">
        The pipeline matches each target to the budget lines on the same goal,
        keeping only high-confidence matches. It shows where a budget line exists
        for a target, not whether money is spent on it. AI-estimated and
        indicative.
      </p>
    </div>
  );
}

function DocCoverageRow({
  doc,
  countryConfig,
}: {
  doc: BudgetCoverageDoc;
  countryConfig: CountryConfig | null;
}) {
  const label = getDocMediumLabel(countryConfig, doc.doc);
  const color = getDocColor(countryConfig, doc.doc);
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[13px] text-[var(--undp-black)] truncate">
                {label}
              </span>
              <span
                aria-hidden="true"
                className="text-[var(--undp-gray)]/50 text-[10px]"
              >
                +
              </span>
            </span>
            <span className="text-[11px] tabular-nums text-[var(--undp-gray)] shrink-0 text-right">
              <span className="text-[var(--undp-black)] font-medium">
                {doc.reached}
              </span>{" "}
              of {doc.total} matched
            </span>
          </div>
          {/* Dot-map: one uniform dot per target. Filled = has a matching
              budget line; hollow = none. Matched dots first so the proportion
              reads at a glance. */}
          <div className="flex flex-wrap gap-1">
            {doc.links.map((link) => (
              <span
                key={link.targetId}
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: color }}
                title={link.targetLabel}
              />
            ))}
            {doc.uncovered.map((a) => (
              <span
                key={a.targetId}
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full border"
                style={{ borderColor: color }}
                title={a.targetLabel}
              />
            ))}
          </div>
        </summary>
        <div className="mt-2.5 ml-3.5 space-y-3">
          {doc.links.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--undp-gray)] mb-1.5">
                Targets with a matching budget line
              </p>
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {doc.links.map((link) => (
                  <li
                    key={link.targetId}
                    className="border-l-2 pl-2.5"
                    style={{ borderColor: color }}
                  >
                    <p
                      className="text-[12px] font-medium text-[var(--undp-black)] leading-snug"
                      title={link.targetText}
                    >
                      {link.targetLabel}
                    </p>
                    <p className="text-[11px] text-[var(--undp-gray)] leading-snug mt-0.5">
                      <span className="text-[var(--undp-gray)]/70">
                        budget line:
                      </span>{" "}
                      {link.programName}
                    </p>
                    {link.rationale && (
                      <p className="text-[11px] italic text-[var(--undp-gray)] leading-snug mt-1 line-clamp-3">
                        {link.rationale}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {doc.uncovered.length > 0 ? (
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--undp-gray)] mb-1.5">
                Targets with no matching budget line
              </p>
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {doc.uncovered.map((a) => (
                  <li
                    key={a.targetId}
                    className="border-l-2 border-[var(--undp-gray)]/30 pl-2.5"
                  >
                    <p
                      className="text-[12px] font-medium text-[var(--undp-black)] leading-snug"
                      title={a.targetText}
                    >
                      {a.targetLabel}
                    </p>
                    <p className="text-[11px] text-[var(--undp-gray)] leading-snug mt-0.5 line-clamp-3">
                      {a.targetText}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] italic text-[var(--undp-gray)]">
              Every target in this document has a matching budget line.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

interface Sentence {
  headline: string;
  body: string;
}

// "most of" / "about half of" / "under half of" / "few of" — a graspable share
// word so the headline does not lead with a bare fraction. The body carries the
// exact counts.
function coverageWord(share: number): string {
  if (share >= 0.6) return "most of";
  if (share >= 0.4) return "about half";
  if (share >= 0.2) return "under half of";
  return "few of";
}

function composeSentence(
  coverage: BudgetCoverage | null,
  summary: FinancingCoherenceSummary,
  commitmentCount: number,
  countryName: string,
): Sentence {
  // No tracked spend yet: nothing to compare.
  if (summary.totalProgramCount === 0 || summary.totalTrackedExpenditure <= 0) {
    return {
      headline: "No tracked biodiversity expenditure to compare yet.",
      body: "Once the Biodiversity Expenditure Review reports program spending, this slide shows how much of the policy has a matching budget line, and which targets have none.",
    };
  }

  // Budget-to-target matching not available for this corpus (rare for Mongolia,
  // where the alignment exists). Name the budget; do not headline a number.
  if (!coverage || coverage.byDocument.length === 0) {
    return {
      headline: `${countryName}'s reviewed biodiversity spending sits beside ${commitmentCount} policy targets.`,
      body: "The match between this budget's lines and the policy targets has not been computed for this corpus yet. The right column shows the budget itself: where the money sits, and how much of the plan went unspent.",
    };
  }

  const { reached, total, outsideReach, byDocument } = coverage;
  const share = total > 0 ? reached / total : 0;
  return {
    headline: `${countryName}'s reviewed biodiversity spending matches ${coverageWord(share)} the policy targets.`,
    body: `Across the ${byDocument.length} policy documents there are ${total} targets. ${reached} have a matching budget line in this review; the other ${outsideReach} have none.`,
  };
}
