"use client";

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
import type { PolicyDocumentType } from "@/types";

interface BarData {
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}

interface NbsBarChartProps {
  data: BarData[];
  title: string;
  subtitle?: string;
  documentTypes: PolicyDocumentType[];
}

/**
 * Interactive horizontal stacked bar chart using Recharts.
 * Hoverable bars with tooltips showing per-document breakdown.
 */
export function NbsBarChart({
  data,
  title,
  subtitle,
  documentTypes,
}: NbsBarChartProps) {
  // Reshape data for Recharts
  const chartData = data.map((d) => ({
    name: d.categoryName,
    ...Object.fromEntries(
      documentTypes.map((doc) => [doc, d.byDocument[doc]])
    ),
    total: d.total,
  }));

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
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edeff0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: "#55606e" }} />
          <YAxis
            dataKey="name"
            type="category"
            tick={{ fontSize: 12, fill: "#55606e" }}
            width={190}
          />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid #d4d6d8",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
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
              radius={[0, 0, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

