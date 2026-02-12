"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import type { Target } from "@/types";

interface StatCardProps {
  value: number;
  label: string;
  colorClass: string;
  targets?: Target[];
}

function StatCard({ value, label, colorClass, targets }: StatCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  const isClickable = targets && targets.length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => isClickable && setIsOpen(true)}
        className={`bg-[var(--undp-light)] p-5 text-left w-full transition-colors ${
          isClickable ? "hover:bg-gray-200/60 cursor-pointer" : "cursor-default"
        }`}
      >
        <p className={`text-2xl md:text-3xl font-medium tabular-nums ${colorClass}`}>
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

      {isOpen && targets && (
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
                      {t.text}
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

interface DashboardStatsProps {
  totalTargets: number;
  nbtTargets: Target[];
  ndcTargets: Target[];
  napTargets: Target[];
  alignmentCount: number;
}

export function DashboardStats({
  totalTargets,
  nbtTargets,
  ndcTargets,
  napTargets,
  alignmentCount,
}: DashboardStatsProps) {
  const allTargets = [...nbtTargets, ...ndcTargets, ...napTargets];

  return (
    <section className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
      <div className="col-span-2 md:col-span-1">
        <StatCard
          value={totalTargets}
          label="targets from 3 sources"
          colorClass="text-[var(--undp-blue)]"
          targets={allTargets}
        />
      </div>
      <div>
        <StatCard
          value={nbtTargets.length}
          label="National Biodiversity Targets"
          colorClass="text-[var(--chart-nbt)]"
          targets={nbtTargets}
        />
      </div>
      <div>
        <StatCard
          value={ndcTargets.length}
          label="Nationally Determined Contributions"
          colorClass="text-[var(--chart-ndc)]"
          targets={ndcTargets}
        />
      </div>
      <div>
        <StatCard
          value={napTargets.length}
          label="National Adaptation Plan Targets"
          colorClass="text-[var(--chart-nap)]"
          targets={napTargets}
        />
      </div>
      <div>
        <StatCard
          value={alignmentCount}
          label="Alignment Opportunities"
          colorClass="text-[var(--undp-blue-light)]"
        />
      </div>
    </section>
  );
}
