"use client";

import { useState } from "react";
import { getDocColor, getDocFullLabel, getDocLabel } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type { CountryConfig, Target, PolicyDocumentType } from "@/types";

interface StatCardProps {
  value: number;
  label: string;
  color: string;
  targets?: Target[];
  countryConfig?: CountryConfig | null;
}

function StatCard({ value, label, color, targets, countryConfig }: StatCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isClickable = targets && targets.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => isClickable && setIsOpen(true)}
        className={`bg-[var(--undp-light)] border border-gray-100 p-5 text-left w-full h-full transition-colors ${
          isClickable ? "hover:bg-gray-200/60 cursor-pointer" : "cursor-default"
        }`}
      >
        <p className="text-2xl md:text-3xl font-medium tabular-nums" style={{ color }}>
          {value}
        </p>
        <p className="text-xs text-[var(--undp-gray)] mt-1 leading-snug">
          {label}
        </p>
        {isClickable && (
          <p className="text-[10px] text-[var(--undp-gray)]/70 mt-1">
            Click to view
          </p>
        )}
      </button>

      <Modal
        open={isOpen && !!targets}
        onClose={() => setIsOpen(false)}
        title={`${label} (${targets?.length ?? 0})`}
        maxWidth="max-w-xl"
      >
        {targets && (
          <ul className="divide-y divide-gray-50 px-5 py-2">
            {targets.map((t) => (
              <li key={t.id} className="py-3.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-none"
                    style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                    title={getDocFullLabel(countryConfig, t.sourceDocument)}
                  >
                    {getDocLabel(countryConfig, t.sourceDocument)}
                  </span>
                  <span className="text-xs font-medium text-[var(--undp-black)]">
                    {t.sourceLabel}
                  </span>
                </div>
                <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                  <TargetTextWithHighlights target={t} />
                </p>
                <ActivitiesActions target={t} />
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}


interface DashboardStatsProps {
  targets: Target[];
  alignmentCount: number;
  contradictionCount: number;
  countryConfig?: CountryConfig | null;
}

export function DashboardStats({
  targets,
  alignmentCount,
  contradictionCount,
  countryConfig,
}: DashboardStatsProps) {
  const targetsByDoc = new Map<PolicyDocumentType, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) || [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }

  const docTypes = Array.from(targetsByDoc.keys());
  const colCount = docTypes.length + 2;

  return (
    <section
      className="grid gap-3 mb-10"
      style={{
        gridTemplateColumns: `repeat(${Math.min(colCount, 6)}, minmax(0, 1fr))`,
      }}
    >
      <StatCard
        value={targets.length}
        label={`targets from ${docTypes.length} source${docTypes.length !== 1 ? "s" : ""}`}
        color="var(--undp-blue, #0468b1)"
        targets={targets}
        countryConfig={countryConfig}
      />
      {docTypes.map((docType) => {
        const docTargets = targetsByDoc.get(docType) ?? [];
        return (
          <StatCard
            key={docType}
            value={docTargets.length}
            label={getDocFullLabel(countryConfig, docType)}
            color={getDocColor(countryConfig, docType)}
            targets={docTargets}
            countryConfig={countryConfig}
          />
        );
      })}
      <StatCard
        value={alignmentCount}
        label="Alignment Opportunities"
        color="var(--chart-alignment, #196127)"
      />
      {contradictionCount > 0 && (
        <StatCard
          value={contradictionCount}
          label="Contradictions Found"
          color="#b91c1c"
        />
      )}
    </section>
  );
}
