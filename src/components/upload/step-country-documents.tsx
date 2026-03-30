"use client";

import { useState, useRef, useEffect } from "react";
import type { PolicyDocumentType } from "@/types";
import type { UploadedDoc } from "@/lib/upload-helpers";
import type { ExtractedItem } from "@/lib/upload-helpers";
import { DOCUMENT_TYPES } from "@/lib/upload-helpers";
import { ExtractReviewPanel } from "./extract-review-panel";
import { ManualEntryForm } from "./manual-entry-form";
import { DocumentPipeline } from "./document-pipeline";

const KNOWN_COUNTRIES = [
  { value: "Mongolia", hasTargets: true, hasBtr: true, hasNr7: true },
];

interface StepCountryDocumentsProps {
  country: string;
  onCountryChange: (value: string) => void;
  mode: "upload" | "manual";
  onModeChange: (mode: "upload" | "manual") => void;
  // Upload — unified
  uploadMode: "policy" | "list" | "btr";
  onUploadModeChange: (mode: "policy" | "list" | "btr") => void;
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

export function StepCountryDocuments(props: StepCountryDocumentsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const knownCountry = KNOWN_COUNTRIES.find(
    (c) => c.value.toLowerCase() === props.country.toLowerCase()
  );

  // Modal state for extraction review
  const showExtractionModal = props.extractedItems.length > 0;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const needsCustomName = props.extractDocType === "SECTORAL" || props.extractDocType === "OTHER";

  return (
    <div>
      {/* Compact intro */}
      <p className="text-sm text-[var(--undp-gray)] mb-6">
        Select your country and upload policy documents. All common formats are accepted — the system will auto-detect how to process each file.
      </p>

      {/* Country + doc type — inline row */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="sm:w-52 flex-shrink-0" ref={dropdownRef}>
          <label className="block text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-1.5">
            Country
          </label>
          <div className="relative">
            <input
              type="text"
              value={props.country}
              onChange={(e) => { props.onCountryChange(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="e.g. Mongolia"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)] focus:ring-1 focus:ring-[var(--undp-blue)] pr-8"
            />
            <button type="button" onClick={() => setShowDropdown(!showDropdown)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showDropdown && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                {KNOWN_COUNTRIES.filter((c) => !props.country || c.value.toLowerCase().includes(props.country.toLowerCase())).map((c) => (
                  <button key={c.value} type="button" onClick={() => { props.onCountryChange(c.value); setShowDropdown(false); }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50 flex items-center justify-between">
                    <span className="font-medium">{c.value}</span>
                    <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Reference data</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {knownCountry && (
            <p className="mt-1 text-[10px] text-emerald-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Reference data in next step
            </p>
          )}
        </div>

        <div className="sm:w-44 flex-shrink-0">
          <label className="block text-xs font-semibold text-[var(--undp-gray)] uppercase tracking-wider mb-1.5">
            Document type
          </label>
          <select
            value={props.extractDocType}
            onChange={(e) => props.onExtractDocTypeChange(e.target.value as PolicyDocumentType)}
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
              Label prefix
            </label>
            <input
              type="text"
              value={props.extractDocLabel}
              onChange={(e) => props.onExtractDocLabelChange(e.target.value)}
              placeholder="e.g. Transport Policy"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
            />
          </div>
        )}
      </div>

      {/* Unified drop zone — one zone for all file types */}
      <div
        onDrop={props.onFileDrop}
        onDragOver={props.onDragOver}
        onDragLeave={props.onDragLeave}
        className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-4 ${
          props.dragging
            ? "border-[var(--undp-blue)] bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        }`}
      >
        {props.extracting ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-[var(--undp-blue)] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--undp-blue)] font-medium">
              Extracting targets from {props.extractFileName}...
            </p>
            {props.extractionQueueLength > 0 && (
              <p className="text-xs text-[var(--undp-gray)]">
                {props.extractionQueueLength} more file{props.extractionQueueLength > 1 ? "s" : ""} queued
              </p>
            )}
          </div>
        ) : (
          <>
            <svg className="w-8 h-8 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-[var(--undp-black)]">
              Drag and drop files here, or{" "}
              <button type="button" onClick={() => props.fileInputRef.current?.click()} className="text-[var(--undp-blue)] underline">
                browse
              </button>
            </p>
            <p className="text-xs text-[var(--undp-gray)] mt-1">
              PDF, DOCX, CSV, TSV, XLSX — all formats auto-detected
            </p>
          </>
        )}
        <input
          ref={props.fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.csv,.tsv,.xlsx,.xls"
          onChange={props.onFileInput}
          className="hidden"
        />
      </div>

      {/* Error */}
      {props.extractError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-700">{props.extractError}</p>
        </div>
      )}

      {/* Document pipeline (parsed files status) */}
      <DocumentPipeline uploadedDocs={props.uploadedDocs} onRemoveDoc={props.onRemoveDoc} />

      {/* Manual entry toggle */}
      <div className="mt-4 mb-4">
        <button
          type="button"
          onClick={() => props.onModeChange(props.mode === "manual" ? "upload" : "manual")}
          className="text-xs text-[var(--undp-blue)] hover:underline font-medium"
        >
          {props.mode === "manual" ? "Hide manual entry" : "+ Add targets manually"}
        </button>
      </div>

      {props.mode === "manual" && (
        <div className="p-4 border border-blue-200 rounded-xl bg-blue-50/30 mb-4">
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
            targetCount={props.targetCount}
          />
        </div>
      )}

      {/* Status bar */}
      {props.targetCount > 0 && (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-emerald-700">{props.targetCount}</span>
          </div>
          <p className="text-sm text-emerald-700">
            target{props.targetCount !== 1 ? "s" : ""} added — click <strong>Next</strong> to continue
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
                  Review Extracted Targets
                </h3>
                <p className="text-xs text-[var(--undp-gray)]">
                  {props.extractedItems.filter((i) => i.accepted).length} of {props.extractedItems.length} targets selected from {props.extractFileName}
                </p>
              </div>
              <button
                type="button"
                onClick={props.onDiscardExtraction}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5">
              <ExtractReviewPanel
                items={props.extractedItems}
                fileName={props.extractFileName}
                onToggleItem={props.onToggleItem}
                onKeepAll={props.onKeepAll}
                onRemoveAll={props.onRemoveAll}
                onUpdateItem={props.onUpdateItem}
                onAddManual={props.onAddManual}
                onAccept={props.onAcceptExtraction}
                onDiscard={props.onDiscardExtraction}
                manualLabel={props.manualLabel}
                onManualLabelChange={props.onManualLabelChange}
                manualText={props.manualText}
                onManualTextChange={props.onManualTextChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
