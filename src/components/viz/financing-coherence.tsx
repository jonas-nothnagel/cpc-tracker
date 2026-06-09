"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { InfoBox } from "@/components/ui/info-box";
import { DataProvenance } from "@/components/ui/data-provenance";
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
  /**
   * When true, the component is being rendered inside a wrapper that already
   * provides the section heading (e.g. a `<details>/<summary>` Beta collapse).
   * Suppresses the duplicate h2 text but keeps the InfoBox + DataProvenance
   * icons attached to the subtitle so meta-information is still reachable.
   */
  embedded?: boolean;
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
  countryConfig,
  embedded = false,
}: FinancingCoherenceProps) {
  const t = useTranslations("viz.financingCoherence");
  const viewLabels: Record<TaxonomyView, string> = {
    globe_sub: t("viewLabels.globe_sub"),
    sector: t("viewLabels.sector"),
  };
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
          taxonomyLabel: t("globeSub.taxonomyLabel"),
          parentLabel: t("globeSub.parentLabel"),
          parentLabelPlural: t("globeSub.parentLabelPlural"),
        };
      }
      return {
        leaves: makeFlatLeaves(sectors),
        taxonomyType: "sector",
        taxonomyLabel: t("sectorView.taxonomyLabel"),
        parentLabel: t("sectorView.parentLabel"),
        parentLabelPlural: t("sectorView.parentLabelPlural"),
      };
    }, [view, globeCategories, globeSubcategories, sectors, t]);

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

  const infoBox = (
    <InfoBox>
      {t("infoBox.intro")}
      <br />
      <br />
      {t("infoBox.detail", { currency: moneyCurrency, period: periodLabel })}
    </InfoBox>
  );
  const dataProvenance = (
    <DataProvenance
      origin="mixed"
      sources={[
        {
          label: t("provenance.sourceLabel"),
          citation: countryConfig?.docProvenance?.BER,
        },
      ]}
      method={<>{t("provenance.method")}</>}
      caveat={t.rich("provenance.caveat", {
        strong: (chunks) => <strong>{chunks}</strong>,
      })}
    />
  );

  return (
    <>
      <div className="mb-4">
        {embedded ? (
          <div className="flex items-center gap-1 mb-1">
            {infoBox}
            {dataProvenance}
          </div>
        ) : (
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            {t("heading")}
            {infoBox}
            {dataProvenance}
          </h2>
        )}
        <p className="text-sm text-[var(--undp-gray)] mt-0.5">
          {t("subtitle.intro", {
            programCount: berData.programs.length,
            targetCount: targets.length,
          })}{" "}
          {groupBy === "category"
            ? t("subtitle.rollup", { taxonomy: viewLabels[view] })
            : t("subtitle.program", { count: 28 })}
        </p>
      </div>

      {berData.keyFindings && (
        <div className="mb-3 px-3 py-2 rounded-md bg-[#fef3c7] border-l-4 border-[#b45309]">
          <p className="text-xs text-[var(--undp-black)]">
            <span className="font-semibold">
              {t("keyFindings.horizon", {
                period: berData.keyFindings.programPeriod,
              })}
            </span>{" "}
            {t("keyFindings.summary", {
              planned: moneyFormatter(berData.keyFindings.plannedBudget),
              actual: moneyFormatter(berData.keyFindings.actualExpenditure),
              gap: moneyFormatter(berData.keyFindings.gap),
            })}
          </p>
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5">
            {t("keyFindings.note", {
              period: periodLabel,
              programPeriod: berData.keyFindings.programPeriod,
            })}
          </p>
        </div>
      )}

      <div className="mb-5 px-3 py-2 rounded-md bg-gray-50 border border-gray-200">
        <p className="text-[11px] font-semibold text-[var(--undp-gray)] mb-1 uppercase tracking-wide">
          {t("scopeNote.title")}
        </p>
        <ul className="text-[11px] text-[var(--undp-gray)] space-y-0.5 list-disc pl-4">
          <li>
            {t.rich("scopeNote.berOnly", {
              strong: (chunks) => (
                <strong className="text-[var(--undp-black)]">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t.rich("scopeNote.classification", {
              strong: (chunks) => (
                <strong className="text-[var(--undp-black)]">{chunks}</strong>
              ),
            })}
          </li>
          <li>
            {t("scopeNote.period", {
              programPeriod:
                berData.keyFindings?.programPeriod ??
                `${berData.period.start}-${berData.period.end}`,
              period: periodLabel,
            })}
          </li>
          <li>{t("scopeNote.reconciliation", { count: 28 })}</li>
        </ul>
      </div>

      {/* Group-by + taxonomy controls */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--undp-gray)]">{t("groupBy")}</span>
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
              {g === "category"
                ? t("taxonomyRollup")
                : t("programOption", { count: 28 })}
            </button>
          ))}
        </div>

        {groupBy === "category" && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--undp-gray)]">{t("taxonomy")}</span>
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
                {viewLabels[v]}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--undp-gray)]">
            {t("cards.classifiedTitle", { period: periodLabel })}
          </p>
          <p className="text-lg font-semibold text-[var(--undp-black)] mt-0.5">
            {moneyFormatter(stats.totalExpenditure)}
          </p>
          <p className="text-xs text-[var(--undp-gray)]">
            {t("cards.coverage", {
              percent:
                coveragePercent >= 0.1
                  ? `${coveragePercent.toFixed(0)}%`
                  : "<1%",
              total: moneyFormatter(actualTotalExpenditure),
              period: periodLabel,
            })}
          </p>
          <p className="text-xs text-[var(--undp-gray)] mt-0.5">
            {t("cards.acrossParents", {
              count: stats.withExp,
              total: stats.parentCount,
              parent:
                stats.parentCount === 1 ? parentLabel : parentLabelPlural,
            })}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--undp-gray)]">
            {t("cards.fundedTitle")}
          </p>
          <p className="text-lg font-semibold text-[#059669] mt-0.5">
            {stats.funded}
          </p>
          <p className="text-xs text-[var(--undp-gray)]">
            {t("cards.fundedDesc", {
              parent: stats.funded === 1 ? parentLabel : parentLabelPlural,
            })}
          </p>
        </div>
        <div className="border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-xs text-[var(--undp-gray)]">
            {t("cards.unfundedTitle")}
          </p>
          <p
            className={`text-lg font-semibold mt-0.5 ${stats.unfunded > 0 ? "text-[#b45309]" : "text-[#059669]"}`}
          >
            {stats.unfunded}
          </p>
          <p className="text-xs text-[var(--undp-gray)]">
            {stats.unfunded > 0
              ? t("cards.unfundedDesc", {
                  parent:
                    stats.unfunded === 1 ? parentLabel : parentLabelPlural,
                })
              : t("cards.unfundedNone")}
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
            expenditureLabel={t("expenditureLabel", { period: periodLabel })}
            parentLabel={parentLabel}
            parentLabelPlural={parentLabelPlural}
          />

          <p className="mt-3 text-[11px] italic text-[var(--undp-gray)]">
            {t("barChartNote")}
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
            {t("footer.categoryMethod", { parent: parentLabel })}
            <br />
            {t.rich("footer.categoryScope", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </>
        ) : (
          <>
            {t("footer.programMethod")}
            <br />
            {t.rich("footer.programScope", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </>
        )}
      </div>
    </>
  );
}
