"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("upload.editor");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  return (
    <div className="mb-8 rounded-lg border-2 border-[var(--undp-blue)]/30 bg-blue-50/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-body font-semibold text-[var(--undp-black)]">
          {t("title", { docType })}
        </h3>
        <button
          type="button"
          onClick={onSave}
          className="px-3 py-1.5 text-body bg-[var(--undp-blue)] text-white rounded hover:bg-[var(--undp-blue-dark)] transition-colors"
        >
          {t("done")}
        </button>
      </div>
      <div className="space-y-2 max-h-[24rem] overflow-y-auto">
        {targets.map((tg, idx) => (
          <div
            key={`${tg.sourceDocument}-${tg.sourceLabel}-${idx}`}
            className="py-2 px-3 rounded border border-line bg-white"
          >
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={tg.sourceLabel}
                onChange={(e) => onUpdate(idx, { sourceLabel: e.target.value })}
                placeholder={t("labelPlaceholder")}
                className="w-28 shrink-0 px-2 py-1 text-body border border-line rounded focus:outline-none focus:border-[var(--undp-blue)]"
              />
              <textarea
                value={tg.text}
                onChange={(e) => onUpdate(idx, { text: e.target.value })}
                placeholder={t("targetPlaceholder")}
                rows={2}
                className="flex-1 min-w-0 px-2 py-1 text-body border border-line rounded resize-y focus:outline-none focus:border-[var(--undp-blue)]"
              />
              <button
                type="button"
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                className="shrink-0 w-6 h-6 flex items-center justify-center text-[var(--undp-gray)] hover:text-[var(--undp-blue)] rounded transition-colors text-caption"
                title={t("toggleDetails")}
              >
                {expandedIdx === idx ? "−" : "+"}
              </button>
              <button
                type="button"
                onClick={() => onRemove(idx)}
                className="shrink-0 w-6 h-6 flex items-center justify-center text-[var(--undp-gray)] hover:text-[var(--undp-red)] hover:bg-red-50 rounded"
              >
                &times;
              </button>
            </div>
            {expandedIdx === idx && (
              <div className="mt-2 pl-[7.5rem] space-y-1.5">
                <div>
                  <label className="text-caption font-medium text-[var(--undp-gray)]">
                    {t("activities")}
                  </label>
                  <textarea
                    value={tg.activities ?? ""}
                    onChange={(e) => onUpdate(idx, { activities: e.target.value || undefined })}
                    placeholder={t("activitiesPlaceholder")}
                    rows={2}
                    className="w-full px-2 py-1 text-body border border-line rounded resize-y focus:outline-none focus:border-[var(--undp-blue)]"
                  />
                </div>
                <div>
                  <label className="text-caption font-medium text-[var(--undp-gray)]">
                    {t("actions")}
                  </label>
                  <textarea
                    value={tg.actions ?? ""}
                    onChange={(e) => onUpdate(idx, { actions: e.target.value || undefined })}
                    placeholder={t("actionsPlaceholder")}
                    rows={2}
                    className="w-full px-2 py-1 text-body border border-line rounded resize-y focus:outline-none focus:border-[var(--undp-blue)]"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
