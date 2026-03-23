"use client";

import type { PolicyDocumentType } from "@/types";
import { DOCUMENT_TYPES } from "@/lib/upload-helpers";

interface DocumentUploadZoneProps {
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
}

const FILE_TYPE_CARDS = [
  { id: "policy" as const, title: "Policy document", subtitle: "PDF or DOCX — targets extracted automatically" },
  { id: "list" as const, title: "Target list", subtitle: "CSV or TSV with text, type, label columns" },
  { id: "btr" as const, title: "BTR Excel sheet", subtitle: "XLSX — emissions, mitigation, projections data" },
] as const;

export function DocumentUploadZone({
  uploadMode,
  onUploadModeChange,
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
}: DocumentUploadZoneProps) {
  const uploadModeAccept = uploadMode === "policy"
    ? ".pdf,.docx,.txt"
    : uploadMode === "list"
    ? ".csv,.tsv"
    : ".xlsx,.xls";

  return (
    <div className="space-y-4">
      {/* File type cards */}
      <div className="grid grid-cols-3 gap-3">
        {FILE_TYPE_CARDS.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => onUploadModeChange(card.id)}
            className={`text-left p-4 rounded-xl border-2 transition-all ${
              uploadMode === card.id
                ? "border-[var(--undp-blue)] bg-blue-50/40"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <p className={`text-sm font-semibold mb-0.5 ${uploadMode === card.id ? "text-[var(--undp-blue)]" : "text-[var(--undp-black)]"}`}>
              {card.title}
            </p>
            <p className="text-xs text-[var(--undp-gray)] leading-snug">
              {card.subtitle}
            </p>
          </button>
        ))}
      </div>

      {/* Policy doc type selector */}
      {uploadMode === "policy" && (
        <div className="flex items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
              Document type
            </label>
            <select
              value={extractDocType}
              onChange={(e) => onExtractDocTypeChange(e.target.value as PolicyDocumentType)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
            >
              {DOCUMENT_TYPES.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 max-w-[200px]">
            <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
              Label prefix <span className="font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={extractDocLabel}
              onChange={(e) => onExtractDocLabelChange(e.target.value)}
              placeholder="e.g. NDC Target, NBT"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-[var(--undp-blue)]"
            />
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={onDragOver}
        onDragLeave={() => onDragLeave()}
        onDrop={onFileDrop}
        onClick={() => !extracting && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all py-10 ${
          dragging
            ? "border-[var(--undp-blue)] bg-blue-50/50"
            : "border-gray-300 hover:border-gray-400 bg-white"
        } ${extracting ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={uploadModeAccept}
          multiple
          onChange={onFileInput}
          className="hidden"
        />
        <svg className="mx-auto mb-3 text-[var(--undp-gray)]" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p className="text-sm text-[var(--undp-black)] mb-0.5">
          Drag and drop your file{uploadMode === "policy" ? "s" : ""} here, or{" "}
          <span className="text-[var(--undp-blue)]">browse</span>
        </p>
        <p className="text-xs text-[var(--undp-gray)]">
          {uploadMode === "policy" && "PDF, DOCX accepted — multiple files supported"}
          {uploadMode === "list" && "CSV, TSV accepted"}
          {uploadMode === "btr" && "XLSX accepted"}
        </p>
      </div>

      {/* Extracting indicator */}
      {extracting && (
        <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200">
          <div className="w-5 h-5 border-2 border-[var(--undp-blue)] border-t-transparent rounded-full animate-spin shrink-0" />
          <div>
            <p className="text-sm text-[var(--undp-black)]">
              Extracting from <strong>{extractFileName}</strong>...
            </p>
            <p className="text-xs text-[var(--undp-gray)]">
              This may take 1–2 minutes depending on document length.
              {extractionQueueLength > 0 && ` ${extractionQueueLength} more file${extractionQueueLength !== 1 ? "s" : ""} queued.`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
