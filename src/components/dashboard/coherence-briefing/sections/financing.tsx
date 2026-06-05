"use client";

/**
 * Financing — the Level 2 slide. One question: is the biodiversity money where
 * the policy ambition is?
 *
 * Left column:
 *   - HEADLINE (hard facts only): the budget is concentrated in a few programs.
 *   - A per-DOCUMENT read of where the budget FUNDS the policy commitments. The
 *     pipeline (budget_align.py) judges, per budget-programme × commitment pair,
 *     whether the programme's mandate and expenditure fund the commitment's
 *     goals; HIGH = "clearly funds the goals". We count only HIGH (medium is
 *     "same sector but doesn't meaningfully fund" — too generous), so the
 *     gradient is honest. This is a FUNDING judgement, distinct from the
 *     policy-to-policy coherence elsewhere in the briefing. Each document
 *     expands to the actual funded commitments, the budget line, and the AI's
 *     reasoning, so the number is substantiated. AI-derived: indicative, never
 *     headlined.
 *
 * Right column (FinancingCenterpiece, kept simple): where the money
 * concentrates by program, plus how much of the plan went unspent.
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
}: {
  summary: FinancingCoherenceSummary;
  commitmentCount: number;
  coverage: BudgetCoverage | null;
  countryConfig: CountryConfig | null;
}) {
  const sentence = composeSentence(summary, commitmentCount);
  return (
    <SlideFrame
      id={FINANCING_SECTION_ID}
      eyebrow="Where does money meet ambition?"
      headline={sentence.headline}
      body={sentence.body}
      evidence={
        coverage && coverage.byDocument.length > 0 ? (
          <DocumentFunding coverage={coverage} countryConfig={countryConfig} />
        ) : undefined
      }
    />
  );
}

// Where the budget FUNDS each policy document's commitments (high-confidence
// judgements only). Bar = the share of a document's commitments a funded
// budget line covers; expand to the actual links, the budget line, and why.
function DocumentFunding({
  coverage,
  countryConfig,
}: {
  coverage: BudgetCoverage;
  countryConfig: CountryConfig | null;
}) {
  return (
    <div>
      <p className="text-[13.5px] leading-relaxed text-[var(--undp-black)] mb-3 max-w-prose">
        Those {coverage.total} commitments are the individual targets in the
        country&apos;s nature-climate documents. The pipeline checks each against
        the budget and flags where a programme&apos;s mandate and spending fund a
        commitment&apos;s goals. Open a document to see those links and why:
      </p>
      <ul className="space-y-2">
        {coverage.byDocument.map((d) => (
          <DocFundingRow key={d.doc} doc={d} countryConfig={countryConfig} />
        ))}
      </ul>
      <p className="mt-3 text-[11px] italic text-[var(--undp-gray)] max-w-prose">
        A funding link is the pipeline&apos;s high-confidence judgement that a
        budget programme funds a commitment&apos;s goals. This is distinct from
        the policy-to-policy coherence elsewhere in the briefing. It is
        AI-assessed and indicative, not an audited allocation; weaker same-sector
        matches are excluded, so the picture is deliberately selective.
      </p>
    </div>
  );
}

function DocFundingRow({
  doc,
  countryConfig,
}: {
  doc: BudgetCoverageDoc;
  countryConfig: CountryConfig | null;
}) {
  const label = getDocMediumLabel(countryConfig, doc.doc);
  const color = getDocColor(countryConfig, doc.doc);
  const share = doc.total > 0 ? doc.reached / doc.total : 0;
  return (
    <li>
      <details className="group">
        <summary className="cursor-pointer list-none grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-[13px] text-[var(--undp-black)] truncate">
              {label}
            </span>
            {doc.links.length > 0 && (
              <span
                aria-hidden="true"
                className="text-[var(--undp-gray)]/60 text-[10px]"
              >
                +
              </span>
            )}
          </span>
          <span className="text-[11px] tabular-nums text-[var(--undp-gray)] text-right">
            <span className="text-[var(--undp-black)] font-medium">
              {doc.reached}
            </span>
            /{doc.total} funded
          </span>
          <span
            aria-hidden="true"
            className="col-span-2 block h-2 rounded-full bg-gray-100 overflow-hidden"
            title={`${Math.round(share * 100)}% funded`}
          >
            <span
              className="block h-full rounded-full"
              style={{ width: `${share * 100}%`, backgroundColor: color }}
            />
          </span>
        </summary>
        {doc.links.length > 0 ? (
          <div className="mt-2.5 ml-3.5">
            <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--undp-gray)] mb-1.5">
              Commitments the budget funds
            </p>
            <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
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
                    <span className="uppercase tracking-wider text-[9.5px] text-[var(--undp-gray)]/70">
                      funded by
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
        ) : (
          <p className="mt-2 ml-3.5 text-[11px] italic text-[var(--undp-gray)]">
            No funded budget line clearly funds this document&apos;s goals.
          </p>
        )}
      </details>
    </li>
  );
}

interface Sentence {
  headline: string;
  body: string;
}

function composeSentence(
  summary: FinancingCoherenceSummary,
  commitmentCount: number,
): Sentence {
  const { programsToHalf, totalProgramCount } = summary;
  const concentrated =
    programsToHalf <= Math.max(1, Math.round(totalProgramCount * 0.2));

  if (totalProgramCount === 0 || summary.totalTrackedExpenditure <= 0) {
    return {
      headline: "No tracked biodiversity expenditure to compare yet.",
      body: "Once the Biodiversity Expenditure Review reports program spending, this slide shows whether the money is concentrated where the policy ambition sits.",
    };
  }

  if (!concentrated) {
    return {
      headline: `Biodiversity spending is spread across ${totalProgramCount} programs.`,
      body: `It takes ${programsToHalf} of ${totalProgramCount} programs to reach half of all tracked spending, so no handful dominates. Across the ${commitmentCount} policy commitments — the targets in the country's nature-climate documents — the budget funds the goals of some far more than others.`,
    };
  }

  const where =
    programsToHalf === 1
      ? "a single program"
      : `just ${numberWord(programsToHalf)} of ${totalProgramCount} programs`;
  return {
    headline: `Over half the biodiversity budget sits in ${where}.`,
    body: `${programsToHalf === 1 ? "One program holds" : `These ${programsToHalf} programs hold`} more than half of all tracked spending. Across the ${commitmentCount} policy commitments — the targets in the country's nature-climate documents — the budget funds the goals of some far more than others.`,
  };
}

const SMALL_NUMBERS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

function numberWord(n: number): string {
  return SMALL_NUMBERS[n] ?? String(n);
}
