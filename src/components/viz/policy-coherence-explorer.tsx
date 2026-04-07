"use client";

import React, { useState, useMemo, useCallback } from "react";
import { arc as d3Arc } from "d3-shape";
import {
  DOC_COLORS,
  DOC_LABELS,
  DOC_MEDIUM_LABELS,
  DOC_FULL_LABELS,
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
} from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { isContradiction } from "@/types";
import { TargetTextWithHighlights, ActivitiesActions } from "./target-text";
import type {
  Target,
  PolicyDocumentType,
  AlignmentResult,
  AlignmentLevel,
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
type AlignFilter = "all" | "high_medium" | "high_contra" | "high" | "contradictions";


// ─── SVG layout constants ───────────────────────────────────────────

const GAP = 0.08;
const OUTER_R = 225;
const INNER_R = 218;
const NODE_R = 210;
const LABEL_R = 238;
const GRP_LABEL_R = 292;
const VB = 720;
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
      label: DOC_FULL_LABELS[d],
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
    if (f === "high_contra")
      return x.alignment === "high" || isContradiction(x.alignment);
    return x.alignment === "high";
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
  const sorted = [...connections].sort((a, b) => {
    const order: Record<AlignmentLevel, number> = {
      high_contradiction: 0, moderate_contradiction: 1, low_tension: 2,
      high: 3, medium: 4, low: 5,
      none: 6,
    };
    return order[a.alignment] - order[b.alignment];
  });

  // Show the first rationale by default so the interaction pattern is obvious.
  // Parent passes `key={node.id}`, so this initialiser re-runs when node changes.
  const [expandedRationaleId, setExpandedRationaleId] = useState<string | null>(
    () => sorted.find((conn) => conn.description)?.otherTarget.id ?? null,
  );

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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
                {DOC_LABELS[t.sourceDocument]}: {t.sourceLabel}
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
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
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
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
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
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
            Connections ({connections.length})
          </p>
          {hasNr7InConns && (
            <div className="flex items-center gap-2 text-[11px] text-[var(--undp-gray)]">
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
                      className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-none"
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
                      className="text-[11px] font-medium shrink-0"
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
                      className="flex items-center gap-1 text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors mb-1"
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
  focusTargetId?: string | null;
}

export function PolicyCoherenceExplorer({
  targets,
  alignment,
  sectors,
  themes,
  nbsCategories,
  classifications,
  nr7Data,
  focusTargetId,
}: PolicyCoherenceExplorerProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>("document");
  const [filter, setFilter] = useState<AlignFilter>("high_contra");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [comparedPair, setComparedPair] = useState<{
    result: AlignmentResult;
    other: Target;
  } | null>(null);
  const [hiddenDocs, setHiddenDocs] = useState<Set<string>>(() => new Set(["LDN", "SECTORAL", "BTR", "OTHER"]));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // External focus: when Tensions section links to a specific target.
  // Track prop changes during render so we don't run setState inside an effect
  // (see React docs: "Adjusting some state when a prop changes").
  const [trackedFocusTargetId, setTrackedFocusTargetId] = useState(focusTargetId);
  if (focusTargetId !== trackedFocusTargetId) {
    setTrackedFocusTargetId(focusTargetId);
    if (focusTargetId) {
      setSelectedId(focusTargetId);
      setFilter("contradictions");
      const t = targets.find((tt) => tt.id === focusTargetId);
      if (t) {
        setHiddenDocs((prev) => {
          if (!prev.has(t.sourceDocument)) return prev;
          const next = new Set(prev);
          next.delete(t.sourceDocument);
          return next;
        });
      }
    }
  }

  /** All document types present in the data */
  const availableDocs = useMemo(() => {
    const order: PolicyDocumentType[] = ["NDC", "NBSAP", "NAP", "LDN", "SECTORAL", "BTR", "OTHER"];
    const present = new Set(targets.map((t) => t.sourceDocument));
    return order.filter((d) => present.has(d));
  }, [targets]);

  const toggleDoc = (doc: string) =>
    setHiddenDocs((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc);
      else next.add(doc);
      return next;
    });

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
    () => targets.filter((t) => !hiddenDocs.has(t.sourceDocument)),
    [targets, hiddenDocs],
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
    () => computeLayout(groups, filtered),
    [groups, filtered],
  );

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const groupColorMap = useMemo(() => new Map(arcs.map((a) => [a.id, a.color])), [arcs]);
  const targetMap = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);

  // Ambient connections — shown faintly when no node is active
  // Must match the selected filter so users see what they asked for
  const ambientConns = useMemo(() => filtered, [filtered]);

  // Scale ambient opacity inversely with edge count so dense views stay readable
  const ambientOpacity = useMemo(() => {
    const n = ambientConns.length;
    if (n <= 50) return 0.25;
    if (n >= 1000) return 0.03;
    const t = (n - 50) / (1000 - 50);
    return 0.25 - t * 0.22;
  }, [ambientConns.length]);

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
  }, []);

  const handleGroupChange = useCallback((m: GroupMode) => {
    setGroupMode(m);
    setSelectedId(null);
    setComparedPair(null);
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

  const { minConn, maxConn } = useMemo(() => {
    if (nodes.length === 0) return { minConn: 0, maxConn: 1 };
    const vals = nodes.map((n) => n.connections);
    return { minConn: Math.min(...vals), maxConn: Math.max(...vals) };
  }, [nodes]);

  const nodeSize = useCallback(
    (n: NodePos) => {
      const range = maxConn - minConn || 1;
      const t = (n.connections - minConn) / range; // 0..1
      return 3.5 + t * 7; // 3.5px to 10.5px
    },
    [minConn, maxConn],
  );

  return (
    <section id="coherence-explorer" className="mb-10">
      {/* Header + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            Policy Coherence Explorer
            <InfoBox>
              This visualization maps alignment relationships between policy targets across your documents. <strong>Lines</strong> between targets represent assessed relationships. Thicker, darker lines show stronger alignment. Dashed red lines indicate contradictions.
              <br /><br />
              The <strong>coherency score</strong> is a quality-weighted percentage: each aligned pair scores 1–3 points (low/medium/high), divided by the maximum possible score.
            </InfoBox>
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-0.5">
            {totalAligned} alignment opportunit{totalAligned !== 1 ? "ies" : "y"} across {groups.length} {
              ({ document: ["document type", "document types"], theme: ["cross-cutting theme", "cross-cutting themes"], sector: ["sector", "sectors"], nbs: ["NBS category", "NBS categories"] } as Record<GroupMode, [string, string]>)[groupMode][groups.length !== 1 ? 1 : 0]
            }
            {totalContra > 0 && (
              <>
                {", "}
                <button
                  type="button"
                  onClick={() => setFilter(filter === "contradictions" ? "all" : "contradictions")}
                  className="text-red-600 hover:underline font-medium"
                >
                  {totalContra} contradiction{totalContra !== 1 ? "s" : ""}
                </button>
              </>
            )}
            . Hover or click a target to explore connections.
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
            <option value="high_contra">High + Contradictions</option>
            <option value="high_medium">High + Medium</option>
            <option value="all">All connections</option>
            <option value="high">High only</option>
            <option value="contradictions">Contradictions only</option>
          </select>
          {availableDocs.map((doc) => {
            const active = !hiddenDocs.has(doc);
            const color = DOC_COLORS[doc];
            return (
              <button
                key={doc}
                type="button"
                onClick={() => toggleDoc(doc)}
                className={`flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? ""
                    : "border-gray-200 bg-white text-[var(--undp-gray)] hover:border-gray-300"
                }`}
                style={active ? { color, borderColor: `${color}66`, backgroundColor: `${color}1a` } : undefined}
              >
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ backgroundColor: active ? color : "#d1d5db" }}
                />
                {DOC_LABELS[doc]}
              </button>
            );
          })}

          {/* Target search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Find a target…"
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30 w-44"
            />
            {searchOpen && searchQuery.length >= 2 && (() => {
              const q = searchQuery.toLowerCase();
              const matches = visibleTargets
                .filter((t) =>
                  t.sourceLabel.toLowerCase().includes(q) ||
                  t.text.toLowerCase().includes(q) ||
                  DOC_FULL_LABELS[t.sourceDocument].toLowerCase().includes(q),
                )
                .slice(0, 8);
              if (matches.length === 0) return null;
              return (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
                  {matches.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => {
                        handleNodeClick(t.id);
                        setSearchQuery("");
                        setSearchOpen(false);
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                      />
                      <span className="text-xs text-[var(--undp-black)] truncate">
                        <span className="font-medium text-[var(--undp-gray)]">
                          {DOC_LABELS[t.sourceDocument]}
                        </span>
                        {" "}{t.sourceLabel}
                      </span>
                    </button>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Click-away handler for search dropdown — only when dropdown is visible */}
      {searchOpen && searchQuery.length >= 2 && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSearchOpen(false)}
        />
      )}

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
                const arcMidR = (INNER_R + OUTER_R) / 2;
                const badgeX = arcMidR * Math.sin(arc.midAngle);
                const badgeY = -arcMidR * Math.cos(arc.midAngle);
                return (
                  <g key={arc.id}>
                    <path
                      d={d ?? ""}
                      fill={arc.color}
                      opacity={activeId ? (hasActiveNode ? 0.8 : 0.12) : 0.65}
                      className="transition-opacity duration-200"
                      style={{ pointerEvents: "none" }}
                    />
                    {/* Count badge on arc in overview mode */}
                    {!activeId && arc.count > 0 && (
                      <text
                        x={badgeX}
                        y={badgeY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={9}
                        fontWeight={600}
                        fill="white"
                        className="select-none pointer-events-none"
                      >
                        {arc.count}
                      </text>
                    )}
                  </g>
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
                      opacity={isContraMode ? 0.55 : ambientOpacity}
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
                      opacity={conn.alignment === "high" ? 0.85 : conn.alignment === "medium" ? 0.7 : 0.6}
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
                const useGroupColor = groupMode !== "document";
                const nodeColor = useGroupColor
                  ? (groupColorMap.get(node.groupId) ?? DOC_COLORS[node.target.sourceDocument])
                  : DOC_COLORS[node.target.sourceDocument];
                return (
                  <g key={node.id}>
                    {isActive && (
                      <circle
                        cx={node.x} cy={node.y} r={r + 5}
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth={2}
                        opacity={0.4}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    {isConnected && !isActive && (
                      <circle
                        cx={node.x} cy={node.y} r={r + 3}
                        fill="none"
                        stroke={nodeColor}
                        strokeWidth={1.5}
                        opacity={0.25}
                        style={{ pointerEvents: "none" }}
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill={nodeColor}
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
                    >
                      <title>{DOC_MEDIUM_LABELS[node.target.sourceDocument]}: {node.target.sourceLabel}</title>
                    </circle>
                    {/* Small doc-type indicator dot in non-document modes */}
                    {useGroupColor && r >= 4 && !isDimmed && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={2.5}
                        fill={DOC_COLORS[node.target.sourceDocument]}
                        stroke="white"
                        strokeWidth={0.5}
                        className="pointer-events-none"
                      />
                    )}
                  </g>
                );
              })}

              {/* Node labels — only when a node is active/hovered, with collision avoidance */}
              {activeId && (() => {
                // Collect connected nodes and sort by alignment strength
                const labelNodes: { node: NodePos; isActive: boolean }[] = [];
                for (const node of nodes) {
                  if (node.id === activeId) labelNodes.push({ node, isActive: true });
                  else if (connectedIds.has(node.id)) labelNodes.push({ node, isActive: false });
                }
                // Sort: active first, then by angle for spacing check
                const sorted = labelNodes.sort((a, b) => {
                  if (a.isActive) return -1;
                  if (b.isActive) return 1;
                  return a.node.angle - b.node.angle;
                });
                // Greedily filter: skip labels too close to an already-placed label
                const MIN_ANGLE_GAP = 0.12; // ~7 degrees minimum between labels
                const placed: number[] = [];
                const visible: typeof sorted = [];
                for (const entry of sorted) {
                  const tooClose = placed.some(
                    (a) => Math.abs(entry.node.angle - a) < MIN_ANGLE_GAP,
                  );
                  if (entry.isActive || !tooClose) {
                    visible.push(entry);
                    placed.push(entry.node.angle);
                  }
                }
                const showDocCtx = groupMode !== "document";
                return visible.map(({ node, isActive }) => {
                  const lx = LABEL_R * Math.sin(node.angle);
                  const ly = -LABEL_R * Math.cos(node.angle);
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
                          ? docColor
                          : "#334155"
                      }
                      style={{ transition: "fill 200ms, font-size 200ms" }}
                    >
                      {showDocCtx && (
                        <tspan fontWeight={700} fontSize={isActive ? 9 : 7}>
                          {DOC_MEDIUM_LABELS[node.target.sourceDocument]}{" "}
                        </tspan>
                      )}
                      {node.target.sourceLabel}
                    </text>
                  );
                });
              })()}

              {/* Group labels — positioned radially with collision avoidance */}
              {(() => {
                // Estimate label height in SVG units (~14px per label)
                const LABEL_H = 14;
                // Minimum angular gap to avoid overlap (based on label height / radius)
                const MIN_GAP = LABEL_H / GRP_LABEL_R;

                const entries = arcs.map((arc) => ({
                  arc,
                  angle: arc.midAngle,
                }));

                // Sort by angle for overlap detection
                const sorted = [...entries].sort((a, b) => a.angle - b.angle);

                // Bi-directional spread: find clusters and spread from center
                // First pass: push forward to enforce minimum gap
                for (let i = 1; i < sorted.length; i++) {
                  const gap = sorted[i].angle - sorted[i - 1].angle;
                  if (gap < MIN_GAP) {
                    sorted[i].angle = sorted[i - 1].angle + MIN_GAP;
                  }
                }
                // Second pass: if labels were pushed too far, pull back from the end
                const maxAngle = 2 * Math.PI - MIN_GAP;
                if (sorted.length > 1 && sorted[sorted.length - 1].angle > maxAngle) {
                  for (let i = sorted.length - 2; i >= 0; i--) {
                    const gap = sorted[i + 1].angle - sorted[i].angle;
                    if (gap < MIN_GAP) {
                      sorted[i].angle = sorted[i + 1].angle - MIN_GAP;
                    }
                  }
                }

                return sorted.map(({ arc, angle }) => {
                  // Leader line: from arc outer edge (at original midAngle) to label position
                  const arcX = (OUTER_R + 3) * Math.sin(arc.midAngle);
                  const arcY = -(OUTER_R + 3) * Math.cos(arc.midAngle);
                  const lx = GRP_LABEL_R * Math.sin(angle);
                  const ly = -GRP_LABEL_R * Math.cos(angle);
                  // Small elbow point just outside arc
                  const elbowR = OUTER_R + 14;
                  const elbowX = elbowR * Math.sin(angle);
                  const elbowY = -elbowR * Math.cos(angle);
                  const anchor = anchorFor(angle);
                  // Nudge label slightly away from leader endpoint
                  const nudge = anchor === "start" ? 3 : anchor === "end" ? -3 : 0;
                  return (
                    <g key={`grp-${arc.id}`}>
                      <path
                        d={`M${arcX},${arcY} L${elbowX},${elbowY} L${lx},${ly}`}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={1}
                        opacity={activeId ? 0.2 : 0.35}
                        className="pointer-events-none"
                      />
                      <text
                        x={lx + nudge}
                        y={ly}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        className="select-none"
                        fontSize={11}
                        fontWeight={600}
                        fill={activeId ? "#94a3b8" : arc.color}
                        style={{ letterSpacing: "0.04em", transition: "fill 200ms" }}
                      >
                        {arc.label}
                      </text>
                    </g>
                  );
                });
              })()}

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
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-[auto_auto] gap-x-8 gap-y-1 text-[11px] justify-start">
              {/* Document column */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                  {groupMode === "document" ? "Document" : groupMode === "theme" ? "Theme" : groupMode === "sector" ? "Sector" : "NBS Category"}
                </p>
                <div className="flex flex-col gap-1">
                  {arcs.map((arc) => (
                    <span key={arc.id} className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: arc.color }} />
                      <span className="text-[var(--undp-gray)]">
                        {arc.label} ({arc.count})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              {/* Connection strength column */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">Connection strength</p>
                <div className="flex flex-col gap-1">
                  {([
                    ["high", "High: strong synergy"],
                    ["medium", "Medium: complementary"],
                    ["low", "Low: loosely related"],
                  ] as [AlignmentLevel, string][]).map(([level, desc]) => (
                    <span key={level} className="flex items-center gap-1.5">
                      <span className="w-6 h-1 rounded-full shrink-0" style={{ backgroundColor: ALIGNMENT_COLORS[level] }} />
                      <span className="text-[var(--undp-gray)]">{desc}</span>
                    </span>
                  ))}
                  {totalContra > 0 && (
                    <span className="flex items-center gap-1.5">
                      <svg width="24" height="4" className="shrink-0"><line x1="0" y1="2" x2="24" y2="2" stroke={ALIGNMENT_COLORS.high_contradiction} strokeWidth="3" strokeDasharray="4 3" strokeLinecap="round" /></svg>
                      <span className="text-[var(--undp-gray)]">Contradiction: potential conflict</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div className="w-[360px] shrink-0 self-start sticky top-20">
            <DetailPanel
              key={selectedNode.id}
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
              nr7ProgressMap={nr7ProgressMap}
            />
          </div>
        )}
      </div>
    </section>
  );
}
