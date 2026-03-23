"use client";

import type { ExtractedItem } from "@/lib/upload-helpers";

interface ExtractReviewPanelProps {
  items: ExtractedItem[];
  fileName: string;
  onToggleItem: (idx: number) => void;
  onKeepAll: () => void;
  onRemoveAll: () => void;
  onUpdateItem: (idx: number, changes: Partial<ExtractedItem>) => void;
  onAddManual: () => void;
  onAccept: () => void;
  onDiscard: () => void;
  manualLabel: string;
  onManualLabelChange: (value: string) => void;
  manualText: string;
  onManualTextChange: (value: string) => void;
}

export function ExtractReviewPanel({
  items,
  fileName,
  onToggleItem,
  onKeepAll,
  onRemoveAll,
  onUpdateItem,
  onAddManual,
  onAccept,
  onDiscard,
  manualLabel,
  onManualLabelChange,
  manualText,
  onManualTextChange,
}: ExtractReviewPanelProps) {
  const keptCount = items.filter((i) => i.accepted).length;

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[var(--undp-black)]">
            Review extracted targets
          </h3>
          <p className="text-xs text-[var(--undp-gray)] mt-0.5">
            {keptCount} of {items.length} kept · {fileName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onKeepAll}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-[var(--undp-black)]"
          >
            Keep all
          </button>
          <button
            type="button"
            onClick={onRemoveAll}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-[var(--undp-black)]"
          >
            Remove all
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="divide-y divide-gray-100">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-3 px-4 py-3 transition-colors ${
              item.accepted ? "hover:bg-gray-50/40" : "bg-gray-50/60"
            }`}
          >
            {/* Drag handle */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="shrink-0 mt-1 text-gray-300 cursor-grab select-none"
            >
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={item.label}
                  onChange={(e) => onUpdateItem(idx, { label: e.target.value })}
                  disabled={!item.accepted}
                  className={`flex-1 text-sm font-semibold bg-transparent border-0 px-0 py-0 focus:outline-none focus:ring-0 ${
                    item.accepted
                      ? "text-[var(--undp-black)]"
                      : "line-through text-gray-400"
                  }`}
                />
                {/* Page number badges */}
                {item.pageNumbers && item.pageNumbers.length > 0 && item.pageNumbers[0] !== 0 && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[var(--undp-gray)] font-medium">
                    p.{" "}
                    {item.pageNumbers.length <= 3
                      ? item.pageNumbers.join(", ")
                      : `${item.pageNumbers[0]}–${item.pageNumbers[item.pageNumbers.length - 1]}`}
                  </span>
                )}
              </div>
              <textarea
                value={item.text}
                onChange={(e) => onUpdateItem(idx, { text: e.target.value })}
                disabled={!item.accepted}
                rows={2}
                className={`mt-0.5 w-full text-sm bg-transparent border-0 px-0 py-0 resize-none focus:outline-none focus:ring-0 leading-snug ${
                  item.accepted
                    ? "text-[var(--undp-gray)]"
                    : "line-through text-gray-400"
                }`}
              />
              {/* Translation (if non-English) */}
              {item.text_eng && item.language && item.language !== "en" && (
                <p className="mt-1 text-xs text-blue-600/70 italic">
                  EN: {item.text_eng}
                </p>
              )}
            </div>

            {/* Status badge + toggle */}
            <div className="shrink-0 flex items-center gap-2 mt-0.5">
              {item.accepted ? (
                <>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    Keep
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleItem(idx)}
                    className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-300 text-green-600 transition-colors"
                    title="Remove"
                  >
                    &#10003;
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[10px] px-2 py-0.5 rounded-full text-red-500 font-medium">
                    Removed
                  </span>
                  <button
                    type="button"
                    onClick={() => onToggleItem(idx)}
                    className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:border-gray-300 text-gray-400 hover:text-[var(--undp-black)] transition-colors"
                    title="Restore"
                  >
                    &#8617;
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Manual add inline */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/40">
        <p className="text-xs font-medium text-[var(--undp-gray)] mb-2">
          Add a target that wasn&apos;t extracted
        </p>
        <textarea
          value={manualText}
          onChange={(e) => onManualTextChange(e.target.value)}
          placeholder="Target text..."
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onAddManual();
          }}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:border-[var(--undp-blue)] focus:ring-1 focus:ring-[var(--undp-blue)]"
        />
        <div className="flex items-center justify-between mt-2">
          <input
            type="text"
            value={manualLabel}
            onChange={(e) => onManualLabelChange(e.target.value)}
            placeholder="Label (optional)"
            className="w-44 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--undp-blue)]"
          />
          <button
            type="button"
            onClick={onAddManual}
            disabled={!manualText.trim()}
            className="px-3 py-1.5 text-sm bg-[var(--undp-blue)] text-white rounded-lg hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Add
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-200 bg-white flex items-center justify-between sticky bottom-0 rounded-b-xl">
        <p className="text-sm text-[var(--undp-gray)]">
          <strong className="text-[var(--undp-black)]">{keptCount}</strong>{" "}
          target{keptCount !== 1 ? "s" : ""} will be added to this analysis
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:border-gray-300 transition-colors text-[var(--undp-black)]"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={keptCount === 0}
            className="px-4 py-2 text-sm bg-[var(--undp-blue)] text-white rounded-lg hover:bg-[var(--undp-blue-dark)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add {keptCount} target{keptCount !== 1 ? "s" : ""} &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
