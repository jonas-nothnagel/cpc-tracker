"use client";

import { useMemo, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { BtrData } from "@/types";

const SECTOR_COLORS: Record<string, string> = {
  sector_energy: "#0468b1",
  sector_transport: "#e5243b",
  sector_ippu: "#fcc30b",
  sector_agriculture: "#4c9f38",
  sector_lulucf: "#00689d",
  sector_waste: "#a21942",
  total: "#232e3d",
};

const SECTOR_LABELS: Record<string, string> = {
  sector_energy: "Energy",
  sector_transport: "Transport",
  sector_ippu: "IPPU",
  sector_agriculture: "Agriculture",
  sector_lulucf: "LULUCF",
  sector_waste: "Waste",
  total: "Total (excl. LULUCF)",
};

interface EmissionsTrendProps {
  btrData: BtrData;
}

export function EmissionsTrend({ btrData }: EmissionsTrendProps) {
  const [showLulucf, setShowLulucf] = useState(false);
  const [showTotal, setShowTotal] = useState(false);
  const [hiddenSectors, setHiddenSectors] = useState<Set<string>>(new Set());

  const { chartData, activeSectors, hasTotalData, hasLulucf } = useMemo(() => {
    const sectorSeries = btrData.sectorEmissions.bySector.filter(
      (s) => !s.isTotal && s.normalizedSector && s.normalizedSector in SECTOR_COLORS
    );

    const totalSeries = btrData.sectorEmissions.bySector.find(
      (s) => s.isTotal && s.category.toLowerCase().includes("without")
    );

    const allYears = new Set<string>();
    for (const s of sectorSeries) {
      for (const year of Object.keys(s.yearlyEmissions)) allYears.add(year);
    }
    if (totalSeries) {
      for (const year of Object.keys(totalSeries.yearlyEmissions)) allYears.add(year);
    }

    const wemProjections = btrData.projections.filter(
      (p) => p.scenario === "wem" && !p.isTotal && p.normalizedSector in SECTOR_COLORS
    );
    const totalProjection = btrData.projections.find(
      (p) => p.scenario === "wem" && p.isTotal && p.category.toLowerCase().includes("without")
    );

    for (const p of wemProjections) {
      for (const year of Object.keys(p.yearlyValues)) allYears.add(year);
    }
    if (totalProjection) {
      for (const year of Object.keys(totalProjection.yearlyValues)) allYears.add(year);
    }

    const recentYears = Array.from(allYears).sort().filter((y) => parseInt(y) >= 2000);
    const activeSectorIds = new Set(sectorSeries.map((s) => s.normalizedSector));

    const chartData = recentYears.map((year) => {
      const point: Record<string, number | string | null> = { year };

      for (const s of sectorSeries) {
        const val = s.yearlyEmissions[year];
        if (val !== undefined) point[s.normalizedSector] = Math.round(val);
      }
      for (const p of wemProjections) {
        const val = p.yearlyValues[year];
        if (val !== undefined) point[`${p.normalizedSector}_proj`] = Math.round(val);
      }

      if (totalSeries) {
        const val = totalSeries.yearlyEmissions[year];
        if (val !== undefined) point.total = Math.round(val);
      }
      if (totalProjection) {
        const val = totalProjection.yearlyValues[year];
        if (val !== undefined) point.total_proj = Math.round(val);
      }

      return point;
    });

    return {
      chartData,
      activeSectors: Array.from(activeSectorIds),
      hasTotalData: !!totalSeries,
      hasLulucf: activeSectorIds.has("sector_lulucf"),
    };
  }, [btrData]);

  const toggleSector = useCallback((sectorId: string) => {
    setHiddenSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sectorId)) next.delete(sectorId);
      else next.add(sectorId);
      return next;
    });
  }, []);

  if (chartData.length === 0) return null;

  const latestHistorical = chartData
    .filter((d) => activeSectors.some((s) => d[s] != null))
    .pop();
  const latestYear = latestHistorical?.year as string | undefined;

  const visibleSectors = activeSectors.filter((s) => {
    if (s === "sector_lulucf" && !showLulucf) return false;
    return !hiddenSectors.has(s);
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--undp-black)] mb-1">
            GHG Emissions by Sector
          </h3>
          <p className="text-sm text-[var(--undp-gray)]">
            Historical emissions (solid) and WEM projections (dashed) in kt CO&#x2082; equivalent.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0 pt-1">
          {hasLulucf && (
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--undp-gray)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLulucf}
                onChange={() => setShowLulucf((v) => !v)}
                className="accent-[#00689d] w-3 h-3"
              />
              Show LULUCF
            </label>
          )}
          {hasTotalData && (
            <label className="flex items-center gap-1.5 text-[10px] text-[var(--undp-gray)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTotal}
                onChange={() => setShowTotal((v) => !v)}
                className="accent-[#232e3d] w-3 h-3"
              />
              Show Total
            </label>
          )}
        </div>
      </div>

      {/* Interactive legend */}
      <div className="flex flex-wrap gap-3 mb-3">
        {activeSectors
          .filter((s) => s !== "sector_lulucf" || showLulucf)
          .map((sectorId) => {
            const isHidden = hiddenSectors.has(sectorId);
            const label = SECTOR_LABELS[sectorId] ?? sectorId;
            const color = SECTOR_COLORS[sectorId];
            return (
              <button
                key={sectorId}
                type="button"
                onClick={() => toggleSector(sectorId)}
                className={`flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border transition-all cursor-pointer ${
                  isHidden
                    ? "border-gray-200 text-gray-400 bg-white"
                    : "border-gray-300 text-[var(--undp-black)] bg-white"
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 transition-opacity"
                  style={{
                    backgroundColor: color,
                    opacity: isHidden ? 0.25 : 1,
                  }}
                />
                <span className={isHidden ? "line-through" : ""}>
                  {label}
                </span>
              </button>
            );
          })}
        {showTotal && (
          <span className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-gray-300 text-[var(--undp-black)] bg-white">
            <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#232e3d]" />
            Total (excl. LULUCF)
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 11, fill: "#64748b" }}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
            label={{
              value: "kt CO₂ eq",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 10, fill: "#94a3b8" },
            }}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 6,
              border: "1px solid #e2e8f0",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
            formatter={(value, name) => {
              const n = String(name);
              const clean = n.replace("_proj", "");
              const label = SECTOR_LABELS[clean] ?? clean;
              const suffix = n.endsWith("_proj") ? " (projected)" : "";
              return [`${Number(value).toLocaleString()} kt`, `${label}${suffix}`];
            }}
          />

          {latestYear && (
            <ReferenceLine
              x={latestYear}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
          )}

          {/* Historical lines */}
          {visibleSectors.map((sectorId) => (
            <Line
              key={sectorId}
              type="monotone"
              dataKey={sectorId}
              stroke={SECTOR_COLORS[sectorId]}
              strokeWidth={2}
              dot={false}
              connectNulls
              name={sectorId}
            />
          ))}

          {/* Projection lines */}
          {visibleSectors.map((sectorId) => {
            const projKey = `${sectorId}_proj`;
            const hasProj = chartData.some((d) => d[projKey] != null);
            if (!hasProj) return null;
            return (
              <Line
                key={projKey}
                type="monotone"
                dataKey={projKey}
                stroke={SECTOR_COLORS[sectorId]}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                connectNulls
                name={projKey}
              />
            );
          })}

          {/* Total lines */}
          {showTotal && (
            <>
              <Line
                type="monotone"
                dataKey="total"
                stroke="#232e3d"
                strokeWidth={2.5}
                dot={false}
                connectNulls
                name="total"
              />
              {chartData.some((d) => d.total_proj != null) && (
                <Line
                  type="monotone"
                  dataKey="total_proj"
                  stroke="#232e3d"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls
                  name="total_proj"
                />
              )}
            </>
          )}
        </LineChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-[var(--undp-gray)] mt-2 text-center">
        Dashed lines show WEM (With Existing Measures) projections. Click legend items to toggle sectors.
        {!showLulucf && hasLulucf && " LULUCF hidden — acts as large carbon sink, see checkbox above."}
      </p>

      {showLulucf && (
        <div className="mt-3 px-4 py-3 bg-[#00689d]/8 border border-[#00689d]/20 rounded-lg text-[10px] text-[var(--undp-gray)] leading-relaxed">
          <span className="font-semibold text-[#00689d]">About negative LULUCF values: </span>
          The Land Use, Land-Use Change and Forestry sector shows negative numbers because Mongolia&apos;s
          forests and grasslands currently <strong>absorb more CO&#x2082; than they emit</strong> —
          making this sector a net carbon sink. In international GHG accounting, removals from the atmosphere
          are reported as negative values. A value becoming <em>less negative</em> (moving toward zero)
          means the sink is weakening and absorbing less carbon over time, which is a warning sign for climate goals.
        </div>
      )}
    </div>
  );
}
