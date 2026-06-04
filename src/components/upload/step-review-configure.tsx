"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { PolicyDocumentType } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";
import type { ExtractedItem } from "@/lib/upload-helpers";
import type { TaxonomyGroup } from "@/hooks/useCategories";
import { getDocColor } from "@/lib/utils";
import { ManualTargetEditor } from "./manual-target-editor";
import { ManualEntryForm } from "./manual-entry-form";
import { CategoryConfig } from "./category-config";

interface StepReviewConfigureProps {
  targets: TargetRow[];
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
  editingManualTargets: {
    docType: PolicyDocumentType;
    targets: TargetRow[];
  } | null;
  onUpdate: (idx: number, updates: Partial<TargetRow>) => void;
  onRemoveFromEditing: (idx: number) => void;
  onSaveEdits: () => void;
  currentDoc: PolicyDocumentType;
  onDocChange: (doc: PolicyDocumentType) => void;
  currentText: string;
  onTextChange: (text: string) => void;
  currentLabel: string;
  onLabelChange: (label: string) => void;
  customDocName: string;
  onCustomDocNameChange: (name: string) => void;
  onAddTarget: () => void;
  // Categories — groups-based
  groups: TaxonomyGroup[];
  showCategories: boolean;
  onToggleShowCategories: () => void;
  toggleCategory: (groupId: string, itemId: string) => void;
  removeCategory: (groupId: string, itemId: string) => void;
  toggleAllInGroup: (groupId: string, enable: boolean) => void;
  addingTo: string | null;
  onSetAddingTo: (v: string | null) => void;
  newCatName: string;
  onNewCatNameChange: (v: string) => void;
  newCatDesc: string;
  onNewCatDescChange: (v: string) => void;
  onAddCustomCategory: () => void;
  onAddGroup: (name: string, description: string) => void;
  onRemoveGroup: (groupId: string) => void;
}

export function StepReviewConfigure(props: StepReviewConfigureProps) {
  const t = useTranslations("upload.step3");
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<PolicyDocumentType | null>(null);

  // Summary from groups
  const categorySummary = props.groups
    .map((g) => {
      const active = g.items.filter((c) => c.enabled).length;
      return `${active} ${g.name.split(" ")[0]}`;
    })
    .join("  ·  ");

  return (
    <div>
      {/* Step header */}
      <div className="mb-8 p-5 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-100">
        <h2 className="text-lg font-semibold text-[var(--undp-black)] mb-1.5">
          {t("title")}
        </h2>
        <p className="text-sm text-[var(--undp-gray)] leading-relaxed max-w-2xl">
          {t("subtitle")}
        </p>
      </div>

      {/* ── CATEGORIES (shown first) ── */}
      <div className="mb-8">
        <h3 className="text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-1">
          {t("categoriesHeading")}
        </h3>
        <p className="text-xs text-[var(--undp-gray)] mb-3">
          {categorySummary}
        </p>

        <CategoryConfig
          groups={props.groups}
          showCategories={props.showCategories}
          onToggleShow={props.onToggleShowCategories}
          toggleCategory={props.toggleCategory}
          removeCategory={props.removeCategory}
          toggleAllInGroup={props.toggleAllInGroup}
          addingTo={props.addingTo}
          onSetAddingTo={props.onSetAddingTo}
          newCatName={props.newCatName}
          onNewCatNameChange={props.onNewCatNameChange}
          newCatDesc={props.newCatDesc}
          onNewCatDescChange={props.onNewCatDescChange}
          onAddCustomCategory={props.onAddCustomCategory}
          onAddGroup={props.onAddGroup}
          onRemoveGroup={props.onRemoveGroup}
        />
      </div>

      {/* ── TARGETS ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider flex items-center gap-2">
            {t("targetsHeading")}
            {props.targets.length > 0 && (
              <span className="px-2 py-0.5 bg-[var(--undp-blue)] text-white rounded-full text-[10px] font-bold">
                {props.targets.length}
              </span>
            )}
          </h3>
          <button type="button" onClick={() => setShowManualAdd(!showManualAdd)}
            className="text-xs text-[var(--undp-blue)] hover:underline font-medium">
            {showManualAdd ? t("hideManual") : t("addTarget")}
          </button>
        </div>

        {props.editingManualTargets && (
          <ManualTargetEditor
            docType={props.editingManualTargets.docType}
            targets={props.editingManualTargets.targets}
            onUpdate={props.onUpdate}
            onRemove={props.onRemoveFromEditing}
            onSave={props.onSaveEdits}
          />
        )}

        {props.targets.length > 0 && (
          <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {props.targetsByDocument.map(({ docType, targets: docTargets }) => (
              <div key={docType}>
                <button type="button"
                  onClick={() => setExpandedDoc(expandedDoc === docType ? null : docType)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: getDocColor(null, docType) }} />
                  <span className="text-sm font-medium text-[var(--undp-black)]">{docType}</span>
                  <span className="text-sm text-[var(--undp-gray)] ml-auto tabular-nums">
                    {t("targetCount", { count: docTargets.length })}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${expandedDoc === docType ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedDoc === docType && (
                  <div className="border-t border-gray-100 bg-gray-50/50 max-h-64 overflow-y-auto">
                    {docTargets.map(({ t: tg, idx }) => (
                      <div key={idx} className="px-4 py-2.5 flex items-start gap-3 border-b border-gray-100 last:border-0 group">
                        <span className="text-[10px] font-medium text-[var(--undp-gray)] bg-gray-200 rounded px-1.5 py-0.5 mt-0.5 flex-shrink-0">
                          {tg.sourceLabel}
                        </span>
                        <p className="text-xs text-[var(--undp-black)] leading-relaxed flex-1 min-w-0">{tg.text}</p>
                        <button type="button" onClick={() => props.onRemoveTarget(idx)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" title={t("removeTarget")}>
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {props.targets.length === 0 && !props.editingManualTargets && (
          <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-[var(--undp-gray)]">{t("noTargets")}</p>
            <p className="text-xs text-gray-400 mt-0.5">{t("noTargetsHint")}</p>
          </div>
        )}

        {showManualAdd && (
          <div className="mt-3 p-4 border border-blue-200 rounded-xl bg-blue-50/30">
            <ManualEntryForm
              currentDoc={props.currentDoc}
              onDocChange={props.onDocChange}
              currentText={props.currentText}
              onTextChange={props.onTextChange}
              currentLabel={props.currentLabel}
              onLabelChange={props.onLabelChange}
              customDocName={props.customDocName}
              onCustomDocNameChange={props.onCustomDocNameChange}
              onAddTarget={props.onAddTarget}
              targetCount={props.targets.length}
            />
          </div>
        )}
      </div>
    </div>
  );
}
