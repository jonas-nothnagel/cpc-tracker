"use client";

import { useState } from "react";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import type { Target, PolicyDocumentType } from "@/types";

interface TargetTableProps {
  targets: Target[];
}

/** Filterable table of targets, color-coded by source document. */
export function TargetTable({ targets }: TargetTableProps) {
  const [filter, setFilter] = useState<PolicyDocumentType | "ALL">("ALL");

  const documentTypes = [...new Set(targets.map((t) => t.sourceDocument))];
  const filtered =
    filter === "ALL" ? targets : targets.filter((t) => t.sourceDocument === filter);

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilter("ALL")}
          className={`px-3 py-1 rounded-full text-sm border transition-colors ${
            filter === "ALL"
              ? "bg-[var(--undp-black)] text-white border-transparent"
              : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
          }`}
        >
          All ({targets.length})
        </button>
        {documentTypes.map((doc) => {
          const count = targets.filter((t) => t.sourceDocument === doc).length;
          return (
            <button
              key={doc}
              onClick={() => setFilter(doc)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                filter === doc
                  ? "text-white border-transparent"
                  : "border-gray-300 text-[var(--undp-gray)] hover:border-gray-400"
              }`}
              style={
                filter === doc
                  ? { backgroundColor: DOC_COLORS[doc] }
                  : undefined
              }
            >
              {DOC_LABELS[doc]} ({count})
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="bg-[var(--undp-light)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/80 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium text-[var(--undp-gray)] w-36">
                Source
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-[var(--undp-gray)]">
                Target
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 align-top">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                    style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                  >
                    {t.sourceLabel}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[var(--undp-black)] leading-relaxed">
                  {t.text}
                  {t.isQuantitative && (
                    <span className="ml-2 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      Quantitative
                    </span>
                  )}
                  {t.isTimeBound && (
                    <span className="ml-1 text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                      Time-bound
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

