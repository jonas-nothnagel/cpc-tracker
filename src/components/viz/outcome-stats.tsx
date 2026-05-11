"use client";

import { useState } from "react";
import { getDocColor, getDocFullLabel, getDocLabel } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type { CountryConfig, Target } from "@/types";

interface OutcomeStatCardProps {
  percentage: number;
  label: string;
  targets: Target[];
  countryConfig?: CountryConfig | null;
}

function OutcomeStatCard({ percentage, label, targets, countryConfig }: OutcomeStatCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isClickable = targets.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => isClickable && setIsOpen(true)}
        className={`bg-[var(--undp-light)] border border-gray-100 rounded-lg p-5 text-left w-full transition-colors ${
          isClickable ? "hover:border-[var(--undp-blue)]/30 hover:bg-[var(--undp-blue)]/5 cursor-pointer" : "cursor-default"
        }`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)]">
          {label}
        </p>
        <p className="text-3xl font-medium text-[var(--undp-blue)] tabular-nums mt-1">
          {percentage}%
        </p>
        <p className="text-xs text-[var(--undp-gray)] mt-0.5">
          of targets
        </p>
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={`${label} (${targets.length})`}
        maxWidth="max-w-xl"
      >
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
      </Modal>
    </>
  );
}

interface OutcomeStatsProps {
  quantitativeTargets: Target[];
  timeBoundTargets: Target[];
  totalTargets: number;
  /**
   * Third tile: category coverage for the active taxonomy view. `primary` is
   * the headline value (e.g. "4 of 7"); `secondary` replaces the "of targets"
   * footer to carry the classification-completeness sub-stat.
   */
  coverageStat?: { primary: string; secondary: string; label: string };
  countryConfig?: CountryConfig | null;
}

function CoverageStatCard({
  primary, secondary, label,
}: { primary: string; secondary: string; label: string }) {
  return (
    <div className="bg-[var(--undp-light)] border border-gray-100 rounded-lg p-5 w-full">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)]">
        {label}
      </p>
      <p className="text-3xl font-medium text-[var(--undp-blue)] tabular-nums mt-1">
        {primary}
      </p>
      <p className="text-xs text-[var(--undp-gray)] mt-0.5">
        {secondary}
      </p>
    </div>
  );
}

export function OutcomeStats({
  quantitativeTargets,
  timeBoundTargets,
  totalTargets,
  coverageStat,
  countryConfig,
}: OutcomeStatsProps) {
  const quantitativePct = Math.round((quantitativeTargets.length / totalTargets) * 100);
  const timeBoundPct = Math.round((timeBoundTargets.length / totalTargets) * 100);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <OutcomeStatCard
        percentage={quantitativePct}
        label="Measurable outcomes"
        targets={quantitativeTargets}
        countryConfig={countryConfig}
      />
      <OutcomeStatCard
        percentage={timeBoundPct}
        label="Time-bound commitments"
        targets={timeBoundTargets}
        countryConfig={countryConfig}
      />
      {coverageStat && (
        <CoverageStatCard
          primary={coverageStat.primary}
          secondary={coverageStat.secondary}
          label={coverageStat.label}
        />
      )}
    </div>
  );
}
