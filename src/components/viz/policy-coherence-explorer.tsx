"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { arc as d3Arc } from "d3-shape";
import {
  getDocColor,
  getDocFriendlyName,
  getDocFullLabel,
  getDocLabel,
  getDocMediumLabel,
  getDocTypeOrder,
  ALIGNMENT_COLORS,
} from "@/lib/utils";
import {
  useAlignmentLabels,
  useContradictionTypeLabels,
  useNr7BadgeLabels,
  type Nr7Status,
} from "@/lib/labels";
import { track } from "@/lib/analytics/client";
import { InfoBox } from "@/components/ui/info-box";
import { Modal } from "@/components/ui/modal";
import { isContradiction } from "@/types";
import {
  buildChatRequest,
  pickExampleQueries,
  type ChatHistoryTurn,
  type ChatSuggestion,
} from "@/lib/coherence-chat";
import {
  alphaForBudgetShare,
  computeBudgetByGlobeCategory,
  computeProgrammesByCategory,
  formatBudgetValue,
  type CategoryBudgetEntry,
  type CategoryBudgetSummary,
  type CategoryProgramme,
} from "@/lib/coherence-budget";
import {
  detectInsights,
  type Insight,
} from "@/lib/coherence-insights";
import {
  TargetTextWithHighlights,
  ActivitiesActions,
  ActionTypeBadge,
  BTR_ADAPTATION_COLOR,
  OriginalLanguageChip,
} from "./target-text";
import { WorkbenchStage } from "./explorer-workbench/workbench-stage";
import { LensPane } from "./explorer-workbench/lens-pane";
import type {
  BerData,
  BtrData,
  CountryConfig,
  GlobeSubcategory,
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

type GroupMode = "document" | "sector" | "globe" | "gga";
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

// Single hue for the Biodiversity Budget wedges. Cyan-700 (#0e7490) is a
// saturated teal-blue that sits between UNDP blue (#0468b1) and the teal
// already in SECTOR_PAL (#0d9488), so it does not collide with any category
// rim colour at the wheel's outer band. At full alpha it reads as a clear
// hue (the user explicitly did not want black or grey here); at lower alpha
// it fades through a recognizable colour ramp, so opacity alone carries the
// budget-share signal across all funded categories.
const BUDGET_WEDGE_COLOR = "#0e7490";

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
  ggaCategories: TaxCategory[],
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
  if (mode === "gga") return buildGroupsByTaxonomy(targets, ggaCategories, "gga", classifications);
  return buildGroupsByTaxonomy(targets, globeCategories, "globe", classifications);
}

/**
 * Build the wheel's arcs and per-target nodes.
 *
 * By default each arc's angular span is proportional to its target count
 * (breadth of policy ambition). When `opts.weightById` is supplied, the span is
 * driven by that weight instead — the Finance view passes per-category tagged
 * spend so the wheel can be read as "where does the money go". Zero-weight
 * groups (e.g. GLOBE categories that carry targets but no tagged BER spend)
 * keep a fixed minimum sliver so they stay visible and clickable; the remaining
 * angle is split among weighted groups in exact proportion, so funded shares
 * stay faithful. Group order is unchanged either way, so the two layouts can be
 * interpolated arc-for-arc (the morph between the Targets and Spend scalings).
 */
function computeLayout(
  groups: Group[],
  alignment: AlignmentResult[],
  opts?: { weightById?: Map<string, number>; minSpanFrac?: number },
) {
  const totalTargets = groups.reduce((s, g) => s + g.targets.length, 0);
  if (totalTargets === 0) return { nodes: [] as NodePos[], arcs: [] as GroupArc[] };
  const avail = 2 * Math.PI - GAP * groups.length;

  const wantsWeights = !!opts?.weightById;
  const weights = groups.map((g) =>
    wantsWeights ? Math.max(0, opts!.weightById!.get(g.id) ?? 0) : g.targets.length,
  );
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  // Fall back to target-count spans when a weight map was supplied but summed
  // to zero (no funded category currently has a visible target — e.g. after
  // doc-hiding). Without this every wedge would collapse to the min-span sliver
  // and the wheel would look broken instead of showing the target-count layout.
  const useWeights = wantsWeights && totalWeight > 0;
  // Min sliver only applies in weighted mode; default mode is pixel-identical
  // to before (every group has >= 1 target, so no zero spans arise).
  const minSpan = useWeights ? (opts?.minSpanFrac ?? 0.012) * avail : 0;
  const zeroCount = useWeights ? weights.filter((w) => w <= 0).length : 0;
  const flexAvail = Math.max(0, avail - zeroCount * minSpan);

  const cc = new Map<string, number>();
  for (const a of alignment) {
    if (a.alignment === "none") continue;
    cc.set(a.targetAId, (cc.get(a.targetAId) ?? 0) + 1);
    cc.set(a.targetBId, (cc.get(a.targetBId) ?? 0) + 1);
  }

  const nodes: NodePos[] = [];
  const arcs: GroupArc[] = [];
  let cur = 0;

  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi];
    const w = weights[gi];
    const span = useWeights
      ? w > 0
        ? (w / totalWeight) * flexAvail
        : minSpan
      : (g.targets.length / totalTargets) * avail;
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

type WheelLayout = { nodes: NodePos[]; arcs: GroupArc[] };

/**
 * Interpolate two layouts arc-for-arc / node-for-node (both built from the same
 * groups in the same order, so indices line up). Used to morph the wheel
 * between the Targets and Spend scalings. `t` is clamped 0..1; the endpoints
 * short-circuit so the common (not-animating) case returns the layout as-is.
 */
function lerpLayout(a: WheelLayout, b: WheelLayout, t: number): WheelLayout {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const arcs = a.arcs.map((arc, i) => {
    const arcB = b.arcs[i] ?? arc;
    const startAngle = arc.startAngle + (arcB.startAngle - arc.startAngle) * t;
    const endAngle = arc.endAngle + (arcB.endAngle - arc.endAngle) * t;
    return { ...arc, startAngle, endAngle, midAngle: (startAngle + endAngle) / 2 };
  });
  const nodes = a.nodes.map((node, i) => {
    const nodeB = b.nodes[i] ?? node;
    const angle = node.angle + (nodeB.angle - node.angle) * t;
    return { ...node, angle, x: NODE_R * Math.sin(angle), y: -NODE_R * Math.cos(angle) };
  });
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


/**
 * Order of alignment levels rendered in the distribution bar. Skips "none"
 * (= no relationship assessed) so the bar only reflects real signal.
 */
const DIST_ORDER: AlignmentLevel[] = [
  "flagged",
  "low",
  "medium",
  "high",
];

/**
 * Split a target's sourceLabel into a leading numeric/section code and the
 * rest as a title. Pure presentation; keeps the original string when no
 * digit-prefixed code is detectable.
 *
 *   "4.4 Pig, poultry, fattening farm support" → { code: "4.4", title: "Pig, ..." }
 *   "Animal husbandry and pastureland 1"        → { code: null, title: "Animal ... 1" }
 */
function splitSourceLabel(label: string): { code: string | null; title: string } {
  const firstSpace = label.indexOf(" ");
  if (firstSpace === -1) return { code: null, title: label };
  const head = label.slice(0, firstSpace);
  const tail = label.slice(firstSpace + 1);
  if (/^\d/.test(head)) return { code: head, title: tail };
  return { code: null, title: label };
}

// ─── Detail panel ───────────────────────────────────────────────────

function DetailPanel({
  node,
  connections,
  onClose,
  onSelectPair,
  nr7Item,
  nr7ProgressMap,
  countryConfig,
}: {
  node: NodePos;
  connections: (AlignmentResult & { otherTarget: Target })[];
  onClose: () => void;
  onSelectPair: (r: AlignmentResult) => void;
  nr7Item?: Nr7ProgressItem | null;
  nr7ProgressMap?: Map<string, string>;
  countryConfig?: CountryConfig | null;
}) {
  const alignmentLabels = useAlignmentLabels();
  const nr7BadgeLabels = useNr7BadgeLabels();
  const t = useTranslations("explorer.detailPanel");
  const sorted = [...connections].sort((a, b) => {
    const order: Record<AlignmentLevel, number> = {
      flagged: 0,
      high: 3, medium: 4, low: 5,
      none: 6,
    };
    return order[a.alignment] - order[b.alignment];
  });


  // Distribution across the full alignment spectrum (DIST_ORDER, module
  // scope) so the bar only reflects real signal.
  const distSegments = DIST_ORDER
    .map((lvl) => ({ lvl, n: connections.filter((c) => c.alignment === lvl).length }))
    .filter((s) => s.n > 0);
  const distTotal = distSegments.reduce((sum, s) => sum + s.n, 0);

  // Split a sourceLabel like "4.4 Pig, poultry, fattening farm support" into
  // a leading code token + title. Falls back to title-only when no numeric
  // prefix is present (e.g. BTR narratives).
  const { code: targetCode, title: targetTitle } = splitSourceLabel(node.target.sourceLabel);
  const docShort = getDocLabel(countryConfig, node.target.sourceDocument);
  const docFriendly = getDocFriendlyName(countryConfig, node.target.sourceDocument);
  const showDocFriendly = docFriendly && docFriendly !== docShort;

  // Long BTR Action narratives can run 1000+ characters; an internal
  // scrollbar on the target text plus the panel's outer scroll produces a
  // dual-scrollbar mess. Use a line-clamp + "Read full" toggle instead.
  // Parent passes `key={node.id}`, so this initialiser re-runs per target.
  const isTargetLong = (node.target.text?.length ?? 0) > 280;
  const [targetTextExpanded, setTargetTextExpanded] = useState(!isTargetLong);

  return (
    <div className="border border-line-soft rounded-lg bg-white overflow-hidden flex flex-col h-full">
      {/* Header: citation-style minimal typography. Quiet doc line on
          top, bold wrapping title below, target text as a paragraph. No
          chip/dot chrome; keeps the focus on the language itself. */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-line-soft">
        <div className="flex items-start justify-between gap-3">
          <p className="text-caption font-medium text-[var(--undp-gray)] leading-snug">
            <span style={{ color: getDocColor(countryConfig, node.target.sourceDocument) }}>●</span>{" "}
            {docShort}
            {targetCode ? ` · ${targetCode}` : ""}
            {showDocFriendly ? ` · ${docFriendly}` : ""}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <OriginalLanguageChip target={node.target} />
            <ActionTypeBadge actionType={node.target.actionType} />
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-lg leading-none"
              aria-label={t("closeAria")}
            >
              ×
            </button>
          </div>
        </div>
        <h3 className="mt-1 text-base font-semibold text-[var(--undp-black)] leading-snug">
          {targetTitle}
        </h3>
      </div>

      {/* Target text: line-clamped with a "Read full" toggle when long, so
          the panel keeps a single scroll context (the connections list
          below) instead of two competing scrollbars. */}
      <div className="px-4 py-3 shrink-0">
        <p
          className={`text-data text-[var(--undp-black)] leading-relaxed ${
            isTargetLong && !targetTextExpanded ? "line-clamp-5" : ""
          }`}
        >
          <TargetTextWithHighlights target={node.target} />
        </p>
        {isTargetLong && (
          <button
            type="button"
            onClick={() => setTargetTextExpanded((p) => !p)}
            className="mt-1 text-caption text-[var(--undp-blue)] hover:underline"
          >
            {targetTextExpanded ? t("showLess") : t("readFull")}
          </button>
        )}
        <ActivitiesActions target={node.target} />
      </div>

      {/* Distribution bar: shows the full alignment spectrum across this
          target's connections so the analyst sees the shape of the
          problem, not just a "high/conflict" binary. */}
      {distTotal > 0 && (
        <div className="px-4 pt-1 pb-3 shrink-0">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            {distSegments.map((s) => (
              <div
                key={s.lvl}
                style={{
                  width: `${(s.n / distTotal) * 100}%`,
                  backgroundColor: ALIGNMENT_COLORS[s.lvl],
                }}
                title={t("distSegmentTitle", { count: s.n, label: alignmentLabels[s.lvl].toLowerCase() })}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption">
            {distSegments.map((s) => (
              <span key={s.lvl}>
                <span className="font-semibold" style={{ color: ALIGNMENT_COLORS[s.lvl] }}>
                  {s.n}
                </span>
                <span className="text-[var(--undp-gray)] ml-1">
                  {alignmentLabels[s.lvl].toLowerCase()}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {nr7Item && (
        <div className="px-4 py-3 border-t border-line-soft shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: NR7_BADGE_COLORS[nr7Item.progressStatus] ?? "#9ca3af" }}
            />
            <span className="text-caption font-medium text-[var(--undp-gray)]">
              {t("nr7Progress", { label: nr7BadgeLabels[(nr7Item.progressStatus as Nr7Status)] ?? nr7BadgeLabels.unknown })}
            </span>
          </div>
          {nr7Item.progressSummary && (
            <p className="text-caption text-[var(--undp-black)] leading-relaxed mb-1.5">
              {nr7Item.progressSummary.length > 300
                ? nr7Item.progressSummary.slice(0, 300) + "..."
                : nr7Item.progressSummary}
            </p>
          )}
          {nr7Item.challenges && (
            <details className="text-caption">
              <summary className="text-[var(--undp-gray)] cursor-pointer hover:text-[var(--undp-blue)]">
                {t("keyChallenges")}
              </summary>
              <p className="text-[var(--undp-black)] leading-relaxed mt-1 pl-2 border-l border-line-strong">
                {nr7Item.challenges.length > 300
                  ? nr7Item.challenges.slice(0, 300) + "..."
                  : nr7Item.challenges}
              </p>
            </details>
          )}
        </div>
      )}

      {/* Connections list: minimal rows, rationale shown inline as a
          preview (line-clamped). Clicking anywhere on a row opens the
          pair-comparison modal; that's the drill-in for full rationale
          + side-by-side targets. No per-row expand/collapse. */}
      <div className="flex-1 overflow-y-auto min-h-0 border-t border-line-soft">
        <div className="px-4 pt-3 pb-2 shrink-0">
          <p className="text-caption text-[var(--undp-gray)]">
            {connections.length === 1
              ? t("connectionsSingular", { count: connections.length })
              : t("connectionsPlural", { count: connections.length })}
            {" · "}
            {t("sortedBySeverity")}
          </p>
        </div>
        <ul className="divide-y divide-line-soft">
          {sorted.map((conn) => {
            const nr7Status = nr7ProgressMap?.get(conn.otherTarget.id);
            return (
              <li key={conn.otherTarget.id}>
                <button
                  type="button"
                  onClick={() => onSelectPair(conn)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0 translate-y-[-1px]"
                      style={{ backgroundColor: getDocColor(countryConfig, conn.otherTarget.sourceDocument) }}
                    />
                    <span className="text-caption font-medium text-[var(--undp-gray)] shrink-0">
                      {getDocLabel(countryConfig, conn.otherTarget.sourceDocument)}
                    </span>
                    <span className="text-data font-semibold text-[var(--undp-black)] flex-1 min-w-0">
                      {conn.otherTarget.sourceLabel}
                    </span>
                    {nr7Status && (
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: NR7_BADGE_COLORS[nr7Status] ?? "#9ca3af" }}
                        title={t("nr7TitlePrefix", { label: nr7BadgeLabels[(nr7Status as Nr7Status)] ?? nr7BadgeLabels.unknown })}
                      />
                    )}
                    <span
                      className="text-caption font-medium shrink-0"
                      style={{ color: ALIGNMENT_COLORS[conn.alignment] }}
                    >
                      {alignmentLabels[conn.alignment]}
                    </span>
                  </div>
                  {conn.description && (
                    <p className="mt-1.5 ml-3.5 text-caption leading-relaxed text-[var(--undp-gray)] line-clamp-3">
                      {conn.description}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ─── Pair comparison modal ──────────────────────────────────────────

function TargetCard({
  target,
  countryConfig,
}: {
  target: Target;
  countryConfig?: CountryConfig | null;
}) {
  const t = useTranslations("explorer.targetCard");
  const isLong = (target.text?.length ?? 0) > 280;
  const [expanded, setExpanded] = useState(!isLong);
  const docColor = getDocColor(countryConfig, target.sourceDocument);

  return (
    <div className="rounded-lg border border-line-soft bg-white p-3 flex flex-col min-w-0">
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: docColor }}
        />
        <span className="text-caption font-medium text-[var(--undp-gray)] truncate min-w-0">
          {getDocLabel(countryConfig, target.sourceDocument)} · {target.sourceLabel}
        </span>
        <ActionTypeBadge actionType={target.actionType} />
        <OriginalLanguageChip target={target} />
      </div>
      <p
        className={`text-data leading-relaxed text-[var(--undp-black)] ${
          isLong && !expanded ? "line-clamp-3" : ""
        }`}
      >
        <TargetTextWithHighlights target={target} />
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="mt-1.5 self-start text-caption text-[var(--undp-blue)] hover:underline"
        >
          {expanded ? t("showLess") : t("readFull")}
        </button>
      )}
      <ActivitiesActions target={target} />
    </div>
  );
}

function PairDetailModal({
  open,
  pair,
  selectedTarget,
  countryConfig,
  onClose,
}: {
  open: boolean;
  pair: { result: AlignmentResult; other: Target } | null;
  selectedTarget: Target | null;
  countryConfig?: CountryConfig | null;
  onClose: () => void;
}) {
  const alignmentLabels = useAlignmentLabels();
  const contradictionLabels = useContradictionTypeLabels();
  const t = useTranslations("explorer.pairModal");
  if (!pair || !selectedTarget) return null;

  const { result, other } = pair;
  const negative = isContradiction(result.alignment);
  const tint = ALIGNMENT_COLORS[result.alignment];
  // Glyphs read as relationship-by-direction: contradiction = arrows pulling
  // apart, synergy = arrows pulling together, neutral = a quiet middle dot.
  const relationGlyph = negative
    ? "⇄"
    : result.alignment === "none"
      ? "·"
      : "⇋";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("title", { label: alignmentLabels[result.alignment] })}
      maxWidth="max-w-2xl"
    >
      {/* Hero callout: inset rounded card so the AI verdict reads as a
          focused box, not a full-bleed stripe across the modal. */}
      <div className="px-5 pt-5 pb-2">
        <div
          className="rounded-lg px-4 py-3.5"
          style={{ backgroundColor: `${tint}1a` }}
        >
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: tint }}
            />
            <span className="text-caption font-medium text-[var(--undp-black)]">
              {alignmentLabels[result.alignment]}
            </span>
            {result.mechanism && (
              <span className="ml-auto text-caption font-medium px-2 py-0.5 rounded-full bg-white/80 text-[var(--undp-black)] border border-line">
                {contradictionLabels[result.mechanism]}
                {result.manageability === "fundamental" && (
                  <span className="ml-1 text-[var(--undp-gray)]">{t("fundamentalSuffix")}</span>
                )}
              </span>
            )}
          </div>
          {result.description ? (
            <p className="text-body leading-relaxed text-[var(--undp-black)]">
              {result.description}
            </p>
          ) : (
            <p className="text-caption leading-relaxed text-[var(--undp-gray)]">
              {t("noRationale")}
            </p>
          )}
        </div>
      </div>

      {/* Side-by-side target cards on >= md, stacked with a vertical
          separator below. Both targets carry their document color so the
          reader can map back to the chord visualization at a glance. */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 md:gap-3 items-stretch">
          <TargetCard target={selectedTarget} countryConfig={countryConfig} />
          <div
            className="hidden md:flex items-center justify-center text-2xl text-[var(--undp-gray)] select-none"
            aria-hidden="true"
          >
            {relationGlyph}
          </div>
          <div
            className="md:hidden flex items-center justify-center text-xl text-[var(--undp-gray)] select-none -my-1"
            aria-hidden="true"
          >
            {"⇅"}
          </div>
          <TargetCard target={other} countryConfig={countryConfig} />
        </div>
      </div>
    </Modal>
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
  // `accent` is preserved on the props for callers but no longer drives
  // color — keeping all three stats neutral reads quieter at first paint.
  void accent;
  const valueClass = `text-2xl font-semibold tabular-nums leading-none text-[var(--undp-black)]`;
  const labelClass =
    "text-caption text-[var(--undp-gray)] mt-1.5";
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
          ? "bg-gray-100 ring-1 ring-line"
          : "ring-1 ring-transparent hover:bg-gray-50 hover:ring-line"
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
      <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
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
  const t = useTranslations("explorer.stat");
  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <p className="text-caption font-medium text-[var(--undp-gray)]">
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("closeListAria")}
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-base leading-none px-1"
        >
          ×
        </button>
      </div>
      {isEmpty ? (
        <p className="text-caption text-[var(--undp-gray)] leading-snug">
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
  severity,
  unit,
}: {
  target: Target;
  count: number;
  max: number;
  onClick: () => void;
  countryConfig?: CountryConfig | null;
  tone: "neutral" | "red";
  /** Worst contradiction level this target is involved in. Drives the
   *  red intensity so rows with a likely_conflict stand out from rows
   *  whose only contradictions are possible_misalignment. Only consulted when
   *  tone="red"; ignored otherwise. */
  severity?: AlignmentLevel;
  /** Optional inline label after the count (e.g., "alignments"). */
  unit?: string;
}) {
  // 4% min so the smallest non-zero count still has a visible pill.
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  // v2.1 collapses severity to a single "flagged" state; the previous
  // "likely_conflict / possible_conflict / possible_misalignment" gradient
  // is gone. Border accent stays for visual heft on the flagged row.
  const redFill = "bg-red-50 group-hover:bg-red-100";
  const fillBg = tone === "red" ? redFill : "bg-gray-100 group-hover:bg-gray-200";
  const borderAccent = tone === "red" && severity === "flagged"
    ? "border-l border-line-strong"
    : "";
  const countColor = "text-[var(--undp-black)]";
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`relative w-full text-left flex items-center gap-2 py-1.5 px-2 rounded transition-colors group overflow-hidden ${borderAccent}`}
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
        <span className="relative text-caption font-medium text-[var(--undp-gray)] shrink-0">
          {getDocLabel(countryConfig, target.sourceDocument)}
        </span>
        <span className="relative text-caption text-[var(--undp-black)] truncate flex-1">
          {target.sourceLabel}
        </span>
        <span
          className={`relative text-caption tabular-nums shrink-0 font-semibold ${countColor}`}
        >
          {count}
          {unit && (
            <span className="text-caption font-medium text-[var(--undp-gray)] ml-1">
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
  /** Follow-up chips returned by the last successful reply. */
  suggestions: ChatSuggestion[];
  /** Server-emitted navigation actions held until the user clicks Show me.
   *  Replies are now read-first, apply-on-demand: the reply text shows the
   *  factual answer, and the user opts in to view changes rather than
   *  having the wheel reshape behind their reading. Null when no reply is
   *  active or its actions have already been applied / cleared. */
  pendingActions: ChatServerAction[] | null;
  /** Inline target-id spans the server identified in the reply text. The
   *  client renders these as clickable chips so the user can jump straight
   *  to a single target without applying the model's full action set. */
  replyEntities: ReplyEntity[];
}

/** Inline target-id occurrences in the reply. start/end are byte offsets
 *  into `reply`; type is a target id today, may extend to docs/categories. */
interface ReplyEntity {
  type: "target";
  id: string;
  start: number;
  end: number;
}

/** Server-emitted navigation actions. Mirrors the client `ChatAction` union
 *  imported from `@/lib/coherence-chat` but lives at module scope so it
 *  can be referenced inside ChatStatus. */
type ChatServerAction =
  | { type: "set_filter"; filter: AlignFilter }
  | { type: "focus_category"; categoryId: string }
  | { type: "select_target"; targetId: string }
  | { type: "select_pair"; targetAId: string; targetBId: string }
  | { type: "set_mode"; mode: GroupMode }
  | { type: "show_docs"; ids: string[] };

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
        <div className="min-w-0 flex-1 text-caption leading-snug">
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
  filter: AlignFilter;
  onSelectTarget: (id: string) => void;
  onSelectPair: (targetAId: string, targetBId: string) => void;
  onAsk: (query: string) => void;
  chat: ChatStatus;
  onSetFilter: (filter: AlignFilter) => void;
  countryConfig?: CountryConfig | null;
  /** Data-aware chip strings for the example pool. Generated upstream. */
  exampleQueries: string[];
  /** Rotate to the next insight (text only, no wheel changes). */
  onRotateInsight: () => void;
  /** Currently-displayed insight, or null when the dataset has none or a
   *  reply / loading / error owns the bubble slot instead. */
  currentInsight: Insight | null;
  /** Apply the current insight's actions OR the reply's pending actions
   *  to the wheel. The dispatcher upstream chooses which based on state. */
  onApplyHook: () => void;
  /** Whether the Show me affordance has something to apply right now. */
  canShowMe: boolean;
  /** Click handler for inline target-id chips rendered inside the chat
   *  reply text. Selects the target without clearing the reply. */
  onSelectChatEntity: (targetId: string) => void;
  /** Whether to render the internal chat bar. False in embed contexts where
   *  the host already provides a chat surface. */
  showChat: boolean;
  /** Embed mode: lighter, cream-friendly chrome to match the briefing. */
  embed?: boolean;
}

type StatView = "overview" | "targets" | "alignments" | "tensions";

// Ordering used when listing contradictions in the tensions stat-view so
// high-severity pairs surface first. Module-level so the useMemo dep array
// can reference a stable identity.
const TENSION_SEVERITY: Record<string, number> = {
  likely_conflict: 0,
  possible_conflict: 1,
  possible_misalignment: 2,
};

// Example chip queries are now generated upstream by `pickExampleQueries`
// (see `@/lib/coherence-chat`). The generator filters a candidate pool
// against what's actually loaded so a user never sees a chip the dataset
// can't honestly answer.

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

// Typed-out body text for the insight callout and the chat reply, so a new
// fact appears to "write itself" rather than snap in. Mirrors
// useTypedPlaceholder above but resets when `text` changes (the placeholder
// version assumes a constant string per mount).
//
// First-mount behaviour: the initial value of `text` is shown instantly,
// without animation. Only subsequent text changes trigger the typing
// reveal. This avoids the page-load insight bubble appearing to "write
// itself" when the user hasn't asked for it yet — the typing should be a
// response to user action (Surprise me click, question asked), not the
// default opening gesture.
//
// Respects prefers-reduced-motion by skipping the animation outright. All
// state updates are deferred through timers so React's cascading-render
// lint rule stays clean.
function useTypedBody(text: string, charDelayMs = 10): string {
  const [typed, setTyped] = useState(text);
  const firstRun = useRef(true);
  useEffect(() => {
    // First-mount short-circuit: useState above already initialised the
    // returned value with the initial text, so we skip animation here and
    // just record that subsequent runs should animate.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!text) {
      const id = window.setTimeout(() => setTyped(""), 0);
      return () => window.clearTimeout(id);
    }
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      const id = window.setTimeout(() => setTyped(text), 0);
      return () => window.clearTimeout(id);
    }
    // Reset on the next tick (deferred to avoid the synchronous
    // setState-in-effect warning), then advance one character per tick.
    let i = 0;
    let intervalId: number | null = null;
    const startId = window.setTimeout(() => {
      setTyped("");
      intervalId = window.setInterval(() => {
        i += 1;
        setTyped(text.slice(0, i));
        if (i >= text.length && intervalId !== null) {
          window.clearInterval(intervalId);
          intervalId = null;
        }
      }, charDelayMs);
    }, 0);
    return () => {
      window.clearTimeout(startId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, [text, charDelayMs]);
  return typed;
}

/**
 * When Show me focuses a sector/globe category, the categoryId is a
 * taxonomy id (eg "Waste"), not a doc id, so the dispatchers can't tell
 * which docs the focal arc actually contains. This helper walks the
 * primary classifications for the focal category, accumulates the
 * matched targets' source docs into `docsToShow`, and resets the BTR
 * mit/adp pill when the matched targets are BTR-bound and the current
 * pill would hide them.
 *
 * Both `applyInsight` and `applyServerActions` call this after the main
 * action loop so the unhide step at the end picks up the new doc ids.
 */
function revealDocsForFocalTaxonomyCategory(args: {
  focalCategoryId: string;
  taxonomyType: "sector" | "globe" | "gga";
  classifications: ThematicClassification[];
  targetMap: Map<string, Target>;
  docsToShow: Set<string>;
  actionTypeFilter: ActionTypeFilter;
  setActionTypeFilter: (f: ActionTypeFilter) => void;
}) {
  const {
    focalCategoryId,
    taxonomyType,
    classifications,
    targetMap,
    docsToShow,
    actionTypeFilter,
    setActionTypeFilter,
  } = args;
  let hasBtrMit = false;
  let hasBtrAdp = false;
  for (const c of classifications) {
    if (!c.isPrimary) continue;
    if (c.taxonomyType !== taxonomyType) continue;
    if (c.categoryId !== focalCategoryId) continue;
    const t = targetMap.get(c.targetId);
    if (!t) continue;
    docsToShow.add(t.sourceDocument);
    if (t.sourceDocument === "BTR") {
      if (t.actionType === "mitigation") hasBtrMit = true;
      else if (t.actionType === "adaptation") hasBtrAdp = true;
    }
  }
  // Reset pill only when the current filter would hide the matched BTR
  // targets. Leaves filter alone when no BTR targets are involved.
  if (hasBtrMit && hasBtrAdp) {
    if (actionTypeFilter !== "all") setActionTypeFilter("all");
  } else if (hasBtrMit && actionTypeFilter === "adaptation") {
    setActionTypeFilter("all");
  } else if (hasBtrAdp && actionTypeFilter === "mitigation") {
    setActionTypeFilter("all");
  }
}

/**
 * Chat input + reply. Lives inside EmptyPanel below the "At a glance"
 * stats — borderless so it inherits the EmptyPanel card chrome rather
 * than stacking a card-in-a-card. Reply is only visible while the user
 * is in idle state; once the wheel reshapes into a category or target
 * view, the wheel + panel state IS the answer.
 */
/**
 * Tailwind class lists for the chat's chip vocabulary.
 *
 * - SURPRISE: amber-tinted pill for Surprise-me, mirroring the insight
 *   bubble's accent so the two read as a related pair.
 * - SUGGESTION: small gray pill for server-emitted follow-up chips after a
 *   reply (these tend to be short labels like "Find similar tensions").
 * - EXAMPLE_ROW: full-width left-aligned row for the persistent starter
 *   questions. Stacking them vertically makes the row heights uniform when
 *   labels run long, so the panel doesn't read as a ragged pill-wrap.
 * - SHOW_ME_LINK: lightweight text-link + arrow used inside the insight /
 *   reply bubbles. Replaces the heavier black-filled pill so the bubble's
 *   own accent color carries the CTA emphasis.
 */
const CHIP_BASE =
  "text-caption leading-snug rounded-full px-2.5 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const CHIP_SURPRISE = `${CHIP_BASE} text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-300`;
const CHIP_SUGGESTION = `${CHIP_BASE} text-[var(--undp-gray)] border border-line hover:bg-gray-50 hover:border-line-strong hover:text-[var(--undp-black)]`;
const EXAMPLE_ROW =
  "w-full text-left text-caption leading-snug rounded-md px-3 py-2 text-[var(--undp-gray)] border border-line hover:bg-gray-50 hover:border-line-strong hover:text-[var(--undp-black)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
// Workbench variant of the example starters: small pills under the prominent
// chat input, so they stay visibly secondary to the chat itself.
const EXAMPLE_CHIP =
  "text-left text-caption leading-snug rounded-full px-2.5 py-1 text-[var(--undp-gray)] border border-line hover:bg-gray-50 hover:border-line-strong hover:text-[var(--undp-black)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const SHOW_ME_LINK_BASE =
  "text-caption font-semibold inline-flex items-center gap-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed";
const SHOW_ME_LINK_AMBER = `${SHOW_ME_LINK_BASE} text-amber-800 hover:text-amber-900 hover:underline`;
const SHOW_ME_LINK_BLUE = `${SHOW_ME_LINK_BASE} text-[var(--undp-blue)] hover:underline`;

/**
 * Renders a chat reply with inline target-id chips. Each entity in
 * `entities` is replaced by a clickable button at its `[start, end)` slice
 * of the full reply. While the typewriter cursor is mid-entity the partial
 * text renders plain; the chip only appears once the entity is fully
 * revealed. Falls back to plain text when there are no entities.
 */
function ReplyText({
  typed,
  full,
  entities,
  onSelectTarget,
}: {
  typed: string;
  full: string | null;
  entities: ReplyEntity[];
  onSelectTarget: (targetId: string) => void;
}) {
  const t = useTranslations("explorer.chat");
  if (!full || entities.length === 0) {
    return <>{typed}</>;
  }
  const cursor = typed.length;
  const parts: React.ReactNode[] = [];
  let from = 0;
  let key = 0;
  for (const e of entities) {
    if (e.start >= cursor) break;
    if (e.start > from) {
      parts.push(<span key={key++}>{full.slice(from, e.start)}</span>);
    }
    if (e.end <= cursor) {
      parts.push(
        <button
          key={key++}
          type="button"
          onClick={() => onSelectTarget(e.id)}
          className="font-medium text-[var(--undp-black)] underline decoration-dotted decoration-gray-400 underline-offset-2 hover:decoration-[var(--undp-blue)] hover:text-[var(--undp-blue)] transition-colors px-0.5 rounded-sm focus:outline-none focus:ring-1 focus:ring-[var(--undp-blue)]/40"
          title={t("openEntityTitle", { id: e.id })}
        >
          {full.slice(e.start, e.end)}
        </button>,
      );
      from = e.end;
    } else {
      // Entity is mid-typing: render what's revealed as plain text,
      // stop here, the next render frame will pick up the rest.
      parts.push(<span key={key++}>{full.slice(e.start, cursor)}</span>);
      from = cursor;
      break;
    }
  }
  if (from < cursor) {
    parts.push(<span key={key++}>{full.slice(from, cursor)}</span>);
  }
  return <>{parts}</>;
}

/**
 * The chat output bubbles (rotating insight, typed reply, error) plus the
 * inline "Show me" affordance. Extracted from ChatBar so the Explorer B
 * workbench can keep the chat INPUT in the bottom dock while the OUTPUT lands
 * in the answers drawer. In the standalone variants ChatBar renders this inline
 * exactly as before.
 */
function ChatOutput({
  chat,
  currentInsight,
  canShowMe,
  onApplyHook,
  onSelectChatEntity,
  hideInsights = false,
}: {
  chat: ChatStatus;
  currentInsight: Insight | null;
  canShowMe: boolean;
  onApplyHook: () => void;
  onSelectChatEntity: (targetId: string) => void;
  hideInsights?: boolean;
}) {
  const t = useTranslations("explorer.chat");
  const ti = useTranslations("explorer.insights");
  const showInsight =
    !hideInsights &&
    !!currentInsight &&
    !chat.reply &&
    !chat.loading &&
    !chat.error;
  const showReply = !!chat.reply && !chat.loading;
  const showError = !!chat.error && !chat.loading;
  const typedReply = useTypedBody(showReply ? chat.reply ?? "" : "");

  // Prefer the localized insight message (es/mn: explorer.insights.<pattern>.*)
  // when it exists and the insight carries interpolation vars; otherwise fall
  // back to the English callout/pathway composed in coherence-insights.ts.
  const localizeInsight = (field: "callout" | "pathway"): string => {
    if (!currentInsight) return "";
    const tt = ti as unknown as {
      has: (k: string) => boolean;
      (k: string, v?: Record<string, string | number>): string;
    };
    const key = `${currentInsight.pattern}.${field}`;
    if (currentInsight.vars && tt.has(key)) return tt(key, currentInsight.vars);
    return (
      (field === "callout" ? currentInsight.callout : currentInsight.pathway) ?? ""
    );
  };

  return (
    <>
      {showInsight && currentInsight && (
        <div className="text-data text-[var(--undp-black)] leading-relaxed bg-amber-50/70 border border-amber-100 rounded-lg px-3.5 py-2.5">
          <p className="flex items-baseline gap-2">
            <span className="text-caption font-medium text-amber-700 shrink-0">
              {t("insight")}
            </span>
            <span className="flex-1">{localizeInsight("callout")}</span>
          </p>
          {currentInsight.pathway && (
            <p className="mt-1.5 text-caption text-amber-900/65 leading-snug pl-[60px]">
              <span
                aria-hidden="true"
                className="mr-1.5 text-amber-700/70"
              >
                ↪
              </span>
              {localizeInsight("pathway")}
            </p>
          )}
          {canShowMe && (
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={onApplyHook}
                disabled={chat.loading}
                className={SHOW_ME_LINK_AMBER}
              >
                {t("showMe")} <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
      )}
      {showReply && (
        <div className="text-data text-[var(--undp-black)] leading-relaxed bg-gray-50 border border-line-soft rounded-lg px-3.5 py-2.5">
          <div>
            <ReplyText
              typed={typedReply}
              full={chat.reply}
              entities={chat.replyEntities}
              onSelectTarget={onSelectChatEntity}
            />
          </div>
          {canShowMe && (
            <div className="flex justify-end mt-2">
              <button
                type="button"
                onClick={onApplyHook}
                disabled={chat.loading}
                className={SHOW_ME_LINK_BLUE}
              >
                {t("showMe")} <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
      )}
      {showError && (
        <div className="text-data text-red-700 leading-relaxed bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
          {chat.error}
        </div>
      )}
    </>
  );
}

function ChatBar({
  onAsk,
  chat,
  exampleQueries,
  onRotateInsight,
  currentInsight,
  onApplyHook,
  canShowMe,
  onSelectChatEntity,
  prominent = false,
  hideInsights = false,
  hideReply = false,
  surprisePool,
  surpriseFills = false,
}: {
  onAsk: (query: string) => void;
  chat: ChatStatus;
  exampleQueries: string[];
  onRotateInsight: () => void;
  currentInsight: Insight | null;
  onApplyHook: () => void;
  /** Whether the Show me affordance has something to apply: either an
   *  insight bubble is showing, or a reply has pending server actions. */
  canShowMe: boolean;
  /** Inline click handler for target-id chips rendered inside the reply. */
  onSelectChatEntity: (targetId: string) => void;
  /** Workbench mode: a lead label, a larger input with a filled Ask button, and
   *  example questions shown as small chips rather than full-width rows, so the
   *  chat reads as the section's primary action. */
  prominent?: boolean;
  /** Suppress the rotating insight bubble + Surprise me (used in the expanded
   *  wheel view, where the user wants just the wheel and the chat). */
  hideInsights?: boolean;
  /** Render the input + chips only, with the reply / insight / error bubbles
   *  suppressed. The Explorer B dock sets this so the output lands in the
   *  answers drawer instead. */
  hideReply?: boolean;
  /** Full pool of questions Surprise me draws from when surpriseFills is set
   *  (wider than the few chips shown). */
  surprisePool?: string[];
  /** Explorer B behaviour: Surprise me fills the input with a random question
   *  from surprisePool instead of rotating a data-derived insight. */
  surpriseFills?: boolean;
}) {
  const t = useTranslations("explorer.chat");
  const [query, setQuery] = useState("");
  const placeholder = useTypedPlaceholder(
    prominent ? t("askPlaceholderProminent") : t("askPlaceholder"),
  );
  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || chat.loading) return;
    onAsk(trimmed);
    setQuery("");
  };

  // showReply gates the server follow-up chips below. The reply / insight /
  // error bubbles render via <ChatOutput> (suppressed when hideReply, e.g. the
  // Explorer B dock, where the output moves to the answers drawer instead).
  const showReply = !!chat.reply && !chat.loading;
  // Drop server-emitted "surprise" follow-ups because the always-visible
  // Surprise me chip below already covers that affordance.
  const visibleSuggestions = chat.suggestions.filter(
    (s) => s.kind !== "surprise",
  );
  const showSuggestions = showReply && visibleSuggestions.length > 0;

  const onSurprise = () => {
    if (surpriseFills) {
      const pool = surprisePool ?? [];
      if (pool.length === 0) return;
      setQuery(pool[Math.floor(Math.random() * pool.length)]);
      return;
    }
    onRotateInsight();
  };

  return (
    <div className="space-y-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(query);
        }}
      >
        {prominent ? (
          // Explorer B dock: a single embedded bar — lead label, search input,
          // filled Ask button — so the chat reads as part of the canvas.
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3.5 py-2.5 shadow-sm">
            <span className="hidden max-w-[54px] shrink-0 text-caption font-medium leading-[1.15] text-[var(--undp-gray)] sm:block">
              {t("askPoliciesLabel")}
            </span>
            <span aria-hidden="true" className="text-body text-gray-300">
              ⌕
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={chat.loading}
              className="min-w-0 flex-1 bg-transparent text-data text-[var(--undp-black)] placeholder:text-[var(--undp-gray)] focus:outline-none disabled:opacity-50"
              aria-label={t("askAriaProminent")}
            />
            <button
              type="submit"
              disabled={chat.loading || query.trim().length === 0}
              className="shrink-0 rounded-full bg-[var(--undp-blue)] px-5 py-2 text-data font-semibold text-white transition-colors disabled:opacity-40"
            >
              {chat.loading ? t("loading") : t("askProminent")}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 border border-line rounded-md px-3 py-2 focus-within:border-gray-400 transition-colors">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              disabled={chat.loading}
              className="flex-1 min-w-0 text-data text-[var(--undp-black)] placeholder:text-[var(--undp-gray)] bg-transparent focus:outline-none disabled:opacity-50"
              aria-label={t("askAria")}
            />
            <button
              type="submit"
              disabled={chat.loading || query.trim().length === 0}
              className="text-caption font-medium text-[var(--undp-blue)] hover:underline disabled:opacity-30 disabled:no-underline shrink-0"
            >
              {chat.loading ? t("loading") : t("ask")}
            </button>
          </div>
        )}
      </form>

      {/* Disclosure for the chat-query ledger (removable usage analytics:
          see src/lib/analytics/README.md). The workbench dock (prominent) folds
          this sentence into the stage's footer caveat instead. */}
      {!prominent && (
        <p className="px-1 text-caption text-[var(--undp-gray)]/80">
          {t("storageNotice")}
        </p>
      )}

      {chat.loading && (
        <div className="text-caption text-[var(--undp-gray)] px-1">
          {t("thinking")}
        </div>
      )}

      {!hideReply && (
        <ChatOutput
          chat={chat}
          currentInsight={currentInsight}
          canShowMe={canShowMe}
          onApplyHook={onApplyHook}
          onSelectChatEntity={onSelectChatEntity}
          hideInsights={hideInsights}
        />
      )}

      {/* Chips: Surprise me + server follow-ups + example questions. In the
       *  prominent dock they all flow into one wrapping row under the bar
       *  (`contents` lets each group join the same flex line); elsewhere they
       *  stack as separate blocks. */}
      <div className={prominent ? "flex flex-wrap items-center gap-2" : "space-y-2.5"}>
        {!hideInsights && (
          <div className={prominent ? "contents" : "flex flex-wrap gap-1.5"}>
            <button
              type="button"
              onClick={onSurprise}
              disabled={chat.loading}
              className={CHIP_SURPRISE}
            >
              {t("surpriseMe")}
            </button>
          </div>
        )}
        {showSuggestions && (
          <div className={prominent ? "contents" : "flex flex-wrap gap-1.5"}>
            {visibleSuggestions.map((s) => (
              <button
                key={s.query}
                type="button"
                onClick={() => submit(s.query)}
                disabled={chat.loading}
                className={CHIP_SUGGESTION}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className={prominent ? "contents" : "flex flex-col gap-1.5"}>
          {exampleQueries.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              disabled={chat.loading}
              className={prominent ? EXAMPLE_CHIP : EXAMPLE_ROW}
            >
              {q}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Browseable stats: shared hook + list view ──────────────────────
//
// Shared between EmptyPanel (idle, scoped to all visible items) and
// CategoryPanel (focal-category-scoped). Clicking a stat tile opens a
// full list of items in that category and tells the parent to align
// the wheel filter with the view intent so the visualisation reflects
// what the user is browsing.

/**
 * Stat-browsing engine: state + sorted lists for the three list views.
 * The big sorted lists are gated on the active `statView` so the
 * default overview render stays cheap.
 */
function useStatBrowsing({
  targets,
  alignment,
  filter,
  onSetFilter,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  filter: AlignFilter;
  onSetFilter: (filter: AlignFilter) => void;
}) {
  const [statView, setStatView] = useState<StatView>("overview");
  // Remember the wheel filter that was active before the user opened a
  // stat view, so closing the view restores their prior selection
  // instead of leaving the wheel locked to the stat's filter intent.
  // Held in a ref because we only need its value when transitioning,
  // not on every render.
  const previousFilterRef = useRef<AlignFilter | null>(null);

  const toggleStatView = useCallback(
    (view: StatView, viewFilter: AlignFilter) => {
      if (statView === view) {
        // Toggling the active view off: restore the prior filter.
        if (previousFilterRef.current !== null) {
          onSetFilter(previousFilterRef.current);
          previousFilterRef.current = null;
        }
        setStatView("overview");
        return;
      }
      if (statView === "overview") {
        // Entering a stat view from overview: capture the current
        // filter so we can put it back on close.
        previousFilterRef.current = filter;
      }
      // Either entering or switching between stat views: apply the
      // new view's filter intent.
      onSetFilter(viewFilter);
      setStatView(view);
    },
    [statView, filter, onSetFilter],
  );

  const closeStatView = useCallback(() => {
    if (statView === "overview") return;
    if (previousFilterRef.current !== null) {
      onSetFilter(previousFilterRef.current);
      previousFilterRef.current = null;
    }
    setStatView("overview");
  }, [statView, onSetFilter]);

  // Totals are mutually exclusive (contradictions excluded from
  // alignments) so the headline numbers match the document-level
  // summary instead of double-counting.
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

  // Per-target degree counts inside the current scope, used by the
  // pair-list sort to put hub pairs first.
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

  // Sort pairs by max-endpoint degree first (groups all of a hub's
  // pairs together) then by partner degree (within a hub, pairs
  // touching another well-connected target rank above pairs touching
  // a leaf).
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

  // Group ranked targets by source document so 60+ items don't flood
  // the panel; each doc group renders as a collapsible section.
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
      .sort((a, b) => b.totalCount - a.totalCount);
  }, [statView, allTargetsRanked]);

  return {
    statView,
    setStatView,
    toggleStatView,
    closeStatView,
    totalAligned,
    totalContra,
    targetMap,
    highDegree,
    tensionDegree,
    allTargetsRanked,
    allAlignmentPairs,
    allTensionPairs,
    targetsByDoc,
    allTargetsMax,
  };
}

type StatBrowsingHook = ReturnType<typeof useStatBrowsing>;

/**
 * Renders the active stat-view list (targets / alignments / tensions).
 * Returns `null` when the panel is in "overview" mode; callers render
 * their own overview content in that case. `getTarget` lets the
 * CategoryPanel resolve partner targets that sit outside the focal
 * category. The hook's internal `targetMap` only knows about in-scope
 * targets, so cross-category partners would otherwise fail to render.
 */
function StatBrowseView({
  stat,
  onSelectTarget,
  onSelectPair,
  getTarget,
  countryConfig,
}: {
  stat: StatBrowsingHook;
  onSelectTarget: (id: string) => void;
  onSelectPair: (targetAId: string, targetBId: string) => void;
  getTarget: (id: string) => Target | undefined;
  countryConfig?: CountryConfig | null;
}) {
  const t = useTranslations("explorer.empty");
  const {
    statView,
    closeStatView,
    allTargetsRanked,
    allAlignmentPairs,
    allTensionPairs,
    targetsByDoc,
    allTargetsMax,
    highDegree,
    tensionDegree,
  } = stat;

  if (statView === "targets") {
    return (
      <StatListSection
        title={t("allTargetsTitle", { count: allTargetsRanked.length })}
        onClose={closeStatView}
        empty={t("emptyTargets")}
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
                  <span className="text-caption font-semibold text-[var(--undp-black)]">
                    {label}
                  </span>
                  <span className="text-caption text-[var(--undp-gray)] tabular-nums">
                    {t("docTargetCount", { count: items.length })}
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
    );
  }

  if (statView === "alignments") {
    return (
      <StatListSection
        title={t("allAlignmentsTitle", { count: allAlignmentPairs.length })}
        onClose={closeStatView}
        empty={t("emptyAlignments")}
        isEmpty={allAlignmentPairs.length === 0}
      >
        <ul className="space-y-0.5">
          {allAlignmentPairs.map((p) => {
            // Higher-degree endpoint on top so the hub target is what
            // the eye lands on first.
            const degA = highDegree.get(p.targetAId) ?? 0;
            const degB = highDegree.get(p.targetBId) ?? 0;
            const [firstId, secondId] =
              degA >= degB
                ? [p.targetAId, p.targetBId]
                : [p.targetBId, p.targetAId];
            const tFirst = getTarget(firstId);
            const tSecond = getTarget(secondId);
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
    );
  }

  if (statView === "tensions") {
    return (
      <StatListSection
        title={t("allTensionsTitle", { count: allTensionPairs.length })}
        onClose={closeStatView}
        empty={t("emptyTensions")}
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
            const tFirst = getTarget(firstId);
            const tSecond = getTarget(secondId);
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
    );
  }

  return null;
}

function EmptyPanel({
  targets,
  alignment,
  filter,
  onSelectTarget,
  onSelectPair,
  onAsk,
  chat,
  onSetFilter,
  countryConfig,
  exampleQueries,
  onRotateInsight,
  currentInsight,
  onApplyHook,
  canShowMe,
  onSelectChatEntity,
  showChat,
  embed,
}: EmptyPanelProps) {
  const t = useTranslations("explorer.empty");
  // Stats are interactive: clicking a stat sets the wheel filter AND swaps
  // the middle section to a full list of that kind of item (targets, strong
  // alignment pairs, or contradiction pairs). Clicking the same stat again
  // closes the list and restores the user's prior filter selection.
  const stat = useStatBrowsing({ targets, alignment, filter, onSetFilter });
  const { statView, toggleStatView, totalAligned, totalContra, targetMap } =
    stat;

  // Overview-only rankings (not surfaced by the stat-view lists): the six
  // most-aligned and six most-conflicted targets. Counting medium/low
  // edges would let "broadly mentioned" targets dominate the alignment
  // column for reasons that aren't really about coherence — strong-only
  // keeps the signal tight. Both metrics use the wheel's current
  // alignment subset so numbers match what's drawn.
  //
  // For tensions we also track the MAX severity a target is involved in
  // (likely_conflict > possible_conflict > possible_misalignment) so the
  // row can render in a darker red when at least one pair is a hard
  // contradiction. Without this, a target with 50 possible_misalignments and one
  // with a single likely_conflict looked identical.
  const { connRanks, tensRanks } = useMemo(() => {
    const connCounts = new Map<string, number>();
    const tensCounts = new Map<string, number>();
    const tensSeverity = new Map<string, AlignmentLevel>();
    // Lower rank value = more severe. Matches the ordering used elsewhere
    // in this file (e.g. line 827, line 1629).
    const severityRank: Record<string, number> = {
      likely_conflict: 0,
      possible_conflict: 1,
      possible_misalignment: 2,
    };
    const bumpSeverity = (id: string, level: AlignmentLevel) => {
      const prev = tensSeverity.get(id);
      if (!prev || severityRank[level] < severityRank[prev]) {
        tensSeverity.set(id, level);
      }
    };
    for (const a of alignment) {
      if (a.alignment === "high") {
        connCounts.set(a.targetAId, (connCounts.get(a.targetAId) ?? 0) + 1);
        connCounts.set(a.targetBId, (connCounts.get(a.targetBId) ?? 0) + 1);
      } else if (isContradiction(a.alignment)) {
        tensCounts.set(a.targetAId, (tensCounts.get(a.targetAId) ?? 0) + 1);
        tensCounts.set(a.targetBId, (tensCounts.get(a.targetBId) ?? 0) + 1);
        bumpSeverity(a.targetAId, a.alignment);
        bumpSeverity(a.targetBId, a.alignment);
      }
    }
    const toRanked = (m: Map<string, number>) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([id, count]) => ({
          target: targetMap.get(id),
          count,
          severity: tensSeverity.get(id),
        }))
        .filter(
          (x): x is { target: Target; count: number; severity: AlignmentLevel | undefined } =>
            !!x.target,
        );
    return {
      connRanks: toRanked(connCounts),
      tensRanks: toRanked(tensCounts),
    };
  }, [alignment, targetMap]);

  const connMax = connRanks[0]?.count ?? 1;
  const tensMax = tensRanks[0]?.count ?? 1;

  return (
    <div className={`flex flex-col h-full overflow-hidden ${embed ? "bg-white/55 border border-line/70 rounded-2xl" : "bg-white border border-line-soft rounded-lg"}`}>
      <div className="p-5 overflow-y-auto flex-1 space-y-6">
        <div>
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-3">
            {t("atAGlance")}
          </p>
          <div className="grid grid-cols-3 gap-4">
            <Stat
              label={t("statTargets")}
              value={targets.length}
              onClick={() => toggleStatView("targets", "high_contra")}
              title={t("statTargetsTitle")}
              active={statView === "targets"}
            />
            <Stat
              label={t("statAlignments")}
              value={totalAligned}
              accent="green"
              onClick={() => toggleStatView("alignments", "high")}
              title={t("statAlignmentsTitle")}
              active={statView === "alignments"}
            />
            <Stat
              label={t("statMisalignments")}
              value={totalContra}
              accent="red"
              onClick={() => toggleStatView("tensions", "contradictions")}
              title={t("statMisalignmentsTitle")}
              active={statView === "tensions"}
            />
          </div>
        </div>

        {statView === "overview" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Section title={t("strongestAlignments")}>
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
                <p className="text-caption text-[var(--undp-gray)] leading-snug">
                  {t("noStrongAlignments")}
                </p>
              )}
            </Section>
            <Section title={t("mostConflictedTargets")}>
              {tensRanks.length > 0 ? (
                <ul className="space-y-0.5">
                  {tensRanks.map(({ target, count, severity }) => (
                    <BarRow
                      key={target.id}
                      target={target}
                      count={count}
                      max={tensMax}
                      onClick={() => onSelectTarget(target.id)}
                      countryConfig={countryConfig}
                      tone="red"
                      severity={severity}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-caption text-[var(--undp-gray)] leading-snug">
                  {t("noTensions")}
                </p>
              )}
            </Section>
          </div>
        ) : (
          <StatBrowseView
            stat={stat}
            onSelectTarget={onSelectTarget}
            onSelectPair={onSelectPair}
            getTarget={(id) => targetMap.get(id)}
            countryConfig={countryConfig}
          />
        )}

        {showChat && (
          <ChatBar
            onAsk={onAsk}
            chat={chat}
            exampleQueries={exampleQueries}
            onRotateInsight={onRotateInsight}
            currentInsight={currentInsight}
            onApplyHook={onApplyHook}
            canShowMe={canShowMe}
            onSelectChatEntity={onSelectChatEntity}
          />
        )}

      </div>
    </div>
  );
}

interface CategoryPanelProps {
  group: GroupArc;
  nodes: NodePos[];
  arcs: GroupArc[];
  alignment: AlignmentResult[];
  filter: AlignFilter;
  onClose: () => void;
  onSelectTarget: (id: string) => void;
  onSelectPair: (targetAId: string, targetBId: string) => void;
  onSelectCategory: (id: string) => void;
  onSetFilter: (filter: AlignFilter) => void;
  countryConfig?: CountryConfig | null;
  /** Tagged BER spend for this category (primary GLOBE only). Parent passes
   *  null on non-GLOBE lenses so the rows render only where the data maps. */
  budget?: CategoryBudgetEntry | null;
  /** Currency string from berData, used to format the absolute amount. */
  budgetCurrency?: string;
  /** Reporting period from berData (e.g. {start: 2020, end: 2024}). */
  budgetPeriod?: { start: number; end: number };
  /** Programmes contributing positive spend to this primary GLOBE category,
   *  sorted desc. Empty when the category has no contributors or when the
   *  parent panel is rendering for a non-GLOBE lens. */
  programmes?: CategoryProgramme[];
}

function CategoryPanel({
  group,
  nodes,
  arcs,
  alignment,
  filter,
  onClose,
  budget,
  budgetCurrency,
  budgetPeriod,
  programmes,
  onSelectTarget,
  onSelectPair,
  onSelectCategory,
  onSetFilter,
  countryConfig,
}: CategoryPanelProps) {
  const t = useTranslations("explorer.category");
  /** Contributing-programmes disclosure starts collapsed on every panel open.
   *  Component-local state is enough because the panel re-mounts on each
   *  category click via `key={focalGroup.id}` upstream — opening Pollution
   *  then Sustainable use gives the latter a fresh closed disclosure. */
  const [programmesOpen, setProgrammesOpen] = useState(false);
  const targetIdsInGroup = useMemo(
    () => new Set(nodes.filter((n) => n.groupId === group.id).map((n) => n.id)),
    [nodes, group.id],
  );
  const targetsInGroup = useMemo(
    () => nodes.filter((n) => n.groupId === group.id),
    [nodes, group.id],
  );
  const scopedTargets = useMemo(
    () => targetsInGroup.map((n) => n.target),
    [targetsInGroup],
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

  // Browseable stats engine, scoped to this category. Same UX as the
  // idle panel: clicking a stat tile sets the wheel filter to match
  // the view intent and replaces the overview with a full list. The
  // `getTarget` callback below resolves cross-category partner targets
  // that don't sit in `scopedTargets`.
  const stat = useStatBrowsing({
    targets: scopedTargets,
    alignment: involvedAlignments,
    filter,
    onSetFilter,
  });
  const { statView, toggleStatView, totalAligned, totalContra } = stat;

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

  // Pair listings — what the user usually came here for. Keep contradictions
  // and high alignments separate so each can be hidden when its filter is
  // off (the involvedAlignments arg is already filter-aware).
  const SEVERITY: Record<string, number> = {
    likely_conflict: 0,
    possible_conflict: 1,
    possible_misalignment: 2,
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
    <div className="bg-white border border-line-soft rounded-lg flex flex-col h-full overflow-hidden">
      {/* Pinned header with stats so the body owns the scroll. */}
      <div className="p-5 pb-4 shrink-0 border-b border-line-soft">
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
            aria-label={t("closeAria")}
          >
            ×
          </button>
        </div>
        {budget && (
          <div className="text-caption text-[var(--undp-black)] leading-snug mb-3 space-y-0.5">
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--undp-gray)] w-32 shrink-0">
                {t("taggedBerSpend")}
              </span>
              <span className="tabular-nums">
                <span className="font-medium">
                  {formatBudgetValue(
                    budget.totalBudget,
                    budgetCurrency ?? "",
                  )}
                </span>
                <span className="text-[var(--undp-gray)]">
                  {t("shareSuffix", { pct: (budget.shareOfTotalBudget * 100).toFixed(1) })}
                </span>
                {budgetPeriod && (
                  <span className="text-[var(--undp-gray)]">
                    {t("periodSuffix", { start: budgetPeriod.start, end: budgetPeriod.end })}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[var(--undp-gray)] w-32 shrink-0">
                {t("policyTargets")}
              </span>
              <span className="tabular-nums">
                <span className="font-medium">{budget.targetCount}</span>
                <span className="text-[var(--undp-gray)]">
                  {t("policyTargetsShareSuffix", { pct: (budget.shareOfTargets * 100).toFixed(0) })}
                </span>
              </span>
            </div>
            {programmes && programmes.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setProgrammesOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-caption text-[var(--undp-black)] hover:text-[var(--undp-blue)] transition-colors"
                  aria-expanded={programmesOpen}
                >
                  <span aria-hidden="true" className="text-[var(--undp-gray)]">
                    {programmesOpen ? "▾" : "▸"}
                  </span>
                  <span>
                    {t("contributingProgrammes")}
                    <span className="text-[var(--undp-gray)]">
                      {t("contributingProgrammesCount", { count: programmes.length })}
                    </span>
                  </span>
                </button>
                {programmesOpen && (() => {
                  // List is pre-sorted desc by the helper, so the first
                  // entry's spend is the max. Each row's bar width scales
                  // against this so the biggest contributor fills the
                  // available width and smaller programmes shrink
                  // proportionally — quick visual sense of "this one
                  // dominates" without the user having to read the digits.
                  const maxBudget = programmes[0]?.totalBudget ?? 0;
                  return (
                    <ul className="mt-1.5 space-y-1">
                      {programmes.map((p) => {
                        const widthPct =
                          maxBudget > 0
                            ? (p.totalBudget / maxBudget) * 100
                            : 0;
                        return (
                          <li
                            key={p.code}
                            title={t("programmeTooltip", { id: p.subcategoryId, name: p.subcategoryName })}
                          >
                            <div className="flex items-baseline gap-2 text-caption">
                              <span className="text-[var(--undp-gray)] tabular-nums shrink-0">
                                {p.code}
                              </span>
                              <span className="text-[var(--undp-black)] truncate flex-1">
                                {p.name}
                              </span>
                              <span className="text-[var(--undp-black)] font-medium tabular-nums shrink-0">
                                {formatBudgetValue(
                                  p.totalBudget,
                                  budgetCurrency ?? "",
                                )}
                              </span>
                            </div>
                            <div
                              aria-hidden="true"
                              className="h-[3px] mt-0.5 rounded-sm"
                              style={{
                                width: `${widthPct}%`,
                                backgroundColor: BUDGET_WEDGE_COLOR,
                                opacity: 0.6,
                              }}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-3 gap-4">
          <Stat
            label={t("statTargets")}
            value={group.count}
            onClick={() => toggleStatView("targets", "high_contra")}
            title={t("statTargetsTitle")}
            active={statView === "targets"}
          />
          <Stat
            label={t("statAlignments")}
            value={totalAligned}
            accent="green"
            onClick={() => toggleStatView("alignments", "high")}
            title={t("statAlignmentsTitle")}
            active={statView === "alignments"}
          />
          <Stat
            label={t("statMisalignments")}
            value={totalContra}
            accent="red"
            onClick={() => toggleStatView("tensions", "contradictions")}
            title={t("statMisalignmentsTitle")}
            active={statView === "tensions"}
          />
        </div>
      </div>

      <div className="p-5 overflow-y-auto flex-1 space-y-6">
        {statView === "overview" ? (
          /* Flat 2×2 grid so both rows align across columns: row 1 =
             partner overviews, row 2 = per-target pair lists. The grid
             auto-sizes each row to the taller cell, which keeps the
             pair-list headers level even when one column has more
             partner entries than the other. Tone is consistent within a
             column (red on the left, green on the right). Falls back to
             a single column on narrow viewports. */
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-5 gap-y-6">
            <div>
              <Section title={t("misWithOther")}>
                {topTensionPartners.length > 0 ? (
                  <ul className="space-y-0.5">
                    {topTensionPartners.map(({ arc, count }) => (
                      <li key={arc.id}>
                        <button
                          type="button"
                          onClick={() => onSelectCategory(arc.id)}
                          title={arc.label}
                          className="w-full flex items-center gap-2 text-caption py-0.5 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors text-left"
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: arc.color }}
                          />
                          <span className="text-[var(--undp-black)] truncate flex-1">
                            {arc.label}
                          </span>
                          <span className="text-[var(--undp-black)] tabular-nums">
                            {count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-caption text-[var(--undp-gray)] leading-snug">
                    {t("noTensionsOther")}
                  </p>
                )}
              </Section>
            </div>
            <div>
              <Section title={t("alignsWithOther")}>
                {topSynergyPartners.length > 0 ? (
                  <ul className="space-y-0.5">
                    {topSynergyPartners.map(({ arc, count }) => (
                      <li key={arc.id}>
                        <button
                          type="button"
                          onClick={() => onSelectCategory(arc.id)}
                          title={arc.label}
                          className="w-full flex items-center gap-2 text-caption py-0.5 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors text-left"
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
                  <p className="text-caption text-[var(--undp-gray)] leading-snug">
                    {t("noAlignsOther")}
                  </p>
                )}
              </Section>
            </div>
            <div>
              <Section
                title={
                  contradictionPairs.length > 0
                    ? t("topConflictsCount", { count: contradictionPairs.length })
                    : t("topConflicts")
                }
              >
                {contradictionPairs.length > 0 ? (
                  <>
                    <ul className="space-y-0.5">
                      {contradictionPairs.slice(0, 5).map((p) => {
                        const tA = nodeMap.get(p.targetAId)?.target;
                        const tB = nodeMap.get(p.targetBId)?.target;
                        if (!tA || !tB) return null;
                        return (
                          <PairRow
                            key={`c-${p.targetAId}-${p.targetBId}`}
                            a={tA}
                            b={tB}
                            level={p.alignment}
                            onClick={() =>
                              onSelectPair(p.targetAId, p.targetBId)
                            }
                            countryConfig={countryConfig}
                          />
                        );
                      })}
                    </ul>
                    {contradictionPairs.length > 5 && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleStatView("tensions", "contradictions")
                        }
                        className="text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] mt-1.5 px-1.5 underline decoration-dotted underline-offset-2"
                      >
                        {t("moreCount", { count: contradictionPairs.length - 5 })}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-caption text-[var(--undp-gray)] leading-snug">
                    {t("noConflicts")}
                  </p>
                )}
              </Section>
            </div>
            <div>
              <Section
                title={
                  alignmentPairs.length > 0
                    ? t("strongestAlignmentsCount", { count: alignmentPairs.length })
                    : t("strongestAlignments")
                }
              >
                {alignmentPairs.length > 0 ? (
                  <>
                    <ul className="space-y-0.5">
                      {alignmentPairs.slice(0, 5).map((p) => {
                        const tA = nodeMap.get(p.targetAId)?.target;
                        const tB = nodeMap.get(p.targetBId)?.target;
                        if (!tA || !tB) return null;
                        return (
                          <PairRow
                            key={`a-${p.targetAId}-${p.targetBId}`}
                            a={tA}
                            b={tB}
                            level={p.alignment}
                            onClick={() =>
                              onSelectPair(p.targetAId, p.targetBId)
                            }
                            countryConfig={countryConfig}
                          />
                        );
                      })}
                    </ul>
                    {alignmentPairs.length > 5 && (
                      <button
                        type="button"
                        onClick={() => toggleStatView("alignments", "high")}
                        className="text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] mt-1.5 px-1.5 underline decoration-dotted underline-offset-2"
                      >
                        {t("moreCount", { count: alignmentPairs.length - 5 })}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-caption text-[var(--undp-gray)] leading-snug">
                    {t("noStrongAlignments")}
                  </p>
                )}
              </Section>
            </div>
          </div>
        ) : (
          <StatBrowseView
            stat={stat}
            onSelectTarget={onSelectTarget}
            onSelectPair={onSelectPair}
            getTarget={(id) => nodeMap.get(id)?.target}
            countryConfig={countryConfig}
          />
        )}
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

interface PolicyCoherenceExplorerProps {
  targets: Target[];
  alignment: AlignmentResult[];
  sectors: TaxCategory[];
  globeCategories: TaxCategory[];
  globeSubcategories?: GlobeSubcategory[];
  /** Climate-resilience (GGA) taxonomy categories — decision 2/CMA.5 thematic
   *  targets. Enables the fourth "Resilience" wheel grouping when present. */
  ggaCategories?: TaxCategory[];
  classifications: ThematicClassification[];
  nr7Data?: Nr7Data | null;
  btrData?: BtrData | null;
  /** Country BER (Biodiversity Expenditure Review) data. When present and
   *  classifications cover GLOBE subcategories, the wheel exposes the
   *  Biodiversity Budget overlay and the chat receives budget context. */
  berData?: BerData | null;
  focusTargetId?: string | null;
  countryConfig?: CountryConfig | null;
  /** "dashboard" (default) renders the full standalone chrome. "embed"
   *  suppresses the internal heading + chat and starts with the side panel
   *  collapsed (wheel full-width), with an "At a glance" toggle to reveal it.
   *  "workbench" is the briefing finale: it keeps all embed chrome but the rail
   *  stays open with a persistent, prominent chat header above the detail. */
  variant?: "dashboard" | "embed" | "workbench";
}

export function PolicyCoherenceExplorer({
  targets,
  alignment,
  sectors,
  globeCategories,
  globeSubcategories,
  ggaCategories = [],
  classifications,
  nr7Data,
  btrData,
  berData,
  focusTargetId,
  countryConfig,
  variant = "dashboard",
}: PolicyCoherenceExplorerProps) {
  const t = useTranslations("explorer");
  // Embed mode re-hosts the explorer inside the briefing: the host supplies its
  // own heading + chat, and the side panel starts collapsed so the wheel gets
  // the full width (toggleable via "At a glance"). Default "dashboard" keeps the
  // original standalone behaviour byte-for-byte.
  const isWorkbench = variant === "workbench";
  // Workbench inherits all of embed's lighter chrome (pill controls, no card,
  // bolder arcs); it differs only in the always-open, chat-led rail.
  const isEmbed = variant === "embed" || isWorkbench;
  const showHeading = !isEmbed;
  // The internal EmptyPanel chat stays off in embed/workbench: the host (or the
  // persistent workbench rail header) owns the chat surface instead.
  const showInternalChat = !isEmbed;
  const [showAtAGlance, setShowAtAGlance] = useState(!isEmbed);
  const locale = useLocale();

  // Embed mode adopts the briefing's lighter chrome: pill-shaped controls and a
  // softer card, so the re-hosted explorer reads as part of the new design.
  const controlCls = isEmbed
    ? "rounded-full border border-line-strong bg-white px-3.5 py-1.5 text-data text-[var(--undp-black)] hover:border-[var(--undp-black)] focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/20 transition-colors"
    : "border border-line rounded-md px-2.5 py-1.5 text-data text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30";
  // Embed sits directly on the briefing's cream page — no white card, so the
  // wheel reads as part of the new design rather than a pasted-in panel.
  const wheelCardCls = isEmbed
    ? "h-full relative"
    : "bg-white border border-line-soft rounded-lg p-4 h-full relative";
  // Embed thickens the rim arcs outward for the bolder, banded look of the new
  // design. Node and leader-label radii are unchanged, so the layout stays put.
  const arcOuterR = isEmbed ? 230 : OUTER_R;

  const [groupMode, setGroupMode] = useState<GroupMode>("document");
  const [filter, setFilter] = useState<AlignFilter>("high_contra");
  const [actionTypeFilter, setActionTypeFilter] = useState<ActionTypeFilter>("all");
  /**
   * Budget overlay state: orthogonal to groupMode. When ON, GLOBE-grouped
   * arcs are shaded by their share of total tagged BER spend; the toggle
   * shortcut also snaps groupMode to "globe" so the visual lands somewhere
   * the data maps. Lens changes while ON are honoured — the shading simply
   * stops applying on non-GLOBE lenses (no per-document budget mapping
   * exists in v1) but the state survives so a return to GLOBE re-paints.
   */
  const [budgetOverlay, setBudgetOverlay] = useState(false);
  /**
   * Arc-scaling mode within the Finance view. "targets" (default) sizes each
   * GLOBE wedge by its policy-target count and shades it by spend share — the
   * original behaviour. "spend" re-sizes wedges by their share of tagged spend
   * so the wheel reads as "where does the money go"; individual targets are
   * then revealed on click rather than tiled along the rim. Only meaningful on
   * the GLOBE lens with budget data, and reset to "targets" when the user
   * leaves that context so the toggle never lingers where spend is undefined.
   */
  const [budgetScale, setBudgetScale] = useState<"targets" | "spend">("targets");
  // Animated morph between the two scalings: 0 = targets, 1 = spend. Driven by
  // a rAF tween (see effect below) so toggling visibly animates the wedge
  // widths; snaps instantly under prefers-reduced-motion.
  const [morph, setMorph] = useState(0);
  const morphRef = useRef(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [comparedPair, setComparedPair] = useState<{
    result: AlignmentResult;
    other: Target;
  } | null>(null);
  // Default-hidden document types come from the country config so each
  // country controls which documents add visual noise to its first view.
  // Users can still toggle these back on.
  const [hiddenDocs, setHiddenDocs] = useState<Set<string>>(
    () => new Set(countryConfig?.defaultHiddenDocTypes ?? []),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  // Workbench layout. Default (true) is the big-picture wheel: the wheel fills
  // the page width with the chat as a bar on top, and the side rail only
  // appears when a target or category is selected (its stats). Toggling this
  // off brings the chat + insights + at-a-glance panel in beside the wheel.

  // Answers overlay. Collapsed by default so the wheel reads as the clean hero;
  // opens when a question is answered, a target / category is selected, or the
  // user surfaces an insight, so output is never hidden behind the ask dock.
  const [answersCollapsed, setAnswersCollapsed] = useState(true);

  // "Share this view" transient confirmation ("Link copied ✓"). Timer is held
  // in a ref so a rapid re-click resets the countdown cleanly.
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  // Focal group: a category arc the user has clicked to drill into. Independent
  // of the target selection — when both are set, target focus dominates the
  // wheel and the panel shows target detail; closing the target falls back to
  // the category panel because the group remains focal.
  const [focalGroupId, setFocalGroupId] = useState<string | null>(null);
  // Transient group hover-preview from the lens legend (see effectiveFocalGroupId).
  const [previewGroupId, setPreviewGroupId] = useState<string | null>(null);
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
      setAnswersCollapsed(false);
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
   * (e.g. Panama's NP/ENR/HR/PEG/PENCYT/PIOTA/PNRF/PNSH/CNR) still gets a populated filter row.
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
  // Whether any target carries a primary GGA (climate-resilience) classification.
  // Gates the fourth "Resilience" group-by option so it only shows with content.
  const hasGga = useMemo(
    () =>
      classifications.some(
        (c) => c.taxonomyType === "gga" && c.isPrimary === true,
      ),
    [classifications],
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

  /**
   * Per-primary-GLOBE budget summary, scoped to currently-visible targets.
   * Null when the country has no BER data, no GLOBE subcategory taxonomy, or
   * no positive expenditure — the toggle and chat block both key off this
   * single signal. Recomputes on doc-visibility changes so target counts and
   * pair counts reflect the current scope (budget totals themselves don't
   * depend on visible targets, but co-locating the rollup keeps one source
   * of truth per render).
   */
  const budgetSummary = useMemo<CategoryBudgetSummary | null>(
    () =>
      computeBudgetByGlobeCategory({
        berData: berData ?? null,
        globeCategories,
        globeSubcategories: globeSubcategories ?? [],
        classifications,
        targets: visibleTargets,
        alignment: visibleAlignment,
      }),
    [
      berData,
      globeCategories,
      globeSubcategories,
      classifications,
      visibleTargets,
      visibleAlignment,
    ],
  );

  /** O(1) lookup table for the arc-shading and detail-panel paths. */
  const budgetByCategoryId = useMemo(() => {
    const m = new Map<string, CategoryBudgetEntry>();
    if (!budgetSummary) return m;
    for (const e of budgetSummary.entries) m.set(e.categoryId, e);
    return m;
  }, [budgetSummary]);

  /**
   * For each primary GLOBE category, the BER programmes contributing positive
   * spend (sorted desc). The category detail panel uses this to render the
   * "Contributing programmes" disclosure so a user clicking the Pollution
   * wedge can immediately see which programmes drive that 58% share — without
   * navigating away to the Financing Coherence beta tab. Independent of
   * `budgetSummary` since this is a structural map and never depends on
   * visible-target scoping (programmes live in BER, not policy targets).
   */
  const programmesByCategoryId = useMemo(
    () =>
      computeProgrammesByCategory({
        berData: berData ?? null,
        globeSubcategories: globeSubcategories ?? [],
        classifications,
        locale,
      }),
    [berData, globeSubcategories, classifications, locale],
  );

  /** True iff the shading should actually paint right now: data present,
   *  toggle on, and the user is on the GLOBE lens. Used by the arc renderer
   *  and by the toggle's visual "active" state. */
  const budgetShadingActive =
    budgetOverlay && groupMode === "globe" && !!budgetSummary;

  /** True iff arcs should be sized by spend right now (Finance + GLOBE + the
   *  Spend scaling). Drives the layout morph and the hide-dots-until-click
   *  behaviour. */
  const spendScaleActive = budgetShadingActive && budgetScale === "spend";

  const activeId = selectedId ?? hoveredId;

  // Legend hover-preview: transiently traces one group's threads on the wheel
  // without opening a panel. A clicked focal group (focalGroupId) always wins;
  // an active target suppresses preview entirely. This id drives ONLY the
  // wheel's dim/focus visuals + centre label, never railVisible, so hovering
  // the legend never opens the detail rail.
  const effectiveFocalGroupId =
    focalGroupId ?? (activeId ? null : previewGroupId);

  const groups = useMemo(
    () => buildGroups(visibleTargets, groupMode, sectors, globeCategories, ggaCategories, classifications, countryConfig),
    [visibleTargets, groupMode, sectors, globeCategories, ggaCategories, classifications, countryConfig],
  );

  const filtered = useMemo(() => filterAlign(visibleAlignment, filter), [visibleAlignment, filter]);

  // Target-count layout (the default scaling) and, when on the GLOBE lens with
  // budget data, a spend-weighted layout. The rendered layout interpolates
  // between them by `morph` so switching scalings animates the wedge widths.
  const layoutByTargets = useMemo(
    () => computeLayout(groups, filtered),
    [groups, filtered],
  );
  // Per-category spend weights for the Spend scaling, derived from the same map
  // that drives the arc shading so a wedge's width and its shade can never
  // disagree about how much spend the category carries.
  const budgetWeightMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, e] of budgetByCategoryId) m.set(id, e.totalBudget);
    return m;
  }, [budgetByCategoryId]);
  const layoutBySpend = useMemo<WheelLayout | null>(() => {
    if (groupMode !== "globe" || !budgetSummary) return null;
    return computeLayout(groups, filtered, {
      weightById: budgetWeightMap,
      minSpanFrac: 0.012,
    });
  }, [groupMode, budgetSummary, groups, filtered, budgetWeightMap]);

  const { nodes, arcs } = useMemo(
    () =>
      layoutBySpend && morph > 0
        ? lerpLayout(layoutByTargets, layoutBySpend, morph)
        : layoutByTargets,
    [layoutByTargets, layoutBySpend, morph],
  );

  // rAF tween of `morph` toward the active scaling. Cancels any in-flight tween
  // on change/unmount; snaps under prefers-reduced-motion.
  useEffect(() => {
    const target = spendScaleActive ? 1 : 0;
    if (morphRef.current === target) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      morphRef.current = target;
      setMorph(target);
      return;
    }
    const from = morphRef.current;
    const dur = 550;
    let raf = 0;
    let startTs = 0;
    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const p = Math.min(1, (ts - startTs) / dur);
      // easeInOutQuad
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const v = from + (target - from) * eased;
      morphRef.current = v;
      setMorph(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spendScaleActive]);

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

  // Chat state. Carries the reply plus follow-up suggestion chips, and the
  // pending action set the user hasn't applied yet.
  const [chat, setChat] = useState<ChatStatus>({
    loading: false,
    reply: null,
    error: null,
    suggestions: [],
    pendingActions: null,
    replyEntities: [],
  });

  // Rolling buffer of the last 3 user+assistant turns, sent on each ask so
  // the model can resolve "what about its alignments?" against the previous
  // selection. Reset when the user navigates away (clearChat).
  const [history, setHistory] = useState<ChatHistoryTurn[]>([]);

  // Insight rotation index. Increments when the user clicks "Another
  // insight" or the Surprise-me chip — the displayed insight is just
  // `insights[insightIdx % insights.length]`. Plain integer is enough: with
  // ~10 detectors the user has to rotate that many times before seeing a
  // repeat, which is fine. Session-scoped, resets on page reload.
  const [insightIdx, setInsightIdx] = useState(0);

  // Clear the chat reply when the user manually navigates away from it (clicks
  // a target / arc / empty area, closes a panel). Also resets history so the
  // next ask starts a fresh thread — referring expressions from before the
  // click would be confusing.
  const clearChat = useCallback(() => {
    setChat((prev) =>
      prev.reply !== null ||
      prev.error !== null ||
      prev.pendingActions !== null
        ? {
            loading: false,
            reply: null,
            error: null,
            suggestions: [],
            pendingActions: null,
            replyEntities: [],
          }
        : prev,
    );
    setHistory((prev) => (prev.length > 0 ? [] : prev));
  }, []);

  // Returns the panel to the country's load-time defaults: clears any
  // selection / focus / comparison, restores the default filter and
  // hidden-doc set, and wipes the chat. Used when the user closes a detail
  // panel or clicks the empty background, so "returning to the chat" feels
  // like a fresh start rather than continuing whatever filtered state the
  // last insight or query had layered on.
  const resetView = useCallback(() => {
    setFilter("high_contra");
    setSelectedId(null);
    setComparedPair(null);
    setFocalGroupId(null);
    setHiddenDocs(new Set(countryConfig?.defaultHiddenDocTypes ?? []));
    clearChat();
    setAnswersCollapsed(true);
  }, [countryConfig, clearChat]);

  // "Share this view" — copies the current URL and flips the button to a
  // confirmation for ~1.8s. A rapid re-click restarts the timer cleanly.
  const share = useCallback(() => {
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    try {
      void navigator.clipboard?.writeText(window.location.href);
    } catch {
      /* clipboard may be unavailable (insecure context); copy is best-effort */
    }
    setCopied(true);
    copyTimer.current = window.setTimeout(() => setCopied(false), 1800);
  }, []);
  useEffect(
    () => () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  // Legend hover-preview setter. Suppressed while an answer or a detail panel
  // is open so the answer's own wheel focus is not fought by an idle hover.
  const handlePreviewGroup = useCallback(
    (id: string | null) => {
      if (id && (selectedId || focalGroupId || chat.loading || chat.reply)) return;
      setPreviewGroupId(id);
    },
    [selectedId, focalGroupId, chat.loading, chat.reply],
  );

  const handleNodeClick = useCallback((id: string) => {
    setComparedPair(null);
    setPreviewGroupId(null);
    setSelectedId((prev) => (prev === id ? null : id));
    setAnswersCollapsed(false);
    // Chat is NOT cleared on selection: in the workbench the chat is a
    // persistent rail header, so its reply must survive node clicks. (In the
    // standalone "dashboard" variant the chat lives in the idle EmptyPanel,
    // which is replaced by DetailPanel on selection anyway, so this is a no-op
    // there.)
  }, []);

  // Inline target id clicks inside the chat reply bubble. Lighter than
  // handleNodeClick: keeps the chat reply and pending-actions visible so the
  // user can still hit Show me for the model's full intent, while jumping
  // directly to the named target. Reveals the doc if hidden so the wheel
  // can render the selection.
  const handleChatEntityClick = useCallback(
    (targetId: string) => {
      const target = targets.find((t) => t.id === targetId);
      if (!target) return;
      if (hiddenDocs.has(target.sourceDocument)) {
        setHiddenDocs((prev) => {
          const next = new Set(prev);
          next.delete(target.sourceDocument);
          return next;
        });
      }
      setComparedPair(null);
      setSelectedId(targetId);
      setAnswersCollapsed(false);
    },
    [targets, hiddenDocs],
  );

  const handleBgClick = useCallback(() => {
    resetView();
  }, [resetView]);

  const handleGroupChange = useCallback(
    (m: GroupMode) => {
      setGroupMode(m);
      setSelectedId(null);
      setComparedPair(null);
      setFocalGroupId(null);
      // Spend scaling only maps onto the GLOBE lens; drop it elsewhere so the
      // wheel reverts to target-count widths.
      if (m !== "globe") setBudgetScale("targets");
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
      setAnswersCollapsed(false);
    },
    [clearChat],
  );

  const closeDetail = useCallback(() => {
    resetView();
  }, [resetView]);

  const closeCategory = useCallback(() => {
    resetView();
  }, [resetView]);

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
    if (!effectiveFocalGroupId) return null;
    const ids = new Set<string>();
    for (const n of nodes) if (n.groupId === effectiveFocalGroupId) ids.add(n.id);
    return ids;
  }, [nodes, effectiveFocalGroupId]);

  const handleAsk = useCallback(
    async (query: string) => {
      setPreviewGroupId(null);
      setAnswersCollapsed(false);
      setChat({
        loading: true,
        reply: null,
        error: null,
        suggestions: [],
        pendingActions: null,
        replyEntities: [],
      });
      // Chat always sees the full corpus. Scoping the chat to the visible
      // view forced users to set the view correctly BEFORE asking, which
      // defeats the point of a navigation helper. The chat is now a Q&A over
      // the entire dataset; show_docs reveals hidden docs when needed and
      // the reply narrates the unhide.
      //
      // Actions are NOT applied to the wheel here. They are stored as
      // pendingActions and applied when the user clicks Show me. This keeps
      // the answer text the primary output and prevents the wheel from
      // reshaping behind the user's reading.
      try {
        const body = buildChatRequest({
          query,
          groupMode,
          filter,
          targets,
          alignment,
          classifications,
          sectors,
          globeCategories,
          ggaCategories,
          budgetSummary,
          btrData,
          availableDocs,
          hiddenDocs,
          countryConfig,
          history,
        });

        // Removable usage analytics: see src/lib/analytics/README.md.
        track("chat_message_sent");
        const res = await fetch("/api/coherence-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          // The route returns { error: "..." } as JSON. Extract just the
          // message so the user sees a sentence, not the raw payload.
          // Fall back to the status code if the body isn't parseable.
          let message: string;
          try {
            const errBody = (await res.json()) as { error?: string };
            message =
              typeof errBody.error === "string" && errBody.error.length > 0
                ? errBody.error
                : t("chat.requestFailed", { status: res.status });
          } catch {
            message = t("chat.requestFailed", { status: res.status });
          }
          throw new Error(message);
        }
        const json = (await res.json()) as {
          reply: string;
          actions: ChatServerAction[];
          suggestions?: ChatSuggestion[];
          replyEntities?: ReplyEntity[];
        };

        const suggestions = (json.suggestions ?? []).slice(0, 3);
        const actions = Array.isArray(json.actions) ? json.actions : [];
        const replyEntities = Array.isArray(json.replyEntities)
          ? json.replyEntities.filter(
              (e): e is ReplyEntity =>
                !!e &&
                e.type === "target" &&
                typeof e.id === "string" &&
                typeof e.start === "number" &&
                typeof e.end === "number" &&
                e.end > e.start,
            )
          : [];
        setChat({
          loading: false,
          reply: json.reply,
          error: null,
          suggestions,
          pendingActions: actions.length > 0 ? actions : null,
          replyEntities,
        });
        // Append this turn to history, capped at 3 turns (~6 messages).
        setHistory((prev) =>
          [
            ...prev,
            { role: "user" as const, content: query },
            { role: "assistant" as const, content: json.reply },
          ].slice(-6),
        );
        // A fresh answer landed: open the answers overlay so the reply is
        // visible (the chat input lives in the dock).
        setAnswersCollapsed(false);
      } catch (err) {
        setChat({
          loading: false,
          reply: null,
          error:
            err instanceof Error ? err.message : t("chat.genericError"),
          suggestions: [],
          pendingActions: null,
          replyEntities: [],
        });
        setAnswersCollapsed(false);
      }
    },
    [
      alignment,
      availableDocs,
      btrData,
      classifications,
      countryConfig,
      globeCategories,
      ggaCategories,
      hiddenDocs,
      groupMode,
      filter,
      history,
      sectors,
      targets,
      budgetSummary,
      t,
    ],
  );

  // ─── Example chips + Surprise-me + first-load hook ─────────────────

  // Data-aware example chips: regenerate when the visible dataset shape
  // shifts (eg the user toggles a doc on/off). Each candidate in the pool
  // has a precondition; chips that can't be answered honestly are dropped.
  const visibleDocsForExamples = useMemo(
    () => availableDocs.filter((d) => !hiddenDocs.has(d)),
    [availableDocs, hiddenDocs],
  );
  // Coherence / Finance view, derived from the budget overlay (no second
  // source of truth). Selecting Finance also snaps the grouping to GLOBE so the
  // spend shading lands somewhere the data maps — the same rule the legacy
  // toggle used. Only offered when the country has tagged budget data.
  const view: "coherence" | "finance" = budgetOverlay ? "finance" : "coherence";
  const setView = useCallback(
    (next: "coherence" | "finance") => {
      const finance = next === "finance";
      setBudgetOverlay(finance);
      if (finance && groupMode !== "globe") setGroupMode("globe");
      // Leaving Finance returns the wheel to the target-count scaling.
      if (!finance) setBudgetScale("targets");
    },
    [groupMode],
  );
  // Example chips, split into coherence and finance pools. Keys come from
  // pickExampleQueries (gated by the dataset); the labels live in the explorer
  // i18n catalogue. The workbench dock shows up to three for the active view;
  // the standalone EmptyPanel shows up to four across both pools.
  const exampleKeys = useMemo(
    () =>
      pickExampleQueries({
        globeCategoriesAvailable: globeCategories.length > 0,
        sectorsAvailable: sectors.length > 0,
        hasAdaptation:
          visibleDocsForExamples.includes("NAP") ||
          (btrData?.adaptationGoals?.length ?? 0) > 0,
        hasTensions: visibleAlignment.some((a) => isContradiction(a.alignment)),
        hasBtr: targets.some((t) => t.sourceDocument === "BTR"),
        hasBudget: !!budgetSummary,
      }),
    [
      visibleDocsForExamples,
      globeCategories,
      sectors,
      visibleAlignment,
      btrData,
      targets,
      budgetSummary,
    ],
  );
  const exampleQueries = useMemo(
    () =>
      [
        ...exampleKeys.coherence.map((k) => t(`questions.coherence.${k}`)),
        ...exampleKeys.finance.map((k) => t(`questions.finance.${k}`)),
      ].slice(0, 4),
    [exampleKeys, t],
  );
  // Full pool for the active view; Surprise me draws from all of it, the dock
  // shows the first three as chips.
  const surprisePool = useMemo(
    () =>
      view === "finance"
        ? exampleKeys.finance.map((k) => t(`questions.finance.${k}`))
        : exampleKeys.coherence.map((k) => t(`questions.coherence.${k}`)),
    [exampleKeys, view, t],
  );
  const dockQuestions = surprisePool.slice(0, 3);

  // Compute all available insights once per data shift. The list is ordered
  // by interestingness; `insightIdx` rotates through it.
  const insights = useMemo(
    () =>
      detectInsights({
        targets,
        alignment,
        classifications,
        sectors,
        globeCategories,
        btrData,
        availableDocs,
        countryConfig,
      }),
    [
      targets,
      alignment,
      classifications,
      sectors,
      globeCategories,
      btrData,
      availableDocs,
      countryConfig,
    ],
  );

  // Currently-displayed insight: the rotation pointer modulo list length,
  // hidden while a reply / loading / error owns the bubble slot.
  const currentInsight = useMemo<Insight | null>(() => {
    if (chat.reply || chat.loading || chat.error) return null;
    if (insights.length === 0) return null;
    return insights[insightIdx % insights.length];
  }, [insights, insightIdx, chat.reply, chat.loading, chat.error]);

  // Rotate to the next insight — text only. Doesn't touch the wheel state;
  // the user can compare the new fact against whatever they're currently
  // looking at. Clears any active reply / pending actions so the new
  // insight is visible without a stale Show me from a prior reply.
  const rotateInsight = useCallback(() => {
    if (insights.length === 0) return;
    setInsightIdx((i) => i + 1);
    setChat((prev) =>
      prev.reply !== null ||
      prev.error !== null ||
      prev.suggestions.length > 0 ||
      prev.pendingActions !== null
        ? {
            loading: false,
            reply: null,
            error: null,
            suggestions: [],
            pendingActions: null,
            replyEntities: [],
          }
        : prev,
    );
    setHistory([]);
    setAnswersCollapsed(false);
  }, [insights.length]);

  // Apply an insight's action set to the wheel. Surfaces the callout as the
  // chat reply so the user keeps the fact in view alongside the new wheel
  // state. Unhides any doc the insight references (BTR pairs in particular).
  const applyInsight = useCallback(
    (insight: Insight) => {
      const targetMapLocal = new Map(targets.map((t) => [t.id, t]));
      setFilter((insight.filter as AlignFilter | undefined) ?? "high_contra");
      let nextSelectedId: string | null = null;
      let nextFocalGroupId: string | null = null;
      let nextComparedPair: {
        result: AlignmentResult;
        other: Target;
      } | null = null;
      const docsToShow = new Set<string>();
      let effectiveGroupMode: GroupMode = groupMode;
      for (const action of insight.actions) {
        if (action.type === "show_docs") {
          for (const id of action.ids) docsToShow.add(id);
        } else if (action.type === "set_mode") {
          setGroupMode(action.mode);
          effectiveGroupMode = action.mode;
        } else if (action.type === "focus_category") {
          nextFocalGroupId = action.categoryId;
          docsToShow.add(action.categoryId);
        } else if (action.type === "select_target") {
          nextSelectedId = action.targetId;
          const node = nodes.find((n) => n.id === action.targetId);
          if (node) nextFocalGroupId = node.groupId;
          const t = targetMapLocal.get(action.targetId);
          if (t) docsToShow.add(t.sourceDocument);
        } else if (action.type === "select_pair") {
          const tA = targetMapLocal.get(action.targetAId);
          const tB = targetMapLocal.get(action.targetBId);
          if (tA) docsToShow.add(tA.sourceDocument);
          if (tB) docsToShow.add(tB.sourceDocument);
          const result = alignment.find(
            (a) =>
              (a.targetAId === action.targetAId &&
                a.targetBId === action.targetBId) ||
              (a.targetAId === action.targetBId &&
                a.targetBId === action.targetAId),
          );
          nextSelectedId = action.targetAId;
          const node = nodes.find((n) => n.id === action.targetAId);
          if (node) nextFocalGroupId = node.groupId;
          if (result && tB) {
            nextComparedPair = { result, other: tB };
          }
        }
      }
      // When focus lands on a sector/globe category via focus_category, the
      // categoryId is a taxonomy id, not a doc id, so the docsToShow.add
      // above is a no-op against hiddenDocs. Walk the primary
      // classifications for that category to surface its targets' source
      // docs, and reset the BTR mit/adp pill if those targets are BTR-bound
      // — otherwise a 2-target BTR category like "Waste" renders as an
      // empty arc on Show me. Gated on focus_category specifically so
      // select_target / select_pair on a target that happens to sit in a
      // sector/globe arc doesn't sweep in every other doc's targets.
      const hasFocusCategoryAction = insight.actions.some(
        (a) => a.type === "focus_category",
      );
      if (
        hasFocusCategoryAction &&
        nextFocalGroupId &&
        (effectiveGroupMode === "sector" ||
          effectiveGroupMode === "globe" ||
          effectiveGroupMode === "gga")
      ) {
        revealDocsForFocalTaxonomyCategory({
          focalCategoryId: nextFocalGroupId,
          taxonomyType: effectiveGroupMode,
          classifications,
          targetMap: targetMapLocal,
          docsToShow,
          actionTypeFilter,
          setActionTypeFilter,
        });
      }
      if (docsToShow.size > 0) {
        setHiddenDocs((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const d of docsToShow) {
            if (next.has(d)) {
              next.delete(d);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      setSelectedId(nextSelectedId);
      setFocalGroupId(nextFocalGroupId);
      setComparedPair(nextComparedPair);
      // Don't surface the callout as a chat reply: the user just read it
      // in the amber insight bubble, and the resulting detail or category
      // panel IS the answer. Typing the same text again in the reply slot
      // would feel like the chat is restating what the user just clicked.
      setChat((prev) =>
        prev.pendingActions !== null
          ? { ...prev, pendingActions: null }
          : prev,
      );
      setHistory([]);
    },
    [nodes, alignment, targets, groupMode, classifications, actionTypeFilter],
  );

  // Apply server-emitted navigation actions held in chat.pendingActions.
  // Same control-flow as the old in-line block inside handleAsk; lifted
  // here so the user can opt in to view changes via Show me rather than
  // having the wheel reshape automatically after every reply.
  const applyServerActions = useCallback(
    (actions: ChatServerAction[]) => {
      const targetMapLocal = new Map(targets.map((t) => [t.id, t]));
      // Reset filter to default so each Show me application starts clean,
      // matching the previous auto-apply behaviour.
      setFilter("high_contra");
      const docsToShow = new Set<string>();
      for (const action of actions) {
        if (action.type === "show_docs") {
          for (const id of action.ids) docsToShow.add(id);
        }
      }
      let nextSelectedId: string | null = null;
      let nextFocalGroupId: string | null = null;
      let nextComparedPair: {
        result: AlignmentResult;
        other: Target;
      } | null = null;
      let effectiveGroupMode: GroupMode = groupMode;
      for (const action of actions) {
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
          const result = alignment.find(
            (a) =>
              (a.targetAId === action.targetAId &&
                a.targetBId === action.targetBId) ||
              (a.targetAId === action.targetBId &&
                a.targetBId === action.targetAId),
          );
          const otherTarget = targetMapLocal.get(action.targetBId);
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
          effectiveGroupMode = action.mode;
          nextSelectedId = null;
          nextFocalGroupId = null;
          nextComparedPair = null;
        }
      }
      // Belt-and-braces auto-unhide: the server usually emits show_docs but
      // if it forgets we still don't want to navigate to an invisible doc.
      for (const action of actions) {
        if (action.type === "focus_category" && effectiveGroupMode === "document") {
          docsToShow.add(action.categoryId);
        } else if (action.type === "select_target") {
          const t = targetMapLocal.get(action.targetId);
          if (t) docsToShow.add(t.sourceDocument);
        } else if (action.type === "select_pair") {
          const tA = targetMapLocal.get(action.targetAId);
          const tB = targetMapLocal.get(action.targetBId);
          if (tA) docsToShow.add(tA.sourceDocument);
          if (tB) docsToShow.add(tB.sourceDocument);
        }
      }
      // Same gap as applyInsight: focus_category in sector/globe mode means
      // categoryId is a taxonomy id, not a doc id. Surface the source docs
      // of the matching primary-classified targets so the focal arc renders
      // with actual nodes, and reset BTR mit/adp pill when needed. Gated on
      // focus_category so select_target / select_pair landing in a sector
      // arc doesn't sweep in every other doc.
      const hasFocusCategoryAction = actions.some(
        (a) => a.type === "focus_category",
      );
      if (
        hasFocusCategoryAction &&
        nextFocalGroupId &&
        (effectiveGroupMode === "sector" ||
          effectiveGroupMode === "globe" ||
          effectiveGroupMode === "gga")
      ) {
        revealDocsForFocalTaxonomyCategory({
          focalCategoryId: nextFocalGroupId,
          taxonomyType: effectiveGroupMode,
          classifications,
          targetMap: targetMapLocal,
          docsToShow,
          actionTypeFilter,
          setActionTypeFilter,
        });
      }
      if (docsToShow.size > 0) {
        setHiddenDocs((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const d of docsToShow) {
            if (next.has(d)) {
              next.delete(d);
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      }
      setSelectedId(nextSelectedId);
      setFocalGroupId(nextFocalGroupId);
      setComparedPair(nextComparedPair);
      // Clear the pending actions so Show me hides; the reply text remains
      // visible alongside the new wheel state.
      setChat((prev) => ({ ...prev, pendingActions: null }));
    },
    [nodes, alignment, targets, groupMode, classifications, actionTypeFilter],
  );

  // Show me dispatcher: applies the active insight if one is showing,
  // otherwise applies the pending actions from the last chat reply. The
  // bubble itself decides which path is live; this just routes the click.
  const onApplyHook = useCallback(() => {
    if (currentInsight) {
      applyInsight(currentInsight);
      return;
    }
    if (chat.pendingActions && chat.pendingActions.length > 0) {
      applyServerActions(chat.pendingActions);
    }
  }, [currentInsight, applyInsight, chat.pendingActions, applyServerActions]);

  const canShowMe =
    !!currentInsight ||
    !!(chat.pendingActions && chat.pendingActions.length > 0);

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;

  const focalGroup = useMemo(
    () =>
      focalGroupId ? arcs.find((a) => a.id === focalGroupId) ?? null : null,
    [arcs, focalGroupId],
  );

  // Focal group for wheel VISUALS (click focus or legend hover-preview). Unlike
  // `focalGroup`, this reflects hover and so must never drive railVisible.
  const effectiveFocalGroup = useMemo(
    () =>
      effectiveFocalGroupId
        ? arcs.find((a) => a.id === effectiveFocalGroupId) ?? null
        : null,
    [arcs, effectiveFocalGroupId],
  );

  // Wheel scanning state: while a question is in flight the threads fade and
  // the centre reads "Reading N targets…", so the answer visibly plays out on
  // the wheel when it resolves. This is the loading state for the ask flow.
  const scanning = chat.loading;

  // Panel shows when the user opts into "At a glance", OR whenever a target /
  // category is selected — detail must stay reachable even when collapsed.
  // Workbench keeps the rail open at all times so the persistent chat header is
  // always visible; otherwise the panel opens on demand (At a glance, or a
  // selected target / category).
  // The workbench variant returns its own stage layout before this fall-through
  // layout renders, so the rail visibility only serves the standalone variants.
  const railVisible =
    showAtAGlance || selectedNode != null || focalGroup != null;

  // Group focus drives the dim treatment on the wheel only when no target is
  // active. Active target takes visual priority and reuses the existing
  // hover/click highlight path.
  const isGroupFocus = !!effectiveFocalGroupId && !activeId;

  const arcGen = useMemo(
    () =>
      d3Arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(INNER_R)
        .outerRadius(arcOuterR)
        .cornerRadius(3),
    [arcOuterR],
  );

  // Wedge generator for the Biodiversity Budget overlay. Annular sectors fill
  // the interior from outside the centre text block (r=58 — the centre stack
  // is now narrow because "157 targets" and "7998 aligned" sit on two short
  // rows instead of one wide one) to just inside the rim arc band (r=215).
  // Same angular spans as the rim arcs (driven by target counts), so the
  // wheel's spatial grouping is preserved while the wedge fill turns budget
  // share into a visual the user can actually read.
  const wedgeGen = useMemo(
    () =>
      d3Arc<{ startAngle: number; endAngle: number }>()
        .innerRadius(58)
        .outerRadius(215)
        .padAngle(0.012),
    [],
  );

  // Uniform node radius. Variable sizing by connection count added cognitive
  // load for policymakers without analytic payoff (design guardrail), so every
  // target reads at the same visual weight. A constant also keeps the
  // active/connected rings (r + 5 / r + 3) and the group indicator dot stable.
  const NODE_RADIUS = 4.5;

  // Target search for the standalone/embed variants (rendered in Row 2 of the
  // controls). The workbench variant returns its own layout before this and does
  // not surface search.
  const targetSearch = (
    <div className="relative">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setSearchOpen(true);
        }}
        onFocus={() => setSearchOpen(true)}
        placeholder={t("doc.searchPlaceholder")}
        className={`${controlCls} ${isEmbed ? "w-56 sm:w-72" : "w-44"}`}
      />
      {searchOpen && searchQuery.length >= 2 && (() => {
        const q = searchQuery.toLowerCase();
        const matches = visibleTargets
          .filter(
            (t) =>
              t.sourceLabel.toLowerCase().includes(q) ||
              t.text.toLowerCase().includes(q) ||
              getDocFullLabel(countryConfig, t.sourceDocument)
                .toLowerCase()
                .includes(q),
          )
          .slice(0, 8);
        if (matches.length === 0) return null;
        return (
          <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-line rounded-lg shadow-lg z-50 py-1 max-h-60 overflow-y-auto">
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
                  style={{
                    backgroundColor: getDocColor(countryConfig, t.sourceDocument),
                  }}
                />
                <span className="text-data text-[var(--undp-black)] truncate">
                  <span className="font-medium text-[var(--undp-gray)]">
                    {getDocLabel(countryConfig, t.sourceDocument)}
                  </span>{" "}
                  {t.sourceLabel}
                </span>
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );

  // The workbench chat, extracted so it can live either in the side rail
  // (default) or in a full-width bar on top (expanded wheel mode).
  const workbenchChat = (
    hideInsights = false,
    hideReply = false,
    surpriseFills = false,
  ) => (
    <ChatBar
      onAsk={handleAsk}
      chat={chat}
      exampleQueries={dockQuestions}
      onRotateInsight={rotateInsight}
      currentInsight={currentInsight}
      onApplyHook={onApplyHook}
      canShowMe={canShowMe}
      onSelectChatEntity={handleChatEntityClick}
      prominent
      hideInsights={hideInsights}
      hideReply={hideReply}
      surprisePool={surprisePool}
      surpriseFills={surpriseFills}
    />
  );

  // Hoisted so the legacy return and the Explorer B workbench stage render
  // the exact same wheel and detail panels without duplicating their JSX.
  const wheelSvg = (
            <svg
              viewBox={`${-VB_W / 2} ${-VB / 2} ${VB_W} ${VB}`}
              className={isWorkbench ? "h-full w-full" : "w-full"}
              preserveAspectRatio="xMidYMid meet"
              style={{
                maxHeight: isWorkbench
                  ? 820
                  : isEmbed
                    ? "min(600px, 64vh)"
                    : 620,
              }}
              onClick={handleBgClick}
            >
              {/* Guide circle */}
              <circle cx={0} cy={0} r={NODE_R} fill="none" stroke="#f1f5f9" strokeWidth={1} strokeDasharray="4 4" />

              {/* Biodiversity Budget wedges. Rendered before the rim arcs so
                  the arcs (and everything that follows: ribbons, nodes,
                  labels) layer on top. Each wedge fills the interior of one
                  GLOBE category at a saturation proportional to its share of
                  tagged BER spend. Hidden when the overlay is off so the
                  regular wheel looks unchanged. */}
              {budgetShadingActive && budgetSummary &&
                arcs.map((arc) => {
                  const d = wedgeGen({
                    startAngle: arc.startAngle,
                    endAngle: arc.endAngle,
                  });
                  if (!d) return null;
                  const entry = budgetByCategoryId.get(arc.id);
                  const share = entry?.shareOfTotalBudget ?? 0;
                  // Single hue for funded wedges (BUDGET_WEDGE_COLOR), single
                  // grey for unfunded ones. The angular span already encodes
                  // the target-count grouping (Sustainable use takes nearly
                  // half the wheel because it has 70 targets), so layering
                  // the category hue on the wedge fill made budget hard to
                  // read in isolation: a wide pale-blue wedge looked like
                  // "lots of something" even though it's only 6.5% of tagged
                  // spend. With one hue across all funded wedges, opacity is
                  // the only varying dimension, and the rim arc continues
                  // to carry category identity.
                  const isUnfunded = !entry || entry.totalBudget <= 0;
                  const wedgeColor = isUnfunded
                    ? "#94a3b8"
                    : BUDGET_WEDGE_COLOR;
                  // Gradual saturation by spend share in BOTH scalings: the
                  // most-funded category renders darkest, the rest fade down.
                  // In the Spend scaling the wedge width also encodes spend, so
                  // width and shade reinforce each other (the dominant category
                  // is both widest and darkest).
                  const fillAlpha = isUnfunded
                    ? 0.08
                    : alphaForBudgetShare(share, budgetSummary.maxShare);
                  const angularSpan = arc.endAngle - arc.startAngle;
                  // Only label wedges wider than ~14 degrees. Below that the
                  // text overlaps the wedge boundary and reads as junk; the
                  // rim label + hover tooltip still carry the info.
                  // Also hide the inside % when a target is active or a
                  // category is focal — the central callout and connection
                  // lines draw across the wedge interior in those states, so
                  // the inside label is unreadable. The category-name label
                  // outside picks up the % in that case (see the leader-label
                  // block below).
                  // Inside-wedge % is suppressed when:
                  //   - the wedge is too narrow to comfortably hold the
                  //     glyphs (angular span <= ~14 deg),
                  //   - a target or category is focal (the central callout
                  //     overlays the wedge interior — the % moves outside
                  //     into the leader label in that state),
                  //   - or the category has zero tagged BER spend (showing
                  //     "0%" is redundant once the wedge itself is greyed).
                  // Suppression threshold: the resting Targets view keeps the
                  // original ~14deg floor (below which the glyphs overlap the
                  // wedge edge); the Spend scaling relaxes it toward ~11.5deg so
                  // narrow-but-funded wedges (e.g. a 4-5% category) still show
                  // their share. Interpolated by morph so the Targets view is
                  // byte-for-byte unchanged at rest.
                  const labelMinSpan = 0.244 - 0.044 * morph;
                  const showLabel =
                    angularSpan > labelMinSpan &&
                    !activeId &&
                    !isGroupFocus &&
                    !isUnfunded;
                  const labelR = 145;
                  const sharePct = (share * 100).toFixed(
                    share >= 0.1 ? 0 : 1,
                  );
                  const amountStr = entry
                    ? formatBudgetValue(
                        entry.totalBudget,
                        budgetSummary.currency ?? "",
                      )
                    : "";
                  const labelFill =
                    fillAlpha > 0.55 ? "white" : "var(--undp-black)";
                  return (
                    <g key={`wedge-${arc.id}`}>
                      <path
                        d={d}
                        fill={wedgeColor}
                        fillOpacity={fillAlpha}
                        stroke={wedgeColor}
                        strokeOpacity={isUnfunded ? 0.2 : 0.35}
                        strokeWidth={0.75}
                        className="cursor-pointer"
                        data-track="Explore: budget wedge"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArcClick(arc.id);
                        }}
                      >
                        <title>
                          {t("budget.wedgeTooltip", { label: arc.label, amount: amountStr, pct: sharePct, hasAmount: amountStr ? 1 : 0 })}
                        </title>
                      </path>
                      {showLabel && (
                        <text
                          x={labelR * Math.sin(arc.midAngle)}
                          y={-labelR * Math.cos(arc.midAngle)}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize={14}
                          fontWeight={isEmbed ? 500 : 600}
                          fill={labelFill}
                          className="pointer-events-none select-none tabular-nums"
                          style={{ letterSpacing: "0.01em" }}
                        >
                          <tspan>{sharePct}</tspan>
                          <tspan
                            fontSize={9}
                            fontWeight={500}
                            dx="0.15em"
                            fillOpacity={0.75}
                          >
                            %
                          </tspan>
                        </text>
                      )}
                    </g>
                  );
                })}

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
                const isFocal = arc.id === effectiveFocalGroupId;
                const arcMidR = (INNER_R + arcOuterR) / 2;
                const badgeX = arcMidR * Math.sin(arc.midAngle);
                const badgeY = -arcMidR * Math.cos(arc.midAngle);
                // Rim arc opacity. In budget mode we keep overview at 1.0 so
                // the colored boundary at the rim stays crisp; the magnitude
                // encoding is carried by the wedge fill layer below, not by
                // modulating the 7-pixel rim band (v1 attempt, indiscernible).
                const arcOpacity = activeId
                  ? hasActiveNode
                    ? 0.8
                    : 0.12
                  : isGroupFocus
                    ? isFocal
                      ? 1
                      : 0.18
                    : budgetShadingActive
                      ? 1
                      : 0.65;
                const budgetEntry = budgetShadingActive
                  ? budgetByCategoryId.get(arc.id)
                  : undefined;
                // In budget mode, zero-budget categories also grey their rim
                // arc so the entire category (wedge + rim + leader + label)
                // reads as a single "no tagged spend" visual class. Outside
                // budget mode, the category hue is preserved.
                const arcIsUnfunded =
                  budgetShadingActive &&
                  (!budgetEntry || budgetEntry.totalBudget <= 0);
                const rimColor = arcIsUnfunded ? "#94a3b8" : arc.color;
                return (
                  <g key={arc.id}>
                    <path
                      d={d ?? ""}
                      fill={rimColor}
                      opacity={arcOpacity}
                      stroke={isFocal && !activeId ? rimColor : "none"}
                      strokeWidth={isFocal && !activeId ? 1.5 : 0}
                      className="transition-opacity duration-200 cursor-pointer"
                      data-track="Explore: category arc"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArcClick(arc.id);
                      }}
                    >
                      <title>
                        {budgetShadingActive && budgetEntry
                          ? t("budget.wedgeTooltip", {
                              label: arc.label,
                              amount: formatBudgetValue(budgetEntry.totalBudget, budgetSummary?.currency ?? ""),
                              pct: (budgetEntry.shareOfTotalBudget * 100).toFixed(1),
                              hasAmount: 1,
                            })
                          : arc.label}
                      </title>
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

              {/* Ambient connections — faint background web. Suppressed
                  while the Biodiversity Budget overlay is shading: in budget
                  mode the question is "where is the money", and the ambient
                  ribbon noise competes with the wedge fill instead of adding
                  signal. Selected-target connections (rendered separately
                  below) still appear so click-through navigation works. */}
              {!activeId && !budgetShadingActive &&
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
                  const opacity = scanning
                    ? 0.05
                    : isGroupFocus
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

              {/* Target nodes. Wrapped in a group with reduced opacity while
                  the budget overlay is shading so the colourful node ring
                  doesn't overpower the wedge fill underneath. Click and hover
                  still work because the underlying nodes keep their full
                  pointer surface. */}
              <g
                opacity={
                  budgetShadingActive && !activeId && !isGroupFocus
                    ? 0.2 * (1 - morph)
                    : 1
                }
                style={
                  // Gate interactivity on the same `morph` signal that drives
                  // the fade (not the stepped spendScaleActive) so visibility
                  // and clickability stay in sync across the tween — otherwise
                  // toggling back to Targets restores clicks ~550ms before the
                  // dots reappear, letting users hit invisible nodes.
                  budgetShadingActive && !activeId && !isGroupFocus && morph > 0.5
                    ? { pointerEvents: "none" }
                    : undefined
                }
              >
              {nodes.map((node) => {
                const r = NODE_RADIUS;
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
                      strokeWidth={isEmbed ? 1 : 1.5}
                      opacity={isDimmed ? 0.12 : isEmbed ? 0.8 : 1}
                      className="transition-opacity duration-200 cursor-pointer"
                      data-track="Explore: target dot"
                      onMouseEnter={() => {
                        if (!selectedId) setHoveredId(node.id);
                      }}
                      onMouseLeave={() => setHoveredId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNodeClick(node.id);
                      }}
                    >
                      <title>{t("wheel.nodeTooltip", { label: getDocMediumLabel(countryConfig, node.target.sourceDocument), source: node.target.sourceLabel })}</title>
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
              </g>

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
                // Greedily filter: skip labels that would collide with an
                // already-placed one. The required angular gap grows toward the
                // top and bottom of the wheel, where labels run horizontally and
                // a small angular step still overlaps a long neighbour; near the
                // sides a small gap suffices because neighbours separate
                // vertically. A highly-connected target therefore shows only a
                // readable, spread-out subset on the wheel; the full list lives
                // in the detail panel.
                const gapFor = (angle: number) =>
                  0.14 / Math.max(0.22, Math.abs(Math.sin(angle)));
                const placed: number[] = [];
                const visible: typeof sorted = [];
                for (const entry of sorted) {
                  const gap = gapFor(entry.node.angle);
                  const tooClose = placed.some(
                    (a) => Math.abs(entry.node.angle - a) < gap,
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
                const N = sorted.length;
                for (let iter = 0; iter < 60; iter++) {
                  for (const e of sorted) {
                    e.angle += HOME_PULL * (e.arc.midAngle - e.angle);
                  }
                  // Circular de-collision: pair i with (i+1) AND the last with
                  // the first across the 12 o'clock seam (gap measured with a
                  // +2π offset). Without the wrap pair the two labels straddling
                  // the top never de-collide — which is exactly where the Spend
                  // scaling parks the shrunken lead category next to the
                  // unfunded slivers, causing the overlap.
                  for (let i = 0; i < N; i++) {
                    const a = sorted[i];
                    const b = sorted[(i + 1) % N];
                    const wrap = i + 1 === N;
                    const needed = (a.angularSpan + b.angularSpan) / 2 + PADDING;
                    const gap = b.angle + (wrap ? 2 * Math.PI : 0) - a.angle;
                    if (gap < needed) {
                      const half = (needed - gap) / 2;
                      a.angle -= half;
                      b.angle += half;
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
                  const isFocal = arc.id === effectiveFocalGroupId;
                  const labelDimmed =
                    !!activeId || (isGroupFocus && !isFocal);
                  const leaderOpacity = activeId
                    ? 0.2
                    : isGroupFocus
                      ? isFocal
                        ? 0.6
                        : 0.12
                      : 0.35;
                  // labelFill: dim grey when another target/category has
                  // focus; full category colour otherwise. In budget mode,
                  // zero-budget categories also drop to grey so the rim arc
                  // greying carries through to the leader line and label
                  // and the whole category reads as a single "unfunded"
                  // visual class.
                  const arcIsUnfundedHere =
                    budgetShadingActive &&
                    (!budgetByCategoryId.get(arc.id) ||
                      (budgetByCategoryId.get(arc.id)?.totalBudget ?? 0) <= 0);
                  const labelFill = labelDimmed || arcIsUnfundedHere ? "#94a3b8" : arc.color;
                  const leaderColor = arcIsUnfundedHere ? "#94a3b8" : arc.color;
                  // In budget mode, surface the absolute amount as a second
                  // sub-line under the category name. The wedge interior
                  // carries the % in idle state; when a target is active or
                  // a category is focal the inside % is hidden because the
                  // central callout overlays the wedge interior, so we fold
                  // the % into this outside label too ("58% · 520B MNT").
                  const budgetEntry = budgetShadingActive
                    ? budgetByCategoryId.get(arc.id)
                    : undefined;
                  const insideLabelHidden = !!activeId || isGroupFocus;
                  // amountLine renders beneath the category name when the
                  // budget overlay is active. The "Other" bucket has no
                  // entry in the budget summary because it is not a real
                  // GLOBE primary, so we fall through to a zero figure for
                  // it — semantically correct (no BER spend is tagged to
                  // unclassified targets) and visually consistent with the
                  // other zero-budget categories that already say "0 MNT".
                  const amountLine = (() => {
                    if (!budgetShadingActive) return null;
                    const totalBudget = budgetEntry?.totalBudget ?? 0;
                    const shareOfTotal = budgetEntry?.shareOfTotalBudget ?? 0;
                    const amount = formatBudgetValue(
                      totalBudget,
                      budgetSummary?.currency ?? "",
                    );
                    if (!insideLabelHidden) return amount;
                    const sharePct = (shareOfTotal * 100).toFixed(
                      shareOfTotal >= 0.1 ? 0 : 1,
                    );
                    return `${sharePct}% · ${amount}`;
                  })();
                  const totalLineCount = lines.length + (amountLine ? 1 : 0);
                  // Center the multi-line block vertically around ly. For a
                  // single line, dy=0 means baseline sits at ly (with
                  // dominantBaseline="middle"). For N lines, offset the first
                  // line up so the block straddles ly.
                  const firstDy = -((totalLineCount - 1) * 0.55);
                  return (
                    <g key={`grp-${arc.id}`}>
                      <path
                        d={`M${arcX},${arcY} L${elbowX},${elbowY} L${lx},${ly}`}
                        fill="none"
                        stroke={leaderColor}
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
                        fontWeight={isFocal && !activeId ? 700 : isEmbed ? 500 : 600}
                        fill={labelFill}
                        style={{ letterSpacing: isEmbed ? "0.015em" : "0.04em", transition: "fill 200ms, font-size 200ms" }}
                        data-track="Explore: category arc"
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
                        {amountLine && (
                          <tspan
                            x={lx + nudge}
                            dy="1.25em"
                            fontSize={10}
                            fontWeight={500}
                            fill="var(--undp-gray)"
                            style={{ letterSpacing: "0.02em" }}
                          >
                            {amountLine}
                          </tspan>
                        )}
                      </text>
                    </g>
                  );
                });
              })()}

              {/* Center content. The country / target / focal-category name
                  sits on top; the supporting counts stack below it on two
                  short rows in idle state ("157 targets" / "7998 aligned")
                  so the centre footprint stays narrow and the wedges can
                  come closer in without crowding the text. Active and focal
                  states only need a single count line, so they stay on one
                  row beneath the title. */}
              {/* Readable plate behind the title when a specific target or
                  category is selected: its name can be long and would
                  otherwise sit unreadable over the crossing ribbons. */}
              {isEmbed && (activeId || focalGroup) && (() => {
                const t = activeId
                  ? targetMap.get(activeId)?.sourceLabel ?? ""
                  : focalGroup?.label ?? "";
                const w = Math.min(360, Math.max(110, t.length * 8.6 + 30));
                return (
                  <rect
                    x={-w / 2}
                    y={-30}
                    width={w}
                    height={52}
                    rx={12}
                    fill="white"
                    opacity={0.86}
                    className="pointer-events-none"
                  />
                );
              })()}
              <text
                x={0} y={-14}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={isEmbed ? 18 : 15} fontWeight={isEmbed ? 500 : 600}
                fill={isEmbed ? "var(--undp-black)" : "#1e293b"}
                style={
                  isEmbed
                    ? { fontFamily: "var(--font-display)" }
                    : undefined
                }
                className="select-none pointer-events-none"
              >
                {scanning
                  ? t("wheel.centerScanning")
                  : activeId
                    ? targetMap.get(activeId)?.sourceLabel ?? ""
                    : effectiveFocalGroup
                      ? effectiveFocalGroup.label
                      : targets[0]?.country ?? t("wheel.countryFallback")}
              </text>
              {scanning ? (
                <text
                  x={0} y={8}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10}
                  fill={isEmbed ? "var(--undp-gray)" : "#94a3b8"}
                  className="select-none pointer-events-none"
                >
                  {t("wheel.centerScanningDetail", {
                    targets: targets.length,
                    docs: availableDocs.length,
                  })}
                </text>
              ) : activeId ? (
                <text
                  x={0} y={8}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10}
                  fill={isEmbed ? "var(--undp-gray)" : "#94a3b8"}
                  className="select-none pointer-events-none"
                >
                  {activeConns.length === 1
                    ? t("wheel.centerConnectionsSingular", { count: activeConns.length })
                    : t("wheel.centerConnectionsPlural", { count: activeConns.length })}
                </text>
              ) : effectiveFocalGroup ? (
                <text
                  x={0} y={8}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={10}
                  fill={isEmbed ? "var(--undp-gray)" : "#94a3b8"}
                  className="select-none pointer-events-none"
                >
                  {effectiveFocalGroup.count === 1
                    ? t("wheel.centerTargetSingular", { count: effectiveFocalGroup.count })
                    : t("wheel.centerTargetPlural", { count: effectiveFocalGroup.count })}
                </text>
              ) : (
                <>
                  <text
                    x={0} y={6}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={10}
                    fill={isEmbed ? "var(--undp-gray)" : "#94a3b8"}
                    className="select-none pointer-events-none"
                  >
                    {t("wheel.centerTargets", { count: targets.length })}
                  </text>
                  <text
                    x={0} y={22}
                    textAnchor="middle" dominantBaseline="middle"
                    fontSize={10}
                    fill={isEmbed ? "var(--undp-gray)" : "#94a3b8"}
                    className="select-none pointer-events-none"
                  >
                    {budgetShadingActive
                      ? t("wheel.centerSpendTagged")
                      : t("wheel.centerAligned", { count: totalAligned })}
                  </text>
                </>
              )}
            </svg>
  );
  const railPanel = (
          selectedNode ? (
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
                filter={filter}
                onClose={closeCategory}
                onSelectTarget={handleNodeClick}
                onSelectPair={handleSelectPair}
                onSelectCategory={handleArcClick}
                onSetFilter={setFilter}
                countryConfig={countryConfig}
                budget={
                  groupMode === "globe"
                    ? budgetByCategoryId.get(focalGroup.id) ?? null
                    : null
                }
                budgetCurrency={budgetSummary?.currency}
                budgetPeriod={budgetSummary?.period}
                programmes={
                  groupMode === "globe"
                    ? programmesByCategoryId.get(focalGroup.id) ?? []
                    : []
                }
              />
            ) : (
              <EmptyPanel
                targets={visibleTargets}
                alignment={filtered}
                filter={filter}
                onSelectTarget={handleNodeClick}
                onSelectPair={handleSelectPair}
                onAsk={handleAsk}
                chat={chat}
                onSetFilter={setFilter}
                countryConfig={countryConfig}
                exampleQueries={exampleQueries}
                onRotateInsight={rotateInsight}
                currentInsight={currentInsight}
                onApplyHook={onApplyHook}
                canShowMe={canShowMe}
                onSelectChatEntity={handleChatEntityClick}
                showChat={showInternalChat}
                embed={isEmbed}
              />
            )
  );
  // Explorer B: the live "Explore" workbench. A floating-canvas stage that
  // reuses every piece of state and logic above, rearranged into a lens pane
  // (left), the hero wheel (centre), a command dock (bottom) and an answers
  // drawer (right). The standalone "dashboard" / "embed" variants fall through
  // to the original layout below, so /prototypes is unchanged.
  if (isWorkbench) {
    const countryName = targets[0]?.country ?? t("wheel.countryFallback");
    const financeView = view === "finance";

    // Corpus headline stats. Computed over the full alignment set so the top-bar
    // line reads as a stable headline (doc-hiding reshapes the wheel, not this).
    const strongCount = alignment.filter((a) => a.alignment === "high").length;
    const flaggedCount = alignment.filter((a) =>
      isContradiction(a.alignment),
    ).length;
    const fundedCount =
      budgetSummary?.entries.filter((e) => e.totalBudget > 0).length ?? 0;

    // Stat line, split so the flagged count carries its own colour + weight.
    // Finance swaps in a spend headline plus the reviewed-spending scope caveat.
    const statLead = financeView
      ? t("workbench.statFinanceLead", {
          spend: budgetSummary
            ? formatBudgetValue(
                budgetSummary.totalBudget,
                budgetSummary.currency,
              )
            : "",
          funded: fundedCount,
          total: budgetSummary?.entries.length ?? 0,
        })
      : t("workbench.statStrong", { count: strongCount });
    const statFlagged = financeView
      ? ""
      : t("workbench.statMisalignments", { count: flaggedCount });
    const statTail = financeView
      ? t("workbench.statFinanceScope")
      : t("workbench.statContext", {
          country: countryName,
          targets: targets.length,
          docs: availableDocs.length,
        });

    // The floating answer overlay is open whenever there is something to show:
    // a resolved answer, an error, an insight the user surfaced, or a selected
    // target / category. During a FRESH ask (nothing already open) it stays
    // closed while the wheel scans, then slides in when the answer resolves;
    // when a panel is already open, it stays put and the answer stacks in.
    const overlayOpen =
      !answersCollapsed &&
      (selectedNode != null ||
        focalGroup != null ||
        !!chat.reply ||
        !!chat.error ||
        (!!currentInsight && !scanning));

    // Close the overlay: drop the target / category selection and re-centre the
    // wheel. The chat reply is deliberately NOT cleared — closing the card is a
    // "get this out of my way" gesture, not "discard the answer", so the reply
    // stays reachable through the top-bar Answers control (matching the old
    // collapsible drawer, which kept its contents when collapsed).
    const closeOverlay = () => {
      setSelectedId(null);
      setComparedPair(null);
      setFocalGroupId(null);
      setPreviewGroupId(null);
      setAnswersCollapsed(true);
    };

    // Is there an answer to come back to while the card is collapsed? Only a
    // real reply / error counts: a passive rotating insight is not something
    // the user asked for, so it must not put a blue control in the top bar.
    const hasAnswerToShow = !!chat.reply || !!chat.error;

    // Switching views resets any open answer (handoff behaviour); setView also
    // snaps grouping (Finance → GLOBE, Coherence → Documents).
    const handleWorkbenchViewChange = (v: "coherence" | "finance") => {
      setView(v);
      setSelectedId(null);
      setComparedPair(null);
      setFocalGroupId(null);
      setPreviewGroupId(null);
      clearChat();
      setAnswersCollapsed(true);
    };

    // Legend rows for the non-document groupings (GLOBE / sectors / GGA).
    const categoryLegend = arcs.map((a) => ({
      id: a.id,
      label: a.label,
      color: a.color,
    }));

    // One floating card: the AI answer (chat reply / surfaced insight) stacks
    // above any selected target / category detail, matching the pre-rework
    // "answers + detail" pairing but presented as an overlay. A single header
    // close clears the whole overlay; insight bubbles are suppressed while a
    // detail panel owns the card so the two don't compete.
    const answerCard = (
      <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-line bg-white/95 shadow-[var(--shadow-pop)] backdrop-blur">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-4 py-2.5">
          <span className="text-caption font-medium text-[var(--undp-blue)]">
            {t("workbench.answerEyebrow")}
          </span>
          <button
            type="button"
            onClick={closeOverlay}
            aria-label={t("workbench.answersClose")}
            className="px-1 text-base leading-none text-[var(--undp-gray)] transition-colors hover:text-[var(--undp-black)]"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5 [scrollbar-width:thin]">
          <ChatOutput
            chat={chat}
            currentInsight={currentInsight}
            canShowMe={canShowMe}
            onApplyHook={onApplyHook}
            onSelectChatEntity={handleChatEntityClick}
            hideInsights={selectedNode != null || focalGroup != null}
          />
          {/* Only the detail rail (a selected target / category) belongs in the
              card. The idle "At a glance" EmptyPanel is suppressed — it is not
              an answer and reads as a nested card inside the overlay. */}
          {(selectedNode != null || focalGroup != null) && railPanel}
        </div>
      </div>
    );

    return (
      <WorkbenchStage
        title={t("workbench.title")}
        statLead={statLead}
        statFlagged={statFlagged}
        statTail={statTail}
        onShare={share}
        shareLabel={copied ? t("workbench.shareCopied") : t("workbench.share")}
        shareCopied={copied}
        countryName={countryName}
        showViewSwitch={!!budgetSummary}
        view={view}
        onViewChange={handleWorkbenchViewChange}
        viewCoherenceLabel={t("workbench.viewCoherence")}
        viewFinanceLabel={t("workbench.viewFinance")}
        wheel={wheelSvg}
        answerOpen={overlayOpen}
        answerCard={answerCard}
        answersAvailable={hasAnswerToShow}
        onShowAnswers={() => setAnswersCollapsed(false)}
        answersLabel={t("workbench.answersHeading")}
        dock={workbenchChat(false, true, true)}
        lensPane={
          <LensPane
            view={view}
            groupMode={groupMode}
            onGroupChange={handleGroupChange}
            filter={filter}
            onFilter={setFilter}
            budgetSummary={budgetSummary}
            budgetScale={budgetScale}
            onBudgetScaleChange={setBudgetScale}
            availableDocs={availableDocs}
            categoryLegend={categoryLegend}
            hiddenDocs={hiddenDocs}
            onToggleDoc={toggleDoc}
            onPreviewGroup={handlePreviewGroup}
            countryConfig={countryConfig}
            hasGga={hasGga}
          />
        }
        modal={
          <PairDetailModal
            open={comparedPair != null}
            pair={comparedPair}
            selectedTarget={selectedNode?.target ?? null}
            countryConfig={countryConfig}
            onClose={() => setComparedPair(null)}
          />
        }
      />
    );
  }

  return (
    <section id={isEmbed ? undefined : "coherence-explorer"} className={isEmbed ? "" : "mb-10"}>
      {/* Header + controls */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div>
          {showHeading && (
          <h2 className="text-lg font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
            {t("heading.title")}
            <InfoBox>
              {t.rich("heading.info", { strong: (chunks) => <strong>{chunks}</strong> })}
              <br /><br />
              {t.rich("heading.infoScore", { strong: (chunks) => <strong>{chunks}</strong> })}
              <br /><br />
              {t.rich("heading.infoBtr", { strong: (chunks) => <strong>{chunks}</strong> })}
            </InfoBox>
          </h2>
          )}
          <p className="text-body text-[var(--undp-gray)] mt-0.5">
            {(() => {
              const groupLabel = ({
                document: [t("groupLabel.documentSingular"), t("groupLabel.documentPlural")],
                globe: [t("groupLabel.globeSingular"), t("groupLabel.globePlural")],
                sector: [t("groupLabel.sectorSingular"), t("groupLabel.sectorPlural")],
                gga: [t("groupLabel.ggaSingular"), t("groupLabel.ggaPlural")],
              } as Record<GroupMode, [string, string]>)[groupMode][
                groups.length !== 1 ? 1 : 0
              ];
              const across = (
                <>
                  {t("summary.across", { count: groups.length, groupLabel })}
                </>
              );
              const contraButton = filteredCounts.contra > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setFilter(filter === "contradictions" ? "all" : "contradictions")
                  }
                  className="text-[var(--undp-black)] font-medium underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-[var(--undp-blue)] transition-colors"
                >
                  {filteredCounts.contra === 1
                    ? t("summary.possibleMisSingular", { count: filteredCounts.contra })
                    : t("summary.possibleMisPlural", { count: filteredCounts.contra })}
                </button>
              );
              switch (filter) {
                case "high":
                  return (
                    <>
                      {filteredCounts.high === 1
                        ? t("summary.highAlignmentsSingular", { count: filteredCounts.high })
                        : t("summary.highAlignmentsPlural", { count: filteredCounts.high })}
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
                      {filteredCounts.high === 1
                        ? t("summary.highAlignmentsSingular", { count: filteredCounts.high })
                        : t("summary.highAlignmentsPlural", { count: filteredCounts.high })}
                      {contraButton && (
                        <>
                          {t("summary.joinAnd")}
                          {contraButton}
                        </>
                      )}
                      {across}.
                    </>
                  );
                case "high_medium":
                  return (
                    <>
                      {filteredCounts.aligned === 1
                        ? t("summary.alignedSingular", { count: filteredCounts.aligned })
                        : t("summary.alignedPlural", { count: filteredCounts.aligned })}
                      {across}.
                    </>
                  );
                case "all":
                default:
                  return (
                    <>
                      {filteredCounts.aligned === 1
                        ? t("summary.allOpportunitySingular", { count: filteredCounts.aligned })
                        : t("summary.allOpportunityPlural", { count: filteredCounts.aligned })}
                      {across}
                      {contraButton && (
                        <>
                          {t("summary.joinComma")}
                          {contraButton}
                        </>
                      )}
                      .
                    </>
                  );
              }
            })()}
            {" "}{t("heading.hoverHint")}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          {/* Row 1: grouping + filter selects. Kept on their own row so the
              doc-type toggles below have a full-width budget to wrap into,
              regardless of how many data sources a country exposes. */}
          <div className="flex flex-wrap items-center gap-3">
            {isEmbed ? (
              <div className="inline-flex flex-wrap gap-1.5">
                {([
                  ["document", t("controls.groupDocuments"), t("controls.groupDocumentsTitle")],
                  ["globe", t("controls.groupGlobe"), t("controls.groupGlobeTitle")],
                  ["sector", t("controls.groupSectors"), t("controls.groupSectorsTitle")],
                  ...(hasGga
                    ? [["gga", t("controls.groupGga"), t("controls.groupGgaTitle")]]
                    : []),
                ] as [GroupMode, string, string][]).map(([mode, label, title]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleGroupChange(mode)}
                    aria-pressed={groupMode === mode}
                    title={title}
                    className={`px-3.5 py-1.5 rounded-full text-data font-medium border transition-colors ${
                      groupMode === mode
                        ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
                        : "bg-white border-line-strong text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <select
                value={groupMode}
                onChange={(e) => handleGroupChange(e.target.value as GroupMode)}
                className={controlCls}
              >
                <option value="document">{t("controls.groupOptionDocument")}</option>
                <option value="globe">{t("controls.groupOptionGlobe")}</option>
                <option value="sector">{t("controls.groupOptionSector")}</option>
                {hasGga && (
                  <option value="gga">{t("controls.groupOptionGga")}</option>
                )}
              </select>
            )}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as AlignFilter)}
              className={controlCls}
            >
              <option value="high_contra">{t("controls.filterHighContra")}</option>
              <option value="high">{t("controls.filterHigh")}</option>
              <option value="contradictions">{t("controls.filterContradictions")}</option>
            </select>
            {isEmbed && !isWorkbench && (
              <button
                type="button"
                onClick={() => setShowAtAGlance((v) => !v)}
                aria-pressed={showAtAGlance}
                title={t("controls.atAGlanceTitle")}
                className={`ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-data font-medium border transition-colors ${
                  showAtAGlance
                    ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
                    : "bg-white border-line text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
                }`}
              >
                {t("controls.atAGlance")}
              </button>
            )}
          </div>
          {/* Row 2: per-document toggles + abbreviation key + target search.
              Wraps to multiple lines so countries with many uploaded sources
              (Panama 8+, future uploads more) stay inside the viewport. */}
          <div className="flex flex-wrap items-start gap-x-2 gap-y-2">
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
                  className={`inline-flex items-center gap-1.5 px-1 py-1 text-data font-medium transition-colors ${
                    active
                      ? "text-[var(--undp-black)]"
                      : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                  }`}
                  title={getDocFullLabel(countryConfig, doc)}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={
                      active
                        ? { backgroundColor: color }
                        : { backgroundColor: "transparent", border: `1.5px solid ${color}66` }
                    }
                  />
                  {getDocFriendlyName(countryConfig, doc)}
                </button>
                {showSubPills && (
                  <div className="flex gap-2 pl-4">
                    <button
                      type="button"
                      onClick={() => togglePill("mitigation")}
                      className={`inline-flex items-center gap-1.5 px-1 py-0.5 text-caption font-medium transition-colors ${
                        mitActive
                          ? "text-[var(--undp-black)]"
                          : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                      }`}
                      title={t("doc.toggleMitigationTitle")}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={
                          mitActive
                            ? { backgroundColor: mitColor }
                            : { backgroundColor: "transparent", border: `1.5px solid ${mitColor}66` }
                        }
                      />
                      {t("doc.mitigation")}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePill("adaptation")}
                      className={`inline-flex items-center gap-1.5 px-1 py-0.5 text-caption font-medium transition-colors ${
                        adpActive
                          ? "text-[var(--undp-black)]"
                          : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                      }`}
                      title={t("doc.toggleAdaptationTitle")}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={
                          adpActive
                            ? { backgroundColor: adpColor }
                            : { backgroundColor: "transparent", border: `1.5px solid ${adpColor}66` }
                        }
                      />
                      {t("doc.adaptation")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Doc-type legend popover — surfaces full document names for the
              abbreviations shown in the chip row above. */}
          {availableDocs.length > 0 && (
            <span className="self-start">
              <InfoBox>
                <strong>{t("doc.abbreviationsTitle")}</strong>
                <br /><br />
                {availableDocs.map((doc, i) => {
                  const full = getDocFullLabel(countryConfig, doc);
                  return (
                    <span key={doc}>
                      <strong>{getDocLabel(countryConfig, doc)}</strong>
                      {full !== doc ? `: ${full}` : ""}
                      {i < availableDocs.length - 1 ? <br /> : null}
                    </span>
                  );
                })}
              </InfoBox>
            </span>
          )}

          {/* Target search lives in Row 1 for the workbench; the standalone
              variants keep it here at the end of the document toggles. */}
          {!isWorkbench && targetSearch}
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

{/* Main content: wheel + context panel. Side-by-side by default; in
          expanded mode the wheel spans full width and any open detail stacks
          below it. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Wheel container */}
        <div
          className={`min-w-0 ${
            railVisible ? "lg:col-span-8" : "lg:col-span-12"
          }`}
        >
          <div className={wheelCardCls}>
            {/* Top-left budget overlay control. Only rendered when the country
                has BER data classified to GLOBE subcategories. Clicking ON
                snaps groupMode to "globe" so the shading actually paints;
                clicking OFF stops painting but leaves the lens where it is. */}
            {budgetSummary && (
              <div className="flex flex-col gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    const next = !budgetOverlay;
                    setBudgetOverlay(next);
                    if (next && groupMode !== "globe") setGroupMode("globe");
                  }}
                  className={`self-start inline-flex items-center gap-2 px-3 py-1.5 ${isEmbed ? "rounded-full" : "rounded-md"} text-data font-medium border transition-colors ${
                    budgetShadingActive
                      ? "bg-[var(--undp-blue)]/10 border-[var(--undp-blue)]/40 text-[var(--undp-black)]"
                      : "bg-white border-line text-[var(--undp-black)] hover:border-line-strong"
                  }`}
                  title={
                    budgetShadingActive
                      ? t("budget.onTitle")
                      : t("budget.offTitle")
                  }
                  aria-pressed={budgetShadingActive}
                >
                  <span
                    aria-hidden="true"
                    className={`w-2.5 h-2.5 rounded-sm shrink-0 ${
                      budgetShadingActive
                        ? "bg-[var(--undp-blue)]"
                        : "border border-line-strong bg-white"
                    }`}
                  />
                  {t("budget.label")}
                </button>
                {budgetShadingActive && (
                  <p className="text-caption text-[var(--undp-gray)] leading-snug">
                    {t("budget.mongoliaNote", {
                      start: budgetSummary.period.start,
                      end: budgetSummary.period.end,
                    })}
                  </p>
                )}
              </div>
            )}
            {wheelSvg}

            {/* Legend — structured grid */}
            <div className="mt-4 pt-3 border-t border-line-soft grid grid-cols-[auto_auto] gap-x-8 gap-y-1 text-caption justify-start">
              {/* Document column */}
              <div>
                <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">
                  {groupMode === "document" ? t("wheel.legendDocument") : groupMode === "globe" ? t("wheel.legendBiodiversity") : groupMode === "gga" ? t("wheel.legendResilience") : t("wheel.legendSector")}
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
                <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">{t("wheel.legendConnectionStrength")}</p>
                <div className="flex flex-col gap-1">
                  {([
                    ["high", t("wheel.legendHigh")],
                    ["medium", t("wheel.legendMedium")],
                    ["low", t("wheel.legendLow")],
                  ] as [AlignmentLevel, string][]).map(([level, desc]) => (
                    <span key={level} className="flex items-center gap-1.5">
                      <span className="w-6 h-1 rounded-full shrink-0" style={{ backgroundColor: ALIGNMENT_COLORS[level] }} />
                      <span className="text-[var(--undp-gray)]">{desc}</span>
                    </span>
                  ))}
                  {totalContra > 0 && (
                    <span className="flex items-center gap-1.5">
                      <svg width="24" height="4" className="shrink-0"><line x1="0" y1="2" x2="24" y2="2" stroke={ALIGNMENT_COLORS.flagged} strokeWidth="3" strokeDasharray="4 3" strokeLinecap="round" /></svg>
                      <span className="text-[var(--undp-gray)]">{t("wheel.legendPotentialMis")}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column: the on-demand context panel (target detail / category /
            at-a-glance). The chat lives inside EmptyPanel's idle state. */}
        {railVisible && (
        <div className="min-w-0 lg:col-span-4 flex flex-col gap-4">
          <div className="flex-1 min-h-0">
          {railPanel}
          </div>
        </div>
        )}
      </div>

      <PairDetailModal
        open={comparedPair != null}
        pair={comparedPair}
        selectedTarget={selectedNode?.target ?? null}
        countryConfig={countryConfig}
        onClose={() => setComparedPair(null)}
      />
    </section>
  );
}
