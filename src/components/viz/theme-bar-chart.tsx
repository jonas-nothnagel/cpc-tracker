"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DOC_COLORS, DOC_LABELS } from "@/lib/utils";
import type { PolicyDocumentType } from "@/types";

interface BarData {
  categoryName: string;
  total: number;
  byDocument: Record<PolicyDocumentType, number>;
}

interface ThemeBarChartProps {
  data: BarData[];
  title: string;
  subtitle?: string;
  documentTypes: PolicyDocumentType[];
}

/**
 * Interactive vertical stacked bar chart using Recharts.
 * Hoverable bars with tooltips showing per-document breakdown.
 */
export function ThemeBarChart({
  data,
  title,
  subtitle,
  documentTypes,
}: ThemeBarChartProps) {
  const chartData = data.map((d) => ({
    name: d.categoryName,
    // Create a shorter label for the X axis
    shortName:
      d.categoryName.length > 20
        ? d.categoryName.slice(0, 18) + "…"
        : d.categoryName,
    ...Object.fromEntries(
      documentTypes.map((doc) => [doc, d.byDocument[doc]])
    ),
    total: d.total,
  }));

  return (
    <div>
      <h3 className="text-lg font-semibold text-[var(--undp-black)] mb-1">
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm text-[var(--undp-gray)] mb-4">{subtitle}</p>
      )}
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 10, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edeff0" />
          <XAxis
            dataKey="shortName"
            tick={{ fontSize: 11, fill: "#55606e" }}
            angle={-45}
            textAnchor="end"
            interval={0}
            height={90}
          />
          <YAxis tick={{ fontSize: 12, fill: "#55606e" }} />
          <Tooltip
            contentStyle={{
              fontSize: 13,
              borderRadius: 6,
              border: "1px solid #d4d6d8",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            labelFormatter={(label: string) => {
              // Find full name from data
              const item = data.find(
                (d) =>
                  d.categoryName === label ||
                  d.categoryName.startsWith(label.replace("…", ""))
              );
              return item?.categoryName ?? label;
            }}
            formatter={(value: number, name: string) => [
              value,
              DOC_LABELS[name as PolicyDocumentType] ?? name,
            ]}
          />
          <Legend
            formatter={(value: string) =>
              DOC_LABELS[value as PolicyDocumentType] ?? value
            }
            wrapperStyle={{ fontSize: 12 }}
            verticalAlign="top"
          />
          {documentTypes.map((doc) => (
            <Bar
              key={doc}
              dataKey={doc}
              stackId="stack"
              fill={DOC_COLORS[doc]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

