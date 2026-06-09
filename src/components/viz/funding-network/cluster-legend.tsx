"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ClusterMeta } from "./use-cluster-network-data";

// Magnitude prefix only — currency/unit comes from the parent via unitLabel.
function formatAmount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}T`;
  if (value >= 1) return `${value.toFixed(1)}B`;
  return `${(value * 1000).toFixed(0)}M`;
}

interface ClusterLegendProps {
  clusters: ClusterMeta[];
  highlightedCluster: string | null;
  /** Pre-formatted unit + currency, e.g. "billion MNT" */
  unitLabel: string;
  onHover?: (id: string | null) => void;
}

export function ClusterLegend({
  clusters,
  highlightedCluster,
  unitLabel,
  onHover,
}: ClusterLegendProps) {
  const t = useTranslations("viz.fundingNetwork");
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1.5 mb-3">
      {clusters.map((c) => {
        const dimmed = highlightedCluster !== null && highlightedCluster !== c.id;
        return (
          <div
            key={c.id}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] transition-opacity cursor-default ${
              dimmed ? "opacity-30" : "opacity-100"
            } ${c.type === "unfunded" ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}
            onMouseEnter={() => onHover?.(c.id)}
            onMouseLeave={() => onHover?.(null)}
          >
            <span
              className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: c.color }}
            />
            <span className="font-semibold text-[var(--undp-black)] truncate max-w-[140px]">
              {c.type === "unfunded" ? t("noBudgetBacking") : c.label}
            </span>
            <span className="text-[var(--undp-gray)]">
              {t("targetCount", { count: c.targetCount })}
            </span>
            {c.latestAmount != null && (
              <span className="text-[var(--undp-gray)]">
                · {formatAmount(c.latestAmount)} {unitLabel}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
