"use client";

import type { PolicyDocumentType } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";
import type { ExtractedItem } from "@/lib/upload-helpers";
import { TARGETS_PREVIEW } from "@/lib/upload-helpers";
import { DOC_COLORS } from "@/lib/utils";

interface TargetsByDocumentProps {
  targetsByDocument: {
    docType: PolicyDocumentType;
    targets: { t: TargetRow; idx: number }[];
  }[];
  expandedGroups: Set<PolicyDocumentType>;
  onToggleExpand: (docType: PolicyDocumentType) => void;
  onRemoveTarget: (idx: number) => void;
  extractionBackup: {
    items: ExtractedItem[];
    fileName: string;
    docLabel: string;
    addedTargets: TargetRow[];
  } | null;
  onRestoreExtractionReview: () => void;
  onStartEditManualTargets: (docType: PolicyDocumentType) => void;
}

export function TargetsByDocument({
  targetsByDocument,
  expandedGroups,
  onToggleExpand,
  onRemoveTarget,
  extractionBackup,
  onRestoreExtractionReview,
  onStartEditManualTargets,
}: TargetsByDocumentProps) {
  return (
    <div className="space-y-5">
      {targetsByDocument.map(({ docType, targets: docTargets }) => {
        const extractionDocType = extractionBackup?.addedTargets[0]?.sourceDocument;
        const hasExtractionTargets =
          extractionBackup &&
          extractionDocType === docType &&
          docTargets.some(({ t }) =>
            extractionBackup.addedTargets.some(
              (a) => a.text === t.text && a.sourceLabel === t.sourceLabel
            )
          );
        const hasManualTargets = docTargets.some(({ t }) => t.source === "manual");
        const isExpanded = expandedGroups.has(docType);
        const visible = isExpanded ? docTargets : docTargets.slice(0, TARGETS_PREVIEW);
        const hidden = docTargets.length - TARGETS_PREVIEW;
        return (
          <div key={docType}>
            {/* Group header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block px-2 py-0.5 rounded text-xs font-semibold text-white"
                  style={{ backgroundColor: DOC_COLORS[docType] ?? "#a9b1b7" }}
                >
                  {docType}
                </span>
                <span className="text-sm text-[var(--undp-gray)]">
                  {docTargets.length} target{docTargets.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {hasExtractionTargets && (
                  <button type="button" onClick={onRestoreExtractionReview}
                    className="text-xs text-[var(--undp-blue)] hover:underline">
                    Edit extraction
                  </button>
                )}
                {hasManualTargets && (
                  <button type="button" onClick={() => onStartEditManualTargets(docType)}
                    className="text-xs text-[var(--undp-blue)] hover:underline">
                    Edit manually
                  </button>
                )}
              </div>
            </div>

            {/* Target rows */}
            <div className="space-y-1.5">
              {visible.map(({ t, idx }) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-gray-200 bg-white hover:border-gray-300 transition-colors group"
                >
                  <span
                    className="shrink-0 mt-0.5 px-2 py-0.5 rounded text-[10px] font-medium text-white max-w-[8rem] truncate"
                    style={{ backgroundColor: DOC_COLORS[t.sourceDocument] ?? "#a9b1b7" }}
                    title={t.sourceLabel}
                  >
                    {t.sourceLabel}
                  </span>
                  <p className="flex-1 min-w-0 text-sm text-[var(--undp-black)] leading-snug">
                    {t.text}
                  </p>
                  <button
                    onClick={() => onRemoveTarget(idx)}
                    className="shrink-0 mt-0.5 w-5 h-5 flex items-center justify-center text-gray-300 hover:text-[var(--undp-red)] rounded transition-colors text-sm leading-none opacity-0 group-hover:opacity-100"
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ))}

              {/* Show more / less */}
              {!isExpanded && hidden > 0 && (
                <button
                  type="button"
                  onClick={() => onToggleExpand(docType)}
                  className="w-full px-3 py-1.5 text-xs text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors text-left"
                >
                  + {hidden} more target{hidden !== 1 ? "s" : ""}
                </button>
              )}
              {isExpanded && docTargets.length > TARGETS_PREVIEW && (
                <button
                  type="button"
                  onClick={() => onToggleExpand(docType)}
                  className="w-full px-3 py-1.5 text-xs text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors text-left"
                >
                  Show less
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
