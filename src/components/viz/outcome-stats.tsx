"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
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
        className={`bg-[var(--undp-light)] p-6 flex-1 flex flex-col items-center justify-center text-center w-full transition-colors ${
          isClickable ? "hover:bg-gray-200/60 cursor-pointer" : "cursor-default"
        }`}
      >
        <p className="text-4xl font-medium text-[var(--chart-ndc)] tabular-nums">
          {percentage}%
        </p>
        <p className="text-sm text-[var(--undp-gray)] mt-2">
          {label}
        </p>
        {isClickable && (
          <p className="text-[10px] text-[var(--undp-gray)]/70 mt-1">
            Click to view
          </p>
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-medium text-[var(--undp-black)]">
                {label} ({targets.length})
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-xl leading-none"
              >
                x
              </button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <ul className="space-y-3">
                {targets.map((t) => (
                  <li
                    key={t.id}
                    className="flex gap-3 text-sm py-2 border-b border-gray-50 last:border-0"
                  >
                    <span
                      className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                    >
                      {DOC_LABELS[t.sourceDocument]} {t.sourceLabel}
                    </span>
                    <span className="text-[var(--undp-black)] leading-relaxed">
                      <TargetTextWithHighlights target={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface OutcomeStatsProps {
  quantitativeTargets: Target[];
  timeBoundTargets: Target[];
  totalTargets: number;
}

export function OutcomeStats({
  quantitativeTargets,
  timeBoundTargets,
  totalTargets,
}: OutcomeStatsProps) {
  const quantitativePct = Math.round((quantitativeTargets.length / totalTargets) * 100);
  const timeBoundPct = Math.round((timeBoundTargets.length / totalTargets) * 100);

  return (
    <div className="flex flex-col gap-4">
      <OutcomeStatCard
        percentage={quantitativePct}
        label="of targets include measurable outcomes"
        targets={quantitativeTargets}
      />
      <OutcomeStatCard
        percentage={timeBoundPct}
        label="of targets include time-bound commitments"
        targets={timeBoundTargets}
      />
    </div>
  );
}
