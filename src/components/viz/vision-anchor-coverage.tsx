"use client";

import { Fragment, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LEVEL_ORDER,
  getDocColor,
  getDocFullLabel,
  getDocLabel,
  getDocTypeOrder,
} from "@/lib/utils";
import { useAlignmentLabels } from "@/lib/labels";
import { Modal } from "@/components/ui/modal";
import { InfoBox } from "@/components/ui/info-box";
import { DataProvenance, type ProvenanceSource } from "@/components/ui/data-provenance";
import {
  aggregateAnchorCoverage,
  alignmentLevelRank,
  findLooselyConnectedTargets,
  sortAnchorRows,
  type AnchorRow,
  type AnchorStatus,
  type LooselyConnectedTarget,
  type SortMode,
} from "@/lib/vision-anchor";
import { VisionSunburst } from "@/components/viz/vision-anchor-sunburst";
import type {
  AlignmentLevel,
  AlignmentResult,
  CountryConfig,
  Target,
} from "@/types";

interface VisionAnchorCoverageProps {
  targets: Target[];
  alignment: AlignmentResult[];
  countryConfig: CountryConfig | null;
  /** sourceDocument id of the long-term vision document (e.g. "SECTORAL"). */
  anchorDocType: string;
  /** Below this many medium+high records, an anchor is flagged "Sparse strong support". */
  sparseStrongSupportThreshold?: number;
  onFocusTarget?: (id: string) => void;
}

type ViewMode = "matrix" | "sunburst" | "loose";

const VIEW_OPTIONS: { value: ViewMode; labelKey: string }[] = [
  { value: "sunburst", labelKey: "viewSunburst" },
  { value: "matrix", labelKey: "viewMatrix" },
  { value: "loose", labelKey: "viewLoose" },
];

const STATUS_TONE_CLASSES: Record<AnchorStatus["tone"], string> = {
  amber: "bg-orange-50 text-orange-800 border-orange-200",
  green: "bg-green-50 text-green-800 border-green-200",
  yellow: "bg-yellow-50 text-yellow-800 border-yellow-300",
  gray: "bg-gray-50 text-[var(--undp-gray)] border-gray-200",
};

const SORT_OPTIONS: { value: SortMode; labelKey: string }[] = [
  { value: "weakest_support", labelKey: "sortWeakest" },
  { value: "tension_first", labelKey: "sortMisalignment" },
  { value: "anchor_order", labelKey: "sortAnchorOrder" },
];

export function VisionAnchorCoverage({
  targets,
  alignment,
  countryConfig,
  anchorDocType,
  sparseStrongSupportThreshold = 5,
  onFocusTarget,
}: VisionAnchorCoverageProps) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const [view, setView] = useState<ViewMode>("sunburst");
  const [sortMode, setSortMode] = useState<SortMode>("weakest_support");
  const [modal, setModal] = useState<
    | { kind: "cell"; row: AnchorRow; docType: string }
    | { kind: "sub_arc"; row: AnchorRow; level: AlignmentLevel }
    | { kind: "row"; row: AnchorRow }
    | null
  >(null);

  const aggregation = useMemo(
    () => aggregateAnchorCoverage(targets, alignment, anchorDocType, sparseStrongSupportThreshold),
    [targets, alignment, anchorDocType, sparseStrongSupportThreshold],
  );

  const sortedRows = useMemo(
    () => sortAnchorRows(aggregation.rows, sortMode),
    [aggregation.rows, sortMode],
  );

  const visibleDocTypes = useMemo(
    () =>
      [...aggregation.visibleDocTypes].sort(
        (a, b) => getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
      ),
    [aggregation.visibleDocTypes, countryConfig],
  );

  const looseTargets = useMemo(
    () => findLooselyConnectedTargets(targets, alignment, anchorDocType),
    [targets, alignment, anchorDocType],
  );

  const peripheralById = useMemo(
    () =>
      new Map(
        targets.filter((t) => t.sourceDocument !== anchorDocType).map((t) => [t.id, t]),
      ),
    [targets, anchorDocType],
  );
  const anchorById = useMemo(
    () =>
      new Map(
        targets.filter((t) => t.sourceDocument === anchorDocType).map((t) => [t.id, t]),
      ),
    [targets, anchorDocType],
  );

  const visibleLevels = useMemo<AlignmentLevel[]>(() => {
    const present = new Set<AlignmentLevel>();
    for (const row of aggregation.rows) {
      for (const lvl of Object.keys(row.totalsByLevel) as AlignmentLevel[]) {
        if ((row.totalsByLevel[lvl] ?? 0) > 0) present.add(lvl);
      }
    }
    // ALIGNMENT_LEVEL_ORDER goes contradiction → high. Reverse so the legend
    // reads best→worst left to right, and exclude `none` (we don't render it).
    return [...ALIGNMENT_LEVEL_ORDER].reverse().filter((l) => l !== "none" && present.has(l));
  }, [aggregation.rows]);

  const anchorDocLabel = getDocLabel(countryConfig, anchorDocType);
  const anchorDocFullLabel = getDocFullLabel(countryConfig, anchorDocType);

  const provenanceSources = useMemo<ProvenanceSource[]>(() => {
    const docs = new Set<string>([anchorDocType, ...visibleDocTypes]);
    return Array.from(docs).map((dt) => ({
      label: getDocFullLabel(countryConfig, dt),
      citation: countryConfig?.docProvenance?.[dt],
    }));
  }, [anchorDocType, visibleDocTypes, countryConfig]);

  if (aggregation.rows.length === 0) {
    return null;
  }

  const subtitle = (() => {
    if (view === "matrix") {
      return t("subtitleMatrix", {
        rows: aggregation.rows.length,
        anchor: anchorDocLabel,
        peripheral: aggregation.peripheralCount,
        docs: visibleDocTypes.length,
      });
    }
    if (view === "sunburst") {
      return t("subtitleSunburst", { anchor: anchorDocLabel });
    }
    return t("subtitleLoose", { anchor: anchorDocLabel });
  })();

  return (
    <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
      <div className="mb-3 flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
          {t("heading", { anchor: anchorDocLabel })}
          <InfoBox>
            {t.rich("infoBoxIntro", {
              anchor: anchorDocLabel,
              anchorFull: anchorDocFullLabel,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
            <br />
            <br />
            <em>
              {t.rich("infoBoxNote", {
                anchor: anchorDocLabel,
                strong: (chunks) => <strong>{chunks}</strong>,
                em: (chunks) => <em>{chunks}</em>,
              })}
            </em>
          </InfoBox>
          <DataProvenance
            origin="ai-inferred"
            sources={provenanceSources}
            method={t("provenanceMethod")}
            caveat={t("provenanceCaveat")}
          />
        </h2>
        <div className="flex gap-1.5 text-xs">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setView(opt.value)}
              className={`px-3.5 py-1.5 rounded-full transition-colors ${
                view === opt.value
                  ? "bg-[var(--undp-blue)] text-white"
                  : "bg-gray-100 text-[var(--undp-gray)] hover:bg-gray-200"
              }`}
            >
              {t(opt.labelKey)}
              {opt.value === "loose" && looseTargets.length > 0 && (
                <span className="ml-1.5 text-[10px] opacity-80">({looseTargets.length})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-[var(--undp-gray)] mb-4">{subtitle}</p>

      {view === "matrix" && (
        <CoverageMatrix
          rows={sortedRows}
          visibleDocTypes={visibleDocTypes}
          visibleLevels={visibleLevels}
          maxCellTotal={aggregation.maxCellTotal}
          countryConfig={countryConfig}
          sortMode={sortMode}
          onSortModeChange={setSortMode}
          onCellClick={(row, dt) => {
            setModal({ kind: "cell", row, docType: dt });
            onFocusTarget?.(row.anchor.id);
          }}
          onRowClick={(row) => {
            setModal({ kind: "row", row });
            onFocusTarget?.(row.anchor.id);
          }}
        />
      )}

      {view === "sunburst" && (
        <VisionSunburst
          rows={sortedRows}
          countryConfig={countryConfig}
          anchorDocType={anchorDocType}
          anchorDocLabel={anchorDocLabel}
          onSubArcClick={(row, level) => {
            // Same modal the matrix uses, but pre-filtered to the level the
            // user clicked. We surface this by routing through a new modal kind.
            setModal({ kind: "sub_arc", row, level });
            onFocusTarget?.(row.anchor.id);
          }}
          onViewAllRecords={(row) => {
            setModal({ kind: "row", row });
            onFocusTarget?.(row.anchor.id);
          }}
        />
      )}

      {view === "loose" && (
        <LoosePanel
          looseTargets={looseTargets}
          countryConfig={countryConfig}
          anchorById={anchorById}
          anchorDocLabel={anchorDocLabel}
          onTargetClick={(id) => onFocusTarget?.(id)}
        />
      )}

      {modal?.kind === "cell" && (
        <CellDetailModal
          row={modal.row}
          docType={modal.docType}
          alignment={alignment}
          peripheralById={peripheralById}
          countryConfig={countryConfig}
          onClose={() => setModal(null)}
          onTargetClick={(id) => onFocusTarget?.(id)}
        />
      )}
      {modal?.kind === "sub_arc" && (
        <SubArcDetailModal
          row={modal.row}
          level={modal.level}
          alignment={alignment}
          peripheralById={peripheralById}
          visibleDocTypes={visibleDocTypes}
          countryConfig={countryConfig}
          onClose={() => setModal(null)}
          onTargetClick={(id) => onFocusTarget?.(id)}
        />
      )}
      {modal?.kind === "row" && (
        <RowDetailModal
          row={modal.row}
          visibleDocTypes={visibleDocTypes}
          alignment={alignment}
          peripheralById={peripheralById}
          countryConfig={countryConfig}
          onClose={() => setModal(null)}
          onTargetClick={(id) => onFocusTarget?.(id)}
        />
      )}
    </section>
  );
}

function SubArcDetailModal({
  row,
  level,
  alignment,
  peripheralById,
  visibleDocTypes,
  countryConfig,
  onClose,
  onTargetClick,
}: {
  row: AnchorRow;
  level: AlignmentLevel;
  alignment: AlignmentResult[];
  peripheralById: Map<string, Target>;
  visibleDocTypes: string[];
  countryConfig: CountryConfig | null;
  onClose: () => void;
  onTargetClick: (id: string) => void;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const alignmentLabels = useAlignmentLabels();
  const recordsByDoc = useMemo(() => {
    const grouped = new Map<string, AlignmentResult[]>();
    for (const r of alignment) {
      if (r.alignment !== level) continue;
      const isAnchorA = r.targetAId === row.anchor.id;
      const isAnchorB = r.targetBId === row.anchor.id;
      if (!isAnchorA && !isAnchorB) continue;
      const otherId = isAnchorA ? r.targetBId : r.targetAId;
      const peripheral = peripheralById.get(otherId);
      if (!peripheral) continue;
      const list = grouped.get(peripheral.sourceDocument) ?? [];
      list.push(r);
      grouped.set(peripheral.sourceDocument, list);
    }
    return grouped;
  }, [alignment, peripheralById, row.anchor.id, level]);

  const docs = visibleDocTypes.filter((dt) => recordsByDoc.has(dt));
  const total = Array.from(recordsByDoc.values()).reduce((s, l) => s + l.length, 0);
  const idLabel = row.anchor.sourceLabel || row.anchor.id;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("subArcModalTitle", {
        id: idLabel,
        level: alignmentLabels[level],
        count: total,
      })}
      maxWidth="max-w-3xl"
    >
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <p className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] font-semibold mb-1">
          {t("anchorAmbitionLabel")}
        </p>
        <p className="text-xs text-[var(--undp-black)] leading-relaxed">{row.anchor.text}</p>
      </div>
      <div className="px-5 py-4 space-y-5">
        {docs.length === 0 && (
          <p className="text-xs text-[var(--undp-gray)] italic">
            {t("noRecordsAtLevel")}
          </p>
        )}
        {docs.map((dt) => {
          const docColor = getDocColor(countryConfig, dt);
          const items = recordsByDoc.get(dt) ?? [];
          return (
            <div key={dt}>
              <h4
                className="text-xs font-semibold mb-2 flex items-center gap-2"
                style={{ color: docColor }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: docColor }}
                />
                {getDocFullLabel(countryConfig, dt)}
                <span className="text-[var(--undp-gray)] font-normal">({items.length})</span>
              </h4>
              <RecordList
                records={items}
                anchorId={row.anchor.id}
                peripheralById={peripheralById}
                onTargetClick={onTargetClick}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

// ─── Matrix sub-components ─────────────────────────────────────────────────

interface CoverageMatrixProps {
  rows: AnchorRow[];
  visibleDocTypes: string[];
  visibleLevels: AlignmentLevel[];
  maxCellTotal: number;
  countryConfig: CountryConfig | null;
  sortMode: SortMode;
  onSortModeChange: (mode: SortMode) => void;
  onCellClick: (row: AnchorRow, docType: string) => void;
  onRowClick: (row: AnchorRow) => void;
}

function CoverageMatrix({
  rows,
  visibleDocTypes,
  visibleLevels,
  maxCellTotal,
  countryConfig,
  sortMode,
  onSortModeChange,
  onCellClick,
  onRowClick,
}: CoverageMatrixProps) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const alignmentLabels = useAlignmentLabels();
  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-[var(--undp-gray)] mr-1">{t("sortLabel")}</span>
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSortModeChange(opt.value)}
              className={`px-2.5 py-1 rounded-full transition-colors ${
                sortMode === opt.value
                  ? "bg-[var(--undp-blue)] text-white"
                  : "bg-gray-100 text-[var(--undp-gray)] hover:bg-gray-200"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-3 text-xs items-center">
          {visibleLevels.map((level) => (
            <div key={level} className="flex items-center gap-1">
              <span
                className="w-3.5 h-3.5 rounded-sm inline-block"
                style={{ backgroundColor: ALIGNMENT_COLORS[level] }}
              />
              <span className="text-[var(--undp-gray)]">{alignmentLabels[level]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid items-center gap-y-3 gap-x-3 min-w-[820px]"
          style={{
            gridTemplateColumns: `minmax(240px, 1.6fr) repeat(${visibleDocTypes.length}, minmax(90px, 1fr)) minmax(170px, 1.1fr)`,
          }}
        >
          <div className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] font-semibold pb-2 border-b border-gray-100">
            {t("anchorAmbitionLabel")}
          </div>
          {visibleDocTypes.map((dt) => (
            <div
              key={dt}
              className="text-[11px] uppercase tracking-wide font-semibold pb-2 border-b border-gray-100 text-center"
              title={getDocFullLabel(countryConfig, dt)}
            >
              <span style={{ color: getDocColor(countryConfig, dt) }}>
                {getDocLabel(countryConfig, dt)}
              </span>
            </div>
          ))}
          <div className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] font-semibold pb-2 border-b border-gray-100">
            {t("statusHeader")}
          </div>

          {rows.map((row) => (
            <Fragment key={row.anchor.id}>
              <RowLabel
                row={row}
                onClick={() => onRowClick(row)}
                countryConfig={countryConfig}
              />
              {visibleDocTypes.map((dt) => (
                <CellBar
                  key={dt}
                  row={row}
                  docType={dt}
                  maxCellTotal={maxCellTotal}
                  countryConfig={countryConfig}
                  onClick={() => onCellClick(row, dt)}
                />
              ))}
              <StatusChip status={row.status} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function RowLabel({
  row,
  onClick,
  countryConfig,
}: {
  row: AnchorRow;
  onClick: () => void;
  countryConfig: CountryConfig | null;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const docColor = getDocColor(countryConfig, row.anchor.sourceDocument);
  const provenance = countryConfig?.docProvenance?.[row.anchor.sourceDocument];
  const idLabel = row.anchor.sourceLabel || row.anchor.id;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left -mx-2 px-2 py-1.5 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30 transition-colors"
      title={row.anchor.text}
      aria-label={t("rowAriaLabel", { id: idLabel, text: row.anchor.text })}
    >
      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ backgroundColor: `${docColor}1f`, color: docColor }}
          title={provenance ?? ""}
        >
          {idLabel}
        </span>
        <span className="text-[10px] text-[var(--undp-gray)]">
          {t("linkCount", { count: row.totalRecords })}
        </span>
      </div>
      <div
        className="text-xs text-[var(--undp-black)] leading-snug"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {row.anchor.text}
      </div>
    </button>
  );
}

function CellBar({
  row,
  docType,
  maxCellTotal,
  countryConfig,
  onClick,
}: {
  row: AnchorRow;
  docType: string;
  maxCellTotal: number;
  countryConfig: CountryConfig | null;
  onClick: () => void;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const alignmentLabels = useAlignmentLabels();
  const cell = row.cells.get(docType);
  if (!cell || cell.total === 0) {
    return (
      <div className="flex flex-col items-stretch" aria-label={t("noAlignmentRecords")}>
        <div className="h-5 rounded border border-dashed border-gray-200 bg-gray-50/40" />
        <span className="text-[10px] text-gray-300 mt-0.5 text-center">—</span>
      </div>
    );
  }
  const fillPct = maxCellTotal > 0 ? (cell.total / maxCellTotal) * 100 : 0;
  const docTitle = getDocFullLabel(countryConfig, docType);

  // Sort segments best→worst left to right.
  const segments = (Object.keys(cell.byLevel) as AlignmentLevel[])
    .filter((l) => l !== "none" && (cell.byLevel[l] ?? 0) > 0)
    .sort((a, b) => alignmentLevelRank(b) - alignmentLevelRank(a));

  const breakdown = segments
    .map((l) => t("breakdownSegment", { count: cell.byLevel[l] ?? 0, level: alignmentLabels[l].toLowerCase() }))
    .join(", ");

  return (
    <button
      type="button"
      onClick={onClick}
      title={t("cellTitle", { doc: docTitle, count: cell.total, breakdown })}
      aria-label={t("cellAriaLabel", { doc: docTitle, count: cell.total, breakdown })}
      className="flex flex-col items-stretch hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/40 rounded"
    >
      <div className="relative h-5 bg-gray-100 rounded overflow-hidden border border-gray-200">
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{ width: `${fillPct}%` }}
        >
          {segments.map((level) => {
            const count = cell.byLevel[level] ?? 0;
            const segPct = (count / cell.total) * 100;
            return (
              <span
                key={level}
                style={{
                  width: `${segPct}%`,
                  backgroundColor: ALIGNMENT_COLORS[level],
                }}
              />
            );
          })}
        </div>
      </div>
      <span className="text-[10px] text-[var(--undp-gray)] mt-0.5 text-center">
        {cell.total}
      </span>
    </button>
  );
}

function StatusChip({ status }: { status: AnchorStatus | null }) {
  if (!status) return <div />;
  const tone = STATUS_TONE_CLASSES[status.tone];
  return (
    <span
      className={`inline-flex items-center text-[11px] font-medium rounded border px-2 py-1 self-center ${tone}`}
      title={status.description}
    >
      {status.label}
    </span>
  );
}

// ─── Loosely-connected panel ──────────────────────────────────────────────

function LoosePanel({
  looseTargets,
  countryConfig,
  anchorById,
  anchorDocLabel,
  onTargetClick,
}: {
  looseTargets: LooselyConnectedTarget[];
  countryConfig: CountryConfig | null;
  anchorById: Map<string, Target>;
  anchorDocLabel: string;
  onTargetClick: (id: string) => void;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const alignmentLabels = useAlignmentLabels();
  if (looseTargets.length === 0) {
    return (
      <div className="rounded-md border border-gray-100 bg-[var(--undp-light)] p-6 text-sm text-[var(--undp-gray)]">
        {t("looseEmpty", { anchor: anchorDocLabel })}
      </div>
    );
  }

  const byDoc = new Map<string, LooselyConnectedTarget[]>();
  for (const lt of looseTargets) {
    const list = byDoc.get(lt.target.sourceDocument) ?? [];
    list.push(lt);
    byDoc.set(lt.target.sourceDocument, list);
  }
  // Within each document, surface the truest outliers (no relationship at all,
  // then flagged-only, then low-only) at the top so the eye lands on the
  // actionable cases first.
  for (const list of byDoc.values()) {
    list.sort((a, b) => {
      const aRank = a.maxLevel ? alignmentLevelRank(a.maxLevel) : -1;
      const bRank = b.maxLevel ? alignmentLevelRank(b.maxLevel) : -1;
      return aRank - bRank;
    });
  }
  const docs = Array.from(byDoc.keys()).sort(
    (a, b) => getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
  );

  return (
    <div className="space-y-6">
      {docs.map((dt) => {
        const items = byDoc.get(dt) ?? [];
        const docColor = getDocColor(countryConfig, dt);
        return (
          <div key={dt}>
            <h3
              className="text-sm font-semibold mb-2 flex items-center gap-2"
              style={{ color: docColor }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: docColor }}
              />
              {getDocFullLabel(countryConfig, dt)}
              <span className="text-[var(--undp-gray)] font-normal">({items.length})</span>
            </h3>
            <ul className="space-y-3 pl-4">
              {items.map((lt) => {
                const idLabel = lt.target.sourceLabel || lt.target.id;
                const isOrphan = lt.maxLevel === "none" || lt.maxLevel == null;
                // For true orphans, "strongest" is whichever anchor happened
                // to come first in the alignment array — meaningless. Suppress
                // the link in that case.
                const strongest =
                  !isOrphan && lt.strongestAnchorId
                    ? anchorById.get(lt.strongestAnchorId) ?? null
                    : null;
                return (
                  <li
                    key={lt.target.id}
                    className="text-xs leading-relaxed border-l-2 pl-3"
                    style={{
                      borderColor: isOrphan
                        ? "#94a3b8"
                        : ALIGNMENT_COLORS[lt.maxLevel ?? "low"],
                    }}
                  >
                    <div className="flex items-baseline gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-[var(--undp-black)]">{idLabel}</span>
                      {isOrphan ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-gray-200 text-[var(--undp-black)]">
                          {t("noAnchorLink")}
                        </span>
                      ) : (
                        lt.maxLevel && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: `${ALIGNMENT_COLORS[lt.maxLevel]}33`,
                              color: ALIGNMENT_COLORS[lt.maxLevel],
                            }}
                          >
                            {t("strongestPrefix", { level: alignmentLabels[lt.maxLevel] })}
                          </span>
                        )
                      )}
                    </div>
                    <p
                      className="text-[var(--undp-black)] mb-1 leading-relaxed"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                      title={lt.target.text}
                    >
                      {lt.target.text}
                    </p>
                    <p className="text-[var(--undp-gray)]">
                      {isOrphan ? (
                        <>{t("orphanDescription")}</>
                      ) : (
                        <>
                          {lt.lowTensionCount > 0 && (
                            <>
                              {t("possibleMisalignmentLinks", { count: lt.lowTensionCount })}
                              {lt.lowCount > 0 ? " · " : ""}
                            </>
                          )}
                          {lt.lowCount > 0 && (
                            <>{t("lowAlignmentLinks", { count: lt.lowCount })}</>
                          )}
                          {strongest && (
                            <>
                              {" "}
                              {t.rich("strongestIsWith", {
                                link: (chunks) => (
                                  <button
                                    type="button"
                                    onClick={() => onTargetClick(strongest.id)}
                                    className="underline hover:text-[var(--undp-blue)]"
                                  >
                                    {chunks}
                                  </button>
                                ),
                                label: strongest.sourceLabel || strongest.id,
                              })}
                            </>
                          )}
                        </>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────

function CellDetailModal({
  row,
  docType,
  alignment,
  peripheralById,
  countryConfig,
  onClose,
  onTargetClick,
}: {
  row: AnchorRow;
  docType: string;
  alignment: AlignmentResult[];
  peripheralById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onClose: () => void;
  onTargetClick: (id: string) => void;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const cell = row.cells.get(docType);
  const records = useMemo(() => {
    if (!cell) return [] as AlignmentResult[];
    const peripheralIdSet = new Set(cell.peripheralIds);
    return alignment.filter((a) => {
      const isAnchorA = a.targetAId === row.anchor.id;
      const isAnchorB = a.targetBId === row.anchor.id;
      if (!isAnchorA && !isAnchorB) return false;
      const otherId = isAnchorA ? a.targetBId : a.targetAId;
      return peripheralIdSet.has(otherId);
    });
  }, [cell, alignment, row.anchor.id]);

  const docTitle = getDocFullLabel(countryConfig, docType);
  const docShort = getDocLabel(countryConfig, docType);
  const idLabel = row.anchor.sourceLabel || row.anchor.id;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("cellModalTitle", {
        id: idLabel,
        doc: docShort,
        count: records.length,
      })}
      maxWidth="max-w-2xl"
    >
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <p className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] font-semibold mb-1">
          {t("anchorAmbitionLabel")}
        </p>
        <p className="text-xs text-[var(--undp-black)] leading-relaxed">{row.anchor.text}</p>
      </div>
      <div className="px-5 py-4">
        <p className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] font-semibold mb-2">
          {t("operationalisationBy", { doc: docTitle })}
        </p>
        <RecordList
          records={records}
          anchorId={row.anchor.id}
          peripheralById={peripheralById}
          onTargetClick={onTargetClick}
        />
      </div>
    </Modal>
  );
}

function RowDetailModal({
  row,
  visibleDocTypes,
  alignment,
  peripheralById,
  countryConfig,
  onClose,
  onTargetClick,
}: {
  row: AnchorRow;
  visibleDocTypes: string[];
  alignment: AlignmentResult[];
  peripheralById: Map<string, Target>;
  countryConfig: CountryConfig | null;
  onClose: () => void;
  onTargetClick: (id: string) => void;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const recordsByDoc = useMemo(() => {
    const grouped = new Map<string, AlignmentResult[]>();
    for (const r of alignment) {
      const isAnchorA = r.targetAId === row.anchor.id;
      const isAnchorB = r.targetBId === row.anchor.id;
      if (!isAnchorA && !isAnchorB) continue;
      const otherId = isAnchorA ? r.targetBId : r.targetAId;
      const peripheral = peripheralById.get(otherId);
      if (!peripheral) continue;
      const list = grouped.get(peripheral.sourceDocument) ?? [];
      list.push(r);
      grouped.set(peripheral.sourceDocument, list);
    }
    return grouped;
  }, [alignment, peripheralById, row.anchor.id]);

  const docs = visibleDocTypes.filter((dt) => recordsByDoc.has(dt));
  const totalRecords = Array.from(recordsByDoc.values()).reduce((s, l) => s + l.length, 0);
  const idLabel = row.anchor.sourceLabel || row.anchor.id;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("rowModalTitle", { id: idLabel, count: totalRecords })}
      maxWidth="max-w-3xl"
    >
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
        <p className="text-[11px] uppercase tracking-wide text-[var(--undp-gray)] font-semibold mb-1">
          {t("anchorAmbitionLabel")}
        </p>
        <p className="text-xs text-[var(--undp-black)] leading-relaxed">{row.anchor.text}</p>
      </div>
      <div className="px-5 py-4 space-y-5">
        {docs.map((dt) => {
          const docColor = getDocColor(countryConfig, dt);
          const items = recordsByDoc.get(dt) ?? [];
          return (
            <div key={dt}>
              <h4
                className="text-xs font-semibold mb-2 flex items-center gap-2"
                style={{ color: docColor }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: docColor }}
                />
                {getDocFullLabel(countryConfig, dt)}
                <span className="text-[var(--undp-gray)] font-normal">
                  ({items.length})
                </span>
              </h4>
              <RecordList
                records={items}
                anchorId={row.anchor.id}
                peripheralById={peripheralById}
                onTargetClick={onTargetClick}
              />
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function RecordList({
  records,
  anchorId,
  peripheralById,
  onTargetClick,
}: {
  records: AlignmentResult[];
  anchorId: string;
  peripheralById: Map<string, Target>;
  onTargetClick: (id: string) => void;
}) {
  const t = useTranslations("viz.visionAnchorCoverage");
  const alignmentLabels = useAlignmentLabels();
  const sorted = useMemo(
    () =>
      [...records].sort(
        (a, b) => alignmentLevelRank(b.alignment) - alignmentLevelRank(a.alignment),
      ),
    [records],
  );
  if (sorted.length === 0) {
    return <p className="text-xs text-[var(--undp-gray)] italic">{t("noRecords")}</p>;
  }
  return (
    <ul className="space-y-3">
      {sorted.map((r) => {
        const otherId = r.targetAId === anchorId ? r.targetBId : r.targetAId;
        const peripheral = peripheralById.get(otherId);
        if (!peripheral) return null;
        return (
          <li
            key={`${r.targetAId}__${r.targetBId}`}
            className="border-l-2 pl-3"
            style={{ borderColor: ALIGNMENT_COLORS[r.alignment] }}
          >
            <div className="flex items-baseline gap-2 mb-1 flex-wrap">
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: `${ALIGNMENT_COLORS[r.alignment]}33`,
                  color: ALIGNMENT_COLORS[r.alignment],
                }}
              >
                {alignmentLabels[r.alignment]}
              </span>
              <button
                type="button"
                onClick={() => onTargetClick(peripheral.id)}
                className="text-xs font-semibold text-[var(--undp-black)] hover:text-[var(--undp-blue)]"
              >
                {peripheral.sourceLabel || peripheral.id}
              </button>
            </div>
            <p className="text-xs text-[var(--undp-black)] mb-1.5 leading-relaxed">
              {peripheral.text}
            </p>
            {r.description && (
              <p className="text-[11px] text-[var(--undp-gray)] leading-relaxed">
                <span className="font-semibold uppercase tracking-wide text-[10px]">
                  {t("aiRationale")}
                </span>{" "}
                <span className="italic">{r.description}</span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
