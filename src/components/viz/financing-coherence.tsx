"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { InfoBox } from "@/components/ui/info-box";
import {
  CoherenceTable,
  makeFlatLeaves,
  makeHierarchicalLeaves,
  buildRollups,
} from "@/components/viz/coherence-table";
import type {
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
  globeCategories,
  globeSubcategories,
  sectors,
}: FinancingCoherenceProps) {
  const [view, setView] = useState<TaxonomyView>(
    globeSubcategories.length > 0 ? "globe_sub" : "sector",
  );

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

  // Data for the expenditure bar chart (flat list, no hierarchy)
  const chartData = useMemo(() => {
    const rollups = buildRollups(
      leaves,
      taxonomyType,
      classifications,
      expByBerId,
    );
    return rollups
      .filter((r) => r.expenditure > 0)
      .sort((a, b) => b.expenditure - a.expenditure)
      .map((r) => ({
        name: r.name.length > 30 ? r.name.slice(0, 27) + "..." : r.name,
        fullName: r.name,
        value: +r.expenditure.toFixed(1),
        targets: r.targetCount,
        actions: r.actionCount,
      }));
  }, [leaves, taxonomyType, classifications, expByBerId]);

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
          {targets.length} policy targets, and BTR actions linked through
          the shared {VIEW_LABELS[view]}.
        </p>
      </div>

      {/* Taxonomy switcher */}
      <div className="flex gap-2 mb-5">
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

      {/* The collapsible table with concentration callouts */}
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

      {/* Expenditure chart (flat view over parent categories) */}
      {chartData.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
            Expenditure by {parentLabel} ({periodLabel})
          </h3>
          <ResponsiveContainer
            width="100%"
            height={Math.max(160, chartData.length * 30 + 40)}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis
                type="category"
                dataKey="name"
                width={220}
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
                formatter={(value) => [
                  moneyFormatter(Number(value)),
                  "Expenditure",
                ]}
                labelFormatter={(_label, payload) =>
                  payload?.[0]?.payload?.fullName ?? String(_label)
                }
              />
              <Bar dataKey="value" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Methodology footer */}
      <div className="text-xs mt-4 text-[var(--undp-gray)]">
        Targets = policy commitments classified under each {parentLabel}.
        BTR Actions = reported mitigation and adaptation measures. Each
        item is assigned to its single primary {parentLabel} (the
        highest-scoring one from the LLM classifier), so per-{parentLabel}
        sums equal the unique classified totals. Click a row to expand and
        see subcategory detail (where available).
      </div>
    </>
  );
}
