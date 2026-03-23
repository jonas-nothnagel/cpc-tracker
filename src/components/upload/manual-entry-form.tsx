"use client";

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
  const showCustomDocField = currentDoc === "SECTORAL" || currentDoc === "OTHER";

  return (
    <div className="bg-[var(--undp-light)] rounded-lg p-6 mb-6">
      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <div>
          <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
            Source Document
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
                {d.label}
              </option>
            ))}
          </select>
        </div>
        {showCustomDocField && (
          <div>
            <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
              Document Name
            </label>
            <input
              type="text"
              value={customDocName}
              onChange={(e) => onCustomDocNameChange(e.target.value)}
              placeholder={
                currentDoc === "SECTORAL"
                  ? "e.g. Transport Policy"
                  : "e.g. National Development Plan"
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
            Label (optional)
          </label>
          <input
            type="text"
            value={currentLabel}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="e.g. Biodiversity 1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)]"
          />
        </div>
      </div>
      <div className="mb-4">
        <label className="block text-xs font-medium text-[var(--undp-gray)] mb-1">
          Target Text
        </label>
        <textarea
          value={currentText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Paste or type the full target text..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-[var(--undp-blue)] resize-y"
        />
      </div>
      <button
        onClick={onAddTarget}
        disabled={!currentText.trim() || targetCount >= MAX_TARGETS}
        className="px-4 py-2 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        + Add Target
      </button>
      {targetCount >= MAX_TARGETS && (
        <span className="ml-3 text-xs text-[var(--undp-red)]">
          Maximum {MAX_TARGETS} targets reached
        </span>
      )}
    </div>
  );
}
