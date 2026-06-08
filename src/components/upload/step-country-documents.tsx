"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { PolicyDocumentType } from "@/types";
import type { UploadedDoc } from "@/lib/upload-helpers";
import type { ExtractedItem } from "@/lib/upload-helpers";
import { DOCUMENT_TYPES } from "@/lib/upload-helpers";
import { listVisibleCountries, normaliseCountry } from "@/config/countries";
import { ExtractReviewPanel } from "./extract-review-panel";
import { ManualEntryForm } from "./manual-entry-form";
import { DocumentPipeline } from "./document-pipeline";

interface StepCountryDocumentsProps {
  country: string;
  onCountryChange: (value: string) => void;
  /** When true, the country field is read-only (standalone country routes). */
  countryLocked?: boolean;
  mode: "upload" | "manual";
  onModeChange: (mode: "upload" | "manual") => void;
  extractDocType: PolicyDocumentType;
  onExtractDocTypeChange: (type: PolicyDocumentType) => void;
  extractDocLabel: string;
  onExtractDocLabelChange: (label: string) => void;
  extracting: boolean;
  extractFileName: string;
  onFileDrop: (e: React.DragEvent) => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  dragging: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  extractionQueueLength: number;
  // Extraction review
  extractError: string | null;
  extractedItems: ExtractedItem[];
  onToggleItem: (idx: number) => void;
  onKeepAll: () => void;
  onRemoveAll: () => void;
  onUpdateItem: (idx: number, changes: Partial<ExtractedItem>) => void;
  onAddManual: () => void;
  onAcceptExtraction: () => void;
  onDiscardExtraction: () => void;
  manualLabel: string;
  onManualLabelChange: (value: string) => void;
  manualText: string;
  onManualTextChange: (value: string) => void;
  // Document pipeline
  uploadedDocs: UploadedDoc[];
  onRemoveDoc: (docId: string) => void;
  // Manual entry
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

export function StepCountryDocuments({
  country,
  onCountryChange,
  countryLocked,
  mode,
  onModeChange,
  extractDocType,
  onExtractDocTypeChange,
  extractDocLabel,
  onExtractDocLabelChange,
  extracting,
  extractFileName,
  onFileDrop,
  onFileInput,
  fileInputRef,
  dragging,
  onDragOver,
  onDragLeave,
  extractionQueueLength,
  extractError,
  extractedItems,
  onToggleItem,
  onKeepAll,
  onRemoveAll,
  onUpdateItem,
  onAddManual,
  onAcceptExtraction,
  onDiscardExtraction,
  manualLabel,
  onManualLabelChange,
  manualText,
  onManualTextChange,
  uploadedDocs,
  onRemoveDoc,
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
}: StepCountryDocumentsProps) {
  const t = useTranslations("upload.step1");
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const visibleCountries = listVisibleCountries();
  const normalisedInput = normaliseCountry(country);
  const knownCountry = visibleCountries.find(
    (c) => normaliseCountry(c.name) === normalisedInput
  );

  // Modal state for extraction review
  const showExtractionModal = extractedItems.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const needsCustomName = extractDocType === "SECTORAL" || extractDocType === "OTHER";

  return (
    <div>
      {/* Compact intro */}
      <p className="text-sm text-[var(--undp-gray)] mb-6">
        {t("intro")}
      </p>

      {/* Country + doc type — inline row */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="sm:w-52 flex-shrink-0" ref={dropdownRef}>
          <label className="block text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-1.5">
            {t("countryLabel")}
          </label>
          {countryLocked ? (
            <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-[var(--undp-black)]">
              {country}
            </div>
          ) : (
          <div className="relative">
            <input
              type="text"
              value={country}
              onChange={(e) => { onCountryChange(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder={t("countryPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)] focus:ring-1 focus:ring-[var(--undp-blue)] pr-8"
            />
            <button type="button" onClick={() => setShowDropdown(!showDropdown)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {visibleCountries
                  .filter(
                    (c) =>
                      !country ||
                      normaliseCountry(c.name).includes(normalisedInput)
                  )
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onCountryChange(c.name);
                        setShowDropdown(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.has.coherence && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          {t("referenceBadge")}
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            )}
          </div>
          )}
          {knownCountry && knownCountry.has.coherence && (
            <p className="mt-1 text-[10px] text-emerald-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {t("referenceNext")}
            </p>
          )}
        </div>

        <div className="sm:w-44 flex-shrink-0">
          <label className="block text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-1.5">
            {t("docTypeLabel")}
          </label>
          <select
            value={extractDocType}
            onChange={(e) => onExtractDocTypeChange(e.target.value as PolicyDocumentType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)] bg-white"
          >
            {DOCUMENT_TYPES.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>

        {needsCustomName && (
          <div className="sm:w-44 flex-shrink-0">
            <label className="block text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-1.5">
              {t("labelPrefixLabel")}
            </label>
            <input
              type="text"
              value={extractDocLabel}
              onChange={(e) => onExtractDocLabelChange(e.target.value)}
              placeholder={t("labelPrefixPlaceholder")}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
            />
          </div>
        )}
      </div>

      {/* Unified drop zone — one zone for all file types */}
      <div
        onDrop={onFileDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-4 ${
          dragging
            ? "border-[var(--undp-blue)] bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        {extracting ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-[var(--undp-blue)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--undp-blue)] font-medium">
              {t("extractingFrom", { name: extractFileName })}
            </p>
            {extractionQueueLength > 0 && (
              <p className="text-xs text-[var(--undp-gray)]">
                {t("queueRemaining", { count: extractionQueueLength })}
              </p>
            )}
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-[var(--undp-black)]">
              {t("dropPrompt")}{" "}
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[var(--undp-blue)] underline">
                {t("browse")}
              </button>
            </p>
            <p className="text-xs text-[var(--undp-gray)] mt-1">
              {t("supportedFormats")}
            </p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.csv,.tsv,.xlsx,.xls"
          onChange={onFileInput}
          className="hidden"
        />
      </div>

      {/* Error */}
      {extractError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-700">{extractError}</p>
        </div>
      )}

      {/* Document pipeline (parsed files status) */}
      <DocumentPipeline uploadedDocs={uploadedDocs} onRemoveDoc={onRemoveDoc} />

      {/* Manual entry toggle */}
      <div className="mt-4 mb-4">
        <button
          type="button"
          onClick={() => onModeChange(mode === "manual" ? "upload" : "manual")}
          className="text-xs text-[var(--undp-blue)] hover:underline font-medium"
        >
          {mode === "manual" ? t("hideManual") : t("showManual")}
        </button>
      </div>

      {mode === "manual" && (
        <div className="p-4 border border-blue-200 rounded-xl bg-blue-50/30 mb-4">
          <ManualEntryForm
            currentDoc={currentDoc}
            onDocChange={onDocChange}
            currentText={currentText}
            onTextChange={onTextChange}
            currentLabel={currentLabel}
            onLabelChange={onLabelChange}
            customDocName={customDocName}
            onCustomDocNameChange={onCustomDocNameChange}
            onAddTarget={onAddTarget}
            targetCount={targetCount}
          />
        </div>
      )}

      {/* Status bar */}
      {targetCount > 0 && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-emerald-700">{targetCount}</span>
          </div>
          <p className="text-sm text-emerald-700">
            {t.rich("targetsAddedHint", {
              count: targetCount,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}

      {/* ── Extraction Review Modal ── */}
      {showExtractionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h3 className="text-base font-semibold text-[var(--undp-black)]">
                  {t("reviewModal.title")}
                </h3>
                <p className="text-xs text-[var(--undp-gray)]">
                  {t("reviewModal.subtitle", {
                    selected: extractedItems.filter((i) => i.accepted).length,
                    total: extractedItems.length,
                    file: extractFileName,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={onDiscardExtraction}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <ExtractReviewPanel
                items={extractedItems}
                fileName={extractFileName}
                onToggleItem={onToggleItem}
                onKeepAll={onKeepAll}
                onRemoveAll={onRemoveAll}
                onUpdateItem={onUpdateItem}
                onAddManual={onAddManual}
                onAccept={onAcceptExtraction}
                onDiscard={onDiscardExtraction}
                manualLabel={manualLabel}
                onManualLabelChange={onManualLabelChange}
                manualText={manualText}
                onManualTextChange={onManualTextChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
