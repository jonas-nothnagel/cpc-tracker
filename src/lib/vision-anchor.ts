import type { AlignmentLevel, AlignmentResult, Target } from "@/types";
import { ALIGNMENT_LEVEL_ORDER } from "@/lib/utils";

/**
 * Pure aggregation helpers for the Vision Anchor Coverage view.
 *
 * The view treats one country's `sourceDocument` as the "anchor" (long-term
 * vision document, e.g. Mongolia's Vision 2050 / SECTORAL) and asks: for each
 * anchor target, which peripheral documents operationalise it, and how strongly?
 *
 * Kept separate from the React component so the aggregation, status-chip rules,
 * and "loosely connected" detection can be unit-tested in isolation.
 */

export type SortMode = "weakest_support" | "tension_first" | "anchor_order";

interface AnchorCell {
  /** Peripheral document type for this cell (e.g. "NDC"). */
  docType: string;
  /** Count of alignment records at each level for this (anchor, docType) pair. */
  byLevel: Partial<Record<AlignmentLevel, number>>;
  /** Peripheral target ids that contributed records to this cell. */
  peripheralIds: string[];
  /** Total alignment records in this cell (sum of byLevel). */
  total: number;
}

type AnchorStatusId =
  | "tension_heavy"
  | "single_doc_dependency"
  | "diversified_backing"
  | "sparse_strong_support";

export interface AnchorStatus {
  id: AnchorStatusId;
  label: string;
  /** Tone token consumed by the chip styling (mapped to UNDP palette in the component). */
  tone: "amber" | "green" | "gray" | "yellow";
  /** One-sentence explanation surfaced as a hover title. */
  description: string;
}

export interface AnchorRow {
  anchor: Target;
  /** Cells keyed by peripheral docType. */
  cells: Map<string, AnchorCell>;
  /** Totals across all peripheral docs. */
  totalsByLevel: Partial<Record<AlignmentLevel, number>>;
  /** Total relationship records (excludes `none`-level records). */
  totalRecords: number;
  /** Sum of `medium` and `high` records — used by status rules. */
  mediumOrHighCount: number;
  /** Share of relationship records (0..1) at the `low_tension` level. */
  lowTensionShare: number;
  /** Distinct peripheral documents contributing at least one `medium`+ record. */
  distinctDocsWithMediumPlus: number;
  status: AnchorStatus | null;
}

interface AggregationResult {
  rows: AnchorRow[];
  /** Peripheral doc types present in the anchor alignments (caller sorts via getDocTypeOrder). */
  visibleDocTypes: string[];
  /** Largest `total` seen in any single (anchor, doc) cell — for bar scaling. */
  maxCellTotal: number;
  /** Total peripheral targets in the country dataset (denominator for orphan checks). */
  peripheralCount: number;
}

export interface LooselyConnectedTarget {
  target: Target;
  /** Highest alignment level the peripheral reached against any anchor target. */
  maxLevel: AlignmentLevel | null;
  /** Number of `low_tension` links to anchor targets. */
  lowTensionCount: number;
  /** Number of `low` links to anchor targets. */
  lowCount: number;
  /** Anchor target id with the strongest link (or null if no records). */
  strongestAnchorId: string | null;
}

/** Numeric rank derived from ALIGNMENT_LEVEL_ORDER; higher = more positive. */
const LEVEL_RANK: Record<AlignmentLevel, number> = Object.fromEntries(
  ALIGNMENT_LEVEL_ORDER.map((l, i) => [l, i]),
) as Record<AlignmentLevel, number>;

const LOW_RANK = LEVEL_RANK.low;

/**
 * Build per-anchor coverage rows from the country's targets and pairwise alignment data.
 * Walks the alignment array once; targets that aren't anchors or peripherals are ignored.
 */
export function aggregateAnchorCoverage(
  targets: Target[],
  alignment: AlignmentResult[],
  anchorDocType: string,
  sparseStrongSupportThreshold = 5,
): AggregationResult {
  const anchorTargets = targets.filter((t) => t.sourceDocument === anchorDocType);
  const peripheralTargets = targets.filter((t) => t.sourceDocument !== anchorDocType);
  const peripheralById = new Map(peripheralTargets.map((t) => [t.id, t]));
  const anchorIds = new Set(anchorTargets.map((t) => t.id));

  const rowMap = new Map<string, AnchorRow>();
  for (const anchor of anchorTargets) {
    rowMap.set(anchor.id, {
      anchor,
      cells: new Map(),
      totalsByLevel: {},
      totalRecords: 0,
      mediumOrHighCount: 0,
      lowTensionShare: 0,
      distinctDocsWithMediumPlus: 0,
      status: null,
    });
  }

  for (const a of alignment) {
    // `none` records are excluded everywhere this view computes — they don't
    // belong in the bars (we only legend the present relationship levels), in
    // tension shares (a "no relationship" can't be tension), or in status
    // rules. The pure data is still available via the alignment heatmap.
    if (a.alignment === "none") continue;
    let anchorId: string | null = null;
    let peripheralId: string | null = null;
    if (anchorIds.has(a.targetAId) && peripheralById.has(a.targetBId)) {
      anchorId = a.targetAId;
      peripheralId = a.targetBId;
    } else if (anchorIds.has(a.targetBId) && peripheralById.has(a.targetAId)) {
      anchorId = a.targetBId;
      peripheralId = a.targetAId;
    } else {
      continue;
    }
    const row = rowMap.get(anchorId);
    if (!row) continue;
    const peripheral = peripheralById.get(peripheralId);
    if (!peripheral) continue;
    const docType = peripheral.sourceDocument;
    let cell = row.cells.get(docType);
    if (!cell) {
      cell = { docType, byLevel: {}, peripheralIds: [], total: 0 };
      row.cells.set(docType, cell);
    }
    cell.byLevel[a.alignment] = (cell.byLevel[a.alignment] ?? 0) + 1;
    cell.peripheralIds.push(peripheralId);
    cell.total += 1;
    row.totalsByLevel[a.alignment] = (row.totalsByLevel[a.alignment] ?? 0) + 1;
    row.totalRecords += 1;
  }

  const visibleDocTypeSet = new Set<string>();
  let maxCellTotal = 0;
  for (const row of rowMap.values()) {
    const lowTension = row.totalsByLevel.low_tension ?? 0;
    const medium = row.totalsByLevel.medium ?? 0;
    const high = row.totalsByLevel.high ?? 0;
    row.mediumOrHighCount = medium + high;
    row.lowTensionShare = row.totalRecords > 0 ? lowTension / row.totalRecords : 0;

    const docsWithMediumPlus = new Set<string>();
    for (const cell of row.cells.values()) {
      if ((cell.byLevel.medium ?? 0) + (cell.byLevel.high ?? 0) > 0) {
        docsWithMediumPlus.add(cell.docType);
      }
      if (cell.total > maxCellTotal) maxCellTotal = cell.total;
      visibleDocTypeSet.add(cell.docType);
    }
    row.distinctDocsWithMediumPlus = docsWithMediumPlus.size;
    row.status = computeAnchorStatus(row, sparseStrongSupportThreshold);
  }

  return {
    rows: Array.from(rowMap.values()),
    visibleDocTypes: Array.from(visibleDocTypeSet),
    maxCellTotal,
    peripheralCount: peripheralTargets.length,
  };
}

/**
 * Status chip rules. Order matters: the first matching rule wins, so
 * "tension-heavy" beats "diversified backing" (a tense ambition can also
 * be widely operationalised, but the tension is the more actionable signal).
 *
 * Returns null when none of the rules fires — that's the implicit "Partial
 * coverage" state and we deliberately do not mint a "well-supported" chip
 * the AI's medium-bias can't honestly underwrite.
 */
export function computeAnchorStatus(
  row: AnchorRow,
  sparseStrongSupportThreshold: number,
): AnchorStatus | null {
  if (row.lowTensionShare >= 0.5 && row.totalRecords > 0) {
    return {
      id: "tension_heavy",
      label: "Tension-heavy",
      tone: "amber",
      description:
        "Low-tension links dominate the relationships with this ambition — worth examining where the friction comes from.",
    };
  }
  if (row.mediumOrHighCount < sparseStrongSupportThreshold) {
    return {
      id: "sparse_strong_support",
      label: "Sparse strong support",
      tone: "gray",
      description:
        "Few peripheral targets reach medium-or-better alignment with this ambition. May indicate a coverage gap.",
    };
  }
  if (row.distinctDocsWithMediumPlus === 1) {
    return {
      id: "single_doc_dependency",
      label: "Single-document dependency",
      tone: "yellow",
      description:
        "All medium-or-better operationalisation comes from a single peripheral document — concentration risk if that document's priorities shift.",
    };
  }
  if (row.distinctDocsWithMediumPlus >= 3) {
    return {
      id: "diversified_backing",
      label: "Diversified backing",
      tone: "green",
      description:
        "At least three peripheral documents contribute medium-or-better operationalisation of this ambition.",
    };
  }
  return null;
}

/**
 * Peripheral targets whose strongest link to any anchor target is "low" or
 * "low_tension" (or weaker). These are the closest honest analog of "outliers"
 * the data supports — they're not orphaned (every pair was scored), but their
 * relationship to the long-term vision is loose.
 */
export function findLooselyConnectedTargets(
  targets: Target[],
  alignment: AlignmentResult[],
  anchorDocType: string,
): LooselyConnectedTarget[] {
  const anchorIds = new Set(
    targets.filter((t) => t.sourceDocument === anchorDocType).map((t) => t.id),
  );
  const peripheralTargets = targets.filter((t) => t.sourceDocument !== anchorDocType);
  const peripheralById = new Map(peripheralTargets.map((t) => [t.id, t]));

  type Stats = {
    lowTension: number;
    low: number;
    maxLevel: AlignmentLevel | null;
    strongestAnchorId: string | null;
  };
  const stats = new Map<string, Stats>();
  for (const p of peripheralTargets) {
    stats.set(p.id, { lowTension: 0, low: 0, maxLevel: null, strongestAnchorId: null });
  }

  for (const a of alignment) {
    let anchorId: string | null = null;
    let peripheralId: string | null = null;
    if (anchorIds.has(a.targetAId) && peripheralById.has(a.targetBId)) {
      anchorId = a.targetAId;
      peripheralId = a.targetBId;
    } else if (anchorIds.has(a.targetBId) && peripheralById.has(a.targetAId)) {
      anchorId = a.targetBId;
      peripheralId = a.targetAId;
    } else {
      continue;
    }
    const s = stats.get(peripheralId);
    if (!s) continue;
    if (a.alignment === "low_tension") s.lowTension += 1;
    if (a.alignment === "low") s.low += 1;
    if (s.maxLevel == null || LEVEL_RANK[a.alignment] > LEVEL_RANK[s.maxLevel]) {
      s.maxLevel = a.alignment;
      s.strongestAnchorId = anchorId;
    }
  }

  const results: LooselyConnectedTarget[] = [];
  for (const p of peripheralTargets) {
    const s = stats.get(p.id);
    if (!s || s.maxLevel == null) continue;
    if (LEVEL_RANK[s.maxLevel] > LOW_RANK) continue;
    results.push({
      target: p,
      maxLevel: s.maxLevel,
      lowTensionCount: s.lowTension,
      lowCount: s.low,
      strongestAnchorId: s.strongestAnchorId,
    });
  }
  return results;
}

/** Reorder anchor rows for display. Pure — does not mutate input. */
export function sortAnchorRows(rows: AnchorRow[], mode: SortMode): AnchorRow[] {
  const copy = [...rows];
  if (mode === "weakest_support") {
    copy.sort(
      (a, b) =>
        a.distinctDocsWithMediumPlus - b.distinctDocsWithMediumPlus ||
        a.mediumOrHighCount - b.mediumOrHighCount ||
        a.anchor.id.localeCompare(b.anchor.id),
    );
  } else if (mode === "tension_first") {
    copy.sort(
      (a, b) =>
        b.lowTensionShare - a.lowTensionShare || a.anchor.id.localeCompare(b.anchor.id),
    );
  } else if (mode === "anchor_order") {
    copy.sort((a, b) => {
      const numA = parseInt(a.anchor.id.split("_").pop() ?? "0", 10);
      const numB = parseInt(b.anchor.id.split("_").pop() ?? "0", 10);
      if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) {
        return numA - numB;
      }
      return a.anchor.id.localeCompare(b.anchor.id);
    });
  }
  return copy;
}

/** Exposed for the component so the same numeric ordering is used everywhere. */
export function alignmentLevelRank(level: AlignmentLevel): number {
  return LEVEL_RANK[level];
}
