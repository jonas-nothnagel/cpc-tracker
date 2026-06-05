"use client";

/**
 * Financing — the Level 2 slide. One question: is the biodiversity money where
 * the policy ambition is? The finding runs on hard BER facts alone (no AI, no
 * taxonomy): the budget is concentrated in a few programs, while the policy
 * commitments are far broader. The coherence angle is a hedged prompt, not a
 * computed verdict.
 *
 * Left column: headline + the hedged prompt. Right column (FinancingCenterpiece):
 * where the money concentrates, plus how much of the plan went unspent.
 */

import { SlideFrame } from "../slide-frame";
import type { FinancingCoherenceSummary } from "@/lib/financing-coherence";

export const FINANCING_SECTION_ID = "financing";

export function FinancingSection({
  summary,
  commitmentCount,
}: {
  summary: FinancingCoherenceSummary;
  commitmentCount: number;
}) {
  const sentence = composeSentence(summary, commitmentCount);
  return (
    <SlideFrame
      id={FINANCING_SECTION_ID}
      eyebrow="Where does money meet ambition?"
      headline={sentence.headline}
      body={sentence.body}
    />
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

  if (totalProgramCount === 0 || summary.totalTrackedExpenditure === 0) {
    return {
      headline: "No tracked biodiversity expenditure to compare yet.",
      body: "Once the Biodiversity Expenditure Review reports program spending, this slide shows whether the money is concentrated where the policy ambition sits.",
    };
  }

  if (!concentrated) {
    return {
      headline: `Biodiversity spending is spread across ${totalProgramCount} programs.`,
      body: `It takes ${programsToHalf} of ${totalProgramCount} programs to reach half of all tracked spending, so no handful dominates. The ${commitmentCount} policy commitments span a comparable breadth.`,
    };
  }

  const where =
    programsToHalf === 1
      ? "a single program"
      : `just ${numberWord(programsToHalf)} of ${totalProgramCount} programs`;
  return {
    headline: `Over half the biodiversity budget sits in ${where}.`,
    body: `${programsToHalf === 1 ? "One program holds" : `These ${programsToHalf} programs hold`} more than half of all tracked spending, while the ${commitmentCount} policy commitments reach much further. Worth reviewing whether finance is concentrated where the ambition sits.`,
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
