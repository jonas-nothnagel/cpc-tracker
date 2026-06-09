"use client";

import React, { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAlignmentLabels } from "@/lib/labels";
import type {
  AlignmentResult,
  BerBudgetProgram,
  BerData,
  GlobeCategory,
  GlobeSubcategory,
  IpccSector,
  Target,
  ThematicClassification,
} from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypeFilter = "all" | "environmental" | "non_environmental";
type SpendFilter = "all" | "with" | "none";
type GlobeFilter = "all" | "classified" | "unclassified";
type SortKey = "spend" | "code" | "aligned";

interface ProgramRow {
  program: BerBudgetProgram;
  berId: string;
  totalSpend: number;
  hasSpend: boolean;
  valuesByYear: Record<string, number | null>;
  globePrimary: { id: string; name: string; score: number; reasoning?: string } | null;
  globeSubPrimaries: { id: string; name: string; score: number; reasoning?: string }[];
  sectorPrimary: { id: string; name: string; score: number } | null;
  alignedHighMedium: AlignmentResult[];
  alignedLow: AlignmentResult[];
  topAligned: AlignmentResult[];
}

interface ProgramDetailTableProps {
  berData: BerData;
  targets: Target[];
  classifications: ThematicClassification[];
  budgetAlignment: AlignmentResult[];
  globeCategories: GlobeCategory[];
  globeSubcategories: GlobeSubcategory[];
  sectors: IpccSector[];
  formatMoney: (v: number) => string;
  periodLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALIGNMENT_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

function otherSide(pair: AlignmentResult, berId: string): string | null {
  if (pair.targetAId === berId) return pair.targetBId;
  if (pair.targetBId === berId) return pair.targetAId;
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProgramDetailTable({
  berData,
  targets,
  classifications,
  budgetAlignment,
  globeCategories,
  globeSubcategories,
  sectors,
  formatMoney,
  periodLabel,
}: ProgramDetailTableProps) {
  const t = useTranslations("viz.programDetailTable");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [spendFilter, setSpendFilter] = useState<SpendFilter>("all");
  const [globeFilter, setGlobeFilter] = useState<GlobeFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [expandedBerId, setExpandedBerId] = useState<string | null>(null);

  const years = useMemo(() => {
    const out: string[] = [];
    for (let y = berData.period.start; y <= berData.period.end; y++) out.push(String(y));
    return out;
  }, [berData.period.start, berData.period.end]);

  const targetById = useMemo(() => {
    const m = new Map<string, Target>();
    for (const t of targets) m.set(t.id, t);
    return m;
  }, [targets]);

  const globeCatById = useMemo(() => {
    const m = new Map<string, GlobeCategory>();
    for (const c of globeCategories) m.set(c.id, c);
    return m;
  }, [globeCategories]);

  const globeSubById = useMemo(() => {
    const m = new Map<string, GlobeSubcategory>();
    for (const s of globeSubcategories) m.set(s.id, s);
    return m;
  }, [globeSubcategories]);

  const sectorById = useMemo(() => {
    const m = new Map<string, IpccSector>();
    for (const s of sectors) m.set(s.id, s);
    return m;
  }, [sectors]);

  const rows = useMemo<ProgramRow[]>(() => {
    const expByCode = new Map<string, Record<string, number | null>>();
    for (const e of berData.expenditure) expByCode.set(e.code, e.values);

    // Pre-bucket classifications by targetId for cheap lookup.
    const classByTarget = new Map<string, ThematicClassification[]>();
    for (const c of classifications) {
      if (!c.targetId.startsWith("BER_")) continue;
      const list = classByTarget.get(c.targetId) ?? [];
      list.push(c);
      classByTarget.set(c.targetId, list);
    }

    // Pre-bucket alignments by BER program id.
    const alignByBer = new Map<string, AlignmentResult[]>();
    for (const a of budgetAlignment) {
      const berId = a.targetAId.startsWith("BER_")
        ? a.targetAId
        : a.targetBId.startsWith("BER_")
          ? a.targetBId
          : null;
      if (!berId) continue;
      const list = alignByBer.get(berId) ?? [];
      list.push(a);
      alignByBer.set(berId, list);
    }

    return berData.programs.map((program) => {
      const berId = `BER_${program.code}`;
      const values = expByCode.get(program.code) ?? {};
      const valuesByYear: Record<string, number | null> = {};
      for (const y of years) valuesByYear[y] = values[y] ?? null;
      const totalSpend = Object.values(valuesByYear).reduce<number>(
        (sum, v) => sum + (typeof v === "number" ? v : 0),
        0,
      );
      const hasSpend = Object.values(valuesByYear).some((v) => typeof v === "number");

      const records = classByTarget.get(berId) ?? [];
      const primaries = records.filter((c) => c.isPrimary);

      const globePrimaryRec = primaries.find((c) => c.taxonomyType === "globe");
      const sectorPrimaryRec = primaries.find((c) => c.taxonomyType === "sector");
      const globeSubPrimaryRecs = primaries.filter((c) => c.taxonomyType === "globe_sub");

      const globePrimary = globePrimaryRec
        ? {
            id: globePrimaryRec.categoryId,
            name: globeCatById.get(globePrimaryRec.categoryId)?.name ?? globePrimaryRec.categoryId,
            score: globePrimaryRec.score ?? 0,
            reasoning: globePrimaryRec.reasoning,
          }
        : null;

      const sectorPrimary = sectorPrimaryRec
        ? {
            id: sectorPrimaryRec.categoryId,
            name: sectorById.get(sectorPrimaryRec.categoryId)?.name ?? sectorPrimaryRec.categoryId,
            score: sectorPrimaryRec.score ?? 0,
          }
        : null;

      const globeSubPrimaries = globeSubPrimaryRecs.map((c) => ({
        id: c.categoryId,
        name: globeSubById.get(c.categoryId)?.name ?? c.categoryId,
        score: c.score ?? 0,
        reasoning: c.reasoning,
      }));

      const alignments = alignByBer.get(berId) ?? [];
      const sortedAlignments = [...alignments].sort(
        (a, b) => (ALIGNMENT_ORDER[a.alignment] ?? 99) - (ALIGNMENT_ORDER[b.alignment] ?? 99),
      );
      const alignedHighMedium = sortedAlignments.filter(
        (a) => a.alignment === "high" || a.alignment === "medium",
      );
      const alignedLow = sortedAlignments.filter((a) => a.alignment === "low");
      const topAligned =
        alignedHighMedium.length > 0 ? alignedHighMedium : alignedLow;

      return {
        program,
        berId,
        totalSpend,
        hasSpend,
        valuesByYear,
        globePrimary,
        globeSubPrimaries,
        sectorPrimary,
        alignedHighMedium,
        alignedLow,
        topAligned,
      } satisfies ProgramRow;
    });
  }, [
    berData.programs,
    berData.expenditure,
    classifications,
    budgetAlignment,
    globeCatById,
    globeSubById,
    sectorById,
    years,
  ]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (typeFilter !== "all") list = list.filter((r) => r.program.type === typeFilter);
    if (spendFilter === "with") list = list.filter((r) => r.hasSpend);
    if (spendFilter === "none") list = list.filter((r) => !r.hasSpend);
    if (globeFilter === "classified") list = list.filter((r) => r.globePrimary !== null);
    if (globeFilter === "unclassified") list = list.filter((r) => r.globePrimary === null);

    const sorted = [...list];
    if (sortKey === "spend") {
      sorted.sort((a, b) => b.totalSpend - a.totalSpend);
    } else if (sortKey === "code") {
      sorted.sort((a, b) => a.program.code.localeCompare(b.program.code));
    } else if (sortKey === "aligned") {
      sorted.sort((a, b) => b.alignedHighMedium.length - a.alignedHighMedium.length);
    }
    return sorted;
  }, [rows, typeFilter, spendFilter, globeFilter, sortKey]);

  const envCount = rows.filter((r) => r.program.type === "environmental").length;
  const nonEnvCount = rows.filter((r) => r.program.type === "non_environmental").length;

  const nonEnvBiodivCount = rows.filter(
    (r) => r.program.type === "non_environmental" && r.globePrimary !== null,
  ).length;

  const zeroSpendClassifiedCount = rows.filter(
    (r) => !r.hasSpend && r.globePrimary !== null,
  ).length;

  const unclassifiedCount = rows.filter((r) => r.globePrimary === null).length;

  const maxYearValue = useMemo(() => {
    let max = 0;
    for (const r of rows) {
      for (const v of Object.values(r.valuesByYear)) {
        if (typeof v === "number" && v > max) max = v;
      }
    }
    return max;
  }, [rows]);

  return (
    <div>
      {(nonEnvBiodivCount > 0 || zeroSpendClassifiedCount > 0 || unclassifiedCount > 0) && (
        <ul className="mb-4 space-y-1 text-xs text-[var(--undp-gray)]">
          {nonEnvBiodivCount > 0 && (
            <li>
              <span className="font-semibold text-[var(--undp-black)]">{nonEnvBiodivCount}</span>{" "}
              {t("summary.nonEnvBiodiv", { count: nonEnvBiodivCount })}
            </li>
          )}
          {zeroSpendClassifiedCount > 0 && (
            <li>
              <span className="font-semibold text-[var(--undp-black)]">
                {zeroSpendClassifiedCount}
              </span>{" "}
              {t("summary.zeroSpendClassified", {
                count: zeroSpendClassifiedCount,
                period: periodLabel,
              })}
            </li>
          )}
          {unclassifiedCount > 0 && (
            <li>
              <span className="font-semibold text-[var(--undp-black)]">{unclassifiedCount}</span>{" "}
              {t("summary.unclassified", { count: unclassifiedCount })}
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-4 mb-3 text-xs">
        <FilterGroup
          label={t("filters.type.label")}
          value={typeFilter}
          options={[
            { v: "all", label: t("filters.type.all") },
            { v: "environmental", label: t("filters.type.environmental", { count: envCount }) },
            {
              v: "non_environmental",
              label: t("filters.type.nonEnvironmental", { count: nonEnvCount }),
            },
          ]}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
        />
        <FilterGroup
          label={t("filters.spend.label")}
          value={spendFilter}
          options={[
            { v: "all", label: t("filters.spend.all") },
            { v: "with", label: t("filters.spend.with") },
            { v: "none", label: t("filters.spend.none") },
          ]}
          onChange={(v) => setSpendFilter(v as SpendFilter)}
        />
        <FilterGroup
          label={t("filters.biodiversity.label")}
          value={globeFilter}
          options={[
            { v: "all", label: t("filters.biodiversity.all") },
            { v: "classified", label: t("filters.biodiversity.classified") },
            { v: "unclassified", label: t("filters.biodiversity.unclassified") },
          ]}
          onChange={(v) => setGlobeFilter(v as GlobeFilter)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-200 text-[var(--undp-gray)]">
              <th className="text-left py-2 pr-3 font-medium w-[38%]">
                <SortButton
                  active={sortKey === "code"}
                  onClick={() => setSortKey("code")}
                >
                  {t("columns.program")}
                </SortButton>
              </th>
              <th className="text-right py-2 px-3 font-medium">
                <SortButton
                  active={sortKey === "spend"}
                  onClick={() => setSortKey("spend")}
                >
                  {t("columns.spend", { period: periodLabel })}
                </SortButton>
              </th>
              <th className="text-left py-2 px-3 font-medium">{t("columns.globePrimary")}</th>
              <th className="text-left py-2 px-3 font-medium">{t("columns.ipccSector")}</th>
              <th className="text-right py-2 px-3 font-medium">
                <SortButton
                  active={sortKey === "aligned"}
                  onClick={() => setSortKey("aligned")}
                >
                  {t("columns.alignedTargets")}
                </SortButton>
              </th>
              <th className="w-6" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <ProgramRowView
                key={row.berId}
                row={row}
                years={years}
                maxYearValue={maxYearValue}
                expanded={expandedBerId === row.berId}
                onToggle={() =>
                  setExpandedBerId(expandedBerId === row.berId ? null : row.berId)
                }
                formatMoney={formatMoney}
                targetById={targetById}
              />
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-[var(--undp-gray)]">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function FilterGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[var(--undp-gray)]">{label}:</span>
      <div className="flex gap-1">
        {options.map((o) => (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            aria-pressed={value === o.v}
            className={`px-2 py-0.5 rounded-full border transition-colors ${
              value === o.v
                ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                : "bg-white text-[var(--undp-gray)] border-gray-200 hover:border-gray-300"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`uppercase tracking-wide ${
        active ? "text-[var(--undp-black)]" : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
      }`}
    >
      {children} {active ? "\u2193" : ""}
    </button>
  );
}

function ProgramRowView({
  row,
  years,
  maxYearValue,
  expanded,
  onToggle,
  formatMoney,
  targetById,
}: {
  row: ProgramRow;
  years: string[];
  maxYearValue: number;
  expanded: boolean;
  onToggle: () => void;
  formatMoney: (v: number) => string;
  targetById: Map<string, Target>;
}) {
  const t = useTranslations("viz.programDetailTable");
  const typeBadgeClass =
    row.program.type === "environmental"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : "bg-amber-50 text-amber-800 border-amber-200";

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2 pr-3 align-top">
          <div className="flex items-start gap-2">
            <span className="font-mono text-[var(--undp-gray)] text-[10px] mt-0.5">
              {row.program.code}
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[var(--undp-black)] font-medium">
                  {row.program.name}
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full border ${typeBadgeClass}`}
                >
                  {t(`programType.${row.program.type}`)}
                </span>
              </div>
            </div>
          </div>
        </td>
        <td className="py-2 px-3 align-top text-right">
          {row.hasSpend ? (
            <div>
              <div className="text-[var(--undp-black)] font-semibold">
                {formatMoney(row.totalSpend)}
              </div>
              <YearSparkline
                values={row.valuesByYear}
                years={years}
                max={maxYearValue}
              />
            </div>
          ) : (
            <span className="text-[var(--undp-gray)]">{t("noSpendRecorded")}</span>
          )}
        </td>
        <td className="py-2 px-3 align-top">
          {row.globePrimary ? (
            <CategoryChip
              id={row.globePrimary.id.replace(/^globe_/, "")}
              name={row.globePrimary.name}
              score={row.globePrimary.score}
            />
          ) : (
            <span className="text-[var(--undp-gray)] italic">{t("notClassified")}</span>
          )}
        </td>
        <td className="py-2 px-3 align-top">
          {row.sectorPrimary ? (
            <CategoryChip
              id={row.sectorPrimary.id.replace(/^sector_/, "")}
              name={row.sectorPrimary.name}
              score={row.sectorPrimary.score}
            />
          ) : (
            <span className="text-[var(--undp-gray)] italic">{t("notClassified")}</span>
          )}
        </td>
        <td className="py-2 px-3 align-top text-right">
          <span className="text-[var(--undp-black)] font-medium">
            {row.alignedHighMedium.length}
          </span>
          {row.alignedHighMedium.length > 0 && (
            <span className="text-[var(--undp-gray)] ml-1">
              {t("highCount", {
                count: row.alignedHighMedium.filter((a) => a.alignment === "high").length,
              })}
            </span>
          )}
        </td>
        <td className="py-2 pl-1 pr-2 align-top text-[var(--undp-gray)]">
          {expanded ? "\u25BE" : "\u25B8"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-gray-100 bg-gray-50">
          <td colSpan={6} className="py-4 px-4">
            <ProgramExpand row={row} targetById={targetById} />
          </td>
        </tr>
      )}
    </>
  );
}

function CategoryChip({
  id,
  name,
  score,
}: {
  id: string;
  name: string;
  score: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-gray-200 bg-white text-[var(--undp-black)]">
      <span className="font-mono text-[10px] text-[var(--undp-gray)]">{id}</span>
      <span>{name}</span>
      <span className="text-[10px] text-[var(--undp-gray)]">({score.toFixed(1)})</span>
    </span>
  );
}

function YearSparkline({
  values,
  years,
  max,
}: {
  values: Record<string, number | null>;
  years: string[];
  max: number;
}) {
  const t = useTranslations("viz.programDetailTable");
  const safeMax = max > 0 ? max : 1;
  return (
    <div className="flex items-end gap-0.5 h-4 mt-1 justify-end">
      {years.map((y) => {
        const v = values[y];
        const hasValue = typeof v === "number";
        const height = hasValue ? Math.max(1, (v / safeMax) * 14) : 0;
        return (
          <div
            key={y}
            title={`${y}: ${hasValue ? v : t("noData")}`}
            className="w-1.5 bg-emerald-500/70 rounded-sm"
            style={{ height: `${height}px`, opacity: hasValue ? 1 : 0.1 }}
          />
        );
      })}
    </div>
  );
}

function ProgramExpand({
  row,
  targetById,
}: {
  row: ProgramRow;
  targetById: Map<string, Target>;
}) {
  const t = useTranslations("viz.programDetailTable");
  const alignmentLabels = useAlignmentLabels();
  const topAligned = row.topAligned.slice(0, 3);
  const fallbackToLow = row.alignedHighMedium.length === 0 && row.alignedLow.length > 0;

  return (
    <div className="grid grid-cols-12 gap-6 text-xs">
      <div className="col-span-12 md:col-span-5">
        <h4 className="uppercase tracking-wide text-[var(--undp-gray)] text-[10px]">
          {t("expand.description")}
        </h4>
        <p className="text-[var(--undp-black)] mt-1">{row.program.description}</p>

        {row.globeSubPrimaries.length > 0 && (
          <div className="mt-4">
            <h4 className="uppercase tracking-wide text-[var(--undp-gray)] text-[10px]">
              {t("expand.globeSubcategories")}
            </h4>
            <ul className="mt-1 space-y-1">
              {row.globeSubPrimaries.map((s) => (
                <li key={s.id} className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-[var(--undp-gray)] mt-0.5">
                    {s.id}
                  </span>
                  <span className="text-[var(--undp-black)]">{s.name}</span>
                  <span className="text-[10px] text-[var(--undp-gray)]">
                    ({s.score.toFixed(1)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {row.globePrimary?.reasoning && (
          <div className="mt-4">
            <h4 className="uppercase tracking-wide text-[var(--undp-gray)] text-[10px]">
              {t("expand.aiReasoning")}
            </h4>
            <p className="text-[var(--undp-black)] mt-1 italic">
              {row.globePrimary.reasoning}
            </p>
          </div>
        )}
      </div>

      <div className="col-span-12 md:col-span-7">
        <h4 className="uppercase tracking-wide text-[var(--undp-gray)] text-[10px]">
          {fallbackToLow ? t("expand.thematicallyRelated") : t("expand.topAligned")}
        </h4>
        {fallbackToLow && (
          <p className="text-[var(--undp-gray)] mt-0.5 text-[10px]">
            {t("expand.fallbackNote")}
          </p>
        )}
        {topAligned.length === 0 ? (
          <p className="text-[var(--undp-gray)] mt-1 italic">
            {t("expand.noAlignment")}
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {topAligned.map((a) => {
              const otherId = otherSide(a, row.berId);
              const target = otherId ? targetById.get(otherId) : null;
              const chipClass =
                a.alignment === "high"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : a.alignment === "medium"
                    ? "bg-sky-50 text-sky-800 border-sky-200"
                    : "bg-gray-50 text-gray-600 border-gray-200";
              return (
                <li key={`${a.targetAId}-${a.targetBId}`} className="border-l-2 border-[var(--undp-blue)] pl-3">
                  <div className="flex items-center gap-2 text-[10px] text-[var(--undp-gray)]">
                    <span className={`px-1.5 py-0.5 rounded-full border ${chipClass}`}>
                      {alignmentLabels[a.alignment]}
                    </span>
                    <span className="font-mono">{otherId}</span>
                    {target?.sourceDocument && (
                      <span className="uppercase">{target.sourceDocument}</span>
                    )}
                  </div>
                  {target && (
                    <p className="text-[var(--undp-black)] mt-1">
                      {target.text.length > 240
                        ? target.text.slice(0, 237) + "..."
                        : target.text}
                    </p>
                  )}
                  <p className="text-[var(--undp-gray)] mt-1 italic">
                    {a.description}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
