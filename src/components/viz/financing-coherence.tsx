"use client";

import React, { useMemo, useState, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { InfoBox } from "@/components/ui/info-box";
import { Modal } from "@/components/ui/modal";
import { StatCard } from "@/components/viz/stat-card";
import { ALIGNMENT_COLORS, DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import type {
  AlignmentLevel,
  AlignmentResult,
  BerData,
  BerExpenditureSeries,
  Target,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const POSITIVE_LEVELS: AlignmentLevel[] = ["high", "medium", "low"];

function totalExpenditure(series: BerExpenditureSeries): number {
  return Object.values(series.values).reduce(
    (sum: number, v) => sum + (v ?? 0),
    0
  );
}

function latestExpenditure(
  series: BerExpenditureSeries,
  endYear: number
): number | null {
  return series.values[String(endYear)] ?? null;
}

function formatBillionMnt(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}T`;
  if (value >= 1) return `${value.toFixed(1)}B`;
  return `${(value * 1000).toFixed(0)}M`;
}

function alignmentBadgeColor(level: AlignmentLevel): string {
  return ALIGNMENT_COLORS[level] ?? "#94a3b8";
}

function alignmentLabel(level: AlignmentLevel): string {
  switch (level) {
    case "high":
      return "Strong";
    case "medium":
      return "Moderate";
    case "low":
      return "Emerging";
    case "none":
      return "None";
    case "low_tension":
      return "Low tension";
    case "moderate_contradiction":
      return "Moderate contradiction";
    case "high_contradiction":
      return "High contradiction";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinancingCoherenceProps {
  berData: BerData;
  budgetAlignment: AlignmentResult[];
  budgetPseudoTargets: Target[];
  targets: Target[];
}

interface TargetBacking {
  target: Target;
  totalBacking: number;
  alignedPrograms: {
    code: string;
    name: string;
    level: AlignmentLevel;
    amount: number;
    description: string;
  }[];
}

interface ProgramDetail {
  code: string;
  name: string;
  latestAmount: number | null;
  totalAmount: number;
  type: string;
  alignedTargets: {
    target: Target;
    level: AlignmentLevel;
    description: string;
  }[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FinancingCoherence({
  berData,
  budgetAlignment,
  budgetPseudoTargets,
  targets,
}: FinancingCoherenceProps) {
  const [selectedTarget, setSelectedTarget] = useState<TargetBacking | null>(
    null
  );
  const [selectedProgram, setSelectedProgram] = useState<ProgramDetail | null>(
    null
  );

  const endYear = berData.period.end;

  // Build expenditure lookup
  const expByCode = useMemo(() => {
    const map = new Map<string, BerExpenditureSeries>();
    for (const e of berData.expenditure) {
      map.set(e.code, e);
    }
    return map;
  }, [berData.expenditure]);

  // Build target lookup
  const targetById = useMemo(() => {
    const map = new Map<string, Target>();
    for (const t of targets) map.set(t.id, t);
    return map;
  }, [targets]);

  // Build program name lookup from pseudo-targets
  const programNameByBerId = useMemo(() => {
    const map = new Map<string, { code: string; name: string }>();
    for (const pt of budgetPseudoTargets) {
      const code = pt.id.replace("BER_", "");
      map.set(pt.id, { code, name: pt.sourceLabel });
    }
    return map;
  }, [budgetPseudoTargets]);

  // --- Stats ---
  const stats = useMemo(() => {
    // Total latest-year environmental expenditure
    const envCodes = new Set(
      berData.programs
        .filter((p) => p.type === "environmental")
        .map((p) => p.code)
    );
    let totalEnvLatest = 0;
    for (const e of berData.expenditure) {
      if (envCodes.has(e.code)) {
        totalEnvLatest += latestExpenditure(e, endYear) ?? 0;
      }
    }

    // Zero-allocation programs
    const zeroPrograms = berData.programs.filter((p) => {
      const exp = expByCode.get(p.code);
      if (!exp) return true;
      return !Object.values(exp.values).some((v) => v !== null && v > 0);
    });

    return {
      totalEnvLatest,
      gap: berData.keyFindings?.gap ?? null,
      gapPeriod: berData.keyFindings?.programPeriod ?? "",
      zeroCount: zeroPrograms.length,
      zeroPrograms,
    };
  }, [berData, endYear, expByCode]);

  // --- Expenditure trend data for bar chart ---
  const trendData = useMemo(() => {
    const years = [];
    for (let y = berData.period.start; y <= berData.period.end; y++) {
      years.push(String(y));
    }

    return years.map((year) => {
      let env = 0;
      let nonEnv = 0;
      const envCodes = new Set(
        berData.programs
          .filter((p) => p.type === "environmental")
          .map((p) => p.code)
      );
      for (const e of berData.expenditure) {
        const val = e.values[year] ?? 0;
        if (envCodes.has(e.code)) {
          env += val;
        } else {
          nonEnv += val;
        }
      }
      return { year, environmental: +env.toFixed(1), nonEnvironmental: +nonEnv.toFixed(1) };
    });
  }, [berData]);

  // --- Target financing signal ---
  const targetBackings = useMemo(() => {
    const backingMap = new Map<string, TargetBacking>();

    for (const t of targets) {
      backingMap.set(t.id, {
        target: t,
        totalBacking: 0,
        alignedPrograms: [],
      });
    }

    for (const ar of budgetAlignment) {
      // targetAId = policy target, targetBId = BER program
      const backing = backingMap.get(ar.targetAId);
      if (!backing) continue;

      if (!POSITIVE_LEVELS.includes(ar.alignment)) continue;

      const progInfo = programNameByBerId.get(ar.targetBId);
      if (!progInfo) continue;

      const exp = expByCode.get(progInfo.code);
      const amount = exp ? (latestExpenditure(exp, endYear) ?? 0) : 0;

      backing.alignedPrograms.push({
        code: progInfo.code,
        name: progInfo.name,
        level: ar.alignment,
        amount,
        description: ar.description,
      });
      backing.totalBacking += amount;
    }

    return Array.from(backingMap.values()).sort(
      (a, b) => b.totalBacking - a.totalBacking
    );
  }, [targets, budgetAlignment, programNameByBerId, expByCode, endYear]);

  // --- Target chart data (top backed + zero backed) ---
  const targetChartData = useMemo(() => {
    // Show top 15 backed + all zero-backed
    const backed = targetBackings.filter((tb) => tb.totalBacking > 0).slice(0, 15);
    const zeroBacked = targetBackings.filter(
      (tb) => tb.totalBacking === 0
    );
    return { backed, zeroBacked };
  }, [targetBackings]);

  // --- Program details ---
  const programDetails = useMemo(() => {
    const details: ProgramDetail[] = [];

    for (const prog of berData.programs) {
      const exp = expByCode.get(prog.code);
      const berId = `BER_${prog.code}`;

      const alignedTargets: ProgramDetail["alignedTargets"] = [];
      for (const ar of budgetAlignment) {
        if (ar.targetBId !== berId) continue;
        if (!POSITIVE_LEVELS.includes(ar.alignment)) continue;
        const t = targetById.get(ar.targetAId);
        if (!t) continue;
        alignedTargets.push({
          target: t,
          level: ar.alignment,
          description: ar.description,
        });
      }

      // Sort by alignment level strength
      const levelOrder: Record<string, number> = {
        high: 0,
        medium: 1,
        low: 2,
      };
      alignedTargets.sort(
        (a, b) =>
          (levelOrder[a.level] ?? 3) - (levelOrder[b.level] ?? 3)
      );

      details.push({
        code: prog.code,
        name: prog.name,
        latestAmount: exp ? latestExpenditure(exp, endYear) : null,
        totalAmount: exp ? totalExpenditure(exp) : 0,
        type: prog.type,
        alignedTargets,
      });
    }

    // Sort: programs with aligned targets first, then by latest amount
    details.sort((a, b) => {
      if (a.alignedTargets.length > 0 && b.alignedTargets.length === 0) return -1;
      if (a.alignedTargets.length === 0 && b.alignedTargets.length > 0) return 1;
      return (b.latestAmount ?? 0) - (a.latestAmount ?? 0);
    });

    return details;
  }, [berData.programs, budgetAlignment, expByCode, targetById, endYear]);

  const handleTargetClick = useCallback(
    (backing: TargetBacking) => {
      setSelectedTarget(backing);
    },
    []
  );

  const handleProgramClick = useCallback(
    (detail: ProgramDetail) => {
      setSelectedProgram(detail);
    },
    []
  );

  // Count targets with zero budget backing
  const zeroBackedCount = targetBackings.filter(
    (tb) => tb.totalBacking === 0
  ).length;

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--undp-black)]">
          Budget &amp; Financing Coherence
          <InfoBox>
            This section maps government budget programs from the Biodiversity
            Expenditure Review (BER) to policy targets using AI-assessed
            alignment. It shows whether policy commitments have corresponding
            budget allocations, and highlights opportunities where financing
            could be strengthened.
            <br />
            <br />
            <em>
              All monetary values in {berData.unit} {berData.currency}.
              Alignment assessed via LLM classification.
            </em>
          </InfoBox>
        </h2>
        <p className="text-sm text-[var(--undp-gray)] mt-0.5">
          Linking {berData.programs.length} budget programs to{" "}
          {targets.length} policy targets ({berData.period.start}&ndash;
          {berData.period.end}).
        </p>
      </div>

      {/* --- Stat Cards --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard
          label={`Environmental expenditure (${endYear})`}
          value={`${formatBillionMnt(stats.totalEnvLatest)} MNT`}
          sublabel={`${berData.unit} ${berData.currency}`}
          color="#059669"
        />
        {stats.gap !== null && (
          <StatCard
            label="NBSAP financing gap"
            value={`${formatBillionMnt(stats.gap)} MNT`}
            sublabel={stats.gapPeriod}
            color="#b45309"
          />
        )}
        <StatCard
          label="Targets without budget backing"
          value={zeroBackedCount}
          sublabel={`of ${targets.length} policy targets`}
          color={zeroBackedCount > 0 ? "#b45309" : "#059669"}
        />
      </div>

      {/* --- Expenditure Trend --- */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-[var(--undp-black)] mb-1">
          Expenditure Trend
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mb-3">
          Total government environmental and non-environmental expenditure by
          year.
        </p>
        <div className="flex flex-wrap gap-4 text-xs mb-3">
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: "#059669" }}
            />
            <span className="text-[var(--undp-gray)]">Environmental (714)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: "#94a3b8" }}
            />
            <span className="text-[var(--undp-gray)]">
              Non-environmental (817/822)
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={trendData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: "#64748b" }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: "#64748b" }}
              label={{
                value: `${berData.unit} ${berData.currency}`,
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 11, fill: "#94a3b8" },
              }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 6,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
              formatter={(value, name) => [
                `${Number(value).toFixed(1)}B MNT`,
                name === "environmental"
                  ? "Environmental"
                  : "Non-environmental",
              ]}
            />
            <Bar
              dataKey="environmental"
              stackId="a"
              fill="#059669"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="nonEnvironmental"
              stackId="a"
              fill="#94a3b8"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* --- Budget Programs with Aligned Targets --- */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-[var(--undp-black)] mb-1">
          Budget Programs
          <InfoBox>
            Each budget program is assessed for alignment with all policy
            targets. Programs shown here are sorted by the number of
            targets they align with. Click a program to see which targets
            it finances.
          </InfoBox>
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mb-3">
          Government budget programs and their alignment with policy targets.
        </p>
        <div className="space-y-2">
          {programDetails.map((prog) => (
            <button
              key={prog.code}
              className="w-full text-left border border-gray-200 rounded-md px-4 py-3 hover:border-gray-300 transition-colors duration-200"
              onClick={() => handleProgramClick(prog)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-mono text-[var(--undp-gray)] mr-2">
                    {prog.code}
                  </span>
                  <span className="text-sm font-medium text-[var(--undp-black)]">
                    {prog.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 ml-3 shrink-0">
                  {prog.latestAmount !== null && prog.latestAmount > 0 ? (
                    <span className="text-sm tabular-nums text-[var(--undp-black)]">
                      {prog.latestAmount.toFixed(1)}B
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--undp-gray)]">
                      No allocation
                    </span>
                  )}
                  {prog.alignedTargets.length > 0 ? (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: "#059669" }}
                    >
                      {prog.alignedTargets.length} target
                      {prog.alignedTargets.length !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-[var(--undp-gray)]">
                      No targets
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* --- Target Financing Signal --- */}
      <div className="mb-8">
        <h3 className="text-base font-semibold text-[var(--undp-black)] mb-1">
          Target Financing Signal
          <InfoBox>
            Shows the total budget backing for each policy target based on
            aligned budget programs. Targets at the top have the strongest
            financing signal. Targets with zero backing represent
            opportunities for increased financing alignment.
          </InfoBox>
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mb-3">
          Budget backing per policy target ({endYear}, {berData.unit}{" "}
          {berData.currency}).
        </p>

        {/* Backed targets chart */}
        {targetChartData.backed.length > 0 && (
          <ResponsiveContainer
            width="100%"
            height={Math.max(200, targetChartData.backed.length * 32 + 40)}
          >
            <BarChart
              data={targetChartData.backed.map((tb) => ({
                name:
                  tb.target.sourceLabel.length > 30
                    ? tb.target.sourceLabel.slice(0, 27) + "..."
                    : tb.target.sourceLabel,
                fullName: tb.target.sourceLabel,
                value: +tb.totalBacking.toFixed(1),
                docType: tb.target.sourceDocument,
                targetId: tb.target.id,
              }))}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={180}
                tick={{ fontSize: 11, fill: "#64748b" }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}B MNT`, "Budget backing"]}
                labelFormatter={(_label, payload) => {
                  if (payload?.[0]?.payload?.fullName) return payload[0].payload.fullName;
                  return String(_label);
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(_data, index) => {
                  const tb = targetChartData.backed[index];
                  if (tb) handleTargetClick(tb);
                }}
              >
                {targetChartData.backed.map((tb) => (
                  <Cell
                    key={tb.target.id}
                    fill={DOC_COLORS[tb.target.sourceDocument] ?? "#94a3b8"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Zero-backed targets callout */}
        {targetChartData.zeroBacked.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-amber-800 mb-2">
              {targetChartData.zeroBacked.length} target
              {targetChartData.zeroBacked.length !== 1 ? "s" : ""} without
              identified budget backing
            </p>
            <p className="text-xs text-amber-700 mb-2">
              These targets present opportunities for increased financing
              alignment.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {targetChartData.zeroBacked.slice(0, 20).map((tb) => (
                <button
                  key={tb.target.id}
                  className="text-xs px-2 py-1 rounded border border-amber-300 bg-white text-amber-800 hover:bg-amber-100 transition-colors"
                  onClick={() => handleTargetClick(tb)}
                  title={tb.target.text}
                >
                  <span
                    className="inline-block w-2 h-2 rounded-full mr-1"
                    style={{
                      backgroundColor:
                        DOC_COLORS[tb.target.sourceDocument] ?? "#94a3b8",
                    }}
                  />
                  {DOC_LABELS[tb.target.sourceDocument]}{" "}
                  {tb.target.sourceLabel}
                </button>
              ))}
              {targetChartData.zeroBacked.length > 20 && (
                <span className="text-xs text-amber-600 self-center">
                  +{targetChartData.zeroBacked.length - 20} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* --- Legend --- */}
      <div className="flex flex-wrap gap-4 text-xs mb-4">
        {(["high", "medium", "low"] as const).map((level) => (
          <div key={level} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: alignmentBadgeColor(level) }}
            />
            <span className="text-[var(--undp-gray)]">
              {alignmentLabel(level)} alignment
            </span>
          </div>
        ))}
      </div>

      {/* --- Target Detail Modal --- */}
      {selectedTarget && (
        <Modal
          open={!!selectedTarget}
          onClose={() => setSelectedTarget(null)}
          title={`${DOC_LABELS[selectedTarget.target.sourceDocument]} — ${selectedTarget.target.sourceLabel}`}
        >
          <p className="text-sm text-[var(--undp-gray)] mb-3">
            {selectedTarget.target.text}
          </p>
          {selectedTarget.alignedPrograms.length > 0 ? (
            <>
              <h4 className="text-sm font-semibold text-[var(--undp-black)] mb-2">
                Aligned Budget Programs
              </h4>
              <div className="space-y-2">
                {selectedTarget.alignedPrograms.map((ap) => (
                  <div
                    key={ap.code}
                    className="border border-gray-200 rounded-md px-3 py-2"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">
                        <span className="font-mono text-xs text-[var(--undp-gray)] mr-1">
                          {ap.code}
                        </span>
                        {ap.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs px-1.5 py-0.5 rounded text-white"
                          style={{
                            backgroundColor: alignmentBadgeColor(ap.level),
                          }}
                        >
                          {alignmentLabel(ap.level)}
                        </span>
                        {ap.amount > 0 && (
                          <span className="text-xs tabular-nums text-[var(--undp-gray)]">
                            {ap.amount.toFixed(1)}B MNT
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-[var(--undp-gray)]">
                      {ap.description}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No aligned budget programs identified. This target presents an
              opportunity for increased financing alignment.
            </p>
          )}
        </Modal>
      )}

      {/* --- Program Detail Modal --- */}
      {selectedProgram && (
        <Modal
          open={!!selectedProgram}
          onClose={() => setSelectedProgram(null)}
          title={`${selectedProgram.code} — ${selectedProgram.name}`}
        >
          <div className="flex gap-4 mb-3 text-sm">
            {selectedProgram.latestAmount !== null && (
              <div>
                <span className="text-[var(--undp-gray)]">
                  {endYear} expenditure:{" "}
                </span>
                <span className="font-medium">
                  {selectedProgram.latestAmount > 0
                    ? `${selectedProgram.latestAmount.toFixed(1)}B MNT`
                    : "No allocation"}
                </span>
              </div>
            )}
            <div>
              <span className="text-[var(--undp-gray)]">Total ({berData.period.start}&ndash;{berData.period.end}): </span>
              <span className="font-medium">
                {selectedProgram.totalAmount > 0
                  ? `${selectedProgram.totalAmount.toFixed(1)}B MNT`
                  : "No allocation"}
              </span>
            </div>
          </div>

          {selectedProgram.alignedTargets.length > 0 ? (
            <>
              <h4 className="text-sm font-semibold text-[var(--undp-black)] mb-2">
                Aligned Policy Targets ({selectedProgram.alignedTargets.length})
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {selectedProgram.alignedTargets.map((at) => (
                  <div
                    key={at.target.id}
                    className="border border-gray-200 rounded-md px-3 py-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs px-1.5 py-0.5 rounded text-white shrink-0"
                        style={{
                          backgroundColor:
                            DOC_COLORS[at.target.sourceDocument] ?? "#94a3b8",
                        }}
                      >
                        {DOC_LABELS[at.target.sourceDocument]}
                      </span>
                      <span className="text-sm font-medium">
                        {at.target.sourceLabel}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded text-white ml-auto shrink-0"
                        style={{
                          backgroundColor: alignmentBadgeColor(at.level),
                        }}
                      >
                        {alignmentLabel(at.level)}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--undp-gray)] mb-1 line-clamp-2">
                      {at.target.text}
                    </p>
                    <p className="text-xs text-[var(--undp-gray)] italic">
                      {at.description}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--undp-gray)] bg-gray-50 border border-gray-200 rounded px-3 py-2">
              No policy targets identified as aligned with this program.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
