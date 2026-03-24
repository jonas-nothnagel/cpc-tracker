"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { arc as d3Arc } from "d3-shape";
import {
  DOC_COLORS,
  DOC_LABELS,
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type {
  Target,
  PolicyDocumentType,
  AlignmentResult,
  AlignmentLevel,
  IpccSector,
  ThematicClassification,
  Nr7Data,
  Nr7ProgressItem,
} from "@/types";

// ─── Internal types ─────────────────────────────────────────────────

interface Group {
  id: string;
  label: string;
  color: string;
  targets: Target[];
}

interface NodePos {
  id: string;
  target: Target;
  groupId: string;
  angle: number;
  x: number;
  y: number;
  connections: number;
}

interface GroupArc {
  id: string;
  startAngle: number;
  endAngle: number;
  midAngle: number;
  label: string;
  color: string;
  count: number;
}

interface TaxCategory {
  id: string;
  name: string;
  description: string;
}

type GroupMode = "document" | "sector" | "theme" | "nbs";
type AlignFilter = "all" | "high_medium" | "high" | "contradictions";

const MAX_LABEL_LEN = 20;

// ─── SVG layout constants ───────────────────────────────────────────

const GAP = 0.08;
const OUTER_R = 240;
const INNER_R = 224;
const NODE_R = 210;
const LABEL_R = 254;
const GRP_LABEL_R = 270;
const VB = 630;
const SECTOR_PAL = [
  "#0468b1", "#0d9488", "#b45309", "#7c3aed",
  "#dc2626", "#059669", "#d97706", "#6366f1",
];

// ─── Layout helpers ─────────────────────────────────────────────────

function buildGroupsByTaxonomy(
  targets: Target[],
  categories: TaxCategory[],
  taxonomyType: string,
  classifications: ThematicClassification[],
): Group[] {
  const sm = new Map<string, Target[]>();
  for (const c of categories) sm.set(c.id, []);
  const used = new Set<string>();
  for (const t of targets) {
    const c = classifications.find(
      (x) => x.targetId === t.id && x.taxonomyType === taxonomyType && x.isRelevant,
    );
    if (c && sm.has(c.categoryId)) {
      sm.get(c.categoryId)!.push(t);
      used.add(t.id);
    }
  }
  const rest = targets.filter((t) => !used.has(t.id));
  const gs: Group[] = [];
  let ci = 0;
  for (const cat of categories) {
    const ts = sm.get(cat.id) ?? [];
    if (ts.length === 0) continue;
    gs.push({
      id: cat.id,
      label: cat.name,
      color: SECTOR_PAL[ci++ % SECTOR_PAL.length],
      targets: ts,
    });
  }
  if (rest.length > 0) {
    gs.push({ id: "_other", label: "Other", color: "#94a3b8", targets: rest });
  }
  return gs.sort((a, b) => b.targets.length - a.targets.length);
}

function buildGroups(
  targets: Target[],
  mode: GroupMode,
  sectors: TaxCategory[],
  themes: TaxCategory[],
  nbsCategories: TaxCategory[],
  classifications: ThematicClassification[],
): Group[] {
  if (mode === "document") {
    const m = new Map<PolicyDocumentType, Target[]>();
    for (const t of targets) {
      const l = m.get(t.sourceDocument) ?? [];
      l.push(t);
      m.set(t.sourceDocument, l);
    }
    return Array.from(m.entries()).map(([d, ts]) => ({
      id: d,
      label: DOC_LABELS[d],
      color: DOC_COLORS[d],
      targets: ts,
    }));
  }
  if (mode === "sector") return buildGroupsByTaxonomy(targets, sectors, "sector", classifications);
  if (mode === "theme") return buildGroupsByTaxonomy(targets, themes, "theme", classifications);
  return buildGroupsByTaxonomy(targets, nbsCategories, "nbs", classifications);
}

function computeLayout(groups: Group[], alignment: AlignmentResult[]) {
  const total = groups.reduce((s, g) => s + g.targets.length, 0);
  if (total === 0) return { nodes: [] as NodePos[], arcs: [] as GroupArc[] };
  const avail = 2 * Math.PI - GAP * groups.length;

  const cc = new Map<string, number>();
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    cc.set(a.targetAId, (cc.get(a.targetAId) ?? 0) + 1);
    cc.set(a.targetBId, (cc.get(a.targetBId) ?? 0) + 1);
  }

  const nodes: NodePos[] = [];
  const arcs: GroupArc[] = [];
  let cur = 0;

  for (const g of groups) {
    const span = (g.targets.length / total) * avail;
    const start = cur;
    const end = cur + span;
    const mid = (start + end) / 2;

    arcs.push({
      id: g.id,
      startAngle: start,
      endAngle: end,
      midAngle: mid,
      label: g.label,
      color: g.color,
      count: g.targets.length,
    });

    const n = g.targets.length;
    const pad = span * 0.04;
    const nodeSpan = span - 2 * pad;
    for (let i = 0; i < n; i++) {
      const a = start + pad + (n > 1 ? (i / (n - 1)) * nodeSpan : nodeSpan / 2);
      nodes.push({
        id: g.targets[i].id,
        target: g.targets[i],
        groupId: g.id,
        angle: a,
        x: NODE_R * Math.sin(a),
        y: -NODE_R * Math.cos(a),
        connections: cc.get(g.targets[i].id) ?? 0,
      });
    }
    cur = end + GAP;
  }
  return { nodes, arcs };
}

function filterAlign(a: AlignmentResult[], f: AlignFilter): AlignmentResult[] {
  return a.filter((x) => {
    if (x.alignment === "none") return false;
    if (f === "all") return true;
    if (f === "contradictions") return isContradiction(x.alignment);
    if (f === "high_medium")
      return (
        x.alignment === "high" ||
        x.alignment === "medium" ||
        isContradiction(x.alignment)
      );
    return x.alignment === "high" || isContradiction(x.alignment);
  });
}

function curvePath(ax: number, ay: number, bx: number, by: number) {
  const cx = ((ax + bx) / 2) * 0.25;
  const cy = ((ay + by) / 2) * 0.25;
  return `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
}

function anchorFor(rad: number): "start" | "middle" | "end" {
  const d = ((rad * 180) / Math.PI) % 360;
  if (d > 20 && d < 160) return "start";
  if (d > 200 && d < 340) return "end";
  return "middle";
}

function truncLabel(s: string, max = MAX_LABEL_LEN): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// ─── Detail panel ───────────────────────────────────────────────────

function DetailPanel({
  node,
  connections,
  onClose,
  onSelectPair,
  comparedPair,
  onBackFromPair,
  nr7Item,
  nr7ProgressMap,
}: {
  node: NodePos;
  connections: (AlignmentResult & { otherTarget: Target })[];
  onClose: () => void;
  onSelectPair: (r: AlignmentResult) => void;
  comparedPair: { result: AlignmentResult; other: Target } | null;
  onBackFromPair: () => void;
  nr7Item?: Nr7ProgressItem | null;
  nr7ProgressMap?: Map<string, string>;
}) {
  const [expandedRationaleId, setExpandedRationaleId] = useState<string | null>(null);

  const sorted = [...connections].sort((a, b) => {
    const order: Record<AlignmentLevel, number> = {
      high: 0, medium: 1, low: 2,
      low_tension: 3, moderate_contradiction: 4, high_contradiction: 5,
      none: 6,
    };
    return order[a.alignment] - order[b.alignment];
  });

  // Show the first rationale by default so the interaction pattern is obvious.
  useEffect(() => {
    const firstExpandable = sorted.find((conn) => conn.description)?.otherTarget.id ?? null;
    setExpandedRationaleId(firstExpandable);
  }, [node.id]);

  if (comparedPair) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50">
          <button
            type="button"
            onClick={onBackFromPair}
            className="flex items-center gap-1 text-xs text-[var(--undp-blue)] hover:underline"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
          <button type="button" onClick={onClose} className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-lg leading-none">
            ×
          </button>
        </div>

        <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-100">
          <span className="text-xs text-[var(--undp-gray)] mr-1">Alignment</span>
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: ALIGNMENT_COLORS[comparedPair.result.alignment] }} />
          <span className="text-sm font-semibold text-[var(--undp-black)]">
            {ALIGNMENT_LABELS[comparedPair.result.alignment]}
          </span>
          <span className="text-xs text-[var(--undp-gray)] ml-auto">
            {connections.length} connections
          </span>
        </div>

        <div className="px-4 py-3 space-y-3 border-b border-gray-100">
          {[node.target, comparedPair.other].map((t) => (
            <div key={t.id}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
                {DOC_LABELS[t.sourceDocument]} — {t.sourceLabel}
              </p>
              <p className="text-xs text-[var(--undp-black)] leading-relaxed bg-gray-50 rounded p-2.5 border border-gray-100">
                <TargetTextWithHighlights target={t} />
              </p>
              <ActivitiesActions target={t} />
            </div>
          ))}
        </div>

        {comparedPair.result.description && (
          <div className="px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
              AI Rationale
            </p>
            <p className="text-xs text-[var(--undp-black)] leading-relaxed">
              {comparedPair.result.description}
            </p>
          </div>
        )}
      </div>
    );
  }

  const hi = connections.filter((c) => c.alignment === "high").length;
  const md = connections.filter((c) => c.alignment === "medium").length;
  const lo = connections.filter((c) => c.alignment === "low").length;
  const ct = connections.filter((c) => isContradiction(c.alignment)).length;

  const hasNr7InConns = nr7ProgressMap && connections.some((c) => nr7ProgressMap.has(c.otherTarget.id));

  return (
    <div className="border border-gray-200 rounded-lg bg-white shadow-lg overflow-hidden flex flex-col max-h-[620px]">
      {/* Target header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: DOC_COLORS[node.target.sourceDocument] }} />
          <span className="text-sm font-semibold text-[var(--undp-black)] truncate">
            {DOC_LABELS[node.target.sourceDocument]} · {node.target.sourceLabel}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-lg leading-none ml-2 shrink-0">
          ×
        </button>
      </div>

      <div className="px-4 py-3 shrink-0">
        <p className="text-xs text-[var(--undp-black)] leading-relaxed">
          <TargetTextWithHighlights target={node.target} />
        </p>
        <ActivitiesActions target={node.target} />
      </div>

      <div className="px-4 py-2 shrink-0 flex flex-wrap gap-3 text-[11px]">
        {hi > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: ALIGNMENT_COLORS.high }} />{hi} high</span>}
        {md > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: ALIGNMENT_COLORS.medium }} />{md} medium</span>}
        {lo > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: ALIGNMENT_COLORS.low }} />{lo} low</span>}
        {ct > 0 && <span className="flex items-center gap-1 text-red-600"><span className="w-2 h-2 rounded-full" style={{ backgroundColor: ALIGNMENT_COLORS.high_contradiction }} />{ct} conflict</span>}
      </div>

      {nr7Item && (
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: NR7_BADGE_COLORS[nr7Item.progressStatus] ?? "#9ca3af" }}
            />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
              NR7 Progress: {NR7_BADGE_LABELS[nr7Item.progressStatus] ?? "Unknown"}
            </span>
          </div>
          {nr7Item.progressSummary && (
            <p className="text-[11px] text-[var(--undp-black)] leading-relaxed mb-1.5">
              {nr7Item.progressSummary.length > 300
                ? nr7Item.progressSummary.slice(0, 300) + "..."
                : nr7Item.progressSummary}
            </p>
          )}
          {nr7Item.challenges && (
            <details className="text-[11px]">
              <summary className="text-[var(--undp-gray)] cursor-pointer hover:text-[var(--undp-blue)]">
                Key challenges
              </summary>
              <p className="text-[var(--undp-black)] leading-relaxed mt-1 pl-2 border-l-2 border-gray-200">
                {nr7Item.challenges.length > 300
                  ? nr7Item.challenges.slice(0, 300) + "..."
                  : nr7Item.challenges}
              </p>
            </details>
          )}
        </div>
      )}

      {/* Connections section — visually separated */}
      <div className="flex-1 overflow-y-auto min-h-0 border-t-2 border-gray-100">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
            Connections ({connections.length})
          </p>
          {hasNr7InConns && (
            <div className="flex items-center gap-2 text-[10px] text-[var(--undp-gray)]">
              <span>NR7:</span>
              <span className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: NR7_BADGE_COLORS.on_track }} />
                on track
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: NR7_BADGE_COLORS.limited }} />
                limited
              </span>
              <span className="flex items-center gap-0.5">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: NR7_BADGE_COLORS.no_progress }} />
                none
              </span>
            </div>
          )}
        </div>
        <ul className="divide-y divide-gray-50">
          {sorted.map((conn) => {
            const isExpanded = expandedRationaleId === conn.otherTarget.id;
            const nr7Status = nr7ProgressMap?.get(conn.otherTarget.id);
            return (
              <li key={conn.otherTarget.id}>
                <button
                  type="button"
                  onClick={() => onSelectPair(conn)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[9px] font-semibold text-white leading-none"
                      style={{ backgroundColor: DOC_COLORS[conn.otherTarget.sourceDocument] }}
                    >
                      {DOC_LABELS[conn.otherTarget.sourceDocument]}
                    </span>
                    <span className="text-xs font-medium text-[var(--undp-black)] truncate flex-1">
                      {conn.otherTarget.sourceLabel}
                    </span>
                    {nr7Status && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: NR7_BADGE_COLORS[nr7Status] ?? "#9ca3af" }}
                        title={`NR7: ${NR7_BADGE_LABELS[nr7Status] ?? "Unknown"}`}
                      />
                    )}
                    <span
                      className="text-[10px] font-medium shrink-0"
                      style={{ color: ALIGNMENT_COLORS[conn.alignment] }}
                    >
                      {ALIGNMENT_LABELS[conn.alignment]}
                    </span>
                  </div>
                </button>
                {conn.description && (
                  <div className="px-4 pb-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedRationaleId(isExpanded ? null : conn.otherTarget.id);
                      }}
                      className="flex items-center gap-1 text-[10px] text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors mb-1"
                    >
                      <svg
                        width="10" height="10" viewBox="0 0 10 10" fill="none"
                        className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      >
                        <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Rationale
                    </button>
                    {isExpanded && (
                      <p className="text-[11px] text-[var(--undp-gray)] leading-snug pl-3 pb-1.5 border-l-2 border-gray-100">
                        {conn.description}
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────

const NR7_BADGE_COLORS: Record<string, string> = {
  on_track: "#16a34a",
  limited: "#d97706",
  no_progress: "#dc2626",
  unknown: "#9ca3af",
};

const NR7_BADGE_LABELS: Record<string, string> = {
  on_track: "On track",
  limited: "Limited progress",
  no_progress: "No progress",
  unknown: "Unknown",
};

interface PolicyCoherenceExplorerProps {
  targets: Target[];
  alignment: AlignmentResult[];
  sectors: TaxCategory[];
  themes: TaxCategory[];
  nbsCategories: TaxCategory[];
  classifications: ThematicClassification[];
  nr7Data?: Nr7Data | null;
}

export function PolicyCoherenceExplorer({
  targets,
  alignment,
  sectors,
  themes,
  nbsCategories,
  classifications,
  nr7Data,
}: PolicyCoherenceExplorerProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>("document");
  const [filter, setFilter] = useState<AlignFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [comparedPair, setComparedPair] = useState<{
    result: AlignmentResult;
    other: Target;
  } | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [showBtr, setShowBtr] = useState(false);
  const [showNr7, setShowNr7] = useState(true);

  const hasBtr = useMemo(
    () => targets.some((t) => t.sourceDocument === "BTR"),
    [targets],
  );
  const hasNr7 = useMemo(
    () => !!nr7Data?.progressItems?.length,
    [nr7Data],
  );

  // Map NBSAP target IDs to NR7 progress items via nbsapTargetId
  const nr7ProgressMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!nr7Data?.progressItems?.length) return map;
    for (const item of nr7Data.progressItems) {
      if (item.nbsapTargetId) {
        map.set(item.nbsapTargetId, item.progressStatus);
      }
    }
    return map;
  }, [nr7Data]);

  // Full NR7 item lookup by NBSAP target ID (for detail panel)
  const nr7ItemMap = useMemo(() => {
    const map = new Map<string, Nr7ProgressItem>();
    if (!nr7Data?.progressItems?.length) return map;
    for (const item of nr7Data.progressItems) {
      if (item.nbsapTargetId) {
        map.set(item.nbsapTargetId, item);
      }
    }
    return map;
  }, [nr7Data]);

  const visibleTargets = useMemo(
    () => (showBtr ? targets : targets.filter((t) => t.sourceDocument !== "BTR")),
    [targets, showBtr],
  );
  const visibleTargetIds = useMemo(
    () => new Set(visibleTargets.map((t) => t.id)),
    [visibleTargets],
  );
  const visibleAlignment = useMemo(
    () =>
      alignment.filter(
        (a) => visibleTargetIds.has(a.targetAId) && visibleTargetIds.has(a.targetBId),
      ),
    [alignment, visibleTargetIds],
  );

  const activeId = selectedId ?? hoveredId;

  const groups = useMemo(
    () => buildGroups(visibleTargets, groupMode, sectors, themes, nbsCategories, classifications),
    [visibleTargets, groupMode, sectors, themes, nbsCategories, classifications],
  );

  const filtered = useMemo(() => filterAlign(visibleAlignment, filter), [visibleAlignment, filter]);

  const { nodes, arcs } = useMemo(
    () => computeLayout(groups, visibleAlignment),
    [groups, visibleAlignment],
  );

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const targetMap = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);

  // Ambient connections — shown faintly when no node is active
  const ambientConns = useMemo(() => {
    if (filter === "contradictions")
      return filtered;
    return visibleAlignment.filter((a) => a.alignment === "high");
  }, [visibleAlignment, filtered, filter]);

  // Connections for the active node (from filtered set)
  const activeConns = useMemo(() => {
    if (!activeId) return [];
    return filtered
      .filter((a) => a.targetAId === activeId || a.targetBId === activeId)
      .map((a) => ({
        ...a,
        otherId: a.targetAId === activeId ? a.targetBId : a.targetAId,
      }));
  }, [activeId, filtered]);

  const connectedIds = useMemo(
    () => new Set(activeConns.map((c) => c.otherId)),
    [activeConns],
  );

  // Detail panel connections (for selected node)
  const selectedConns = useMemo(() => {
    if (!selectedId) return [];
    return filtered
      .filter((a) => a.targetAId === selectedId || a.targetBId === selectedId)
      .map((a) => {
        const otherId = a.targetAId === selectedId ? a.targetBId : a.targetAId;
        return { ...a, otherTarget: targetMap.get(otherId)! };
      })
      .filter((c) => c.otherTarget);
  }, [selectedId, filtered, targetMap]);

  const totalAligned = visibleAlignment.filter((a) => a.alignment !== "none").length;
  const totalContra = visibleAlignment.filter((a) => isContradiction(a.alignment)).length;

  const handleNodeClick = useCallback((id: string) => {
    setComparedPair(null);
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const handleBgClick = useCallback(() => {
    setSelectedId(null);
    setComparedPair(null);
    setExpandedGroupId(null);
  }, []);

  const handleGroupChange = useCallback((m: GroupMode) => {
    setGroupMode(m);
    setSelectedId(null);
    setComparedPair(null);
    setExpandedGroupId(null);
  }, []);

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;

  const arcGen = useMemo(
    () =>
      d3Arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(INNER_R)
        .outerRadius(OUTER_R)
        .cornerRadius(3),
    [],
  );

  const nodeSize = useCallback(
    (n: NodePos) => Math.max(4, Math.min(10, 3 + n.connections * 0.5)),
    [],
  );

  return (
    <section className="mb-10">
      {/* Header + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            Policy Coherence Explorer
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-0.5">
            {targets.length} targets · {totalAligned} aligned pairs
            {totalContra > 0 && (
              <>
                {" "}·{" "}
                <button
                  type="button"
                  onClick={() => setFilter(filter === "contradictions" ? "all" : "contradictions")}
                  className="text-red-600 hover:underline font-medium"
                >
                  {totalContra} contradiction{totalContra !== 1 ? "s" : ""}
                </button>
              </>
            )}
            {" "}— hover or click a target to explore connections
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={groupMode}
            onChange={(e) => handleGroupChange(e.target.value as GroupMode)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30"
          >
            <option value="theme">By Cross-Cutting Theme</option>
            <option value="document">By Document Type</option>
            <option value="sector">By IPCC Sector</option>
            {nbsCategories.length > 0 && <option value="nbs">By NBS Category</option>}
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as AlignFilter)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30"
          >
            <option value="all">All connections</option>
            <option value="high_medium">High + Medium</option>
            <option value="high">High only</option>
            <option value="contradictions">Contradictions only</option>
          </select>
          {hasBtr && (
            <button
              type="button"
              onClick={() => setShowBtr((v) => !v)}
              className={`flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showBtr
                  ? "border-[#7c3aed]/40 bg-[#7c3aed]/10 text-[#7c3aed]"
                  : "border-gray-200 bg-white text-[var(--undp-gray)] hover:border-[#7c3aed]/30 hover:text-[#7c3aed]"
              }`}
            >
              <span className={`w-2 h-2 rounded-sm ${showBtr ? "bg-[#7c3aed]" : "bg-gray-300"}`} />
              BTR Measures
            </button>
          )}
          {hasNr7 && (
            <button
              type="button"
              onClick={() => setShowNr7((v) => !v)}
              className={`flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showNr7
                  ? "border-[#16a34a]/40 bg-[#16a34a]/10 text-[#16a34a]"
                  : "border-gray-200 bg-white text-[var(--undp-gray)] hover:border-[#16a34a]/30 hover:text-[#16a34a]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${showNr7 ? "bg-[#16a34a]" : "bg-gray-300"}`} />
              NR7 Progress
            </button>
          )}
        </div>
      </div>

      {/* Main content: wheel + detail panel */}
      <div className="flex gap-4 items-start">
        {/* Wheel container */}
        <div className={`min-w-0 transition-all duration-300 ${selectedNode ? "flex-[3]" : "flex-1"}`}>
          <div className="bg-white border border-gray-100 rounded-lg p-4">
            <svg
              viewBox={`${-VB / 2} ${-VB / 2} ${VB} ${VB}`}
              className="w-full"
              style={{ maxHeight: 620 }}
              onClick={handleBgClick}
            >
              {/* Guide circle */}
              <circle cx={0} cy={0} r={NODE_R} fill="none" stroke="#f1f5f9" strokeWidth={1} strokeDasharray="4 4" />

              {/* Group arcs */}
              {arcs.map((arc) => {
                const d = arcGen({ startAngle: arc.startAngle, endAngle: arc.endAngle });
                const hasActiveNode =
                  !activeId ||
                  nodes.some(
                    (n) =>
                      n.groupId === arc.id &&
                      (n.id === activeId || connectedIds.has(n.id)),
                  );
                return (
                  <path
                    key={arc.id}
                    d={d ?? ""}
                    fill={arc.color}
                    opacity={activeId ? (hasActiveNode ? 0.8 : 0.12) : 0.65}
                    className="transition-opacity duration-200"
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}

              {/* Ambient connections — faint background web */}
              {!activeId &&
                ambientConns.map((conn) => {
                  const nA = nodeMap.get(conn.targetAId);
                  const nB = nodeMap.get(conn.targetBId);
                  if (!nA || !nB) return null;
                  const key = `amb-${[conn.targetAId, conn.targetBId].sort().join("__")}`;
                  const contra = isContradiction(conn.alignment);
                  const isContraMode = filter === "contradictions";
                  return (
                    <path
                      key={key}
                      d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                      fill="none"
                      stroke={ALIGNMENT_COLORS[conn.alignment]}
                      strokeWidth={isContraMode ? 2 : 1}
                      strokeDasharray={contra ? "6 3" : "none"}
                      opacity={isContraMode ? 0.55 : 0.1}
                      strokeLinecap="round"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                })}

              {/* Active-node connections — prominent on hover/click */}
              {activeId &&
                activeConns.map((conn) => {
                  const nA = nodeMap.get(activeId);
                  const nB = nodeMap.get(conn.otherId);
                  if (!nA || !nB) return null;
                  const key = [conn.targetAId, conn.targetBId].sort().join("__");
                  const contra = isContradiction(conn.alignment);
                  return (
                    <path
                      key={key}
                      d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                      fill="none"
                      stroke={ALIGNMENT_COLORS[conn.alignment]}
                      strokeWidth={
                        conn.alignment === "high" || contra ? 2.5 : conn.alignment === "medium" ? 2 : 1.5
                      }
                      strokeDasharray={contra ? "6 3" : "none"}
                      opacity={conn.alignment === "high" ? 0.8 : conn.alignment === "medium" ? 0.6 : 0.45}
                      strokeLinecap="round"
                      style={{ pointerEvents: "none" }}
                    />
                  );
                })}

              {/* Target nodes */}
              {nodes.map((node) => {
                const r = nodeSize(node);
                const isActive = node.id === activeId;
                const isConnected = connectedIds.has(node.id);
                const isDimmed = !!activeId && !isActive && !isConnected;
                return (
                  <g key={node.id}>
                    {isActive && (
                      <circle
                        cx={node.x} cy={node.y} r={r + 5}
                        fill="none"
                        stroke={DOC_COLORS[node.target.sourceDocument]}
                        strokeWidth={2}
                        opacity={0.4}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    {isConnected && !isActive && (
                      <circle
                        cx={node.x} cy={node.y} r={r + 3}
                        fill="none"
                        stroke={DOC_COLORS[node.target.sourceDocument]}
                        strokeWidth={1.5}
                        opacity={0.25}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={DOC_COLORS[node.target.sourceDocument]}
                      stroke="white"
                      strokeWidth={1.5}
                      opacity={isDimmed ? 0.12 : 1}
                      className="transition-opacity duration-200 cursor-pointer"
                      onMouseEnter={() => {
                        if (!selectedId) setHoveredId(node.id);
                      }}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeClick(node.id);
                      }}
                    />
                    {showNr7 && nr7ProgressMap.has(node.id) && !isDimmed && (
                      <circle
                        cx={node.x + r * 0.7}
                        cy={node.y - r * 0.7}
                        r={3.5}
                        fill={NR7_BADGE_COLORS[nr7ProgressMap.get(node.id)!] ?? "#9ca3af"}
                        stroke="white"
                        strokeWidth={1}
                        style={{ pointerEvents: "none" }}
                      >
                        <title>
                          NR7: {NR7_BADGE_LABELS[nr7ProgressMap.get(node.id)!] ?? "Unknown"}
                        </title>
                      </circle>
                    )}
                  </g>
                );
              })}

              {/* Node labels — only for active + connected nodes */}
              {nodes.map((node) => {
                const isActive = node.id === activeId;
                const isConnected = connectedIds.has(node.id);
                if (!isActive && !isConnected && activeId) return null;
                const lx = LABEL_R * Math.sin(node.angle);
                const ly = -LABEL_R * Math.cos(node.angle);
                const showDocCtx = groupMode !== "document";
                const docColor = DOC_COLORS[node.target.sourceDocument];
                return (
                  <text
                    key={`lbl-${node.id}`}
                    x={lx}
                    y={ly}
                    textAnchor={anchorFor(node.angle)}
                    dominantBaseline="middle"
                    className="select-none pointer-events-none"
                    fontSize={isActive ? 11 : 9}
                    fontWeight={isActive ? 700 : 400}
                    fill={
                      showDocCtx
                        ? isActive || isConnected
                          ? docColor
                          : `${docColor}60`
                        : isActive || isConnected
                          ? "#334155"
                          : "#b0b8c4"
                    }
                    style={{ transition: "fill 200ms, font-size 200ms" }}
                  >
                    {showDocCtx && (isActive || isConnected) && (
                      <tspan fontWeight={700} fontSize={isActive ? 9 : 7}>
                        {DOC_LABELS[node.target.sourceDocument]}{" "}
                      </tspan>
                    )}
                    {node.target.sourceLabel}
                  </text>
                );
              })}

              {/* Group labels */}
              {arcs.map((arc) => {
                const lx = GRP_LABEL_R * Math.sin(arc.midAngle);
                const ly = -GRP_LABEL_R * Math.cos(arc.midAngle);
                const isTruncated = arc.label.length > MAX_LABEL_LEN;
                const isExpanded = expandedGroupId === arc.id;
                const displayLabel = isExpanded ? arc.label : truncLabel(arc.label);
                return (
                  <text
                    key={`grp-${arc.id}`}
                    x={lx}
                    y={ly}
                    textAnchor={anchorFor(arc.midAngle)}
                    dominantBaseline="middle"
                    className="select-none"
                    fontSize={isExpanded ? 12 : 13}
                    fontWeight={600}
                    fill={isExpanded ? arc.color : activeId ? "#94a3b8" : "#1e293b"}
                    stroke={isExpanded ? "white" : "none"}
                    strokeWidth={isExpanded ? 4 : 0}
                    paintOrder="stroke"
                    style={{
                      transition: "fill 200ms",
                      cursor: isTruncated ? "pointer" : "default",
                    }}
                    onClick={(e) => {
                      if (isTruncated) {
                        e.stopPropagation();
                        setExpandedGroupId(isExpanded ? null : arc.id);
                      }
                    }}
                  >
                    {displayLabel}
                    {!isExpanded && isTruncated && <title>{arc.label}</title>}
                  </text>
                );
              })}

              {/* Center content */}
              <text
                x={0} y={-10}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={16} fontWeight={600}
                fill="#1e293b"
                className="select-none pointer-events-none"
              >
                {activeId
                  ? targetMap.get(activeId)?.sourceLabel ?? ""
                  : targets[0]?.country ?? "Country"}
              </text>
              <text
                x={0} y={14}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={11}
                fill="#94a3b8"
                className="select-none pointer-events-none"
              >
                {activeId
                  ? `${activeConns.length} connection${activeConns.length !== 1 ? "s" : ""}`
                  : `${targets.length} targets · ${totalAligned} aligned`}
              </text>
            </svg>

            {/* Legend — structured grid */}
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-[auto_auto_auto] gap-x-8 gap-y-1 text-[11px] justify-start">
              {/* Document column */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">Document</p>
                <div className="flex flex-col gap-1">
                  {arcs.map((arc) => (
                    <span key={arc.id} className="flex items-center gap-1.5" title={arc.label}>
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: arc.color }} />
                      <span className="text-[var(--undp-gray)]">
                        {truncLabel(arc.label, 22)} ({arc.count})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Connection strength column */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">Connection strength</p>
                <div className="flex flex-col gap-1">
                  {(["high", "medium", "low"] as AlignmentLevel[]).map((level) => (
                    <span key={level} className="flex items-center gap-1.5">
                      <span className="w-5 h-0.5 rounded shrink-0" style={{ backgroundColor: ALIGNMENT_COLORS[level] }} />
                      <span className="text-[var(--undp-gray)] capitalize">{level}</span>
                    </span>
                  ))}
                  {totalContra > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-0.5 rounded shrink-0" style={{ backgroundColor: ALIGNMENT_COLORS.high_contradiction, borderBottom: "2px dashed" }} />
                      <span className="text-[var(--undp-gray)]">Contradiction</span>
                    </span>
                  )}
                </div>
              </div>
              {/* NR7 column */}
              {showNr7 && nr7ProgressMap.size > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">NR7 Progress</p>
                  <div className="flex flex-col gap-1">
                    {(["on_track", "limited", "no_progress"] as const).map((status) => (
                      <span key={status} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: NR7_BADGE_COLORS[status] }} />
                        <span className="text-[var(--undp-gray)]">{NR7_BADGE_LABELS[status]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-[360px] shrink-0 self-start sticky top-20">
            <DetailPanel
              node={selectedNode}
              connections={selectedConns}
              onClose={() => {
                setSelectedId(null);
                setComparedPair(null);
              }}
              onSelectPair={(r) => {
                const otherId =
                  r.targetAId === selectedId ? r.targetBId : r.targetAId;
                const other = targetMap.get(otherId);
                if (other) setComparedPair({ result: r, other });
              }}
              comparedPair={comparedPair}
              onBackFromPair={() => setComparedPair(null)}
              nr7Item={selectedId ? nr7ItemMap.get(selectedId) ?? null : null}
              nr7ProgressMap={showNr7 ? nr7ProgressMap : undefined}
            />
          </div>
        )}
      </div>
    </section>
  );
}
