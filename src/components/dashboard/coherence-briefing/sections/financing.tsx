"use client";

/**
 * Financing — the Level 2 slide. One question: which policy targets have
 * money behind them, and which don't?
 *
 * Evidence panel shows every visible policy target as one dot, color-coded by
 * funding tier (well-funded / funded / under-funded / no aligned spend) and
 * grouped by document. Click any dot for the target text, the contributing
 * programmes, and a per-year aligned-spend bar chart. The headline sentence
 * names the budget and the matched-share fraction; the dot grid is where the
 * outlier-level reading happens.
 *
 * What "aligned spend" actually is, stated honestly: sum of executed
 * expenditure across programmes the LLM judged high- or medium-aligned with
 * this target. AI-judged semantic coherence — not traced material flow, not
 * an audited allocation. The same programme can be aligned with many
 * targets; the per-target totals share that overcount basis, so ranking
 * across targets is honest while absolute amounts overstate exclusive flow.
 *
 * NOTE: "reviewed biodiversity spending" is BER-specific (the only budget
 * wired today, and deliberately framed as a snapshot review, not the whole
 * budget). If a non-biodiversity budget is ever added, revisit the noun.
 */

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import {
  computeFundingTargetRows,
  groupFundingRowsByDoc,
  visibleFinancingDocIds,
  type BudgetCoverage,
  type FinancingCoherenceSummary,
} from "@/lib/financing-coherence";
import type {
  AlignmentResult,
  BerData,
  CountryConfig,
  Target,
} from "@/types";
import { FundingTargetGrid } from "./funding-target-grid";

export const FINANCING_SECTION_ID = "financing";

export function FinancingSection({
  summary,
  commitmentCount,
  coverage,
  countryConfig,
  countryId,
  countryName,
  targets,
  budgetAlignment,
  berData,
}: {
  summary: FinancingCoherenceSummary;
  commitmentCount: number;
  coverage: BudgetCoverage | null;
  countryConfig: CountryConfig | null;
  countryId?: string;
  countryName: string;
  targets: Target[];
  budgetAlignment: AlignmentResult[] | null;
  berData: BerData | null;
}) {
  const t = useTranslations("briefing.financing");
  const locale = useLocale();
  const sentence = composeSentence(
    coverage,
    summary,
    commitmentCount,
    countryName,
    t,
  );

  // Per-target funding rows powering the dot grid. Memoised so a re-render
  // from elsewhere (locale, country toggle) doesn't redo the join.
  const grid = useMemo(() => {
    if (!berData || !budgetAlignment) return null;
    const visibleDocIds = visibleFinancingDocIds(countryConfig);
    const rows = computeFundingTargetRows({
      targets,
      alignment: budgetAlignment,
      berData,
      countryConfig,
      locale,
      visibleDocIds,
    });
    if (rows.length === 0) return null;
    const docs = groupFundingRowsByDoc(rows, countryConfig);
    const totals = {
      reviewed: rows.length,
      wellFunded: rows.filter((r) => r.tier === "well-funded").length,
      underFunded: rows.filter((r) => r.tier === "under-funded").length,
      unfunded: rows.filter((r) => r.tier === "unfunded").length,
    };
    return { docs, totals };
  }, [targets, budgetAlignment, berData, countryConfig, locale]);

  return (
    <SlideFrame
      id={FINANCING_SECTION_ID}
      eyebrow={t("eyebrow")}
      headline={sentence.headline}
      body={sentence.body}
      evidence={
        grid ? (
          <FundingTargetGrid
            docs={grid.docs}
            unit={berData?.unit ?? "million"}
            currency={berData?.currency ?? ""}
            totals={grid.totals}
            mode={countryId === "panama" ? "drawer" : "docked"}
          />
        ) : undefined
      }
    />
  );
}

interface Sentence {
  headline: string;
  body: string;
}

// "most of" / "about half of" / "under half of" / "few of" — a graspable share
// word so the headline does not lead with a bare fraction. The body carries the
// exact counts.
function coverageWord(
  share: number,
  t: ReturnType<typeof useTranslations<"briefing.financing">>,
): string {
  if (share >= 0.6) return t("share.most");
  if (share >= 0.4) return t("share.aboutHalf");
  if (share >= 0.2) return t("share.underHalf");
  return t("share.few");
}

function composeSentence(
  coverage: BudgetCoverage | null,
  summary: FinancingCoherenceSummary,
  commitmentCount: number,
  countryName: string,
  t: ReturnType<typeof useTranslations<"briefing.financing">>,
): Sentence {
  // No tracked spend yet: nothing to compare.
  if (summary.totalProgramCount === 0 || summary.totalTrackedExpenditure <= 0) {
    return {
      headline: t("noSpend.headline"),
      body: t("noSpend.body"),
    };
  }

  // Budget-to-target matching not available for this corpus. Name the budget;
  // do not headline a number.
  if (!coverage || coverage.byDocument.length === 0) {
    return {
      headline: t("noMatch.headline", {
        country: countryName,
        count: commitmentCount,
      }),
      body: t("noMatch.body"),
    };
  }

  const { reached, total, outsideReach, byDocument } = coverage;
  const share = total > 0 ? reached / total : 0;
  return {
    headline: t("matched.headline", {
      country: countryName,
      share: coverageWord(share, t),
    }),
    body: t("matched.body", {
      docCount: byDocument.length,
      total,
      reached,
      outsideReach,
    }),
  };
}
