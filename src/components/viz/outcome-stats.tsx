"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS, DOC_FULL_LABELS } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type { Target } from "@/types";

interface OutcomeStatCardProps {
  percentage: number;
  label: string;
  targets: Target[];
}

function OutcomeStatCard({ percentage, label, targets }: OutcomeStatCardProps) {
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
                  style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                  title={DOC_FULL_LABELS[t.sourceDocument]}
                >
                  {DOC_LABELS[t.sourceDocument]}
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
  /** Third tile: dynamic based on active view (NBS / IPCC / Themes) */
  mappedTargets?: { count: number; label: string };
}

export function OutcomeStats({
  quantitativeTargets,
  timeBoundTargets,
  totalTargets,
  mappedTargets,
}: OutcomeStatsProps) {
  const quantitativePct = Math.round((quantitativeTargets.length / totalTargets) * 100);
  const timeBoundPct = Math.round((timeBoundTargets.length / totalTargets) * 100);
  const mappedPct = mappedTargets ? Math.round((mappedTargets.count / totalTargets) * 100) : null;

  return (
    <div className="grid grid-cols-3 gap-4">
      <OutcomeStatCard
        percentage={quantitativePct}
        label="Measurable outcomes"
        targets={quantitativeTargets}
      />
      <OutcomeStatCard
        percentage={timeBoundPct}
        label="Time-bound commitments"
        targets={timeBoundTargets}
      />
      {mappedPct !== null && mappedTargets && (
        <OutcomeStatCard
          percentage={mappedPct}
          label={mappedTargets.label}
          targets={[]}
        />
      )}
    </div>
  );
}
