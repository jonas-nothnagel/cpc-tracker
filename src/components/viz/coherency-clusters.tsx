"use client";

import { useState, useMemo } from "react";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type {
  AlignmentResult,
  AlignmentLevel,
  Target,
  PolicyDocumentType,
  ThematicClassification,
  IpccSector,
} from "@/types";

interface CoherencyClustersProps {
  alignmentData: AlignmentResult[];
  targets: Target[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
}

interface Cluster {
  id: number;
  targetIds: Set<string>;
  docTypes: Set<PolicyDocumentType>;
  edges: AlignmentResult[];
  /** Weighted strength: 3×high + 2×medium + 1×low, normalized */
  strength: number;
  /** Top shared sectors across cluster targets */
  sharedSectors: { name: string; count: number }[];
}

const LEVEL_WEIGHT: Record<AlignmentLevel, number> = {
  high_contradiction: -3,
  moderate_contradiction: -2,
  low_tension: -1,
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Finds connected components (clusters) in the alignment graph using
 * medium and high alignment edges, then annotates each with shared themes.
 * Surfaces the most actionable cross-document implementation groups.
 */
export function CoherencyClusters({
  alignmentData,
  targets,
  classifications,
  sectors,
}: CoherencyClustersProps) {
  const [expandedCluster, setExpandedCluster] = useState<number | null>(null);

  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets]
  );

  const sectorMap = useMemo(
    () => new Map(sectors.map((s) => [s.id, s])),
    [sectors]
  );

  const clusters = useMemo(() => {
    // Only use medium and high alignment edges for meaningful clusters
    const significantEdges = alignmentData.filter(
      (a) => a.alignment === "medium" || a.alignment === "high"
    );

    if (significantEdges.length === 0) return [];

    // Build adjacency list
    const adj = new Map<string, Set<string>>();
    const edgeMap = new Map<string, AlignmentResult[]>();

    for (const a of significantEdges) {
      if (!adj.has(a.targetAId)) adj.set(a.targetAId, new Set());
      if (!adj.has(a.targetBId)) adj.set(a.targetBId, new Set());
      adj.get(a.targetAId)!.add(a.targetBId);
      adj.get(a.targetBId)!.add(a.targetAId);

      const key = [a.targetAId, a.targetBId].sort().join("__");
      if (!edgeMap.has(key)) edgeMap.set(key, []);
      edgeMap.get(key)!.push(a);
    }

    // BFS to find connected components
    const visited = new Set<string>();
    const components: { targetIds: Set<string> }[] = [];

    for (const nodeId of adj.keys()) {
      if (visited.has(nodeId)) continue;
      const component = new Set<string>();
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.pop()!;
        if (visited.has(current)) continue;
        visited.add(current);
        component.add(current);
        for (const neighbor of adj.get(current) ?? []) {
          if (!visited.has(neighbor)) queue.push(neighbor);
        }
      }
      components.push({ targetIds: component });
    }

    // Build rich cluster objects, filter to cross-document only
    const richClusters: Cluster[] = [];
    let clusterId = 0;

    for (const comp of components) {
      const docTypes = new Set<PolicyDocumentType>();
      for (const tid of comp.targetIds) {
        const t = targetMap.get(tid);
        if (t) docTypes.add(t.sourceDocument);
      }

      // Only keep clusters spanning 2+ document types
      if (docTypes.size < 2) continue;

      // Collect edges within this cluster
      const clusterEdges: AlignmentResult[] = [];
      const ids = comp.targetIds;
      for (const [, edges] of edgeMap) {
        for (const e of edges) {
          if (ids.has(e.targetAId) && ids.has(e.targetBId)) {
            clusterEdges.push(e);
          }
        }
      }

      // Weighted strength
      const totalWeight = clusterEdges.reduce(
        (sum, e) => sum + LEVEL_WEIGHT[e.alignment],
        0
      );
      const maxWeight = clusterEdges.length * 3;
      const strength = maxWeight > 0 ? totalWeight / maxWeight : 0;

      // Find shared sectors: sectors that apply to targets from 2+ doc types in cluster
      const sectorToDocTypes = new Map<string, Set<PolicyDocumentType>>();
      for (const tid of comp.targetIds) {
        const t = targetMap.get(tid);
        if (!t) continue;
        const targetSectors = classifications.filter(
          (c) => c.targetId === tid && c.taxonomyType === "sector" && c.isRelevant
        );
        for (const tc of targetSectors) {
          if (!sectorToDocTypes.has(tc.categoryId))
            sectorToDocTypes.set(tc.categoryId, new Set());
          sectorToDocTypes.get(tc.categoryId)!.add(t.sourceDocument);
        }
      }

      const sharedSectors = Array.from(sectorToDocTypes.entries())
        .filter(([, docs]) => docs.size >= 2)
        .map(([sectorId, docs]) => ({
          name: sectorMap.get(sectorId)?.name ?? sectorId,
          count: docs.size,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);

      richClusters.push({
        id: clusterId++,
        targetIds: comp.targetIds,
        docTypes,
        edges: clusterEdges,
        strength,
        sharedSectors,
      });
    }

    // Sort: largest clusters first, then by strength
    richClusters.sort((a, b) => {
      if (b.docTypes.size !== a.docTypes.size) return b.docTypes.size - a.docTypes.size;
      if (b.targetIds.size !== a.targetIds.size) return b.targetIds.size - a.targetIds.size;
      return b.strength - a.strength;
    });

    return richClusters;
  }, [alignmentData, classifications, targetMap, sectorMap]);

  if (clusters.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-[var(--undp-gray)]">
        No cross-document coherency clusters found with medium or high alignment.
      </div>
    );
  }

  // Summary stats
  const totalTargetsInClusters = new Set(clusters.flatMap((c) => [...c.targetIds])).size;
  const allDocTypes = new Set(clusters.flatMap((c) => [...c.docTypes]));

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--undp-black)]">
          Implementation Opportunity Groups
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mt-1">
          {clusters.length} group{clusters.length !== 1 ? "s" : ""} of targets across{" "}
          {allDocTypes.size} document types that share medium or high alignment
          — potential coordination opportunities for implementation.
          {" "}{totalTargetsInClusters} targets involved.
        </p>
      </div>

      <div className="space-y-3">
        {clusters.map((cluster) => {
          const isExpanded = expandedCluster === cluster.id;
          const docTypesArr = Array.from(cluster.docTypes);
          const highCount = cluster.edges.filter((e) => e.alignment === "high").length;
          const medCount = cluster.edges.filter((e) => e.alignment === "medium").length;

          // Group targets by document type for display
          const byDoc = new Map<PolicyDocumentType, Target[]>();
          for (const tid of cluster.targetIds) {
            const t = targetMap.get(tid);
            if (!t) continue;
            if (!byDoc.has(t.sourceDocument)) byDoc.set(t.sourceDocument, []);
            byDoc.get(t.sourceDocument)!.push(t);
          }

          return (
            <div key={cluster.id} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedCluster(isExpanded ? null : cluster.id)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50/50 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      {docTypesArr.map((dt) => (
                        <span
                          key={dt}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium text-white"
                          style={{ backgroundColor: DOC_COLORS[dt] }}
                        >
                          {DOC_LABELS[dt]} ({byDoc.get(dt)?.length ?? 0})
                        </span>
                      ))}
                    </div>

                    {cluster.sharedSectors.length > 0 && (
                      <p className="text-xs text-[var(--undp-gray)] mb-1">
                        Shared sectors:{" "}
                        {cluster.sharedSectors.map((s) => s.name).join(", ")}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-[var(--undp-gray)]">
                      <span>{cluster.targetIds.size} targets</span>
                      <span>{cluster.edges.length} alignment pair{cluster.edges.length !== 1 ? "s" : ""}</span>
                      {highCount > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: "#196127" }} />
                          {highCount} high
                        </span>
                      )}
                      {medCount > 0 && (
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: "#7bc96f" }} />
                          {medCount} medium
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-[var(--undp-gray)] shrink-0 mt-0.5">
                    {isExpanded ? "▾" : "▸"}
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 px-4 py-3 bg-[var(--undp-light)]/50">
                  {docTypesArr.map((dt) => {
                    const docTargets = byDoc.get(dt) ?? [];
                    return (
                      <div key={dt} className="mb-3 last:mb-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                          {DOC_LABELS[dt]} targets
                        </p>
                        <ul className="space-y-1.5">
                          {docTargets.map((t) => {
                            const connections = cluster.edges.filter(
                              (e) => e.targetAId === t.id || e.targetBId === t.id
                            ).length;
                            return (
                              <li key={t.id} className="text-xs text-[var(--undp-black)] flex gap-2">
                                <span
                                  className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                                  style={{ backgroundColor: DOC_COLORS[dt] }}
                                >
                                  {t.sourceLabel}
                                </span>
                                <span className="leading-relaxed flex-1">
                                  <TargetTextWithHighlights target={t} />
                                </span>
                                <span className="shrink-0 text-[var(--undp-gray)] text-[10px]">
                                  {connections} link{connections !== 1 ? "s" : ""}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
