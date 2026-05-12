"use client";

/**
 * Generic coherence table: groups classifications by parent category, shows
 * % share of expenditure, target count, action count. Handles both
 * hierarchical taxonomies (GLOBE: 9 parents x 48 subcategories) and flat ones
 * (IPCC sectors: 7 categories, no children; NBS: 10 categories, no children).
 *
 * For hierarchical taxonomies, parent rows are collapsible and expand to show
 * their child rows. For flat taxonomies, each parent row is the data row
 * (no expand toggle).
 *
 * Concentration callouts (top-heavy distribution, unfunded commitment areas,
 * budget-without-mandate) are computed generically from the data and shown
 * above the table.
 */

import React, { useMemo, useState } from "react";
import type { ThematicClassification } from "@/types";

// ---------------------------------------------------------------------------
// Generic types
// ---------------------------------------------------------------------------

/**
 * A single leaf in a taxonomy. For hierarchical taxonomies (GLOBE),
 * parentId/parentName point at the primary category. For flat taxonomies
 * (IPCC sectors, NBS), parentId === id and parentName === name.
 */
interface TaxonomyLeaf {
  id: string;
  name: string;
  parentId: string;
  parentName: string;
}

interface CoherenceRow extends TaxonomyLeaf {
  expenditure: number;
  targetIds: Set<string>;
  actionIds: Set<string>;
}

interface ParentRollup {
  id: string;
  name: string;
  expenditure: number;
  targetCount: number;
  actionCount: number;
  sharePercent: number; // of total classified expenditure
  hasHierarchy: boolean; // true if children are distinct from parent
  children: CoherenceRow[]; // for flat taxonomies, one child equal to the parent
  hasTargets: boolean;
  hasActions: boolean;
}

interface ConcentrationCallout {
  kind: "concentration" | "unfunded" | "unmandated" | "unscoped";
  text: string;
}

interface CoherenceTableProps {
  /** Parent + leaf taxonomy entries (see makeFlatLeaves / makeHierarchicalLeaves). */
  leaves: TaxonomyLeaf[];
  /** What taxonomyType matches against in classifications (e.g. "globe_sub", "sector"). */
  taxonomyType: string;
  /** All classification records (we filter by taxonomyType). */
  classifications: ThematicClassification[];
  /**
   * Cumulative expenditure per BER pseudo-target id
   * (e.g. { "BER_71403": 47.4 }).
   */
  expenditureByItemId: Map<string, number>;
  /** Monetary formatter (supplied by parent for consistent units). */
  formatMoney: (value: number) => string;
  /** Column labels. */
  taxonomyLabel: string; // e.g. "GLOBE subcategory" or "Climate mitigation sector"
  expenditureLabel: string; // e.g. "Expenditure (2020-2024)"
  /** Optional: parent totals header. Defaults to taxonomyLabel. */
  parentLabel?: string;
  /** Optional: plural form used in callouts ("sectors", "GLOBE categories"). */
  parentLabelPlural?: string;
}

// ---------------------------------------------------------------------------
// Leaf builders (callers use these to shape their taxonomy for the table)
// ---------------------------------------------------------------------------

export function makeFlatLeaves<C extends { id: string; name: string }>(
  categories: C[],
): TaxonomyLeaf[] {
  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    parentId: c.id,
    parentName: c.name,
  }));
}

export function makeHierarchicalLeaves<
  P extends { id: string; name: string },
  S extends { id: string; name: string; parentId: string },
>(parents: P[], subcategories: S[]): TaxonomyLeaf[] {
  const byId = new Map(parents.map((p) => [p.id, p.name] as const));
  return subcategories.map((s) => ({
    id: s.id,
    name: s.name,
    parentId: s.parentId,
    parentName: byId.get(s.parentId) ?? s.parentId,
  }));
}

// ---------------------------------------------------------------------------
// Build rollups
// ---------------------------------------------------------------------------

export function buildRollups(
  leaves: TaxonomyLeaf[],
  taxonomyType: string,
  classifications: ThematicClassification[],
  expenditureByItemId: Map<string, number>,
): ParentRollup[] {
  // Map leaf id -> row
  const leafRows = new Map<string, CoherenceRow>();
  for (const leaf of leaves) {
    leafRows.set(leaf.id, {
      ...leaf,
      expenditure: 0,
      targetIds: new Set(),
      actionIds: new Set(),
    });
  }

  // Single-label ingest: each item lands on exactly one leaf (its primary
  // assignment). No multi-label dedup needed since the classifier emits one
  // isPrimary record per (target, taxonomy).
  for (const c of classifications) {
    if (c.taxonomyType !== taxonomyType) continue;
    if (c.isPrimary !== true) continue;
    const row = leafRows.get(c.categoryId);
    if (!row) continue;

    if (c.targetId.startsWith("BER_")) {
      row.expenditure += expenditureByItemId.get(c.targetId) ?? 0;
    } else if (c.targetId.startsWith("BTR_") || c.targetId.startsWith("ADP_")) {
      row.actionIds.add(c.targetId);
    } else {
      row.targetIds.add(c.targetId);
    }
  }

  // Detect hierarchy: if any leaf's parentId differs from its id, we're hierarchical
  const hasHierarchy = leaves.some((l) => l.parentId !== l.id);

  // Group leaves by parent
  const byParent = new Map<
    string,
    { name: string; rows: CoherenceRow[] }
  >();
  for (const row of leafRows.values()) {
    if (!byParent.has(row.parentId)) {
      byParent.set(row.parentId, { name: row.parentName, rows: [] });
    }
    byParent.get(row.parentId)!.rows.push(row);
  }

  // Per-parent totals are simple sums of the leaf rows. Single-label means
  // no item appears in multiple parents, so per-parent expenditures sum to
  // the unique classified total exactly.
  const parentExpenditure = new Map<string, number>();
  for (const [parentId, { rows }] of byParent) {
    let sum = 0;
    for (const row of rows) sum += row.expenditure;
    parentExpenditure.set(parentId, sum);
  }

  const total = Array.from(parentExpenditure.values()).reduce(
    (a, b) => a + b,
    0,
  );

  const rollups: ParentRollup[] = [];
  for (const [parentId, { name, rows }] of byParent) {
    // Parent-level target/action counts: union across children
    const targetSet = new Set<string>();
    const actionSet = new Set<string>();
    for (const row of rows) {
      row.targetIds.forEach((t) => targetSet.add(t));
      row.actionIds.forEach((a) => actionSet.add(a));
    }
    const exp = parentExpenditure.get(parentId) ?? 0;
    rollups.push({
      id: parentId,
      name,
      expenditure: exp,
      targetCount: targetSet.size,
      actionCount: actionSet.size,
      sharePercent: total > 0 ? (exp / total) * 100 : 0,
      hasHierarchy,
      children: rows
        .slice()
        .sort((a, b) => {
          const aHas =
            a.expenditure > 0 || a.targetIds.size > 0 || a.actionIds.size > 0;
          const bHas =
            b.expenditure > 0 || b.targetIds.size > 0 || b.actionIds.size > 0;
          if (aHas && !bHas) return -1;
          if (!aHas && bHas) return 1;
          if (b.expenditure !== a.expenditure) return b.expenditure - a.expenditure;
          return a.id.localeCompare(b.id);
        }),
      hasTargets: targetSet.size > 0,
      hasActions: actionSet.size > 0,
    });
  }

  // Sort parents: with data first, by expenditure desc; empty parents last
  rollups.sort((a, b) => {
    const aHas =
      a.expenditure > 0 || a.targetCount > 0 || a.actionCount > 0;
    const bHas =
      b.expenditure > 0 || b.targetCount > 0 || b.actionCount > 0;
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    if (b.expenditure !== a.expenditure) return b.expenditure - a.expenditure;
    return a.name.localeCompare(b.name);
  });

  return rollups;
}

// ---------------------------------------------------------------------------
// Concentration callouts
// ---------------------------------------------------------------------------

function buildConcentrationCallouts(
  rollups: ParentRollup[],
  parentLabelSingular: string,
  parentLabelPlural: string,
): ConcentrationCallout[] {
  const callouts: ConcentrationCallout[] = [];
  const total = rollups.reduce((s, r) => s + r.expenditure, 0);

  if (total > 0) {
    // Top-heaviness: how many parents cover >= 80% of spending
    const sorted = rollups.slice().sort((a, b) => b.expenditure - a.expenditure);
    let cumShare = 0;
    let topN = 0;
    for (const r of sorted) {
      if (cumShare >= 80) break;
      cumShare += r.sharePercent;
      topN += 1;
      if (cumShare >= 80) break;
    }
    if (topN > 0 && topN < rollups.length) {
      const pct = Math.round(cumShare);
      const label = rollups.length === 1 ? parentLabelSingular : parentLabelPlural;
      callouts.push({
        kind: "concentration",
        text: `${pct}% of classified expenditure flows to ${topN} of ${rollups.length} ${label} (${sorted
          .slice(0, topN)
          .map((r) => r.name)
          .join(", ")}).`,
      });
    }
  }

  // Unfunded commitments: parents with targets but zero expenditure
  const unfunded = rollups.filter(
    (r) => r.targetCount > 0 && r.expenditure === 0,
  );
  if (unfunded.length > 0) {
    const label =
      unfunded.length === 1 ? parentLabelSingular : parentLabelPlural;
    callouts.push({
      kind: "unfunded",
      text: `${unfunded.length} ${label} with policy commitments but no classified budget: ${unfunded.map((r) => r.name).join(", ")}.`,
    });
  }

  // Budget without mandate: parents with expenditure but no targets
  const unmandated = rollups.filter(
    (r) => r.expenditure > 0 && r.targetCount === 0,
  );
  if (unmandated.length > 0) {
    const label =
      unmandated.length === 1 ? parentLabelSingular : parentLabelPlural;
    callouts.push({
      kind: "unmandated",
      text: `${unmandated.length} ${label} with budget but no policy target mapped: ${unmandated.map((r) => r.name).join(", ")}.`,
    });
  }

  // Unscoped: implementation actions reported but no target and no budget.
  // Distinct from unfunded (targets > 0, exp = 0). Surfaces sectors where
  // the BTR reports activity that the policy targets and the budget data
  // didn't anticipate.
  const unscoped = rollups.filter(
    (r) => r.actionCount > 0 && r.targetCount === 0 && r.expenditure === 0,
  );
  if (unscoped.length > 0) {
    const label =
      unscoped.length === 1 ? parentLabelSingular : parentLabelPlural;
    callouts.push({
      kind: "unscoped",
      text: `${unscoped.length} ${label} with implementation actions reported but no policy target or budget mapped: ${unscoped.map((r) => r.name).join(", ")}.`,
    });
  }

  return callouts;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function CoherenceTable({
  leaves,
  taxonomyType,
  classifications,
  expenditureByItemId,
  formatMoney,
  taxonomyLabel,
  expenditureLabel,
  parentLabel,
  parentLabelPlural,
}: CoherenceTableProps) {
  const singular = parentLabel ?? taxonomyLabel;
  const plural = parentLabelPlural ?? `${singular}s`;

  const rollups = useMemo(
    () =>
      buildRollups(leaves, taxonomyType, classifications, expenditureByItemId),
    [leaves, taxonomyType, classifications, expenditureByItemId],
  );

  const callouts = useMemo(
    () => buildConcentrationCallouts(rollups, singular, plural),
    [rollups, singular, plural],
  );

  // Expand state per parent id. Collapsed by default.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const maxParentExp = Math.max(...rollups.map((r) => r.expenditure), 1);
  const anyHierarchical = rollups.some((r) => r.hasHierarchy);

  // Separate populated from empty parents
  const populated = rollups.filter(
    (r) => r.expenditure > 0 || r.targetCount > 0 || r.actionCount > 0,
  );
  const empty = rollups.filter(
    (r) => r.expenditure === 0 && r.targetCount === 0 && r.actionCount === 0,
  );
  const [showEmpty, setShowEmpty] = useState(false);

  return (
    <div>
      {/* Concentration callouts */}
      {callouts.length > 0 && (
        <div className="mb-5 space-y-2">
          {callouts.map((cc, i) => (
            <div
              key={i}
              className={`text-sm px-3 py-2 rounded-md border ${
                cc.kind === "concentration"
                  ? "bg-blue-50/60 border-blue-100 text-[var(--undp-black)]"
                  : cc.kind === "unfunded"
                    ? "bg-amber-50/60 border-amber-100 text-[var(--undp-black)]"
                    : cc.kind === "unscoped"
                      ? "bg-indigo-50/60 border-indigo-100 text-[var(--undp-black)]"
                      : "bg-gray-50 border-gray-200 text-[var(--undp-black)]"
              }`}
            >
              {cc.text}
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_90px_200px_80px_80px] gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs text-[var(--undp-gray)] font-medium">
          <span>{taxonomyLabel}</span>
          <span className="text-right" title="Share of classified BER expenditure (not the country's full budget)">
            Share of BER
          </span>
          <span className="text-right">{expenditureLabel}</span>
          <span className="text-center">Targets</span>
          <span className="text-center">Actions</span>
        </div>

        {populated.map((p) => (
          <ParentRowView
            key={p.id}
            rollup={p}
            maxExp={maxParentExp}
            expanded={!!expanded[p.id]}
            onToggle={() => toggle(p.id)}
            formatMoney={formatMoney}
            anyHierarchical={anyHierarchical}
          />
        ))}

        {empty.length > 0 && (
          <div className="border-t border-gray-100">
            <button
              onClick={() => setShowEmpty((s) => !s)}
              className="w-full text-left px-4 py-2 text-xs text-[var(--undp-gray)] hover:bg-gray-50 transition-colors"
            >
              {showEmpty ? "\u25BE" : "\u25B8"} {empty.length} additional{" "}
              {empty.length === 1 ? singular : plural} with no data
            </button>
            {showEmpty &&
              empty.map((p) => (
                <ParentRowView
                  key={p.id}
                  rollup={p}
                  maxExp={maxParentExp}
                  expanded={!!expanded[p.id]}
                  onToggle={() => toggle(p.id)}
                  formatMoney={formatMoney}
                  anyHierarchical={anyHierarchical}
                  dim
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

interface ParentRowViewProps {
  rollup: ParentRollup;
  maxExp: number;
  expanded: boolean;
  onToggle: () => void;
  formatMoney: (value: number) => string;
  anyHierarchical: boolean;
  dim?: boolean;
}

function ParentRowView({
  rollup,
  maxExp,
  expanded,
  onToggle,
  formatMoney,
  anyHierarchical,
  dim,
}: ParentRowViewProps) {
  // Two distinct gap flavours. `unfunded` is the policy-vs-budget gap
  // (commitment exists but no money). `unscoped` is the implementation-
  // without-policy-or-money case (BTR actions reported here but no NDC/
  // NBSAP/NAP target was classified into this category and no budget
  // either). Mutually exclusive so only one tag shows.
  const isUnfunded = rollup.targetCount > 0 && rollup.expenditure === 0;
  const isUnscoped =
    !isUnfunded &&
    rollup.actionCount > 0 &&
    rollup.targetCount === 0 &&
    rollup.expenditure === 0;
  const hasChildren = rollup.hasHierarchy;

  return (
    <div>
      <div
        onClick={hasChildren ? onToggle : undefined}
        className={`grid grid-cols-[1fr_90px_200px_80px_80px] gap-2 px-4 py-2.5 border-b border-gray-100 items-center text-sm ${
          hasChildren ? "cursor-pointer hover:bg-gray-50" : ""
        } ${isUnfunded ? "bg-amber-50/40" : isUnscoped ? "bg-blue-50/40" : ""} ${dim ? "opacity-40" : ""}`}
      >
        {/* Name column with expand chevron + uppercase parent name */}
        <div className="flex items-center gap-2 min-w-0">
          {hasChildren ? (
            <span className="text-[var(--undp-gray)] text-xs shrink-0 w-3">
              {expanded ? "\u25BE" : "\u25B8"}
            </span>
          ) : (
            anyHierarchical && <span className="shrink-0 w-3" />
          )}
          <span
            className={`truncate font-semibold text-[var(--undp-black)] ${hasChildren ? "uppercase tracking-wide text-xs" : ""}`}
            title={rollup.name}
          >
            {rollup.name}
          </span>
          {isUnfunded && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0 whitespace-nowrap"
              title="Policy targets exist for this category but no budget is classified to it."
            >
              unfunded
            </span>
          )}
          {isUnscoped && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0 whitespace-nowrap"
              title="Implementation actions are reported in this category but no policy target is classified to it and no budget is identified."
            >
              unscoped
            </span>
          )}
        </div>

        {/* Share % */}
        <div className="text-right text-xs tabular-nums text-[var(--undp-gray)]">
          {rollup.sharePercent > 0
            ? `${rollup.sharePercent.toFixed(rollup.sharePercent < 1 ? 1 : 0)}%`
            : "\u2014"}
        </div>

        {/* Expenditure bar + value */}
        <div className="flex items-center gap-2 justify-end">
          {rollup.expenditure > 0 ? (
            <>
              <div className="w-24 h-4 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full bg-[#059669] rounded"
                  style={{ width: `${(rollup.expenditure / maxExp) * 100}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-[var(--undp-black)] w-20 text-right whitespace-nowrap">
                {formatMoney(rollup.expenditure)}
              </span>
            </>
          ) : (
            <span className="text-xs text-[var(--undp-gray)]">{"\u2014"}</span>
          )}
        </div>

        <div className="text-center">
          {rollup.targetCount > 0 ? (
            <span className="text-xs tabular-nums font-medium text-[var(--undp-black)]">
              {rollup.targetCount}
            </span>
          ) : (
            <span className="text-xs text-[var(--undp-gray)]">0</span>
          )}
        </div>

        <div className="text-center">
          {rollup.actionCount > 0 ? (
            <span className="text-xs tabular-nums font-medium text-[var(--undp-black)]">
              {rollup.actionCount}
            </span>
          ) : (
            <span className="text-xs text-[var(--undp-gray)]">0</span>
          )}
        </div>
      </div>

      {/* Children (when expanded) */}
      {hasChildren &&
        expanded &&
        rollup.children.map((child) => (
          <ChildRowView
            key={child.id}
            row={child}
            maxExp={maxExp}
            formatMoney={formatMoney}
            dim={dim}
          />
        ))}
    </div>
  );
}

function ChildRowView({
  row,
  maxExp,
  formatMoney,
  dim,
}: {
  row: CoherenceRow;
  maxExp: number;
  formatMoney: (v: number) => string;
  dim?: boolean;
}) {
  const hasData =
    row.expenditure > 0 || row.targetIds.size > 0 || row.actionIds.size > 0;
  const isUnfunded = row.targetIds.size > 0 && row.expenditure === 0;
  const isUnscoped =
    !isUnfunded &&
    row.actionIds.size > 0 &&
    row.targetIds.size === 0 &&
    row.expenditure === 0;
  return (
    <div
      className={`grid grid-cols-[1fr_90px_200px_80px_80px] gap-2 px-4 py-2 border-b border-gray-50 items-center text-sm bg-gray-50/30 ${isUnfunded ? "bg-amber-50/30" : isUnscoped ? "bg-blue-50/30" : ""} ${!hasData ? "opacity-50" : ""} ${dim ? "opacity-30" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0 pl-7">
        <span
          className="text-[var(--undp-gray)] font-mono text-xs shrink-0"
          style={{ width: 32 }}
        >
          {row.id}
        </span>
        <span
          className="text-[var(--undp-black)] truncate"
          title={row.name}
        >
          {row.name}
        </span>
        {isUnfunded && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0 whitespace-nowrap"
            title="Targets exist for this subcategory but no budget is identified."
          >
            no budget
          </span>
        )}
        {isUnscoped && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0 whitespace-nowrap"
            title="Implementation actions reported here but no policy target nor budget mapped."
          >
            unscoped
          </span>
        )}
      </div>
      <div />
      <div className="flex items-center gap-2 justify-end">
        {row.expenditure > 0 ? (
          <>
            <div className="w-24 h-3 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full bg-[#059669]/70 rounded"
                style={{ width: `${(row.expenditure / maxExp) * 100}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-[var(--undp-black)] w-20 text-right whitespace-nowrap">
              {formatMoney(row.expenditure)}
            </span>
          </>
        ) : (
          <span className="text-xs text-[var(--undp-gray)]">{"\u2014"}</span>
        )}
      </div>
      <div className="text-center">
        {row.targetIds.size > 0 ? (
          <span className="text-xs tabular-nums text-[var(--undp-black)]">
            {row.targetIds.size}
          </span>
        ) : (
          <span className="text-xs text-[var(--undp-gray)]">0</span>
        )}
      </div>
      <div className="text-center">
        {row.actionIds.size > 0 ? (
          <span className="text-xs tabular-nums text-[var(--undp-black)]">
            {row.actionIds.size}
          </span>
        ) : (
          <span className="text-xs text-[var(--undp-gray)]">0</span>
        )}
      </div>
    </div>
  );
}
