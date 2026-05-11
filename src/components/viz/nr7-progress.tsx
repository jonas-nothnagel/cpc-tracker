"use client";

import { useState, useMemo } from "react";
import { InfoBox } from "@/components/ui/info-box";
import { DataProvenance } from "@/components/ui/data-provenance";
import type { Nr7Data, Nr7ProgressItem, AlignmentResult, Target, AlignmentLevel } from "@/types";

const NR7_COLORS: Record<string, string> = {
  on_track: "#16a34a",
  limited: "#d97706",
  no_progress: "#dc2626",
  unknown: "#9ca3af",
};
const NR7_LABELS: Record<string, string> = {
  on_track: "On track",
  limited: "Limited progress",
  no_progress: "No progress",
  unknown: "Unknown",
};
const STATUS_ORDER = ["on_track", "limited", "no_progress", "unknown"] as const;

/* ------------------------------------------------------------------ */
/*  Target card                                                        */
/* ------------------------------------------------------------------ */

const POSITIVE_LEVELS = new Set<AlignmentLevel>(["low", "medium", "high"]);

function Nr7TargetCard({
  item,
  isExpanded,
  onToggle,
  statusColor,
  ndcAlignmentCount,
}: {
  item: Nr7ProgressItem;
  isExpanded: boolean;
  onToggle: () => void;
  statusColor: string;
  ndcAlignmentCount?: number;
}) {
  const displayLabel = item.nbsapTargetId
    ? `NBSAP ${item.nbsapTargetId.replace("NBT_", "")}`
    : item.targetId;
  const hasDetail = item.progressSummary || item.challenges || item.examples;
  const cleanSummary = item.progressSummary?.replace(/\n/g, " ") ?? null;

  return (
    <div
      className={`rounded-lg border transition-colors overflow-hidden ${
        isExpanded
          ? "bg-white border-gray-200 shadow-sm"
          : "bg-[var(--undp-light)] border-gray-100"
      }`}
      style={{ borderLeftWidth: "3px", borderLeftColor: statusColor }}
    >
      <button
        type="button"
        onClick={() => hasDetail && onToggle()}
        aria-expanded={hasDetail ? isExpanded : undefined}
        className={`w-full text-left px-4 py-3 ${
          hasDetail ? "cursor-pointer" : "cursor-default"
        }`}
      >
        {/* Row 1: target ID + target text */}
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-xs font-semibold text-[var(--undp-black)] bg-gray-100 rounded px-1.5 py-0.5 shrink-0">
            {displayLabel}
          </span>
          <span className="text-xs text-[var(--undp-black)] leading-relaxed line-clamp-2 min-w-0">
            {item.targetText}
          </span>
          {hasDetail && (
            <span className="text-[10px] text-[var(--undp-gray)] shrink-0 mt-0.5">
              {isExpanded ? "▾" : "▸"}
            </span>
          )}
        </div>

        {/* Row 2: inline progress preview (hidden when expanded) */}
        {cleanSummary && !isExpanded && (
          <p className="text-[11px] text-[var(--undp-gray)] leading-relaxed mt-1.5 line-clamp-2">
            {cleanSummary}
          </p>
        )}

        {/* Expand hint */}
        {hasDetail && !isExpanded && (
          <span className="text-[10px] text-[var(--undp-blue)] mt-1.5 inline-flex items-center gap-1 opacity-60">
            View details ▸
          </span>
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && hasDetail && (
        <div className="px-4 pb-3 pt-0 border-t border-gray-50 text-xs text-[var(--undp-gray)] space-y-2">
          {item.progressSummary && (
            <div>
              <span className="font-medium text-[var(--undp-black)]">Progress: </span>
              {item.progressSummary.replace(/\n/g, " ")}
            </div>
          )}
          {item.challenges && (
            <div>
              <span className="font-medium text-[var(--undp-black)]">Challenges: </span>
              {item.challenges}
            </div>
          )}
          {item.examples && (
            <div>
              <span className="font-medium text-[var(--undp-black)]">Examples: </span>
              {item.examples.replace(/\n/g, " ")}
            </div>
          )}
          {ndcAlignmentCount != null && ndcAlignmentCount > 0 && (
            <div className="flex items-center gap-1.5 pt-1">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0468b1] bg-blue-50 rounded px-2 py-0.5">
                ↔ Aligns with {ndcAlignmentCount} NDC target{ndcAlignmentCount !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function Nr7Progress({
  nr7Data,
  alignmentData,
  targets,
}: {
  nr7Data: Nr7Data;
  alignmentData?: AlignmentResult[];
  targets?: Target[];
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  /* Group items by status */
  const groupedItems = useMemo(() => {
    const groups = new Map<string, Nr7ProgressItem[]>();
    for (const status of STATUS_ORDER) {
      const items = nr7Data.progressItems.filter((p) => p.progressStatus === status);
      if (items.length > 0) groups.set(status, items);
    }
    return groups;
  }, [nr7Data.progressItems]);

  /* Counts + percentages for the stacked bar */
  const statusCounts = useMemo(() => {
    const total = nr7Data.progressItems.length;
    return STATUS_ORDER.map((status) => {
      const count = nr7Data.progressItems.filter((p) => p.progressStatus === status).length;
      return { status, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 };
    }).filter((s) => s.count > 0);
  }, [nr7Data.progressItems]);

  /* Count NDC alignment pairs per NBSAP target */
  const ndcAlignmentCounts = useMemo(() => {
    if (!alignmentData || !targets) return new Map<string, number>();
    const ndcIds = new Set(targets.filter((t) => t.sourceDocument === "NDC").map((t) => t.id));
    const nbsapIds = new Set(targets.filter((t) => t.sourceDocument === "NBSAP").map((t) => t.id));
    const counts = new Map<string, number>();
    for (const pair of alignmentData) {
      if (!POSITIVE_LEVELS.has(pair.alignment)) continue;
      if (nbsapIds.has(pair.targetAId) && ndcIds.has(pair.targetBId)) {
        counts.set(pair.targetAId, (counts.get(pair.targetAId) ?? 0) + 1);
      } else if (nbsapIds.has(pair.targetBId) && ndcIds.has(pair.targetAId)) {
        counts.set(pair.targetBId, (counts.get(pair.targetBId) ?? 0) + 1);
      }
    }
    return counts;
  }, [alignmentData, targets]);

  const toggleGroup = (status: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const scrollToGroup = (status: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      next.add(status);
      return next;
    });
    requestAnimationFrame(() => {
      document.getElementById(`nr7-group-${status}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-3">
        <h3 className="text-base font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
          NBSAP Progress
          <InfoBox>
            Progress data from the 7th National Report to the Convention on Biological Diversity (CBD).{" "}
            Each national biodiversity target is assessed as on track,{" "}
            limited progress, or no progress based on reported
            implementation status.
          </InfoBox>
          <DataProvenance
            origin="user-uploaded"
            sources={[
              {
                label: "7th National Report to the CBD",
                citation: nr7Data.reportingPeriod
                  ? `NR7 (${nr7Data.reportingPeriod})`
                  : undefined,
              },
            ]}
            caveat="Progress status (on track / limited / no progress) is reported by the country in the NR7 narrative. The tool does not independently verify implementation."
          />
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mt-0.5">
          {nr7Data.progressItems.length} national biodiversity targets from the 7th National Report to the CBD
          {nr7Data.reportingPeriod ? ` (${nr7Data.reportingPeriod})` : ""}
        </p>
      </div>
          {/* ── Stacked progress bar ── */}
          <div className="mb-6">
            <div className="flex h-8 rounded-lg overflow-hidden border border-gray-100">
              {statusCounts.map(({ status, count, percentage }) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => scrollToGroup(status)}
                  className="relative flex items-center justify-center transition-opacity hover:opacity-85 cursor-pointer"
                  style={{
                    width: `${percentage}%`,
                    backgroundColor: NR7_COLORS[status],
                    minWidth: count > 0 ? "2rem" : 0,
                  }}
                  title={`${NR7_LABELS[status]}: ${count} target${count !== 1 ? "s" : ""} (${percentage}%)`}
                >
                  {percentage >= 15 && (
                    <span className="text-white text-xs font-semibold">{count}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5">
              {statusCounts.map(({ status, count, percentage }) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => scrollToGroup(status)}
                  className="flex items-center gap-1.5 text-xs hover:underline cursor-pointer"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: NR7_COLORS[status] }}
                  />
                  <span className="font-semibold text-[var(--undp-black)]">{count}</span>
                  <span className="text-[var(--undp-gray)]">
                    {NR7_LABELS[status]} ({percentage}%)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Status groups ── */}
          {STATUS_ORDER.filter((s) => groupedItems.has(s)).map((status) => {
            const items = groupedItems.get(status)!;
            const isGroupExpanded = expandedGroups.has(status);

            return (
              <div key={status} id={`nr7-group-${status}`} className="mb-4">
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(status)}
                  aria-expanded={isGroupExpanded}
                  className="w-full flex items-center gap-3 py-2 group cursor-pointer"
                >
                  <span
                    className="w-1 h-6 rounded-full shrink-0"
                    style={{ backgroundColor: NR7_COLORS[status] }}
                  />
                  <span className="text-sm font-semibold text-[var(--undp-black)]">
                    {NR7_LABELS[status]}
                  </span>
                  <span className="text-sm text-[var(--undp-gray)]">
                    ({items.length} target{items.length !== 1 ? "s" : ""})
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[11px] text-[var(--undp-gray)] group-hover:text-[var(--undp-blue)] transition-colors">
                    {isGroupExpanded ? "Hide" : "See details"}
                    <span className={`transition-transform ${isGroupExpanded ? "rotate-180" : ""}`}>▾</span>
                  </span>
                </button>

                {/* Target cards */}
                {isGroupExpanded && (
                  <div className="grid gap-2 ml-3 mt-1">
                    {items.map((item) => (
                      <Nr7TargetCard
                        key={item.targetId}
                        item={item}
                        isExpanded={expandedItem === item.targetId}
                        onToggle={() =>
                          setExpandedItem(expandedItem === item.targetId ? null : item.targetId)
                        }
                        statusColor={NR7_COLORS[status]}
                        ndcAlignmentCount={ndcAlignmentCounts.get(item.nbsapTargetId ?? item.targetId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
    </div>
  );
}
