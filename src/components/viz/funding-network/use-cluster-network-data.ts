import { useMemo } from "react";
import type {
  Target,
  AlignmentResult,
  AlignmentLevel,
  BerData,
  BerExpenditureSeries,
} from "@/types";
import { ALIGNMENT_WEIGHTS } from "@/lib/utils";

export interface NetworkNode {
  id: string;
  target: Target;
  /** Program code for the primary funding programme, or "unfunded" */
  clusterId: string;
  primaryProgram: string | null;
  programScores: { code: string; score: number; bestLevel: AlignmentLevel }[];
  isFunded: boolean;
  color: string;
  /** 0–1 — how strongly aligned with the primary funding programme */
  fundingIntensity: number;
  radius: number;
  // Mutated by the d3-force simulation
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface NetworkLink {
  source: string;
  target: string;
  level: AlignmentLevel;
  strength: number;
  crossCluster: boolean;
}

export interface ClusterMeta {
  id: string;
  label: string;
  code: string;
  color: string;
  expenditure: BerExpenditureSeries | null;
  latestAmount: number | null;
  targetCount: number;
  type: "environmental" | "non_environmental" | "unfunded";
}

// Curated colours for Mongolia's most-used BER codes. Any other code (other
// Mongolia programmes, future countries) gets a deterministic hash-derived
// hue via `getProgramColor` so every cluster stays visually distinct.
const PROGRAM_PALETTE: Record<string, string> = {
  "71401": "#6366f1", // Waste management
  "71403": "#16a34a", // Afforestation
  "71404": "#0ea5e9", // Water resource
  "71405": "#8b5cf6", // Protected areas
  "71406": "#ef4444", // Environmental pollution
  "71407": "#14b8a6", // Air pollution / climate
  "71408": "#ec4899", // Meteorology
  "71410": "#84cc16", // Land degradation
  "71411": "#f97316", // Environment policy
  "71412": "#06b6d4", // R&D Environment
  "71413": "#a855f7", // Environment protection / recovery
  "81707": "#64748b", // Forest fire
  "81708": "#78716c", // Plant protection
  "82212": "#9ca3af", // Solid waste / cleaning
  unfunded: "#b45309", // Amber warning
};

function getProgramColor(code: string): string {
  if (code === "unfunded") return PROGRAM_PALETTE.unfunded;
  const curated = PROGRAM_PALETTE[code];
  if (curated) return curated;
  // Stable hash → hue. Fixed S/L for visual consistency across clusters.
  let h = 0;
  for (let i = 0; i < code.length; i++) {
    h = ((h << 5) - h + code.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

const POSITIVE_LEVELS: AlignmentLevel[] = ["high", "medium", "low"];

function alignmentScore(level: AlignmentLevel): number {
  return Math.max(0, ALIGNMENT_WEIGHTS[level] ?? 0);
}

function isPolicyTargetId(id: string): boolean {
  return !id.startsWith("BER_") && !id.startsWith("BTR_");
}

interface UseClusterNetworkDataProps {
  targets: Target[];
  budgetAlignment: AlignmentResult[];
  budgetPseudoTargets: Target[];
  berData: BerData;
  targetAlignment: AlignmentResult[];
}

export function useClusterNetworkData({
  targets,
  budgetAlignment,
  budgetPseudoTargets,
  berData,
  targetAlignment,
}: UseClusterNetworkDataProps) {
  return useMemo(() => {
    // 1. Expenditure lookup
    const expByCode = new Map<string, BerExpenditureSeries>();
    for (const e of berData.expenditure) {
      expByCode.set(e.code, e);
    }
    const endYear = berData.period.end;

    // 2. Programme name + type lookup, keyed by raw program code
    const programInfo = new Map<
      string,
      { code: string; name: string; type: "environmental" | "non_environmental" }
    >();
    for (const pt of budgetPseudoTargets) {
      const code = pt.id.replace("BER_", "");
      const prog = berData.programs.find((p) => p.code === code);
      programInfo.set(code, {
        code,
        name: prog?.name ?? pt.sourceLabel,
        type: prog?.type ?? "environmental",
      });
    }

    // 3. Score each policy target against each budget programme.
    // Best (highest-scoring positive) alignment wins per (target, programme).
    const programScoresMap = new Map<
      string,
      Map<string, { score: number; bestLevel: AlignmentLevel }>
    >();

    for (const ar of budgetAlignment) {
      if (!POSITIVE_LEVELS.includes(ar.alignment)) continue;
      const code = ar.targetBId.replace("BER_", "");
      const targetId = ar.targetAId;
      if (!isPolicyTargetId(targetId)) continue;

      if (!programScoresMap.has(targetId)) {
        programScoresMap.set(targetId, new Map());
      }
      const tMap = programScoresMap.get(targetId)!;
      const existing = tMap.get(code);
      const score = alignmentScore(ar.alignment);
      if (!existing || score > existing.score) {
        tMap.set(code, { score, bestLevel: ar.alignment });
      }
    }

    // 4. Count target-target alignments (medium + high) per policy target.
    // Used to size nodes — more alignments = larger circle.
    const targetSet = new Set(targets.filter((t) => isPolicyTargetId(t.id)).map((t) => t.id));
    const alignmentCount = new Map<string, number>();
    for (const ar of targetAlignment) {
      if (ar.alignment !== "high" && ar.alignment !== "medium") continue;
      if (!targetSet.has(ar.targetAId) || !targetSet.has(ar.targetBId)) continue;
      alignmentCount.set(ar.targetAId, (alignmentCount.get(ar.targetAId) ?? 0) + 1);
      alignmentCount.set(ar.targetBId, (alignmentCount.get(ar.targetBId) ?? 0) + 1);
    }
    const maxAlignCount = Math.max(1, ...alignmentCount.values());

    // 5. Build nodes
    const nodes: NetworkNode[] = [];
    const clusterTargets = new Map<string, NetworkNode[]>();

    for (const t of targets) {
      if (!isPolicyTargetId(t.id)) continue;

      const scores = programScoresMap.get(t.id);
      const sortedPrograms: NetworkNode["programScores"] = [];

      if (scores) {
        for (const [code, { score, bestLevel }] of scores) {
          sortedPrograms.push({ code, score, bestLevel });
        }
        sortedPrograms.sort((a, b) => b.score - a.score);
      }

      const primaryCode = sortedPrograms.length > 0 ? sortedPrograms[0].code : null;
      const clusterId = primaryCode ?? "unfunded";
      const isFunded =
        sortedPrograms.length > 0 &&
        (sortedPrograms[0].bestLevel === "high" || sortedPrograms[0].bestLevel === "medium");

      const ac = alignmentCount.get(t.id) ?? 0;
      const normalizedAc = ac / maxAlignCount;
      const radius = 5 + normalizedAc * 10;

      // Funding intensity drives circle opacity in the canvas — strong
      // alignment looks saturated, weak alignment looks pale, unfunded faint.
      let fundingIntensity = 0.2;
      if (sortedPrograms.length > 0) {
        const best = sortedPrograms[0].bestLevel;
        if (best === "high") fundingIntensity = 1.0;
        else if (best === "medium") fundingIntensity = 0.65;
        else fundingIntensity = 0.35;
      }

      const node: NetworkNode = {
        id: t.id,
        target: t,
        clusterId,
        primaryProgram: primaryCode,
        programScores: sortedPrograms,
        isFunded,
        color: getProgramColor(clusterId),
        fundingIntensity,
        radius,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
      };

      nodes.push(node);
      if (!clusterTargets.has(clusterId)) clusterTargets.set(clusterId, []);
      clusterTargets.get(clusterId)!.push(node);
    }

    // 6. Build links from policy target-target alignment (medium + high only)
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const links: NetworkLink[] = [];
    for (const ar of targetAlignment) {
      if (ar.alignment !== "high" && ar.alignment !== "medium") continue;
      if (!targetSet.has(ar.targetAId) || !targetSet.has(ar.targetBId)) continue;

      const srcNode = nodeById.get(ar.targetAId);
      const tgtNode = nodeById.get(ar.targetBId);
      const crossCluster =
        srcNode != null && tgtNode != null && srcNode.clusterId !== tgtNode.clusterId;

      links.push({
        source: ar.targetAId,
        target: ar.targetBId,
        level: ar.alignment,
        strength: ar.alignment === "high" ? 1.0 : 0.5,
        crossCluster,
      });
    }

    const adjacency = new Map<string, NetworkLink[]>();
    for (const l of links) {
      if (!adjacency.has(l.source)) adjacency.set(l.source, []);
      if (!adjacency.has(l.target)) adjacency.set(l.target, []);
      adjacency.get(l.source)!.push(l);
      adjacency.get(l.target)!.push(l);
    }

    // 7. Cluster metadata
    const clusterMeta: ClusterMeta[] = [];
    for (const [id, clusterNodes] of clusterTargets) {
      if (id === "unfunded") {
        clusterMeta.push({
          id: "unfunded",
          label: "No budget backing",
          code: "unfunded",
          color: PROGRAM_PALETTE.unfunded,
          expenditure: null,
          latestAmount: null,
          targetCount: clusterNodes.length,
          type: "unfunded",
        });
      } else {
        const info = programInfo.get(id);
        const exp = expByCode.get(id) ?? null;
        const latest = exp?.values[String(endYear)] ?? null;
        clusterMeta.push({
          id,
          label: info?.name ?? id,
          code: id,
          color: getProgramColor(id),
          expenditure: exp,
          latestAmount: latest,
          targetCount: clusterNodes.length,
          type: info?.type ?? "environmental",
        });
      }
    }
    // Unfunded sorts last; otherwise by target count descending.
    clusterMeta.sort((a, b) => {
      if (a.type === "unfunded") return 1;
      if (b.type === "unfunded") return -1;
      return b.targetCount - a.targetCount;
    });

    return { nodes, links, adjacency, clusterTargets, clusterMeta, expByCode, endYear };
  }, [targets, budgetAlignment, budgetPseudoTargets, berData, targetAlignment]);
}
