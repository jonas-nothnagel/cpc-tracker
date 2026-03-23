"use client";

import type { TargetRow } from "@/lib/csv-parser";

interface ManualTargetEditorProps {
  docType: string;
  targets: TargetRow[];
  onUpdate: (idx: number, updates: Partial<TargetRow>) => void;
  onRemove: (idx: number) => void;
  onSave: () => void;
}

export function ManualTargetEditor({
  docType,
  targets,
  onUpdate,
  onRemove,
  onSave,
}: ManualTargetEditorProps) {
  return (
    <div className="mb-8 rounded-lg border-2 border-[var(--undp-blue)]/30 bg-blue-50/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--undp-black)]">
          Edit manual targets — {docType}
        </h3>
        <button
          type="button"
          onClick={onSave}
          className="px-3 py-1.5 text-sm bg-[var(--undp-blue)] text-white rounded hover:bg-[var(--undp-blue-dark)] transition-colors"
        >
          Done
        </button>
      </div>
      <div className="space-y-2 max-h-[16rem] overflow-y-auto">
        {targets.map((t, idx) => (
          <div
            key={`${t.sourceDocument}-${t.sourceLabel}-${idx}`}
            className="flex items-center gap-2 py-2 px-3 rounded border border-gray-200 bg-white"
          >
            <input
              type="text"
              value={t.sourceLabel}
              onChange={(e) => onUpdate(idx, { sourceLabel: e.target.value })}
              placeholder="Label"
              className="w-28 shrink-0 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:border-[var(--undp-blue)]"
            />
            <textarea
              value={t.text}
              onChange={(e) => onUpdate(idx, { text: e.target.value })}
              placeholder="Target text..."
              rows={2}
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-200 rounded resize-y focus:outline-none focus:border-[var(--undp-blue)]"
            />
            <button
              type="button"
              onClick={() => onRemove(idx)}
              className="shrink-0 w-6 h-6 flex items-center justify-center text-[var(--undp-gray)] hover:text-[var(--undp-red)] hover:bg-red-50 rounded"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
