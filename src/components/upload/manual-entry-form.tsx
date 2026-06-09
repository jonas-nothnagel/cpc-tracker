"use client";

import { useTranslations } from "next-intl";
import type { PolicyDocumentType } from "@/types";
import { DOCUMENT_TYPES, MAX_TARGETS } from "@/lib/upload-helpers";

interface ManualEntryFormProps {
  currentDoc: PolicyDocumentType;
  onDocChange: (doc: PolicyDocumentType) => void;
  currentText: string;
  onTextChange: (text: string) => void;
  currentLabel: string;
  onLabelChange: (label: string) => void;
  customDocName: string;
  onCustomDocNameChange: (name: string) => void;
  onAddTarget: () => void;
  targetCount: number;
}

export function ManualEntryForm({
  currentDoc,
  onDocChange,
  currentText,
  onTextChange,
  currentLabel,
  onLabelChange,
  customDocName,
  onCustomDocNameChange,
  onAddTarget,
  targetCount,
}: ManualEntryFormProps) {
  const t = useTranslations("upload.manualForm");
  const td = useTranslations("upload.docTypes");
  const showCustomDocField = currentDoc === "SECTORAL" || currentDoc === "OTHER";

  return (
    <div className="bg-[var(--undp-light)] rounded-lg p-6 mb-6">
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
            {t("sourceDocument")}
          </label>
          <select
            value={currentDoc}
            onChange={(e) => {
              onDocChange(e.target.value as PolicyDocumentType);
              onCustomDocNameChange("");
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
          >
            {DOCUMENT_TYPES.map((d) => (
              <option key={d.value} value={d.value}>
                {td(d.value)}
              </option>
            ))}
          </select>
        </div>
        {showCustomDocField && (
          <div>
            <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
              {t("documentName")}
            </label>
            <input
              type="text"
              value={customDocName}
              onChange={(e) => onCustomDocNameChange(e.target.value)}
              placeholder={
                currentDoc === "SECTORAL"
                  ? t("placeholderSectoral")
                  : t("placeholderOther")
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
            {t("labelOptional")}
          </label>
          <input
            type="text"
            value={currentLabel}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder={t("labelPlaceholder")}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
          {t("targetText")}
        </label>
        <textarea
          value={currentText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={t("targetTextPlaceholder")}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)] resize-y"
        />
      </div>
      <button
        onClick={onAddTarget}
        disabled={!currentText.trim() || targetCount >= MAX_TARGETS}
        className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {t("addTarget")}
      </button>
      {targetCount >= MAX_TARGETS && (
        <span className="ml-3 text-xs text-[var(--undp-red)]">
          {t("maxReached", { max: MAX_TARGETS })}
        </span>
      )}
    </div>
  );
}
