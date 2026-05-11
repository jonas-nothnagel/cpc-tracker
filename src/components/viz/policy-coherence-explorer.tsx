"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { arc as d3Arc } from "d3-shape";
import {
  getDocColor,
  getDocFullLabel,
  getDocLabel,
  getDocMediumLabel,
  getDocTypeOrder,
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
} from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { isContradiction } from "@/types";
import { buildChatRequest } from "@/lib/coherence-chat";
import {
  TargetTextWithHighlights,
  ActivitiesActions,
  ActionTypeBadge,
  BTR_ADAPTATION_COLOR,
  OriginalLanguageChip,
} from "./target-text";
import type {
  BtrData,
  CountryConfig,
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

type GroupMode = "document" | "sector" | "globe";
type AlignFilter = "all" | "high_medium" | "high_contra" | "high" | "contradictions";
type ActionTypeFilter = "all" | "mitigation" | "adaptation";


// ─── SVG layout constants ───────────────────────────────────────────

const GAP = 0.08;
const OUTER_R = 225;
const INNER_R = 218;
const NODE_R = 210;
const LABEL_R = 238;
const GRP_LABEL_R = 292;
const VB = 720;
// Horizontal viewBox is wider than vertical to leave room for long category
// labels (e.g. "Protected areas and other conservation measures") that would
// otherwise clip on the left or right edge. Wheel geometry stays unchanged;
// only the horizontal padding around it grows.
const VB_W = 940;
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
    // Single-label assignment: each target sits in its primary category
    // (highest-scoring per the ranked classifier). This replaces the
    // previous "first relevant in classifications array" lookup, which
    // was deterministic but arbitrary -- ordering depended on category
    // iteration order in the pipeline rather than on the LLM's actual
    // confidence. Using isPrimary makes the assignment principled and
    // consistent with the bar chart and the Financing Coherence table.
    const c = classifications.find(
      (x) =>
        x.targetId === t.id &&
        x.taxonomyType === taxonomyType &&
        x.isPrimary === true,
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
  globeCategories: TaxCategory[],
  classifications: ThematicClassification[],
  countryConfig?: CountryConfig | null,
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
      label: getDocMediumLabel(countryConfig, d),
      color: getDocColor(countryConfig, d),
      targets: ts,
    }));
  }
  if (mode === "sector") return buildGroupsByTaxonomy(targets, sectors, "sector", classifications);
  return buildGroupsByTaxonomy(targets, globeCategories, "globe", classifications);
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

/**
 * Word-wrap a category label so long names like "Protected areas and other
 * conservation measures" render on two lines and stay inside the wheel's
 * horizontal viewBox. Returns one line for short labels, otherwise the
 * smallest 2-line split that keeps each line under maxCharsPerLine.
 */
function wrapLabel(label: string, maxCharsPerLine: number): string[] {
  if (label.length <= maxCharsPerLine) return [label];
  const words = label.split(/\s+/);
  if (words.length === 1) return [label];
  // Pick the split point that minimises the longer line's length so the
  // two lines feel balanced.
  let bestSplit = 1;
  let bestLonger = Infinity;
  for (let i = 1; i < words.length; i++) {
    const left = words.slice(0, i).join(" ");
    const right = words.slice(i).join(" ");
    const longer = Math.max(left.length, right.length);
    if (longer < bestLonger) {
      bestLonger = longer;
      bestSplit = i;
    }
  }
  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
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
  countryConfig,
}: {
  node: NodePos;
  connections: (AlignmentResult & { otherTarget: Target })[];
  onClose: () => void;
  onSelectPair: (r: AlignmentResult) => void;
  comparedPair: { result: AlignmentResult; other: Target } | null;
  onBackFromPair: () => void;
  nr7Item?: Nr7ProgressItem | null;
  nr7ProgressMap?: Map<string, string>;
  countryConfig?: CountryConfig | null;
}) {
  const sorted = [...connections].sort((a, b) => {
    const order: Record<AlignmentLevel, number> = {
      high_contradiction: 0, moderate_contradiction: 1, low_tension: 2,
      high: 3, medium: 4, low: 5,
      none: 6,
    };
    return order[a.alignment] - order[b.alignment];
  });

  // All rationales start collapsed; the user opens them on demand.
  const [expandedRationaleId, setExpandedRationaleId] = useState<string | null>(
    null,
  );

  if (comparedPair) {
    return (
      <div className="border border-gray-100 rounded-lg bg-white overflow-hidden h-full max-h-[760px] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/50 shrink-0">
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1 flex items-center gap-1.5">
                <span>{getDocLabel(countryConfig, t.sourceDocument)}: {t.sourceLabel}</span>
                <OriginalLanguageChip target={t} />
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
    <div className="border border-gray-100 rounded-lg bg-white overflow-hidden flex flex-col h-full max-h-[760px]">
      {/* Target header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: getDocColor(countryConfig, node.target.sourceDocument) }} />
          <span className="text-sm font-semibold text-[var(--undp-black)] truncate">
            {getDocLabel(countryConfig, node.target.sourceDocument)} · {node.target.sourceLabel}
          </span>
          <ActionTypeBadge actionType={node.target.actionType} />
          <OriginalLanguageChip target={node.target} />
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
                      style={{ backgroundColor: getDocColor(countryConfig, conn.otherTarget.sourceDocument) }}
                    >
                      {getDocLabel(countryConfig, conn.otherTarget.sourceDocument)}
                    </span>
                    <OriginalLanguageChip target={conn.otherTarget} />
                    <ActionTypeBadge actionType={conn.otherTarget.actionType} />
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

// ─── Idle / category panels ─────────────────────────────────────────

function Stat({
  label,
  value,
  accent,
  onClick,
  title,
  active,
}: {
  label: string;
  value: number;
  accent?: "red" | "green";
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) {
  const accentColor =
    accent === "red"
      ? "text-red-700"
      : accent === "green"
        ? "text-emerald-700"
        : "text-[var(--undp-black)]";
  const valueClass = `text-2xl font-semibold tabular-nums leading-none ${accentColor}`;
  const labelClass =
    "text-[10px] text-[var(--undp-gray)] uppercase tracking-wider mt-1.5";
  if (!onClick) {
    return (
      <div>
        <p className={valueClass}>{value}</p>
        <p className={labelClass}>{label}</p>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`text-left -mx-1 px-1.5 py-1 rounded-md transition-colors group ${
        active
          ? "bg-gray-100 ring-1 ring-gray-200"
          : "ring-1 ring-transparent hover:bg-gray-50 hover:ring-gray-200"
      }`}
    >
      <p
        className={`${valueClass} underline decoration-dotted underline-offset-4 ${
          active
            ? "decoration-gray-500"
            : "decoration-gray-300 group-hover:decoration-gray-500"
        }`}
      >
        {value}
      </p>
      <p
        className={`${labelClass} group-hover:text-[var(--undp-black)] transition-colors`}
      >
        {label}
      </p>
    </button>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {title}
      </p>
      {children}
    </section>
  );
}

/**
 * Section with a built-in close button and empty-state fallback. Used when a
 * stat tile in EmptyPanel is toggled into its expanded list view (all
 * targets, all alignments, all tensions). Close returns to the overview.
 */
function StatListSection({
  title,
  onClose,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  onClose: () => void;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)]">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close list"
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-base leading-none px-1"
        >
          ×
        </button>
      </div>
      {isEmpty ? (
        <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
          {empty}
        </p>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * Compact ranking row used by both the idle and category panels. Renders the
 * count proportionally as a horizontal bar fill behind the label so the eye
 * picks up the ordering before reading any numbers.
 */
function BarRow({
  target,
  count,
  max,
  onClick,
  countryConfig,
  tone,
  unit,
}: {
  target: Target;
  count: number;
  max: number;
  onClick: () => void;
  countryConfig?: CountryConfig | null;
  tone: "neutral" | "red";
  /** Optional inline label after the count (e.g., "alignments"). */
  unit?: string;
}) {
  // 4% min so the smallest non-zero count still has a visible pill.
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  const fillBg =
    tone === "red"
      ? "bg-red-50 group-hover:bg-red-100"
      : "bg-gray-100 group-hover:bg-gray-200";
  const countColor =
    tone === "red" ? "text-red-700" : "text-[var(--undp-black)]";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="relative w-full text-left flex items-center gap-2 py-1.5 px-2 rounded transition-colors group overflow-hidden"
      >
        <div
          className={`absolute inset-y-0.5 left-0 rounded ${fillBg} transition-colors`}
          style={{ width: `${pct}%` }}
        />
        <span
          className="relative w-1.5 h-1.5 rounded-full shrink-0"
          style={{
            backgroundColor: getDocColor(
              countryConfig,
              target.sourceDocument,
            ),
          }}
        />
        <span className="relative text-[10px] font-semibold tracking-wide text-[var(--undp-gray)] shrink-0">
          {getDocLabel(countryConfig, target.sourceDocument)}
        </span>
        <span className="relative text-[11px] text-[var(--undp-black)] truncate flex-1">
          {target.sourceLabel}
        </span>
        <span
          className={`relative text-[11px] tabular-nums shrink-0 font-semibold ${countColor}`}
        >
          {count}
          {unit && (
            <span className="text-[9px] uppercase tracking-wider font-medium text-[var(--undp-gray)] ml-1">
              {unit}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

interface ChatStatus {
  loading: boolean;
  reply: string | null;
  error: string | null;
}

/**
 * Compact pair row — two targets stacked, alignment-coloured dot. Click opens
 * the pair compare view (which shows the rationale text). Used by the
 * CategoryPanel's "top conflicts" / "top alignments" sections.
 */
function PairRow({
  a,
  b,
  level,
  onClick,
  countryConfig,
}: {
  a: Target;
  b: Target;
  level: AlignmentLevel;
  onClick: () => void;
  countryConfig?: CountryConfig | null;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left flex items-start gap-2 py-1.5 px-1.5 hover:bg-gray-50 rounded transition-colors"
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5"
          style={{ backgroundColor: ALIGNMENT_COLORS[level] }}
        />
        <div className="min-w-0 flex-1 text-[11px] leading-snug">
          <div className="text-[var(--undp-black)] truncate">
            <span className="text-[var(--undp-gray)] font-medium">
              {getDocLabel(countryConfig, a.sourceDocument)}
            </span>{" "}
            {a.sourceLabel}
          </div>
          <div className="text-[var(--undp-black)] truncate">
            <span className="text-[var(--undp-gray)] font-medium">
              {getDocLabel(countryConfig, b.sourceDocument)}
            </span>{" "}
            {b.sourceLabel}
          </div>
        </div>
      </button>
    </li>
  );
}

interface EmptyPanelProps {
  targets: Target[];
  alignment: AlignmentResult[];
  onSelectTarget: (id: string) => void;
  onSelectPair: (targetAId: string, targetBId: string) => void;
  onAsk: (query: string) => void;
  chat: ChatStatus;
  searchAllDocs: boolean;
  onToggleSearchAll: (v: boolean) => void;
  onSetFilter: (filter: AlignFilter) => void;
  countryConfig?: CountryConfig | null;
}

type StatView = "overview" | "targets" | "alignments" | "tensions";

// Ordering used when listing contradictions in the tensions stat-view so
// high-severity pairs surface first. Module-level so the useMemo dep array
// can reference a stable identity.
const TENSION_SEVERITY: Record<string, number> = {
  high_contradiction: 0,
  moderate_contradiction: 1,
  low_tension: 2,
};

// Three view-scoped example prompts shown as chips. Each maps to a real
// fault line in the visible-scope rankings, so the chat returns a concrete
// answer instead of a generic one.
const EXAMPLE_QUERIES: string[] = [
  "Which target sits in the most tensions?",
  "Show a target that's broadly aligned and contested",
  "Where in this view do plans contradict most?",
];

// Placeholder typed-out on mount so the chat feels alive rather than static.
// Animation runs once per mount; the resulting string is used as the input's
// HTML placeholder so it disappears the moment the user focuses and types.
function useTypedPlaceholder(text: string, charDelayMs = 35): string {
  // Initial state empty; the interval below appends one character per tick.
  // Text is treated as constant per mount (deps below assume it never
  // changes), so no reset path is needed.
  const [typed, setTyped] = useState("");
  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, charDelayMs);
    return () => window.clearInterval(id);
  }, [text, charDelayMs]);
  return typed;
}

/**
 * Chat input + reply. Lives inside EmptyPanel below the "At a glance"
 * stats — borderless so it inherits the EmptyPanel card chrome rather
 * than stacking a card-in-a-card. Reply is only visible while the user
 * is in idle state; once the wheel reshapes into a category or target
 * view, the wheel + panel state IS the answer.
 */
function ChatBar({
  onAsk,
  chat,
  searchAllDocs,
  onToggleSearchAll,
}: {
  onAsk: (query: string) => void;
  chat: ChatStatus;
  searchAllDocs: boolean;
  onToggleSearchAll: (v: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const placeholder = useTypedPlaceholder("Ask about what’s currently in view…");
  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || chat.loading) return;
    onAsk(trimmed);
    setQuery("");
  };
  return (
    <div className="space-y-2">
      <p className="text-[10px] leading-snug">
        <span className="font-semibold uppercase tracking-wider text-[var(--undp-gray)]">
          Ask and explore this view
        </span>
        <span className="text-[var(--undp-gray)] normal-case font-normal tracking-normal">
          {" · Beta."}
        </span>
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
      >
        <div className="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-2 focus-within:border-gray-400 transition-colors">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            disabled={chat.loading}
            className="flex-1 min-w-0 text-[12px] text-[var(--undp-black)] placeholder:text-[var(--undp-gray)] bg-transparent focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={chat.loading || query.trim().length === 0}
            className="text-[11px] font-medium text-[var(--undp-blue)] hover:underline disabled:opacity-30 disabled:no-underline shrink-0"
          >
            {chat.loading ? "Asking…" : "Ask"}
          </button>
        </div>
      </form>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[10px] text-[var(--undp-gray)] leading-snug">
          {searchAllDocs
            ? "Next ask will include all documents."
            : "Searches only what's currently selected."}
        </span>
        <button
          type="button"
          onClick={() => onToggleSearchAll(!searchAllDocs)}
          disabled={chat.loading}
          className="flex items-center gap-1 text-[10px] font-medium text-[var(--undp-blue)] hover:underline disabled:opacity-40 disabled:no-underline shrink-0"
        >
          {searchAllDocs && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--undp-blue)]" />
          )}
          {searchAllDocs ? "All documents · cancel" : "Search all documents"}
        </button>
      </div>
      {chat.reply && !chat.loading && (
        <p className="text-[11px] text-[var(--undp-black)] leading-snug bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] mr-1.5">
            AI
          </span>
          {chat.reply}
        </p>
      )}
      {chat.error && !chat.loading && (
        <p className="text-[11px] text-red-700 leading-snug bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {chat.error}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => submit(q)}
            disabled={chat.loading}
            className="text-left text-[10.5px] leading-snug text-[var(--undp-gray)] border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-50 hover:border-gray-300 hover:text-[var(--undp-black)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyPanel({
  targets,
  alignment,
  onSelectTarget,
  onSelectPair,
  onAsk,
  chat,
  searchAllDocs,
  onToggleSearchAll,
  onSetFilter,
  countryConfig,
}: EmptyPanelProps) {
  // Stats are interactive: clicking a stat sets the wheel filter AND swaps
  // the middle section to a full list of that kind of item (targets, strong
  // alignment pairs, or contradiction pairs). Clicking the same stat again
  // closes the list and returns to the overview ranking layout.
  const [statView, setStatView] = useState<StatView>("overview");
  const toggleStatView = (view: StatView, filter: AlignFilter) => {
    onSetFilter(filter);
    setStatView((prev) => (prev === view ? "overview" : view));
  };
  // Compute totals from the alignment set we're already iterating below —
  // this keeps the headline numbers aligned with the wheel's current filter
  // rather than diverging from the rankings underneath. Alignments and
  // contradictions are mutually exclusive in this count so the AT A GLANCE
  // numbers match the header summary ("X strong alignments and Y
  // contradictions") rather than double-counting contradictions as
  // alignments.
  const { totalAligned, totalContra } = useMemo(() => {
    let a = 0;
    let c = 0;
    for (const x of alignment) {
      if (x.alignment === "none") continue;
      if (isContradiction(x.alignment)) c += 1;
      else a += 1;
    }
    return { totalAligned: a, totalContra: c };
  }, [alignment]);
  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets],
  );

  // Two complementary rankings: targets with the most strong (high) alignments
  // and targets with the most potential conflicts. Counting medium/low edges
  // would let "broadly mentioned" targets dominate the alignment column for
  // reasons that aren't really about coherence — strong-only keeps the signal
  // tight. Both metrics use the wheel's current alignment subset so numbers
  // match what's drawn.
  const { connRanks, tensRanks } = useMemo(() => {
    const connCounts = new Map<string, number>();
    const tensCounts = new Map<string, number>();
    for (const a of alignment) {
      if (a.alignment === "high") {
        connCounts.set(a.targetAId, (connCounts.get(a.targetAId) ?? 0) + 1);
        connCounts.set(a.targetBId, (connCounts.get(a.targetBId) ?? 0) + 1);
      } else if (isContradiction(a.alignment)) {
        tensCounts.set(a.targetAId, (tensCounts.get(a.targetAId) ?? 0) + 1);
        tensCounts.set(a.targetBId, (tensCounts.get(a.targetBId) ?? 0) + 1);
      }
    }
    const toRanked = (m: Map<string, number>) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, count]) => ({ target: targetMap.get(id), count }))
        .filter((x): x is { target: Target; count: number } => !!x.target);
    return {
      connRanks: toRanked(connCounts),
      tensRanks: toRanked(tensCounts),
    };
  }, [alignment, targetMap]);

  const connMax = connRanks[0]?.count ?? 1;
  const tensMax = tensRanks[0]?.count ?? 1;

  // Stat-view lists: only computed when the user has opened a stat view, so
  // the default idle render stays cheap. Each list is sorted to put the most
  // diagnostic items first.
  const allTargetsRanked = useMemo(() => {
    if (statView !== "targets") return [];
    const counts = new Map<string, number>();
    for (const a of alignment) {
      if (a.alignment === "none") continue;
      counts.set(a.targetAId, (counts.get(a.targetAId) ?? 0) + 1);
      counts.set(a.targetBId, (counts.get(a.targetBId) ?? 0) + 1);
    }
    return targets
      .map((t) => ({ target: t, count: counts.get(t.id) ?? 0 }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.target.sourceLabel.localeCompare(
          b.target.sourceLabel,
          undefined,
          { numeric: true },
        );
      });
  }, [statView, alignment, targets]);

  // Per-target degree counts: how many strong alignments / contradictions
  // each target is involved in within the current view. Used to weight pairs
  // in the list views so pairs touching "hub" targets surface first.
  const { highDegree, tensionDegree } = useMemo(() => {
    const hi = new Map<string, number>();
    const te = new Map<string, number>();
    for (const a of alignment) {
      if (a.alignment === "high") {
        hi.set(a.targetAId, (hi.get(a.targetAId) ?? 0) + 1);
        hi.set(a.targetBId, (hi.get(a.targetBId) ?? 0) + 1);
      } else if (isContradiction(a.alignment)) {
        te.set(a.targetAId, (te.get(a.targetAId) ?? 0) + 1);
        te.set(a.targetBId, (te.get(a.targetBId) ?? 0) + 1);
      }
    }
    return { highDegree: hi, tensionDegree: te };
  }, [alignment]);

  // Sort by max-endpoint degree first (groups all of a hub's pairs together,
  // so the most-aligned/most-conflicted target's full set of pairs reads as
  // a block) then by the partner's degree (within a hub, pairs touching
  // another well-connected target rank above pairs touching a leaf).
  const allAlignmentPairs = useMemo(() => {
    if (statView !== "alignments") return [];
    return alignment
      .filter((a) => a.alignment === "high")
      .slice()
      .sort((a, b) => {
        const aDegs = [
          highDegree.get(a.targetAId) ?? 0,
          highDegree.get(a.targetBId) ?? 0,
        ];
        const bDegs = [
          highDegree.get(b.targetAId) ?? 0,
          highDegree.get(b.targetBId) ?? 0,
        ];
        const aMax = Math.max(...aDegs);
        const bMax = Math.max(...bDegs);
        if (aMax !== bMax) return bMax - aMax;
        const aMin = Math.min(...aDegs);
        const bMin = Math.min(...bDegs);
        if (aMin !== bMin) return bMin - aMin;
        const ta = targetMap.get(a.targetAId);
        const tb = targetMap.get(b.targetAId);
        return (ta?.sourceLabel ?? "").localeCompare(
          tb?.sourceLabel ?? "",
          undefined,
          { numeric: true },
        );
      });
  }, [statView, alignment, highDegree, targetMap]);

  const allTensionPairs = useMemo(() => {
    if (statView !== "tensions") return [];
    return alignment
      .filter((a) => isContradiction(a.alignment))
      .slice()
      .sort((a, b) => {
        const aDegs = [
          tensionDegree.get(a.targetAId) ?? 0,
          tensionDegree.get(a.targetBId) ?? 0,
        ];
        const bDegs = [
          tensionDegree.get(b.targetAId) ?? 0,
          tensionDegree.get(b.targetBId) ?? 0,
        ];
        const aMax = Math.max(...aDegs);
        const bMax = Math.max(...bDegs);
        if (aMax !== bMax) return bMax - aMax;
        const aMin = Math.min(...aDegs);
        const bMin = Math.min(...bDegs);
        if (aMin !== bMin) return bMin - aMin;
        return (
          (TENSION_SEVERITY[a.alignment] ?? 9) -
          (TENSION_SEVERITY[b.alignment] ?? 9)
        );
      });
  }, [statView, alignment, tensionDegree]);

  const allTargetsMax = allTargetsRanked[0]?.count ?? 1;

  // Group targets by source document for the targets list view. Each doc
  // group renders as a collapsible section so 60+ targets don't all flood
  // the panel at once — users expand the docs they care about.
  const targetsByDoc = useMemo(() => {
    if (statView !== "targets") return [];
    const groups = new Map<string, { target: Target; count: number }[]>();
    for (const item of allTargetsRanked) {
      const doc = item.target.sourceDocument;
      const list = groups.get(doc) ?? [];
      list.push(item);
      groups.set(doc, list);
    }
    return Array.from(groups.entries())
      .map(([doc, items]) => ({
        doc,
        items,
        totalCount: items.reduce((s, i) => s + i.count, 0),
      }))
      // Order by total alignment count across the doc desc so the most
      // active documents sit at the top.
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [statView, allTargetsRanked]);

  return (
    <div className="bg-white border border-gray-100 rounded-lg flex flex-col h-full max-h-[760px] overflow-hidden">
      <div className="p-5 overflow-y-auto flex-1 space-y-6">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] mb-3">
            At a glance
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Stat
              label="Targets"
              value={targets.length}
              onClick={() => toggleStatView("targets", "all")}
              title="Browse all visible targets"
              active={statView === "targets"}
            />
            <Stat
              label="Alignments"
              value={totalAligned}
              accent="green"
              onClick={() => toggleStatView("alignments", "high")}
              title="Browse all strong alignment pairs"
              active={statView === "alignments"}
            />
            <Stat
              label="Potential tensions"
              value={totalContra}
              accent="red"
              onClick={() => toggleStatView("tensions", "contradictions")}
              title="Browse all contradiction pairs"
              active={statView === "tensions"}
            />
          </div>
        </div>

        {statView === "overview" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Section title="Strongest alignments">
              {connRanks.length > 0 ? (
                <ul className="space-y-0.5">
                  {connRanks.map(({ target, count }) => (
                    <BarRow
                      key={target.id}
                      target={target}
                      count={count}
                      max={connMax}
                      onClick={() => onSelectTarget(target.id)}
                      countryConfig={countryConfig}
                      tone="neutral"
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No strong alignments for the current selection.
                </p>
              )}
            </Section>
            <Section title="Most conflicted targets">
              {tensRanks.length > 0 ? (
                <ul className="space-y-0.5">
                  {tensRanks.map(({ target, count }) => (
                    <BarRow
                      key={target.id}
                      target={target}
                      count={count}
                      max={tensMax}
                      onClick={() => onSelectTarget(target.id)}
                      countryConfig={countryConfig}
                      tone="red"
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No potential tensions for the current selection.
                </p>
              )}
            </Section>
          </div>
        )}

        {statView === "targets" && (
          <StatListSection
            title={`All targets · ${allTargetsRanked.length}`}
            onClose={() => setStatView("overview")}
            empty="No targets in the current view."
            isEmpty={allTargetsRanked.length === 0}
          >
            <div className="space-y-1">
              {targetsByDoc.map(({ doc, items }) => {
                const color = getDocColor(countryConfig, doc);
                const label = getDocLabel(countryConfig, doc);
                return (
                  <details key={doc} className="group">
                    <summary className="list-none cursor-pointer flex items-center gap-2 py-1.5 px-1 rounded hover:bg-gray-50 transition-colors select-none">
                      <svg
                        width="8"
                        height="8"
                        viewBox="0 0 8 8"
                        className="transition-transform group-open:rotate-90 text-[var(--undp-gray)] shrink-0"
                      >
                        <path
                          d="M2 1l4 3-4 3"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-[11px] font-semibold text-[var(--undp-black)]">
                        {label}
                      </span>
                      <span className="text-[10px] text-[var(--undp-gray)] tabular-nums">
                        · {items.length} target{items.length !== 1 ? "s" : ""}
                      </span>
                    </summary>
                    <ul className="space-y-0.5 pl-4 mt-1 mb-2">
                      {items.map(({ target, count }) => (
                        <BarRow
                          key={target.id}
                          target={target}
                          count={count}
                          max={allTargetsMax}
                          onClick={() => onSelectTarget(target.id)}
                          countryConfig={countryConfig}
                          tone="neutral"
                        />
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </StatListSection>
        )}

        {statView === "alignments" && (
          <StatListSection
            title={`All alignments · ${allAlignmentPairs.length}`}
            onClose={() => setStatView("overview")}
            empty="No strong alignments in the current view."
            isEmpty={allAlignmentPairs.length === 0}
          >
            <ul className="space-y-0.5">
              {allAlignmentPairs.map((p) => {
                // Display the higher-degree endpoint on top of the pair so
                // the hub target is what the eye lands on first.
                const degA = highDegree.get(p.targetAId) ?? 0;
                const degB = highDegree.get(p.targetBId) ?? 0;
                const [firstId, secondId] =
                  degA >= degB
                    ? [p.targetAId, p.targetBId]
                    : [p.targetBId, p.targetAId];
                const tFirst = targetMap.get(firstId);
                const tSecond = targetMap.get(secondId);
                if (!tFirst || !tSecond) return null;
                return (
                  <PairRow
                    key={`a-${p.targetAId}-${p.targetBId}`}
                    a={tFirst}
                    b={tSecond}
                    level={p.alignment}
                    onClick={() => onSelectPair(firstId, secondId)}
                    countryConfig={countryConfig}
                  />
                );
              })}
            </ul>
          </StatListSection>
        )}

        {statView === "tensions" && (
          <StatListSection
            title={`All tensions · ${allTensionPairs.length}`}
            onClose={() => setStatView("overview")}
            empty="No tensions in the current view."
            isEmpty={allTensionPairs.length === 0}
          >
            <ul className="space-y-0.5">
              {allTensionPairs.map((p) => {
                const degA = tensionDegree.get(p.targetAId) ?? 0;
                const degB = tensionDegree.get(p.targetBId) ?? 0;
                const [firstId, secondId] =
                  degA >= degB
                    ? [p.targetAId, p.targetBId]
                    : [p.targetBId, p.targetAId];
                const tFirst = targetMap.get(firstId);
                const tSecond = targetMap.get(secondId);
                if (!tFirst || !tSecond) return null;
                return (
                  <PairRow
                    key={`t-${p.targetAId}-${p.targetBId}`}
                    a={tFirst}
                    b={tSecond}
                    level={p.alignment}
                    onClick={() => onSelectPair(firstId, secondId)}
                    countryConfig={countryConfig}
                  />
                );
              })}
            </ul>
          </StatListSection>
        )}

        <ChatBar
          onAsk={onAsk}
          chat={chat}
          searchAllDocs={searchAllDocs}
          onToggleSearchAll={onToggleSearchAll}
        />

      </div>
    </div>
  );
}

interface CategoryPanelProps {
  group: GroupArc;
  nodes: NodePos[];
  arcs: GroupArc[];
  alignment: AlignmentResult[];
  onClose: () => void;
  onSelectTarget: (id: string) => void;
  onSelectPair: (targetAId: string, targetBId: string) => void;
  onSelectCategory: (id: string) => void;
  countryConfig?: CountryConfig | null;
}

function CategoryPanel({
  group,
  nodes,
  arcs,
  alignment,
  onClose,
  onSelectTarget,
  onSelectPair,
  onSelectCategory,
  countryConfig,
}: CategoryPanelProps) {
  const targetIdsInGroup = useMemo(
    () => new Set(nodes.filter((n) => n.groupId === group.id).map((n) => n.id)),
    [nodes, group.id],
  );
  const targetsInGroup = useMemo(
    () => nodes.filter((n) => n.groupId === group.id),
    [nodes, group.id],
  );
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const involvedAlignments = useMemo(
    () =>
      alignment.filter(
        (a) =>
          a.alignment !== "none" &&
          (targetIdsInGroup.has(a.targetAId) ||
            targetIdsInGroup.has(a.targetBId)),
      ),
    [alignment, targetIdsInGroup],
  );

  // Alignments and contradictions are mutually exclusive in the panel
  // headers so the totals don't double-count contradictions as alignments.
  const totalContra = involvedAlignments.filter((a) =>
    isContradiction(a.alignment),
  ).length;
  const totalAligned = involvedAlignments.length - totalContra;

  const partnerCounts = useMemo(() => {
    const counts = new Map<string, { synergy: number; tension: number }>();
    for (const a of involvedAlignments) {
      const aIn = targetIdsInGroup.has(a.targetAId);
      const bIn = targetIdsInGroup.has(a.targetBId);
      if (aIn && bIn) continue;
      const partnerNodeId = aIn ? a.targetBId : a.targetAId;
      const partnerNode = nodeMap.get(partnerNodeId);
      if (!partnerNode) continue;
      const partnerGroupId = partnerNode.groupId;
      const cur = counts.get(partnerGroupId) ?? { synergy: 0, tension: 0 };
      if (isContradiction(a.alignment)) cur.tension += 1;
      else cur.synergy += 1;
      counts.set(partnerGroupId, cur);
    }
    return counts;
  }, [involvedAlignments, targetIdsInGroup, nodeMap]);

  const arcMap = useMemo(() => new Map(arcs.map((a) => [a.id, a])), [arcs]);

  const topSynergyPartners = useMemo(
    () =>
      Array.from(partnerCounts.entries())
        .filter(([, v]) => v.synergy > 0)
        .sort((a, b) => b[1].synergy - a[1].synergy)
        .slice(0, 4)
        .map(([id, v]) => ({ arc: arcMap.get(id), count: v.synergy }))
        .filter((x): x is { arc: GroupArc; count: number } => !!x.arc),
    [partnerCounts, arcMap],
  );

  const topTensionPartners = useMemo(
    () =>
      Array.from(partnerCounts.entries())
        .filter(([, v]) => v.tension > 0)
        .sort((a, b) => b[1].tension - a[1].tension)
        .slice(0, 4)
        .map(([id, v]) => ({ arc: arcMap.get(id), count: v.tension }))
        .filter((x): x is { arc: GroupArc; count: number } => !!x.arc),
    [partnerCounts, arcMap],
  );

  // Group targets by their source document. Within a single category,
  // ranking targets by connection count is misleading — broadly-mentioned
  // targets dominate without being meaningfully more central. Grouping by
  // document gives a structural view (whose plan contains what) and the
  // colour stripe per group ties each block back to the wheel's doc colours.
  const targetsByDoc = useMemo(() => {
    const map = new Map<string, NodePos[]>();
    for (const node of targetsInGroup) {
      const list = map.get(node.target.sourceDocument) ?? [];
      list.push(node);
      map.set(node.target.sourceDocument, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        a.target.sourceLabel.localeCompare(b.target.sourceLabel, undefined, {
          numeric: true,
        }),
      );
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) =>
        getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
    );
  }, [targetsInGroup, countryConfig]);

  // Pair listings — what the user usually came here for. Keep contradictions
  // and high alignments separate so each can be hidden when its filter is
  // off (the involvedAlignments arg is already filter-aware).
  const SEVERITY: Record<string, number> = {
    high_contradiction: 0,
    moderate_contradiction: 1,
    low_tension: 2,
    high: 3,
  };
  const contradictionPairs = useMemo(
    () =>
      involvedAlignments
        .filter((a) => isContradiction(a.alignment))
        .sort(
          (a, b) =>
            (SEVERITY[a.alignment] ?? 9) - (SEVERITY[b.alignment] ?? 9),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [involvedAlignments],
  );
  const alignmentPairs = useMemo(
    () => involvedAlignments.filter((a) => a.alignment === "high"),
    [involvedAlignments],
  );

  return (
    <div className="bg-white border border-gray-100 rounded-lg flex flex-col h-full max-h-[760px] overflow-hidden">
      {/* Pinned header with stats so the target list owns the scroll. */}
      <div className="p-5 pb-4 shrink-0 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: group.color }}
            />
            <h3 className="text-base font-semibold text-[var(--undp-black)] truncate">
              {group.label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-lg leading-none shrink-0"
            aria-label="Close category"
          >
            ×
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Targets" value={group.count} />
          <Stat label="Alignments" value={totalAligned} />
          <Stat label="Potential tensions" value={totalContra} accent="red" />
        </div>
      </div>

      <div className="p-5 overflow-y-auto flex-1 space-y-6">
        {/* Flat 2×2 grid so both rows align across columns: row 1 = partner
            overviews, row 2 = per-target pair lists. The grid auto-sizes each
            row to the taller cell, which keeps the pair-list headers level
            even when one column has more partner entries than the other.
            Tone is consistent within a column (red on the left, green on the
            right). Falls back to a single column on narrow viewports. */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-6">
          <div>
            <Section title="Tensions with other categories">
              {topTensionPartners.length > 0 ? (
                <ul className="space-y-0.5">
                  {topTensionPartners.map(({ arc, count }) => (
                    <li key={arc.id}>
                      <button
                        type="button"
                        onClick={() => onSelectCategory(arc.id)}
                        title={arc.label}
                        className="w-full flex items-center gap-2 text-[11px] py-0.5 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors text-left"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: arc.color }}
                        />
                        <span className="text-[var(--undp-black)] truncate flex-1">
                          {arc.label}
                        </span>
                        <span className="text-red-700 tabular-nums">
                          {count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No tensions with other categories.
                </p>
              )}
            </Section>
          </div>
          <div>
            <Section title="Aligns with other categories">
              {topSynergyPartners.length > 0 ? (
                <ul className="space-y-0.5">
                  {topSynergyPartners.map(({ arc, count }) => (
                    <li key={arc.id}>
                      <button
                        type="button"
                        onClick={() => onSelectCategory(arc.id)}
                        title={arc.label}
                        className="w-full flex items-center gap-2 text-[11px] py-0.5 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors text-left"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: arc.color }}
                        />
                        <span className="text-[var(--undp-black)] truncate flex-1">
                          {arc.label}
                        </span>
                        <span className="text-[var(--undp-gray)] tabular-nums">
                          {count}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No alignments with other categories.
                </p>
              )}
            </Section>
          </div>
          <div>
            <Section
              title={
                contradictionPairs.length > 0
                  ? `Top conflicts · ${contradictionPairs.length}`
                  : "Top conflicts"
              }
            >
              {contradictionPairs.length > 0 ? (
                <>
                  <ul className="space-y-0.5">
                    {contradictionPairs.slice(0, 6).map((p) => {
                      const tA = nodeMap.get(p.targetAId)?.target;
                      const tB = nodeMap.get(p.targetBId)?.target;
                      if (!tA || !tB) return null;
                      return (
                        <PairRow
                          key={`c-${p.targetAId}-${p.targetBId}`}
                          a={tA}
                          b={tB}
                          level={p.alignment}
                          onClick={() => onSelectPair(p.targetAId, p.targetBId)}
                          countryConfig={countryConfig}
                        />
                      );
                    })}
                  </ul>
                  {contradictionPairs.length > 6 && (
                    <p className="text-[10px] text-[var(--undp-gray)] mt-1.5 px-1.5">
                      + {contradictionPairs.length - 6} more
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No conflicts in this category.
                </p>
              )}
            </Section>
          </div>
          <div>
            <Section
              title={
                alignmentPairs.length > 0
                  ? `Strongest alignments · ${alignmentPairs.length}`
                  : "Strongest alignments"
              }
            >
              {alignmentPairs.length > 0 ? (
                <>
                  <ul className="space-y-0.5">
                    {alignmentPairs.slice(0, 6).map((p) => {
                      const tA = nodeMap.get(p.targetAId)?.target;
                      const tB = nodeMap.get(p.targetBId)?.target;
                      if (!tA || !tB) return null;
                      return (
                        <PairRow
                          key={`a-${p.targetAId}-${p.targetBId}`}
                          a={tA}
                          b={tB}
                          level={p.alignment}
                          onClick={() => onSelectPair(p.targetAId, p.targetBId)}
                          countryConfig={countryConfig}
                        />
                      );
                    })}
                  </ul>
                  {alignmentPairs.length > 6 && (
                    <p className="text-[10px] text-[var(--undp-gray)] mt-1.5 px-1.5">
                      + {alignmentPairs.length - 6} more
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No strong alignments in this category.
                </p>
              )}
            </Section>
          </div>
        </div>


        {/* Targets folded behind a disclosure — useful when a category has
            many targets (e.g. 20 in NBSAP) where a flat list adds noise. */}
        <details className="group">
          <summary className="list-none cursor-pointer flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors select-none">
            <svg
              width="8"
              height="8"
              viewBox="0 0 8 8"
              className="transition-transform group-open:rotate-90"
            >
              <path d="M2 1l4 3-4 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            All targets · {targetsInGroup.length}
          </summary>
          <div className="space-y-3 mt-2">
            {targetsByDoc.map(([docId, list]) => {
              const color = getDocColor(countryConfig, docId);
              return (
                <div
                  key={docId}
                  className="border-l-2 pl-3"
                  style={{ borderColor: color }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] mb-1 flex items-center gap-1.5">
                    <span style={{ color }}>
                      {getDocLabel(countryConfig, docId)}
                    </span>
                    <span className="text-[var(--undp-gray)]">·</span>
                    <span className="tabular-nums text-[var(--undp-gray)]">
                      {list.length}
                    </span>
                  </p>
                  <ul>
                    {list.map((node) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          onClick={() => onSelectTarget(node.id)}
                          className="w-full text-left text-[11px] text-[var(--undp-black)] py-1 -ml-1 px-1 rounded hover:bg-gray-50 transition-colors block truncate"
                          title={node.target.text}
                        >
                          {node.target.sourceLabel}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </details>
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
  globeCategories: TaxCategory[];
  classifications: ThematicClassification[];
  nr7Data?: Nr7Data | null;
  btrData?: BtrData | null;
  focusTargetId?: string | null;
  countryConfig?: CountryConfig | null;
}

export function PolicyCoherenceExplorer({
  targets,
  alignment,
  sectors,
  globeCategories,
  classifications,
  nr7Data,
  btrData,
  focusTargetId,
  countryConfig,
}: PolicyCoherenceExplorerProps) {
  const [groupMode, setGroupMode] = useState<GroupMode>("document");
  const [filter, setFilter] = useState<AlignFilter>("high_contra");
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [comparedPair, setComparedPair] = useState<{
    result: AlignmentResult;
    other: Target;
  } | null>(null);
  // Default-hidden document types come from the country config so each
  // country controls which documents add visual noise to its first view.
  // Mongolia's config ships the old hardcoded list ["LDN","SECTORAL","BTR","OTHER"];
  // Panama ships an empty list. Users can still toggle these back on.
  const [hiddenDocs, setHiddenDocs] = useState<Set<string>>(
    () => new Set(countryConfig?.defaultHiddenDocTypes ?? []),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // Focal group: a category arc the user has clicked to drill into. Independent
  // of the target selection — when both are set, target focus dominates the
  // wheel and the panel shows target detail; closing the target falls back to
  // the category panel because the group remains focal.
  const [focalGroupId, setFocalGroupId] = useState<string | null>(null);
  // One-shot override: when true, the next chat ask runs against the full
  // corpus instead of the current visible/focal scope. Reset to false after
  // each response so the default scope stays strict.
  const [searchAllDocs, setSearchAllDocs] = useState(false);

  // External focus: when Tensions section links to a specific target.
  // Track prop changes during render so we don't run setState inside an effect
  // (see React docs: "Adjusting some state when a prop changes"). Seed with
  // null so a deep-link mount with focusTargetId already set still runs the
  // setup body on first render.
  const [trackedFocusTargetId, setTrackedFocusTargetId] = useState<string | null | undefined>(null);
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

  /**
   * All document types present in the data, ordered by the country's
   * declared order (falling back to reserved tokens then an unknown-id tail).
   * Derived from the targets themselves so a country with unfamiliar doc ids
   * (e.g. Panama's NP/ENR/IRMF/SPGCF/CNR) still gets a populated filter row.
   */
  const availableDocs = useMemo(() => {
    const present = Array.from(new Set(targets.map((t) => t.sourceDocument)));
    return present.sort(
      (a, b) => getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
    );
  }, [targets, countryConfig]);

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
    () =>
      targets.filter((t) => {
        if (hiddenDocs.has(t.sourceDocument)) return false;
        // Type filter only affects BTR pseudo-targets (which carry actionType).
        // Policy targets are always shown regardless of this filter.
        if (actionTypeFilter === "all") return true;
        if (t.actionType === undefined) return true;
        return t.actionType === actionTypeFilter;
      }),
    [targets, hiddenDocs, actionTypeFilter],
  );

  // Whether any adaptation actions are present in the data at all. Used to
  // hide the Mit/Adp filter toggle when adaptation wasn't loaded — keeps the
  // control surface minimal for non-Mongolia analyses.
  const hasAdaptationActions = useMemo(
    () => targets.some((t) => t.actionType === "adaptation"),
    [targets],
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
    () => buildGroups(visibleTargets, groupMode, sectors, globeCategories, classifications, countryConfig),
    [visibleTargets, groupMode, sectors, globeCategories, classifications, countryConfig],
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
  // Filter-aware counts so the header summary reports exactly what's drawn
  // on the wheel for the current filter rather than the full visible set.
  const filteredCounts = useMemo(() => {
    let a = 0;
    let h = 0;
    let c = 0;
    for (const x of filtered) {
      if (x.alignment === "none") continue;
      a += 1;
      if (x.alignment === "high") h += 1;
      else if (isContradiction(x.alignment)) c += 1;
    }
    return { aligned: a, high: h, contra: c };
  }, [filtered]);

  // Chat state. Single-turn for v1: every Ask replaces the previous reply.
  // History could come later if it earns its keep — keep this lean now.
  const [chat, setChat] = useState<ChatStatus>({
    loading: false,
    reply: null,
    error: null,
  });

  // Clear the chat reply when the user manually navigates away from it (clicks
  // a target / arc / empty area, closes a panel). Stays put when the chat
  // itself sets state — the reply stays visible alongside its result.
  const clearChat = useCallback(() => {
    setChat((prev) =>
      prev.reply !== null || prev.error !== null
        ? { loading: false, reply: null, error: null }
        : prev,
    );
  }, []);

  const handleNodeClick = useCallback(
    (id: string) => {
      setComparedPair(null);
      setSelectedId((prev) => (prev === id ? null : id));
      clearChat();
    },
    [clearChat],
  );

  const handleBgClick = useCallback(() => {
    setSelectedId(null);
    setComparedPair(null);
    setFocalGroupId(null);
    clearChat();
  }, [clearChat]);

  const handleGroupChange = useCallback(
    (m: GroupMode) => {
      setGroupMode(m);
      setSelectedId(null);
      setComparedPair(null);
      setFocalGroupId(null);
      clearChat();
    },
    [clearChat],
  );

  // Clicking a category arc toggles the focal group. Clearing the target so
  // the panel reflects the new context immediately; users can still click a
  // target inside the focal group to drill deeper.
  const handleArcClick = useCallback(
    (id: string) => {
      setSelectedId(null);
      setComparedPair(null);
      setFocalGroupId((prev) => (prev === id ? null : id));
      clearChat();
    },
    [clearChat],
  );

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setComparedPair(null);
    clearChat();
  }, [clearChat]);

  const closeCategory = useCallback(() => {
    setFocalGroupId(null);
    clearChat();
  }, [clearChat]);

  /**
   * Open the pair-compare view directly. Mirrors the chat's select_pair
   * action so a click in the CategoryPanel's pair list jumps straight to
   * the rationale view, no manual click on the connection list needed.
   */
  const handleSelectPair = useCallback(
    (targetAId: string, targetBId: string) => {
      const result = visibleAlignment.find(
        (a) =>
          (a.targetAId === targetAId && a.targetBId === targetBId) ||
          (a.targetAId === targetBId && a.targetBId === targetAId),
      );
      const otherTarget = targetMap.get(targetBId);
      setSelectedId(targetAId);
      const node = nodes.find((n) => n.id === targetAId);
      if (node) setFocalGroupId(node.groupId);
      if (result && otherTarget) {
        setComparedPair({ result, other: otherTarget });
      } else {
        setComparedPair(null);
      }
      clearChat();
    },
    [visibleAlignment, targetMap, nodes, clearChat],
  );

  // Declared before handleAsk so the chat's strict-mode scope filter can
  // restrict its target index to the focal category's targets.
  const focalGroupTargetIds = useMemo(() => {
    if (!focalGroupId) return null;
    const ids = new Set<string>();
    for (const n of nodes) if (n.groupId === focalGroupId) ids.add(n.id);
    return ids;
  }, [nodes, focalGroupId]);

  const handleAsk = useCallback(
    async (query: string) => {
      setChat({ loading: true, reply: null, error: null });
      // Scope contract:
      // - Strict (default, `searchAllDocs === false`): only what's currently
      //   visible is sent — visible docs, plus the focal category's targets
      //   when one is set. Hidden docs are off-limits and the server
      //   replies with an "out of scope" sentence when asked about them.
      // - Override (`searchAllDocs === true`): the user opted into the full
      //   corpus for one query; auto-unhide reveals any doc the chat
      //   references. Toggle resets after the response.
      const strictMode = !searchAllDocs;
      try {
        const targetMap = new Map(targets.map((t) => [t.id, t]));
        const body = buildChatRequest({
          query,
          searchAllDocs,
          groupMode,
          filter,
          targets,
          alignment,
          visibleAlignment,
          classifications,
          sectors,
          globeCategories,
          btrData,
          availableDocs,
          hiddenDocs,
          focalGroupTargetIds,
          countryConfig,
        });

        const res = await fetch("/api/coherence-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `Request failed (${res.status})`);
        }
        type ServerAction =
          | { type: "set_filter"; filter: AlignFilter }
          | { type: "focus_category"; categoryId: string }
          | { type: "select_target"; targetId: string }
          | { type: "select_pair"; targetAId: string; targetBId: string }
          | { type: "set_mode"; mode: GroupMode };
        const json = (await res.json()) as {
          reply: string;
          actions: ServerAction[];
        };

        // Each chat turn is treated as a fresh exploration: reset filter to
        // its default and clear any prior focus / selection / pair compare
        // before layering the new actions. groupMode and hiddenDocs are user
        // preferences kept across chat calls — if the user has explicitly
        // hidden a document, the chat respects that scope and answers within
        // the visible subset (the rankings sent to the model are already
        // computed from visibleAlignment, so this happens automatically).
        setFilter("high_contra");
        let nextSelectedId: string | null = null;
        let nextFocalGroupId: string | null = null;
        let nextComparedPair: { result: AlignmentResult; other: Target } | null =
          null;
        for (const action of json.actions) {
          if (action.type === "set_filter") {
            setFilter(action.filter);
          } else if (action.type === "focus_category") {
            nextFocalGroupId = action.categoryId;
            nextSelectedId = null;
            nextComparedPair = null;
          } else if (action.type === "select_target") {
            nextSelectedId = action.targetId;
            const node = nodes.find((n) => n.id === action.targetId);
            if (node) nextFocalGroupId = node.groupId;
            nextComparedPair = null;
          } else if (action.type === "select_pair") {
            // Open pair compare directly so the rationale is visible without
            // a manual click. If no alignment exists between the ids, fall
            // back to selecting the first target.
            const result = visibleAlignment.find(
              (a) =>
                (a.targetAId === action.targetAId &&
                  a.targetBId === action.targetBId) ||
                (a.targetAId === action.targetBId &&
                  a.targetBId === action.targetAId),
            );
            const otherTarget = targetMap.get(action.targetBId);
            nextSelectedId = action.targetAId;
            const node = nodes.find((n) => n.id === action.targetAId);
            if (node) nextFocalGroupId = node.groupId;
            if (result && otherTarget) {
              nextComparedPair = { result, other: otherTarget };
            } else {
              nextComparedPair = null;
            }
          } else if (action.type === "set_mode") {
            setGroupMode(action.mode);
            nextSelectedId = null;
            nextFocalGroupId = null;
            nextComparedPair = null;
          }
        }
        // Auto-unhide only fires under the override. In strict mode the chat
        // is contractually unable to reference hidden docs, so there's
        // nothing to unhide. Under override the user explicitly asked to
        // search the full corpus, so if the answer touches a hidden doc we
        // make it visible so the result is meaningful.
        if (!strictMode) {
          const docsReferenced = new Set<string>();
          for (const action of json.actions) {
            if (action.type === "focus_category" && groupMode === "document") {
              docsReferenced.add(action.categoryId);
            } else if (action.type === "select_target") {
              const t = targetMap.get(action.targetId);
              if (t) docsReferenced.add(t.sourceDocument);
            } else if (action.type === "select_pair") {
              const tA = targetMap.get(action.targetAId);
              const tB = targetMap.get(action.targetBId);
              if (tA) docsReferenced.add(tA.sourceDocument);
              if (tB) docsReferenced.add(tB.sourceDocument);
            }
          }
          if (docsReferenced.size > 0) {
            setHiddenDocs((prev) => {
              let changed = false;
              const next = new Set(prev);
              for (const d of docsReferenced) {
                if (next.has(d)) {
                  next.delete(d);
                  changed = true;
                }
              }
              return changed ? next : prev;
            });
          }
        }
        setSelectedId(nextSelectedId);
        setFocalGroupId(nextFocalGroupId);
        setComparedPair(nextComparedPair);
        setChat({ loading: false, reply: json.reply, error: null });
      } catch (err) {
        setChat({
          loading: false,
          reply: null,
          error:
            err instanceof Error ? err.message : "Sorry, that didn't work.",
        });
      } finally {
        // The override is one-shot: reset so the next ask defaults to strict.
        setSearchAllDocs(false);
      }
    },
    [
      alignment,
      availableDocs,
      btrData,
      classifications,
      countryConfig,
      focalGroupTargetIds,
      globeCategories,
      hiddenDocs,
      groupMode,
      filter,
      searchAllDocs,
      sectors,
      targets,
      nodes,
      visibleAlignment,
    ],
  );

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;

  const focalGroup = useMemo(
    () =>
      focalGroupId ? arcs.find((a) => a.id === focalGroupId) ?? null : null,
    [arcs, focalGroupId],
  );

  // Group focus drives the dim treatment on the wheel only when no target is
  // active. Active target takes visual priority and reuses the existing
  // hover/click highlight path.
  const isGroupFocus = !!focalGroupId && !activeId;

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
              <br /><br />
              <strong>BTR node colors:</strong> reported mitigation measures are shown in violet and reported adaptation actions in fuchsia, so you can tell the two BTR subsets apart at a glance.
            </InfoBox>
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-0.5">
            {(() => {
              const groupLabel = ({
                document: ["document type", "document types"],
                globe: ["biodiversity category", "biodiversity categories"],
                sector: ["climate mitigation sector", "climate mitigation sectors"],
              } as Record<GroupMode, [string, string]>)[groupMode][
                groups.length !== 1 ? 1 : 0
              ];
              const across = (
                <>
                  {" "}across {groups.length} {groupLabel}
                </>
              );
              const contraButton = filteredCounts.contra > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setFilter(filter === "contradictions" ? "all" : "contradictions")
                  }
                  className="text-red-600 hover:underline font-medium"
                >
                  {filteredCounts.contra} contradiction
                  {filteredCounts.contra !== 1 ? "s" : ""}
                </button>
              );
              switch (filter) {
                case "high":
                  return (
                    <>
                      {filteredCounts.high} strong alignment
                      {filteredCounts.high !== 1 ? "s" : ""}
                      {across}.
                    </>
                  );
                case "contradictions":
                  return (
                    <>
                      {contraButton}
                      {across}.
                    </>
                  );
                case "high_contra":
                  return (
                    <>
                      {filteredCounts.high} strong alignment
                      {filteredCounts.high !== 1 ? "s" : ""}
                      {contraButton && (
                        <>
                          {" and "}
                          {contraButton}
                        </>
                      )}
                      {across}.
                    </>
                  );
                case "high_medium":
                  return (
                    <>
                      {filteredCounts.aligned} strong or medium alignment
                      {filteredCounts.aligned !== 1 ? "s" : ""}
                      {across}.
                    </>
                  );
                case "all":
                default:
                  return (
                    <>
                      {filteredCounts.aligned} alignment opportunit
                      {filteredCounts.aligned !== 1 ? "ies" : "y"}
                      {across}
                      {contraButton && (
                        <>
                          {", "}
                          {contraButton}
                        </>
                      )}
                      .
                    </>
                  );
              }
            })()}
            {" "}Hover or click a target to explore connections.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <select
            value={groupMode}
            onChange={(e) => handleGroupChange(e.target.value as GroupMode)}
            className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30"
          >
            <option value="document">By Document Type</option>
            <option value="globe">By Biodiversity Category</option>
            <option value="sector">By Climate Mitigation Sector</option>
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
            const color = getDocColor(countryConfig, doc);
            // Sub-pills for BTR's Mit/Adp split — only render when the BTR
            // pill is active and the country actually has adaptation actions
            // loaded. Replaces the older "All BTR actions" select.
            const showSubPills =
              doc === "BTR" && hasAdaptationActions && active;
            const mitActive =
              actionTypeFilter === "all" || actionTypeFilter === "mitigation";
            const adpActive =
              actionTypeFilter === "all" || actionTypeFilter === "adaptation";
            const togglePill = (which: "mitigation" | "adaptation") => {
              // Cycle: when both visible (filter=all), clicking deselects
              // the clicked one (filter = the other). Clicking the lone
              // active type re-enables both.
              const other = which === "mitigation" ? "adaptation" : "mitigation";
              if (actionTypeFilter === "all") setActionTypeFilter(other);
              else if (actionTypeFilter === which) setActionTypeFilter("all");
              else setActionTypeFilter("all");
            };
            const mitColor = getDocColor(countryConfig, "BTR");
            const adpColor = getDocColor(countryConfig, "BTR_ADP");
            return (
              <div key={doc} className="flex flex-col items-start gap-1">
                <button
                  type="button"
                  onClick={() => toggleDoc(doc)}
                  className={`flex items-center gap-1.5 border rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? ""
                      : "border-gray-200 bg-white text-[var(--undp-gray)] hover:border-gray-300"
                  }`}
                  style={active ? { color, borderColor: `${color}66`, backgroundColor: `${color}1a` } : undefined}
                  title={getDocFullLabel(countryConfig, doc)}
                >
                  <span
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: active ? color : "#d1d5db" }}
                  />
                  {getDocLabel(countryConfig, doc)}
                </button>
                {showSubPills && (
                  <div className="flex gap-1 pl-3">
                    <button
                      type="button"
                      onClick={() => togglePill("mitigation")}
                      className={`flex items-center gap-1 border rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        mitActive
                          ? ""
                          : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                      }`}
                      style={
                        mitActive
                          ? {
                              color: mitColor,
                              borderColor: `${mitColor}66`,
                              backgroundColor: `${mitColor}1a`,
                            }
                          : undefined
                      }
                      title="Toggle BTR mitigation measures"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-sm"
                        style={{
                          backgroundColor: mitActive ? mitColor : "#d1d5db",
                        }}
                      />
                      Mitigation
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePill("adaptation")}
                      className={`flex items-center gap-1 border rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                        adpActive
                          ? ""
                          : "border-gray-200 bg-white text-gray-400 hover:border-gray-300"
                      }`}
                      style={
                        adpActive
                          ? {
                              color: adpColor,
                              borderColor: `${adpColor}66`,
                              backgroundColor: `${adpColor}1a`,
                            }
                          : undefined
                      }
                      title="Toggle BTR adaptation actions"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-sm"
                        style={{
                          backgroundColor: adpActive ? adpColor : "#d1d5db",
                        }}
                      />
                      Adaptation
                    </button>
                  </div>
                )}
              </div>
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
                  getDocFullLabel(countryConfig, t.sourceDocument).toLowerCase().includes(q),
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
                        style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                      />
                      <span className="text-xs text-[var(--undp-black)] truncate">
                        <span className="font-medium text-[var(--undp-gray)]">
                          {getDocLabel(countryConfig, t.sourceDocument)}
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

      {/* Main content: persistent split — wheel left, context panel right.
          items-stretch (grid default) lets the panel match the wheel's height
          so the layout reads as one card-pair, not two stacked panes. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Wheel container */}
        <div className="min-w-0 lg:col-span-8">
          <div className="bg-white border border-gray-100 rounded-lg p-4 h-full">
            <svg
              viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
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
                const isFocal = arc.id === focalGroupId;
                const arcMidR = (INNER_R + OUTER_R) / 2;
                const badgeX = arcMidR * Math.sin(arc.midAngle);
                const badgeY = -arcMidR * Math.cos(arc.midAngle);
                const arcOpacity = activeId
                  ? hasActiveNode
                    ? 0.8
                    : 0.12
                  : isGroupFocus
                    ? isFocal
                      ? 1
                      : 0.18
                    : 0.65;
                return (
                  <g key={arc.id}>
                    <path
                      d={d ?? ""}
                      fill={arc.color}
                      opacity={arcOpacity}
                      stroke={isFocal && !activeId ? arc.color : "none"}
                      strokeWidth={isFocal && !activeId ? 1.5 : 0}
                      className="transition-opacity duration-200 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArcClick(arc.id);
                      }}
                    >
                      <title>{arc.label}</title>
                    </path>
                    {/* Count badge on arc in overview mode */}
                    {!activeId && !isGroupFocus && arc.count > 0 && (
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
                  // When a category is focal, drop edges that don't touch any
                  // of its targets so the wheel reads as "this slice's web".
                  if (
                    isGroupFocus &&
                    focalGroupTargetIds &&
                    !focalGroupTargetIds.has(conn.targetAId) &&
                    !focalGroupTargetIds.has(conn.targetBId)
                  ) {
                    return null;
                  }
                  const key = `amb-${[conn.targetAId, conn.targetBId].sort().join("__")}`;
                  const contra = isContradiction(conn.alignment);
                  const isContraMode = filter === "contradictions";
                  // In group focus mode, give the surviving edges a bit more
                  // presence — the noise is gone so they can carry weight.
                  const opacity = isGroupFocus
                    ? contra
                      ? 0.7
                      : 0.55
                    : isContraMode
                      ? 0.55
                      : ambientOpacity;
                  const strokeWidth = isGroupFocus
                    ? contra || conn.alignment === "high"
                      ? 1.8
                      : 1.2
                    : isContraMode
                      ? 2
                      : 1;
                  return (
                    <path
                      key={key}
                      d={curvePath(nA.x, nA.y, nB.x, nB.y)}
                      fill="none"
                      stroke={ALIGNMENT_COLORS[conn.alignment]}
                      strokeWidth={strokeWidth}
                      strokeDasharray={contra ? "6 3" : "none"}
                      opacity={opacity}
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
                const isFocalGroupMember =
                  !!focalGroupTargetIds && focalGroupTargetIds.has(node.id);
                const isDimmed = activeId
                  ? !isActive && !isConnected
                  : isGroupFocus && !isFocalGroupMember;
                const useGroupColor = groupMode !== "document";
                const baseNodeColor = useGroupColor
                  ? (groupColorMap.get(node.groupId) ?? getDocColor(countryConfig, node.target.sourceDocument))
                  : getDocColor(countryConfig, node.target.sourceDocument);
                // Override for BTR adaptation actions so they're visually distinct
                // from BTR mitigation (purple) regardless of grouping mode.
                const nodeColor =
                  node.target.actionType === "adaptation"
                    ? BTR_ADAPTATION_COLOR
                    : baseNodeColor;
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
                      <title>{getDocMediumLabel(countryConfig, node.target.sourceDocument)}: {node.target.sourceLabel}</title>
                    </circle>
                    {/* Small doc-type indicator dot in non-document modes */}
                    {useGroupColor && r >= 4 && !isDimmed && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={2.5}
                        fill={getDocColor(countryConfig, node.target.sourceDocument)}
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
                  const docColor = getDocColor(countryConfig, node.target.sourceDocument);
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
                          {getDocMediumLabel(countryConfig, node.target.sourceDocument)}{" "}
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
                // Approximate character width at fontSize 11, fontWeight 600
                const CHAR_W = 6.5;
                // Labels wider than this in chars wrap to two lines so they
                // don't extend past the viewBox edge.
                const MAX_CHARS_PER_LINE = 24;

                const entries = arcs.map((arc) => {
                  const lines = wrapLabel(arc.label, MAX_CHARS_PER_LINE);
                  const longest = lines.reduce(
                    (m, l) => Math.max(m, l.length),
                    0,
                  );
                  return {
                    arc,
                    lines,
                    angle: arc.midAngle,
                    // Angular span uses the longest wrapped line so collision
                    // avoidance stays correct for multi-line labels.
                    angularSpan: (longest * CHAR_W) / GRP_LABEL_R,
                  };
                });

                // Sort by home angle so neighbours-in-the-circle are neighbours-in-the-array
                const sorted = [...entries].sort((a, b) => a.arc.midAngle - b.arc.midAngle);

                // Spring relaxation: each pass pulls every label toward its
                // arc midpoint (home) and pushes overlapping neighbours apart
                // symmetrically. Converges to the layout with minimum total
                // displacement, so labels sit as close to their arcs as the
                // overlap constraint allows.
                const PADDING = LABEL_H / GRP_LABEL_R;
                const HOME_PULL = 0.18;
                for (let iter = 0; iter < 60; iter++) {
                  for (const e of sorted) {
                    e.angle += HOME_PULL * (e.arc.midAngle - e.angle);
                  }
                  for (let i = 0; i < sorted.length - 1; i++) {
                    const needed = (sorted[i].angularSpan + sorted[i + 1].angularSpan) / 2 + PADDING;
                    const gap = sorted[i + 1].angle - sorted[i].angle;
                    if (gap < needed) {
                      const half = (needed - gap) / 2;
                      sorted[i].angle -= half;
                      sorted[i + 1].angle += half;
                    }
                  }
                }

                return sorted.map(({ arc, angle, lines }) => {
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
                  const isFocal = arc.id === focalGroupId;
                  const labelDimmed =
                    !!activeId || (isGroupFocus && !isFocal);
                  const leaderOpacity = activeId
                    ? 0.2
                    : isGroupFocus
                      ? isFocal
                        ? 0.6
                        : 0.12
                      : 0.35;
                  const labelFill = labelDimmed ? "#94a3b8" : arc.color;
                  // Center the multi-line block vertically around ly. For a
                  // single line, dy=0 means baseline sits at ly (with
                  // dominantBaseline="middle"). For N lines, offset the first
                  // line up so the block straddles ly.
                  const firstDy = -((lines.length - 1) * 0.55);
                  return (
                    <g key={`grp-${arc.id}`}>
                      <path
                        d={`M${arcX},${arcY} L${elbowX},${elbowY} L${lx},${ly}`}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={1}
                        opacity={leaderOpacity}
                        className="pointer-events-none"
                      />
                      <text
                        x={lx + nudge}
                        y={ly}
                        textAnchor={anchor}
                        dominantBaseline="middle"
                        className="select-none cursor-pointer"
                        fontSize={isFocal && !activeId ? 12 : 11}
                        fontWeight={isFocal && !activeId ? 700 : 600}
                        fill={labelFill}
                        style={{ letterSpacing: "0.04em", transition: "fill 200ms, font-size 200ms" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArcClick(arc.id);
                        }}
                      >
                        <title>{getDocFullLabel(countryConfig, arc.id)}</title>
                        {lines.map((line, i) => (
                          <tspan
                            key={i}
                            x={lx + nudge}
                            dy={i === 0 ? `${firstDy}em` : "1.1em"}
                          >
                            {line}
                          </tspan>
                        ))}
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
                  : focalGroup
                    ? focalGroup.label
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
                  : focalGroup
                    ? `${focalGroup.count} target${focalGroup.count !== 1 ? "s" : ""}`
                    : `${targets.length} targets · ${totalAligned} aligned`}
              </text>
            </svg>

            {/* Legend — structured grid */}
            <div className="mt-4 pt-3 border-t border-gray-100 grid grid-cols-[auto_auto] gap-x-8 gap-y-1 text-[11px] justify-start">
              {/* Document column */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                  {groupMode === "document" ? "Document" : groupMode === "globe" ? "Biodiversity Category" : "Climate Mitigation Sector"}
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

        {/* Right column: context panel only. Chat now lives inside
            EmptyPanel below the stats — preferred for the cleaner idle
            layout, with the trade-off that the AI reply is only visible
            while the user is in idle state. */}
        <div className="min-w-0 lg:col-span-4">
          {selectedNode ? (
              <DetailPanel
                key={selectedNode.id}
                node={selectedNode}
                connections={selectedConns}
                onClose={closeDetail}
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
                countryConfig={countryConfig}
              />
            ) : focalGroup ? (
              <CategoryPanel
                key={focalGroup.id}
                group={focalGroup}
                nodes={nodes}
                arcs={arcs}
                alignment={filtered}
                onClose={closeCategory}
                onSelectTarget={handleNodeClick}
                onSelectPair={handleSelectPair}
                onSelectCategory={handleArcClick}
                countryConfig={countryConfig}
              />
            ) : (
              <EmptyPanel
                targets={visibleTargets}
                alignment={filtered}
                onSelectTarget={handleNodeClick}
                onSelectPair={handleSelectPair}
                onAsk={handleAsk}
                chat={chat}
                searchAllDocs={searchAllDocs}
                onToggleSearchAll={setSearchAllDocs}
                onSetFilter={setFilter}
                countryConfig={countryConfig}
              />
            )}
        </div>
      </div>
    </section>
  );
}
