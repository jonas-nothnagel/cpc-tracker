"use client";

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { arc as d3Arc } from "d3-shape";
import {
  getDocColor,
  getDocFriendlyName,
  getDocFullLabel,
  getDocLabel,
  getDocMediumLabel,
  getDocTypeOrder,
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  CONTRADICTION_TYPE_LABELS,
} from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { DataProvenance, type ProvenanceSource } from "@/components/ui/data-provenance";
import { Modal } from "@/components/ui/modal";
import { isContradiction } from "@/types";
import {
  buildChatRequest,
  pickExampleQueries,
  type ChatHistoryTurn,
  type ChatSuggestion,
} from "@/lib/coherence-chat";
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


/**
 * Order of alignment levels rendered in the distribution bar. Skips "none"
 * (= no relationship assessed) so the bar only reflects real signal.
 */
const DIST_ORDER: AlignmentLevel[] = [
  "high_contradiction",
  "moderate_contradiction",
  "low_tension",
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
  const sorted = [...connections].sort((a, b) => {
    const order: Record<AlignmentLevel, number> = {
      high_contradiction: 0, moderate_contradiction: 1, low_tension: 2,
      high: 3, medium: 4, low: 5,
      none: 6,
    };
    return order[a.alignment] - order[b.alignment];
  });

  const hasNr7InConns = nr7ProgressMap && connections.some((c) => nr7ProgressMap.has(c.otherTarget.id));

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
    <div className="border border-gray-100 rounded-lg bg-white overflow-hidden flex flex-col h-full max-h-[760px]">
      {/* Header: citation-style minimal typography. Small-caps doc line on
          top, bold wrapping title below, target text as a paragraph. No
          chip/dot chrome; keeps the focus on the language itself. */}
      <div className="px-4 pt-4 pb-3 shrink-0 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] leading-snug">
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
              aria-label="Close target detail"
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
          className={`text-xs text-[var(--undp-black)] leading-relaxed ${
            isTargetLong && !targetTextExpanded ? "line-clamp-5" : ""
          }`}
        >
          <TargetTextWithHighlights target={node.target} />
        </p>
        {isTargetLong && (
          <button
            type="button"
            onClick={() => setTargetTextExpanded((p) => !p)}
            className="mt-1 text-[11px] text-[var(--undp-blue)] hover:underline"
          >
            {targetTextExpanded ? "Show less ▴" : "Read full ▾"}
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
                title={`${s.n} ${ALIGNMENT_LABELS[s.lvl].toLowerCase()}`}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {distSegments.map((s) => (
              <span key={s.lvl}>
                <span className="font-semibold" style={{ color: ALIGNMENT_COLORS[s.lvl] }}>
                  {s.n}
                </span>
                <span className="text-[var(--undp-gray)] ml-1">
                  {ALIGNMENT_LABELS[s.lvl].toLowerCase()}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

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

      {/* Connections list: minimal rows, rationale shown inline as a
          preview (line-clamped). Clicking anywhere on a row opens the
          pair-comparison modal; that's the drill-in for full rationale
          + side-by-side targets. No per-row expand/collapse. */}
      <div className="flex-1 overflow-y-auto min-h-0 border-t border-gray-100">
        <div className="flex items-baseline justify-between px-4 pt-3 pb-2 shrink-0">
          <p className="text-[11px] text-[var(--undp-gray)]">
            {connections.length} connection{connections.length === 1 ? "" : "s"}
          </p>
          <p className="text-[11px] text-[var(--undp-gray)]">Sorted by severity</p>
        </div>
        {hasNr7InConns && (
          <div className="flex items-center gap-3 px-4 pb-2 text-[11px] text-[var(--undp-gray)]">
            <span>NR7:</span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: NR7_BADGE_COLORS.on_track }} />
              on track
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: NR7_BADGE_COLORS.limited }} />
              limited
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: NR7_BADGE_COLORS.no_progress }} />
              none
            </span>
          </div>
        )}
        <ul className="divide-y divide-gray-100">
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
                    <span className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] shrink-0">
                      {getDocLabel(countryConfig, conn.otherTarget.sourceDocument)}
                    </span>
                    <span className="text-xs font-semibold text-[var(--undp-black)] flex-1 min-w-0">
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
                  {conn.description && (
                    <p className="mt-1.5 ml-3.5 text-[11px] leading-relaxed text-[var(--undp-gray)] line-clamp-3">
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
  const isLong = (target.text?.length ?? 0) > 280;
  const [expanded, setExpanded] = useState(!isLong);
  const docColor = getDocColor(countryConfig, target.sourceDocument);

  return (
    <div
      className="rounded-lg border border-gray-100 bg-white p-3 flex flex-col min-w-0"
      style={{ borderLeftWidth: 3, borderLeftColor: docColor }}
    >
      <div className="flex items-center gap-1.5 mb-1.5 min-w-0">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: docColor }}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] truncate min-w-0">
          {getDocLabel(countryConfig, target.sourceDocument)} · {target.sourceLabel}
        </span>
        <ActionTypeBadge actionType={target.actionType} />
        <OriginalLanguageChip target={target} />
      </div>
      <p
        className={`text-xs leading-relaxed text-[var(--undp-black)] ${
          isLong && !expanded ? "line-clamp-3" : ""
        }`}
      >
        <TargetTextWithHighlights target={target} />
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="mt-1.5 self-start text-[11px] text-[var(--undp-blue)] hover:underline"
        >
          {expanded ? "Show less ▴" : "Read full ▾"}
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
      title={`${ALIGNMENT_LABELS[result.alignment]} · target pair`}
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
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--undp-black)]">
              {ALIGNMENT_LABELS[result.alignment]}
            </span>
            {result.contradictionType && (
              <span className="ml-auto text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/80 text-[var(--undp-black)] border border-gray-200">
                {CONTRADICTION_TYPE_LABELS[result.contradictionType]}
              </span>
            )}
          </div>
          {result.description ? (
            <p className="text-sm leading-relaxed text-[var(--undp-black)]">
              {result.description}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-[var(--undp-gray)] italic">
              No AI rationale available for this pair.
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
   *  red intensity so rows with a high_contradiction stand out from rows
   *  whose only contradictions are low_tension. Only consulted when
   *  tone="red"; ignored otherwise. */
  severity?: AlignmentLevel;
  /** Optional inline label after the count (e.g., "alignments"). */
  unit?: string;
}) {
  // 4% min so the smallest non-zero count still has a visible pill.
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  // Severity-driven red intensity. Falls back to the original pale red
  // when severity is undefined or only low_tension is present.
  const redFill =
    severity === "high_contradiction"
      ? "bg-red-200 group-hover:bg-red-300"
      : severity === "moderate_contradiction"
        ? "bg-red-100 group-hover:bg-red-200"
        : "bg-red-50 group-hover:bg-red-100";
  const fillBg = tone === "red" ? redFill : "bg-gray-100 group-hover:bg-gray-200";
  // Left-edge accent on the hardest-severity rows reinforces the color
  // step without relying on viewers to distinguish red-50 from red-100.
  const borderAccent =
    tone === "red" && severity === "high_contradiction"
      ? "border-l-2 border-red-500"
      : tone === "red" && severity === "moderate_contradiction"
        ? "border-l-2 border-red-400"
        : "";
  const countColor =
    tone === "red" ? "text-red-700" : "text-[var(--undp-black)]";
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
  /** Follow-up chips returned by the last successful reply. */
  suggestions: ChatSuggestion[];
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
  /** Apply the current insight's actions to the wheel. */
  onApplyHook: () => void;
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
 * - DEFAULT: example chips and follow-up suggestion chips (the typical
 *   "ask this question" affordance).
 * - PRIMARY: the dark filled "Show me" call-to-action on the insight hook.
 * - SURPRISE: amber-tinted chip used for Surprise-me, signalling that it's
 *   a different kind of action (random insight) than the prompt chips. Mirrors
 *   the amber accent on the insight bubble so the two visually link.
 */
const CHIP_BASE =
  "text-[11px] leading-snug rounded-full px-2.5 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
const CHIP_DEFAULT = `${CHIP_BASE} text-[var(--undp-gray)] border border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:text-[var(--undp-black)]`;
const CHIP_PRIMARY = `${CHIP_BASE} text-white bg-[var(--undp-black)] border border-[var(--undp-black)] hover:bg-gray-800`;
const CHIP_SURPRISE = `${CHIP_BASE} text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 hover:border-amber-300`;

function ChatBar({
  onAsk,
  chat,
  exampleQueries,
  onRotateInsight,
  currentInsight,
  onApplyHook,
}: {
  onAsk: (query: string) => void;
  chat: ChatStatus;
  exampleQueries: string[];
  onRotateInsight: () => void;
  currentInsight: Insight | null;
  onApplyHook: () => void;
}) {
  const [query, setQuery] = useState("");
  const placeholder = useTypedPlaceholder("Ask anything about this view…");
  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed || chat.loading) return;
    onAsk(trimmed);
    setQuery("");
  };

  // The visible message slot shows one of: the current insight bubble, the
  // assistant's reply, or an error. They share the same bubble chrome so
  // the UI doesn't shift between states.
  const showInsight =
    !!currentInsight && !chat.reply && !chat.loading && !chat.error;
  const showReply = !!chat.reply && !chat.loading;
  const showError = !!chat.error && !chat.loading;
  const showSuggestions =
    showReply && chat.suggestions.length > 0;

  return (
    <div className="space-y-2.5">
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
            className="flex-1 min-w-0 text-[12.5px] text-[var(--undp-black)] placeholder:text-[var(--undp-gray)] bg-transparent focus:outline-none disabled:opacity-50"
            aria-label="Ask the assistant about this view"
          />
          <button
            type="submit"
            disabled={chat.loading || query.trim().length === 0}
            className="text-[11px] font-medium text-[var(--undp-blue)] hover:underline disabled:opacity-30 disabled:no-underline shrink-0"
          >
            {chat.loading ? "…" : "Ask"}
          </button>
        </div>
      </form>

      {chat.loading && (
        <div className="text-[11px] text-[var(--undp-gray)] italic px-1">
          Thinking…
        </div>
      )}

      {showInsight && currentInsight && (
        <div className="text-[12px] text-[var(--undp-black)] leading-relaxed bg-amber-50/70 border border-amber-100 rounded-lg px-3.5 py-2.5">
          <p className="flex items-baseline gap-2">
            <span className="text-[9.5px] font-semibold uppercase tracking-wider text-amber-700 shrink-0">
              Insight
            </span>
            <span className="flex-1">{currentInsight.callout}</span>
          </p>
        </div>
      )}
      {showReply && (
        <div className="text-[12px] text-[var(--undp-black)] leading-relaxed bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-2.5">
          {chat.reply}
        </div>
      )}
      {showError && (
        <div className="text-[12px] text-red-700 leading-relaxed bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5">
          {chat.error}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {showInsight ? (
          <>
            <button type="button" onClick={onApplyHook} className={CHIP_PRIMARY}>
              Show me
            </button>
            <button
              type="button"
              onClick={onRotateInsight}
              className={CHIP_SURPRISE}
            >
              Another insight
            </button>
          </>
        ) : showSuggestions ? (
          chat.suggestions.map((s) => (
            <button
              key={s.query}
              type="button"
              onClick={() => {
                if (s.kind === "surprise") {
                  onRotateInsight();
                  return;
                }
                submit(s.query);
              }}
              disabled={chat.loading}
              className={s.kind === "surprise" ? CHIP_SURPRISE : CHIP_DEFAULT}
            >
              {s.label}
            </button>
          ))
        ) : (
          <>
            {exampleQueries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                disabled={chat.loading}
                className={CHIP_DEFAULT}
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              onClick={onRotateInsight}
              disabled={chat.loading}
              className={CHIP_SURPRISE}
            >
              Surprise me
            </button>
          </>
        )}
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
        title={`All targets · ${allTargetsRanked.length}`}
        onClose={closeStatView}
        empty="No targets in this view."
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
    );
  }

  if (statView === "alignments") {
    return (
      <StatListSection
        title={`All alignments · ${allAlignmentPairs.length}`}
        onClose={closeStatView}
        empty="No strong alignments in this view."
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
        title={`All tensions · ${allTensionPairs.length}`}
        onClose={closeStatView}
        empty="No tensions in this view."
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
}: EmptyPanelProps) {
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
  // (high_contradiction > moderate_contradiction > low_tension) so the
  // row can render in a darker red when at least one pair is a hard
  // contradiction. Without this, a target with 50 low_tensions and one
  // with a single high_contradiction looked identical.
  const { connRanks, tensRanks } = useMemo(() => {
    const connCounts = new Map<string, number>();
    const tensCounts = new Map<string, number>();
    const tensSeverity = new Map<string, AlignmentLevel>();
    // Lower rank value = more severe. Matches the ordering used elsewhere
    // in this file (e.g. line 827, line 1629).
    const severityRank: Record<string, number> = {
      high_contradiction: 0,
      moderate_contradiction: 1,
      low_tension: 2,
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

        {statView === "overview" ? (
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
                <p className="text-[11px] text-[var(--undp-gray)] leading-snug">
                  No potential tensions for the current selection.
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

        <ChatBar
          onAsk={onAsk}
          chat={chat}
          exampleQueries={exampleQueries}
          onRotateInsight={onRotateInsight}
          currentInsight={currentInsight}
          onApplyHook={onApplyHook}
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
  filter: AlignFilter;
  onClose: () => void;
  onSelectTarget: (id: string) => void;
  onSelectPair: (targetAId: string, targetBId: string) => void;
  onSelectCategory: (id: string) => void;
  onSetFilter: (filter: AlignFilter) => void;
  countryConfig?: CountryConfig | null;
}

function CategoryPanel({
  group,
  nodes,
  arcs,
  alignment,
  filter,
  onClose,
  onSelectTarget,
  onSelectPair,
  onSelectCategory,
  onSetFilter,
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
      {/* Pinned header with stats so the body owns the scroll. */}
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
          <Stat
            label="Targets"
            value={group.count}
            onClick={() => toggleStatView("targets", "all")}
            title="Browse all targets in this category"
            active={statView === "targets"}
          />
          <Stat
            label="Alignments"
            value={totalAligned}
            accent="green"
            onClick={() => toggleStatView("alignments", "high")}
            title="Browse all strong alignment pairs in this category"
            active={statView === "alignments"}
          />
          <Stat
            label="Potential tensions"
            value={totalContra}
            accent="red"
            onClick={() => toggleStatView("tensions", "contradictions")}
            title="Browse all contradiction pairs in this category"
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
                            onClick={() =>
                              onSelectPair(p.targetAId, p.targetBId)
                            }
                            countryConfig={countryConfig}
                          />
                        );
                      })}
                    </ul>
                    {contradictionPairs.length > 6 && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleStatView("tensions", "contradictions")
                        }
                        className="text-[10px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] mt-1.5 px-1.5 underline decoration-dotted underline-offset-2"
                      >
                        + {contradictionPairs.length - 6} more
                      </button>
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
                            onClick={() =>
                              onSelectPair(p.targetAId, p.targetBId)
                            }
                            countryConfig={countryConfig}
                          />
                        );
                      })}
                    </ul>
                    {alignmentPairs.length > 6 && (
                      <button
                        type="button"
                        onClick={() => toggleStatView("alignments", "high")}
                        className="text-[10px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] mt-1.5 px-1.5 underline decoration-dotted underline-offset-2"
                      >
                        + {alignmentPairs.length - 6} more
                      </button>
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

  const provenanceSources = useMemo<ProvenanceSource[]>(() => {
    const docTypes = new Set<PolicyDocumentType>();
    for (const t of targets) docTypes.add(t.sourceDocument);
    return Array.from(docTypes).map((dt) => ({
      label: getDocFullLabel(countryConfig, dt),
      citation: countryConfig?.docProvenance?.[dt],
    }));
  }, [targets, countryConfig]);

  // Focal group: a category arc the user has clicked to drill into. Independent
  // of the target selection — when both are set, target focus dominates the
  // wheel and the panel shows target detail; closing the target falls back to
  // the category panel because the group remains focal.
  const [focalGroupId, setFocalGroupId] = useState<string | null>(null);
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

  // Chat state. Carries the reply plus follow-up suggestion chips.
  const [chat, setChat] = useState<ChatStatus>({
    loading: false,
    reply: null,
    error: null,
    suggestions: [],
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
      prev.reply !== null || prev.error !== null
        ? { loading: false, reply: null, error: null, suggestions: [] }
        : prev,
    );
    setHistory((prev) => (prev.length > 0 ? [] : prev));
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
      setChat({
        loading: true,
        reply: null,
        error: null,
        suggestions: [],
      });
      // Chat always sees the full corpus. Scoping the chat to the visible
      // view forced users to set the view correctly BEFORE asking, which
      // defeats the point of a navigation helper. The chat is now a Q&A over
      // the entire dataset; show_docs reveals hidden docs when needed and
      // the reply narrates the unhide.
      try {
        const targetMap = new Map(targets.map((t) => [t.id, t]));
        const body = buildChatRequest({
          query,
          groupMode,
          filter,
          targets,
          alignment,
          classifications,
          sectors,
          globeCategories,
          btrData,
          availableDocs,
          hiddenDocs,
          countryConfig,
          history,
        });

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
                : `Request failed (${res.status})`;
          } catch {
            message = `Request failed (${res.status})`;
          }
          throw new Error(message);
        }
        type ServerAction =
          | { type: "set_filter"; filter: AlignFilter }
          | { type: "focus_category"; categoryId: string }
          | { type: "select_target"; targetId: string }
          | { type: "select_pair"; targetAId: string; targetBId: string }
          | { type: "set_mode"; mode: GroupMode }
          | { type: "show_docs"; ids: string[] };
        const json = (await res.json()) as {
          reply: string;
          actions: ServerAction[];
          suggestions?: ChatSuggestion[];
        };

        // Each chat turn is treated as a fresh exploration: reset filter to
        // its default and clear any prior focus / selection / pair compare
        // before layering the new actions.
        setFilter("high_contra");
        // show_docs runs first — unhide before any focus/select lands on a
        // target whose doc was hidden a moment ago.
        const docsToShow = new Set<string>();
        for (const action of json.actions) {
          if (action.type === "show_docs") {
            for (const id of action.ids) docsToShow.add(id);
          }
        }
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
            const result = alignment.find(
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
        // Auto-unhide combines two sources: explicit show_docs from the
        // server, plus a fallback heuristic that unhides any doc referenced
        // by a focus/select action. Belt and braces — the model usually
        // emits show_docs, but if it forgets we still don't navigate to an
        // invisible target.
        for (const action of json.actions) {
          if (action.type === "focus_category" && groupMode === "document") {
            docsToShow.add(action.categoryId);
          } else if (action.type === "select_target") {
            const t = targetMap.get(action.targetId);
            if (t) docsToShow.add(t.sourceDocument);
          } else if (action.type === "select_pair") {
            const tA = targetMap.get(action.targetAId);
            const tB = targetMap.get(action.targetBId);
            if (tA) docsToShow.add(tA.sourceDocument);
            if (tB) docsToShow.add(tB.sourceDocument);
          }
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
        const suggestions = (json.suggestions ?? []).slice(0, 3);
        setChat({
          loading: false,
          reply: json.reply,
          error: null,
          suggestions,
        });
        // Append this turn to history, capped at 3 turns (~6 messages).
        setHistory((prev) =>
          [
            ...prev,
            { role: "user" as const, content: query },
            { role: "assistant" as const, content: json.reply },
          ].slice(-6),
        );
      } catch (err) {
        setChat({
          loading: false,
          reply: null,
          error:
            err instanceof Error ? err.message : "Sorry, that didn't work.",
          suggestions: [],
        });
      }
    },
    [
      alignment,
      availableDocs,
      btrData,
      classifications,
      countryConfig,
      globeCategories,
      hiddenDocs,
      groupMode,
      filter,
      history,
      sectors,
      targets,
      nodes,
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
  const exampleQueries = useMemo(
    () =>
      pickExampleQueries({
        visibleDocs: visibleDocsForExamples,
        globeCategoriesAvailable: globeCategories.length > 0,
        sectorsAvailable: sectors.length > 0,
        hasFood: visibleDocsForExamples.includes("FSS"),
        hasBiodiversity: visibleDocsForExamples.includes("NBSAP"),
        hasClimate: visibleDocsForExamples.includes("NDC"),
        hasAdaptation:
          visibleDocsForExamples.includes("NAP") ||
          (btrData?.adaptationGoals?.length ?? 0) > 0,
        hasTensions: visibleAlignment.some((a) => isContradiction(a.alignment)),
        hasBtr: targets.some((t) => t.sourceDocument === "BTR"),
        country: targets[0]?.country ?? null,
      }),
    [
      visibleDocsForExamples,
      globeCategories,
      sectors,
      visibleAlignment,
      btrData,
      targets,
    ],
  );

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
  // looking at. Clears any active reply so the new insight is visible.
  const rotateInsight = useCallback(() => {
    if (insights.length === 0) return;
    setInsightIdx((i) => i + 1);
    setChat((prev) =>
      prev.reply !== null || prev.error !== null || prev.suggestions.length > 0
        ? { loading: false, reply: null, error: null, suggestions: [] }
        : prev,
    );
    setHistory([]);
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
      for (const action of insight.actions) {
        if (action.type === "show_docs") {
          for (const id of action.ids) docsToShow.add(id);
        } else if (action.type === "set_mode") {
          setGroupMode(action.mode);
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
      setChat({
        loading: false,
        reply: insight.callout,
        error: null,
        suggestions: [
          {
            label: "Another insight",
            query: "Surprise me with something else",
            kind: "surprise",
          },
        ],
      });
      setHistory([]);
    },
    [nodes, alignment, targets],
  );

  const onApplyHook = useCallback(() => {
    if (!currentInsight) return;
    applyInsight(currentInsight);
  }, [currentInsight, applyInsight]);

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
          <h2 className="text-lg font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
            Policy Coherence Explorer
            <InfoBox>
              This visualization maps alignment relationships between policy targets across your documents. <strong>Lines</strong> between targets represent assessed relationships. Thicker, darker lines show stronger alignment. Dashed red lines indicate contradictions.
              <br /><br />
              The <strong>coherency score</strong> is a quality-weighted percentage: each aligned pair scores 1–3 points (low/medium/high), divided by the maximum possible score.
              <br /><br />
              <strong>BTR node colors:</strong> reported mitigation measures are shown in violet and reported adaptation actions in fuchsia, so you can tell the two BTR subsets apart at a glance.
            </InfoBox>
            <DataProvenance
              origin="mixed"
              sources={provenanceSources}
              method={
                <>
                  Each line is a single LLM judgement on a pair of policy
                  targets, scored on a seven-level scale (high contradiction →
                  high alignment). The coherency score aggregates those
                  per-pair scores; the dashed red lines come from the same
                  pass.
                </>
              }
              caveat="Each line represents one model judgement. Click into a target to read the rationale per pair before drawing conclusions, especially for high-stakes contradictions."
            />
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
        <div className="flex flex-col gap-3">
          {/* Row 1: grouping + filter selects. Kept on their own row so the
              doc-type toggles below have a full-width budget to wrap into,
              regardless of how many data sources a country exposes. */}
          <div className="flex flex-wrap items-center gap-3">
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
                  className={`flex items-stretch border rounded-md text-xs font-medium transition-colors overflow-hidden ${
                    active ? "" : "border-gray-200 hover:border-gray-300"
                  }`}
                  style={active ? { borderColor: `${color}66` } : undefined}
                  title={getDocFullLabel(countryConfig, doc)}
                >
                  <span
                    className="px-2 flex items-center text-[10px] font-semibold uppercase tracking-wider"
                    style={
                      active
                        ? { backgroundColor: color, color: "white" }
                        : { backgroundColor: "#f3f4f6", color: "#9ca3af" }
                    }
                  >
                    {getDocLabel(countryConfig, doc)}
                  </span>
                  <span
                    className="px-2.5 py-1.5 flex items-center"
                    style={
                      active
                        ? { color, backgroundColor: `${color}14` }
                        : { color: "var(--undp-gray)", backgroundColor: "white" }
                    }
                  >
                    {getDocFriendlyName(countryConfig, doc)}
                  </span>
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

          {/* Doc-type legend popover — surfaces full document names for the
              abbreviations shown in the chip row above. */}
          {availableDocs.length > 0 && (
            <span className="self-start">
              <InfoBox>
                <strong>Document abbreviations</strong>
                <br /><br />
                {availableDocs.map((doc, i) => {
                  const full = getDocFullLabel(countryConfig, doc);
                  return (
                    <span key={doc}>
                      <strong>{getDocLabel(countryConfig, doc)}</strong>
                      {full !== doc ? ` — ${full}` : ""}
                      {i < availableDocs.length - 1 ? <br /> : null}
                    </span>
                  );
                })}
              </InfoBox>
            </span>
          )}

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
              />
            )}
        </div>
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
