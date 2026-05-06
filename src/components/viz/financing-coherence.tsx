"use client";

import React, { useMemo, useState } from "react";
import { InfoBox } from "@/components/ui/info-box";
import {
  CoherenceTable,
  makeFlatLeaves,
  makeHierarchicalLeaves,
  buildRollups,
} from "@/components/viz/coherence-table";
import { ProgramDetailTable } from "@/components/viz/program-detail-table";
import type {
  AlignmentResult,
  BerData,
  BerExpenditureSeries,
  CountryConfig,
  GlobeCategory,
  GlobeSubcategory,
  IpccSector,
  Target,
  ThematicClassification,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TaxonomyView = "globe_sub" | "sector";

interface FinancingCoherenceProps {
  berData: BerData;
  targets: Target[];
  classifications: ThematicClassification[];
  budgetAlignment: AlignmentResult[];
  globeCategories: GlobeCategory[];
  globeSubcategories: GlobeSubcategory[];
  sectors: IpccSector[];
  countryConfig?: CountryConfig | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function totalExpenditure(series: BerExpenditureSeries): number {
  return Object.values(series.values).reduce(
    (sum: number, v) => sum + (v ?? 0),
    0,
  );
}

/**
 * Formats a value assumed to be in billions of the given currency.
 * Scales up to trillions (T) or down to millions (M) as appropriate.
 * The currency word is the only unit in the output — we avoid concatenating
 * the caller's scale label (e.g. "billion MNT") with our own scale suffix,
 * which previously produced strings like "100M billion MNT".
 */
function formatMoney(valueInBillions: number, currency: string): string {
  const cur = currency.trim();
  const suffix = cur ? ` ${cur}` : "";
  if (valueInBillions >= 1000) return `${(valueInBillions / 1000).toFixed(1)}T${suffix}`;
  if (valueInBillions >= 1) return `${valueInBillions.toFixed(1)}B${suffix}`;
  if (valueInBillions >= 0.001) return `${(valueInBillions * 1000).toFixed(0)}M${suffix}`;
  if (valueInBillions > 0) return `< 1M${suffix}`;
  return `0${suffix}`;
}

const VIEW_LABELS: Record<TaxonomyView, string> = {
  globe_sub: "BIOFIN GLOBE biodiversity taxonomy",
  sector: "IPCC climate mitigation sectors",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinancingCoherence({
  berData,
  targets,
  classifications,
  budgetAlignment,
  globeCategories,
  globeSubcategories,
  sectors,
}: FinancingCoherenceProps) {
  const [view, setView] = useState<TaxonomyView>(
    globeSubcategories.length > 0 ? "globe_sub" : "sector",
  );
  const [groupBy, setGroupBy] = useState<"category" | "program">("category");

  const periodLabel = `${berData.period.start}\u2013${berData.period.end}`;
  const moneyCurrency = berData.currency ?? "";

  // Cumulative expenditure per BER pseudo-target (across all years).
  const expByBerId = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of berData.expenditure) {
      const total = totalExpenditure(e);
      if (total > 0) map.set(`BER_${e.code}`, total);
    }
    return map;
  }, [berData.expenditure]);

  // Build the taxonomy leaves for the active view.
  const { leaves, taxonomyType, taxonomyLabel, parentLabel, parentLabelPlural } =
    useMemo(() => {
      if (view === "globe_sub") {
        return {
          leaves: makeHierarchicalLeaves(globeCategories, globeSubcategories),
          taxonomyType: "globe_sub",
          taxonomyLabel: "GLOBE category / subcategory",
          parentLabel: "GLOBE category",
          parentLabelPlural: "GLOBE categories",
        };
      }
      return {
        leaves: makeFlatLeaves(sectors),
        taxonomyType: "sector",
        taxonomyLabel: "Climate mitigation sector",
        parentLabel: "sector",
        parentLabelPlural: "sectors",
      };
    }, [view, globeCategories, globeSubcategories, sectors]);

  // Total public BER expenditure across all programs and years (the denominator
  // for coverage %). This is the real money on the table, before any
  // classification.
  const actualTotalExpenditure = useMemo(() => {
    let sum = 0;
    for (const e of berData.expenditure) {
      for (const v of Object.values(e.values)) {
        if (typeof v === "number") sum += v;
      }
    }
    return sum;
  }, [berData.expenditure]);

  // Single-label classification means each BER program contributes its full
  // expenditure to exactly one parent category. Per-parent sums add up to the
  // unique classified total exactly -- no overlap to explain.
  const stats = useMemo(() => {
    const rollups = buildRollups(
      leaves,
      taxonomyType,
      classifications,
      expByBerId,
    );

    const totalExpenditure = rollups.reduce((s, r) => s + r.expenditure, 0);
    const withExp = rollups.filter((r) => r.expenditure > 0).length;
    const funded = rollups.filter(
      (r) => r.expenditure > 0 && r.targetCount > 0,
    ).length;
    const unfunded = rollups.filter(
      (r) => r.targetCount > 0 && r.expenditure === 0,
    ).length;
    return {
      totalExpenditure,
      withExp,
      funded,
      unfunded,
      parentCount: rollups.length,
    };
  }, [leaves, taxonomyType, classifications, expByBerId]);

  const coveragePercent =
    actualTotalExpenditure > 0
      ? (stats.totalExpenditure / actualTotalExpenditure) * 100
      : 0;

  const moneyFormatter = React.useCallback(
    (v: number) => formatMoney(v, moneyCurrency),
    [moneyCurrency],
  );

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--undp-black)]">
          Budget &amp; Financing Coherence
          <InfoBox>
            How government biodiversity expenditure aligns with policy
            commitments and reported actions, grouped by a shared taxonomy.
            Each row shows how much budget is allocated, how many policy
            targets address the category, and how many BTR-reported actions
            fall under it.
            <br />
            <br />
            The BIOFIN GLOBE view uses BIOFIN&apos;s official framework for
            Biodiversity Expenditure Reviews (48 subcategories grouped into 9
            primary categories). The Climate Mitigation view uses the IPCC
            sector taxonomy. Subcategory assignments are generated by an LLM
            classifier calibrated on expert examples. All monetary values in{" "}
            {moneyCurrency} ({periodLabel}).
          </InfoBox>
        </h2>
        <p className="text-sm text-[var(--undp-gray)] mt-0.5">
          Cross-level view: {berData.programs.length} budget programs,{" "}
          {targets.length} policy targets, and BTR actions.{" "}
          {groupBy === "category"
            ? `Rollup by ${VIEW_LABELS[view]}.`
            : "Drill into each of the 28 original BER reporting lines."}
        </p>
      </div>

      {berData.keyFindings && (
        <div className="mb-3 px-3 py-2 rounded-md bg-[#fef3c7] border-l-4 border-[#b45309]">
          <p className="text-xs text-[var(--undp-black)]">
            <span className="font-semibold">
              BER analysis horizon ({berData.keyFindings.programPeriod}):
            </span>{" "}
            {moneyFormatter(berData.keyFindings.plannedBudget)} planned,{" "}
            {moneyFormatter(berData.keyFindings.actualExpenditure)} actual.
            Execution gap: {moneyFormatter(berData.keyFindings.gap)}.
          </p>
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
            Detailed annual data below covers {periodLabel}; the BER document
            analyses the longer {berData.keyFindings.programPeriod} period.
          </p>
        </div>
      )}

      <div className="mb-5 px-3 py-2 rounded-md bg-gray-50 border border-gray-200">
        <p className="text-[11px] font-semibold text-[var(--undp-gray)] mb-1 uppercase tracking-wide">
          What this section is and is not showing
        </p>
        <ul className="text-[11px] text-[var(--undp-gray)] space-y-0.5 list-disc pl-4">
          <li>
            <strong className="text-[var(--undp-black)]">Biodiversity expenditure (BER) only.</strong>{" "}
            Broader green budget tagging (climate mitigation and adaptation
            flags across ~1,400 projects) is a separate Mongolia data source
            not yet integrated.
          </li>
          <li>
            Program-to-policy classification is{" "}
            <strong className="text-[var(--undp-black)]">LLM-generated</strong>.
            Each program gets a primary single-label and any tags scoring{" "}
            ≥ 0.5 as multi-label.
          </li>
          <li>
            Period: BER analysis horizon{" "}
            {berData.keyFindings?.programPeriod ?? `${berData.period.start}-${berData.period.end}`};
            detailed annual data {periodLabel}.
          </li>
          <li>
            Sub-program (line-item) reconciliation is in flight; the current
            view is program-level only (28 BER reporting lines).
          </li>
        </ul>
      </div>

      {/* Group-by + taxonomy controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--undp-gray)]">Group by:</span>
          {(["category", "program"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                groupBy === g
                  ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                  : "bg-white text-[var(--undp-gray)] border-gray-200 hover:border-gray-300"
              }`}
            >
              {g === "category" ? "Taxonomy rollup" : "Program (28 BER lines)"}
            </button>
          ))}
        </div>

        {groupBy === "category" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--undp-gray)]">Taxonomy:</span>
            {(globeSubcategories.length > 0
              ? (["globe_sub", "sector"] as const)
              : (["sector"] as const)
            ).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  view === v
                    ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                    : "bg-white text-[var(--undp-gray)] border-gray-200 hover:border-gray-300"
                }`}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--undp-gray)]">
            Classified expenditure ({periodLabel})
          </p>
          <p className="text-lg font-semibold text-[var(--undp-black)] mt-0.5">
            {moneyFormatter(stats.totalExpenditure)}
          </p>
          <p className="text-xs text-[var(--undp-gray)]">
            {coveragePercent >= 0.1 ? `${coveragePercent.toFixed(0)}%` : "<1%"}{" "}
            of {moneyFormatter(actualTotalExpenditure)} total public BER
            ({periodLabel})
          </p>
          <p className="text-xs text-[var(--undp-gray)] mt-0.5">
            across {stats.withExp} of {stats.parentCount}{" "}
            {stats.parentCount === 1 ? parentLabel : parentLabelPlural}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--undp-gray)]">
            Funded commitment areas
          </p>
          <p className="text-lg font-semibold text-[#059669] mt-0.5">
            {stats.funded}
          </p>
          <p className="text-xs text-[var(--undp-gray)]">
            {stats.funded === 1 ? parentLabel : parentLabelPlural} with both
            targets and budget
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--undp-gray)]">
            Unfunded commitment areas
          </p>
          <p
            className={`text-lg font-semibold mt-0.5 ${stats.unfunded > 0 ? "text-[#b45309]" : "text-[#059669]"}`}
          >
            {stats.unfunded}
          </p>
          <p className="text-xs text-[var(--undp-gray)]">
            {stats.unfunded > 0
              ? `${stats.unfunded === 1 ? parentLabel : parentLabelPlural} with targets but no classified budget`
              : "all commitment areas have budget"}
          </p>
        </div>
      </div>

      {groupBy === "category" && (
        <>
          <CoherenceTable
            leaves={leaves}
            taxonomyType={taxonomyType}
            classifications={classifications}
            expenditureByItemId={expByBerId}
            formatMoney={moneyFormatter}
            taxonomyLabel={taxonomyLabel}
            expenditureLabel={`Expenditure (${periodLabel})`}
            parentLabel={parentLabel}
            parentLabelPlural={parentLabelPlural}
          />

          <p className="mt-3 text-[11px] italic text-[var(--undp-gray)]">
            A bar-chart view disaggregated by ministry will follow once the
            Mongolia BER program-to-ministry mapping is wired (separate
            workstream).
          </p>
        </>
      )}

      {groupBy === "program" && (
        <ProgramDetailTable
          berData={berData}
          targets={targets}
          classifications={classifications}
          budgetAlignment={budgetAlignment}
          globeCategories={globeCategories}
          globeSubcategories={globeSubcategories}
          sectors={sectors}
          formatMoney={moneyFormatter}
          periodLabel={periodLabel}
        />
      )}

      {/* Methodology footer */}
      <div className="text-xs mt-4 text-[var(--undp-gray)]">
        {groupBy === "category" ? (
          <>
            Targets = policy commitments classified under each {parentLabel}.
            BTR Actions = reported mitigation and adaptation measures. Each
            item is assigned to its single primary {parentLabel} (the
            highest-scoring one from the LLM classifier), so per-{parentLabel}
            sums equal the unique classified totals. Click a row to expand
            and see subcategory detail (where available).
          </>
        ) : (
          <>
            Environmental and non-environmental tags are the BER&apos;s own
            classification of each budget line. GLOBE and IPCC primaries are
            assigned by an LLM classifier from each program&apos;s description.
            Zero-spend rows are budget lines that exist in the reporting
            framework but recorded no expenditure in the period. Click a row
            for full description, subcategories, reasoning, and top aligned
            policy targets.
          </>
        )}
      </div>
    </>
  );
}
