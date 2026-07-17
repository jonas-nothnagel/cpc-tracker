"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { chartDocKey, getDocColor, getDocFullLabel, getDocLabel } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import {
  TargetTextWithHighlights,
  ActivitiesActions,
  ActionTypeBadge,
} from "./target-text";
import type { CountryConfig, PolicyDocumentType, Target, ThematicClassification } from "@/types";

interface BarData {
  categoryId: string;
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}

interface ThemeBarChartProps {
  data: BarData[];
  title?: string;
  subtitle?: string;
  documentTypes: PolicyDocumentType[];
  targets: Target[];
  themeClassifications: ThematicClassification[];
  taxonomyType?: "globe" | "sector";
  countryConfig?: CountryConfig | null;
}

function getTargetsForTheme(
  themeId: string,
  targets: Target[],
  classifications: ThematicClassification[],
  taxonomyType: "globe" | "sector" = "sector",
  docType?: PolicyDocumentType,
): Target[] {
  const targetIds = new Set(
    classifications
      .filter(
        (c) =>
          c.categoryId === themeId &&
          c.isPrimary === true &&
          c.taxonomyType === taxonomyType
      )
      .map((c) => c.targetId)
  );
  // `docType` may be the synthetic "BTR_ADP" key when the chart splits BTR by
  // actionType — match against `chartDocKey(t)` so segment clicks resolve to
  // the same targets that were counted into that stack.
  return targets.filter(
    (t) => targetIds.has(t.id) && (!docType || chartDocKey(t) === docType)
  );
}

const MAX_Y_LABEL = 50;

function TruncatedYTick({ x, y, payload, onLabelClick }: { x?: number; y?: number; payload?: { value: string }; onLabelClick?: (name: string) => void }) {
  const label = payload?.value ?? "";
  const display = label.length > MAX_Y_LABEL ? label.slice(0, MAX_Y_LABEL - 1) + "…" : label;
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={(e) => { e.stopPropagation(); onLabelClick?.(label); }}
      style={{ cursor: onLabelClick ? "pointer" : "default" }}
    >
      <title>{label}</title>
      <text x={0} y={0} dy={4} textAnchor="end" fill="var(--undp-gray)" fontSize={12} className="hover:fill-[#0468b1]">
        {display}
      </text>
    </g>
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
  countryConfig,
}: ThemeBarChartProps) {
  const t = useTranslations("viz.themeBarChart");
  const [modal, setModal] = useState<{
    themeName: string;
    docType?: PolicyDocumentType;
    targets: Target[];
  } | null>(null);

  const chartData = data.map((d) => ({
    name: d.categoryName,
    categoryId: d.categoryId,
    // `?? 0` guards against the open `PolicyDocumentType` contract where
    // `byDocument[doc]` is undefined for doc types absent from this category.
    ...Object.fromEntries(
      documentTypes.map((doc) => [doc, d.byDocument[doc] ?? 0])
    ),
    total: d.total,
  }));

  const handleSegmentClick = (
    data: { name?: string; categoryId?: string },
    docType: PolicyDocumentType
  ) => {
    if (!data?.categoryId || !data?.name) return;
    const segmentTargets = getTargetsForTheme(
      data.categoryId,
      targets,
      themeClassifications,
      taxonomyType,
      docType,
    );
    if (segmentTargets.length > 0) {
      setModal({
        themeName: data.name,
        docType,
        targets: segmentTargets,
      });
    }
  };

  const handleLabelClick = (categoryName: string) => {
    const row = data.find((d) => d.categoryName === categoryName);
    if (!row) return;
    const allTargets = getTargetsForTheme(
      row.categoryId,
      targets,
      themeClassifications,
      taxonomyType,
    );
    if (allTargets.length > 0) {
      setModal({ themeName: categoryName, targets: allTargets });
    }
  };

  // When the chart splits BTR into mitigation + adaptation stacks (BTR_ADP
  // present in documentTypes), relabel the "BTR" stack as "BTR Mitigation" so
  // the legend reads parallel ("BTR Mitigation" / "BTR Adaptation") instead of
  // the asymmetric default ("BTR Action" / "BTR Adaptation"). The global "BTR"
  // → "BTR Action" label is preserved for badges and other contexts.
  const hasBtrSplit =
    documentTypes.includes("BTR" as PolicyDocumentType) &&
    documentTypes.includes("BTR_ADP" as PolicyDocumentType);
  const legendLabel = (doc: PolicyDocumentType): string =>
    hasBtrSplit && doc === "BTR" ? t("btrMitigation") : getDocLabel(countryConfig, doc);

  return (
    <div>
      {title && (
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-[var(--undp-black)] mb-1">
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm text-[var(--undp-gray)]">{subtitle}</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-xs mb-4">
        {documentTypes.map((doc) => (
          <div key={doc} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: getDocColor(countryConfig, doc) }}
            />
            <span className="text-[var(--undp-gray)]" title={getDocFullLabel(countryConfig, doc)}>
              {legendLabel(doc)}
            </span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={data.length * 48 + 48}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 40, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "var(--undp-gray)" }} />
          <YAxis
            dataKey="name"
            type="category"
            tick={<TruncatedYTick onLabelClick={handleLabelClick} />}
            width={280}
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
              typeof name === "string" ? legendLabel(name as PolicyDocumentType) : (name ?? ""),
            ]}
          />
          {documentTypes.map((doc) => (
            <Bar
              key={doc}
              dataKey={doc}
              stackId="stack"
              fill={getDocColor(countryConfig, doc)}
              onClick={(data) => handleSegmentClick(data, doc)}
              style={{ cursor: "pointer" }}
              activeBar={{ stroke: "none", fillOpacity: 0.75 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal ? `${modal.themeName}${modal.docType ? `, ${legendLabel(modal.docType)}` : ""} (${modal.targets.length})` : ""}
        maxWidth="max-w-xl"
      >
        {modal && (
          <ul className="divide-y divide-gray-50 px-5 py-2">
            {modal.targets.map((t) => (
              <li key={t.id} className="py-3.5">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold text-white leading-none"
                    style={{ backgroundColor: getDocColor(countryConfig, t.sourceDocument) }}
                    title={getDocFullLabel(countryConfig, t.sourceDocument)}
                  >
                    {getDocLabel(countryConfig, t.sourceDocument)}
                  </span>
                  <ActionTypeBadge actionType={t.actionType} />
                  <span className="text-xs font-medium text-[var(--undp-black)]">
                    {t.sourceLabel}
                  </span>
                </div>
                <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                  <TargetTextWithHighlights target={t} />
                </p>
                <ActivitiesActions target={t} />
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}

