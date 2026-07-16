"use client";

/**
 * Financing — the Level 2 slide. One question: which policy targets have
 * money behind them, and which don't?
 *
 * Two evidence layouts share this slide, keyed off `countryId`:
 *
 *   - PANAMA: the `FundingTargetGrid` — every visible target is one dot,
 *     colored by funding tier (well-funded / funded / under-funded / no
 *     aligned spend), grouped by document. Click a dot to pop open a
 *     drawer with the target text, contributing programmes, and a per-year
 *     aligned-spend bar chart. "Aligned spend" = sum of executed spend
 *     across programmes the LLM judged high/medium-aligned with the
 *     target — AI-judged semantic coherence, not audited flow.
 *
 *   - EVERY OTHER COUNTRY (Mongolia today): the `DocumentCoverage`
 *     dot-map — one uniform dot per target, filled = has a HIGH-confidence
 *     matching budget line, hollow = none. Opening a document shows both
 *     sides (matched + unmatched). Rationale opens in the shared
 *     PairDrawer via `onOpenBudgetPair`.
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
  type BudgetCoverageDoc,
  type FinancingCoherenceSummary,
} from "@/lib/financing-coherence";
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
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
  onOpenBudgetPair,
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
  /** Open the shared drawer on a budget-line↔commitment match (full rationale).
   *  Used only by the DocumentCoverage layout (non-Panama). */
  onOpenBudgetPair: (programBerId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.financing");
  const locale = useLocale();
  const isPanama = countryId === "panama";
  const sentence = composeSentence(
    coverage,
    summary,
    commitmentCount,
    countryName,
    t,
  );

  // Per-target funding rows powering the Panama dot grid. Computed only when
  // Panama is active — skip the join for other countries.
  const grid = useMemo(() => {
    if (!isPanama) return null;
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
  }, [isPanama, targets, budgetAlignment, berData, countryConfig, locale]);

  let evidence: React.ReactNode = undefined;
  if (isPanama && grid) {
    evidence = (
      <FundingTargetGrid
        docs={grid.docs}
        unit={berData?.unit ?? "million"}
        currency={berData?.currency ?? ""}
        totals={grid.totals}
        mode="drawer"
      />
    );
  } else if (!isPanama && coverage && coverage.byDocument.length > 0) {
    evidence = (
      <DocumentCoverage
        coverage={coverage}
        countryConfig={countryConfig}
        onOpenBudgetPair={onOpenBudgetPair}
      />
    );
  }

  return (
    <SlideFrame
      id={FINANCING_SECTION_ID}
      headline={sentence.headline}
      body={sentence.body}
      evidence={evidence}
    />
  );
}

// Per-document dot-map of where the budget has a matching line. Each dot is one
// target: filled = has a matching budget line, hollow = none. Opening a
// document shows BOTH sides (matched targets with their line, and unmatched).
function DocumentCoverage({
  coverage,
  countryConfig,
  onOpenBudgetPair,
}: {
  coverage: BudgetCoverage;
  countryConfig: CountryConfig | null;
  onOpenBudgetPair: (programBerId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.financing");
  return (
    <div>
      <p className="text-[12px] leading-relaxed text-[var(--undp-gray)] mb-2.5 max-w-prose">
        {t("dotMap.intro")}
      </p>

      <ul className="space-y-3">
        {coverage.byDocument.map((d) => (
          <DocCoverageRow
            key={d.doc}
            doc={d}
            countryConfig={countryConfig}
            onOpenBudgetPair={onOpenBudgetPair}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[11px] text-[var(--undp-gray)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--undp-gray)]"
          />
          {t("legend.matched")}
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2.5 h-2.5 rounded-full border border-[var(--undp-gray)]"
          />
          {t("legend.unmatched")}
        </span>
      </div>

      <p className="mt-3 text-[11px] italic text-[var(--undp-gray)] max-w-prose">
        {t("dotMap.disclaimer")}
      </p>
    </div>
  );
}

function DocCoverageRow({
  doc,
  countryConfig,
  onOpenBudgetPair,
}: {
  doc: BudgetCoverageDoc;
  countryConfig: CountryConfig | null;
  onOpenBudgetPair: (programBerId: string, targetId: string) => void;
}) {
  const t = useTranslations("briefing.financing");
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
                className="text-[var(--undp-gray)]/50 text-[11px]"
              >
                +
              </span>
            </span>
            <span className="text-[11px] tabular-nums text-[var(--undp-gray)] shrink-0 text-right">
              {t.rich("matchedCount", {
                reached: doc.reached,
                total: doc.total,
                strong: (c) => (
                  <span className="text-[var(--undp-black)] font-medium">
                    {c}
                  </span>
                ),
              })}
            </span>
          </div>
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
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--undp-gray)] mb-1.5">
                {t("matchedHeading")}
              </p>
              <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
                {doc.links.map((link) => (
                  <li key={link.targetId}>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenBudgetPair(link.programBerId, link.targetId)
                      }
                      title={link.targetText}
                      className="w-full text-left border-l-2 pl-2.5 pr-1 py-1 rounded-r hover:bg-black/[0.04] cursor-pointer flex items-start gap-2"
                      style={{ borderColor: color }}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-[var(--undp-black)] leading-snug truncate">
                          {link.targetLabel}
                        </span>
                        <span className="block text-[11px] text-[var(--undp-gray)] leading-snug truncate">
                          <span className="text-[var(--undp-gray)]/70">
                            {t("budgetLineLabel")}
                          </span>{" "}
                          {link.programName}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 self-center text-[var(--undp-gray)]/50 text-[12px]"
                      >
                        ›
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {doc.uncovered.length > 0 ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--undp-gray)] mb-1.5">
                {t("unmatchedHeading")}
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
              {t("allMatched")}
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
