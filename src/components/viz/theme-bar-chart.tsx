"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import { TargetTextWithHighlights } from "./target-text";
import type { PolicyDocumentType, Target, ThematicClassification } from "@/types";

interface BarData {
  categoryId: string;
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}

interface ThemeBarChartProps {
  data: BarData[];
  title: string;
  subtitle?: string;
  documentTypes: PolicyDocumentType[];
  targets: Target[];
  themeClassifications: ThematicClassification[];
  taxonomyType?: "theme" | "sector";
}

function getTargetsForThemeAndDoc(
  themeId: string,
  docType: PolicyDocumentType,
  targets: Target[],
  classifications: ThematicClassification[],
  taxonomyType: "theme" | "sector" = "sector",
): Target[] {
  const targetIds = new Set(
    classifications
      .filter(
        (c) =>
          c.categoryId === themeId &&
          c.isRelevant &&
          c.taxonomyType === taxonomyType
      )
      .map((c) => c.targetId)
  );
  return targets.filter(
    (t) => targetIds.has(t.id) && t.sourceDocument === docType
  );
}

/**
 * Interactive horizontal stacked bar chart using Recharts.
 * Theme names on Y-axis. Click a segment to see which targets it represents.
 */
export function ThemeBarChart({
  data,
  title,
  subtitle,
  documentTypes,
  targets,
  themeClassifications,
  taxonomyType = "sector",
}: ThemeBarChartProps) {
  const [modal, setModal] = useState<{
    themeName: string;
    docType: PolicyDocumentType;
    targets: Target[];
  } | null>(null);

  const chartData = data.map((d) => ({
    name: d.categoryName,
    categoryId: d.categoryId,
    ...Object.fromEntries(
      documentTypes.map((doc) => [doc, d.byDocument[doc]])
    ),
    total: d.total,
  }));

  const handleSegmentClick = (
    data: { name?: string; categoryId?: string },
    docType: PolicyDocumentType
  ) => {
    if (!data?.categoryId || !data?.name) return;
    const segmentTargets = getTargetsForThemeAndDoc(
      data.categoryId,
      docType,
      targets,
      themeClassifications,
      taxonomyType,
    );
    if (segmentTargets.length > 0) {
      setModal({
        themeName: data.name,
        docType,
        targets: segmentTargets,
      });
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--undp-black)] mb-1">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-[var(--undp-gray)]">{subtitle}</p>
          )}
        </div>
        {/* Legend placed outside chart to avoid overlap */}
        <div className="flex flex-wrap gap-4 text-xs">
          {documentTypes.map((doc) => (
            <div key={doc} className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-sm inline-block"
                style={{ backgroundColor: DOC_COLORS[doc] }}
              />
              <span className="text-[var(--undp-gray)]">
                {DOC_LABELS[doc] ?? doc}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={data.length * 40 + 40}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 40, left: 200, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#64748b" }} />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 12, fill: "#64748b" }}
            width={190}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
            formatter={(value, name) => [
              value ?? 0,
              DOC_LABELS[name as PolicyDocumentType] ?? name ?? "",
            ]}
          />
          {documentTypes.map((doc) => (
            <Bar
              key={doc}
              dataKey={doc}
              stackId="stack"
              fill={DOC_COLORS[doc]}
              onClick={(data) => handleSegmentClick(data, doc)}
              style={{ cursor: "pointer" }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Modal: targets for theme + document type */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-medium text-[var(--undp-black)]">
                {modal.themeName} — {DOC_LABELS[modal.docType]} ({modal.targets.length})
              </h3>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-xl leading-none"
              >
                x
              </button>
            </div>
            <div className="overflow-auto flex-1 px-6 py-4">
              <p className="text-xs text-[var(--undp-gray)] mb-3">
                {DOC_LABELS[modal.docType]} targets classified under this category
              </p>
              <ul className="space-y-3">
                {modal.targets.map((t) => (
                  <li
                    key={t.id}
                    className="flex gap-3 text-sm py-2 border-b border-gray-50 last:border-0"
                  >
                    <span
                      className="shrink-0 inline-block px-2 py-0.5 rounded text-xs font-medium text-white"
                      style={{ backgroundColor: DOC_COLORS[t.sourceDocument] }}
                    >
                      {DOC_LABELS[t.sourceDocument]} {t.sourceLabel}
                    </span>
                    <span className="text-[var(--undp-black)] leading-relaxed">
                      <TargetTextWithHighlights target={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

