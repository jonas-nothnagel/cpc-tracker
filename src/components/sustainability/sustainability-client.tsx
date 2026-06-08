"use client";

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cumulativeByComponent } from "@/lib/footprint/rollup";
import type {
  FootprintComponent,
  FootprintMetrics,
  FootprintRollup,
  LedgerEvent,
  RollupBucket,
} from "@/lib/footprint/types";

const UNDP_BLUE = "#0468b1";
const UNDP_GRAY = "#55606e";

const COMPONENT_LABELS: Record<FootprintComponent, string> = {
  dev_pipeline: "Developer pipeline runs",
  user_pipeline: "User pipeline runs",
  extract: "Document extraction",
  chat: "Chatbot",
};

const SOURCE_LABELS: Record<string, string> = {
  measured: "Measured",
  estimated: "Estimated",
  api: "Estimated (API)",
  unavailable: "Not available",
};

// ---------------------------------------------------------------------------
// Unit-friendly formatters. Each metric is stored in a small base unit (Wh, mL,
// gCO2eq, ugSbeq) and promoted to a larger unit once it crosses 1000.
// ---------------------------------------------------------------------------

function num(value: number, maxFractionDigits = 2): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

function fmtCarbon(g: number): { value: string; unit: string } {
  return g >= 1000
    ? { value: num(g / 1000), unit: "kg CO2e" }
    : { value: num(g, g < 10 ? 2 : 0), unit: "g CO2e" };
}

function fmtEnergy(wh: number): { value: string; unit: string } {
  return wh >= 1000
    ? { value: num(wh / 1000), unit: "kWh" }
    : { value: num(wh, wh < 10 ? 2 : 0), unit: "Wh" };
}

function fmtWater(ml: number): { value: string; unit: string } {
  return ml >= 1000
    ? { value: num(ml / 1000), unit: "L" }
    : { value: num(ml, ml < 10 ? 2 : 0), unit: "mL" };
}

function fmtMinerals(ug: number): { value: string; unit: string } {
  return ug >= 1000
    ? { value: num(ug / 1000), unit: "mg Sb-eq" }
    : { value: num(ug, ug < 10 ? 2 : 0), unit: "ug Sb-eq" };
}

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Export. CSV is the full ledger (one row per recorded event); JSON is the
// whole rollup. Both download client-side, no server round trip.
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  "ts",
  "component",
  "model",
  "region",
  "country",
  "run_id",
  "call_count",
  "cached_call_count",
  "energy_wh",
  "water_ml",
  "co2_geq",
  "minerals_ugsbeq",
  "source",
] as const;

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(events: LedgerEvent[]): string {
  const rows = [CSV_COLUMNS.join(",")];
  for (const e of events) {
    rows.push(CSV_COLUMNS.map((c) => csvCell(e[c])).join(","));
  }
  return rows.join("\n");
}

function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Presentational pieces
// ---------------------------------------------------------------------------

function MetricTile({
  label,
  value,
  unit,
  unitTitle,
  sub,
}: {
  label: string;
  value: string;
  unit: string;
  unitTitle: string;
  sub: string;
}) {
  return (
    <div className="bg-[var(--undp-light)] border border-gray-100 rounded-lg p-5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--undp-gray)]">
        {label}
      </p>
      <p className="text-3xl font-medium text-[var(--undp-blue)] tabular-nums mt-1">
        {value}{" "}
        <span
          className="text-base font-normal text-[var(--undp-gray)] cursor-help"
          title={unitTitle}
        >
          {unit}
        </span>
      </p>
      <p className="text-xs text-[var(--undp-gray)] mt-0.5">{sub}</p>
    </div>
  );
}

function BreakdownBars({
  title,
  data,
  name,
  fmt,
}: {
  title: string;
  data: { label: string; value: number; calls: number }[];
  name: string;
  fmt: (v: number) => { value: string; unit: string };
}) {
  if (data.length === 0) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={Math.max(90, data.length * 46)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ left: 4, right: 24, top: 0, bottom: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#f0f0f0" />
          <XAxis
            type="number"
            tickFormatter={compact}
            fontSize={11}
            stroke={UNDP_GRAY}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={150}
            fontSize={11}
            stroke={UNDP_GRAY}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(4,104,177,0.06)" }}
            formatter={(value) => {
              const f = fmt(Number(value));
              return `${f.value} ${f.unit}`;
            }}
          />
          <Bar dataKey="value" name={name} fill={UNDP_BLUE} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Colour per source (component) for the stacked area chart. The four resource
// metrics move proportionally, so charting them against each other is redundant;
// the components do NOT, so cumulative-by-source is the one trend that adds
// information. A selector picks which metric the chart (and the bars) show.
const COMPONENT_COLORS: Record<string, string> = {
  dev_pipeline: UNDP_BLUE,
  user_pipeline: "#02a38a",
  extract: "#d9a400",
  chat: "#6f7d8c",
};

const METRICS: {
  key: keyof FootprintMetrics;
  label: string;
  fmt: (v: number) => { value: string; unit: string };
}[] = [
  { key: "co2_geq", label: "Carbon", fmt: fmtCarbon },
  { key: "energy_wh", label: "Energy", fmt: fmtEnergy },
  { key: "water_ml", label: "Water", fmt: fmtWater },
  { key: "minerals_ugsbeq", label: "Minerals", fmt: fmtMinerals },
];

function CumulativeImpact({
  events,
  metricKey,
  metricLabel,
  fmt,
}: {
  events: LedgerEvent[];
  metricKey: keyof FootprintMetrics;
  metricLabel: string;
  fmt: (v: number) => { value: string; unit: string };
}) {
  const { points, components } = cumulativeByComponent(events, metricKey);
  if (points.length === 0) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-1">
        Cumulative {metricLabel.toLowerCase()} over time
      </h3>
      <p className="text-xs text-[var(--undp-gray)] mb-3">
        Running total of {metricLabel.toLowerCase()} to date, split by where it
        comes from. The four resources move in step, so each shows the same shape
        in its own units.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={points} margin={{ left: 4, right: 16, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#f0f0f0" />
          <XAxis dataKey="key" fontSize={11} stroke={UNDP_GRAY} tickLine={false} />
          <YAxis
            fontSize={11}
            stroke={UNDP_GRAY}
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(value, name) => {
              const f = fmt(Number(value));
              return [
                `${f.value} ${f.unit}`,
                COMPONENT_LABELS[name as FootprintComponent] ?? name,
              ];
            }}
          />
          <Legend
            formatter={(value) =>
              COMPONENT_LABELS[value as FootprintComponent] ?? value
            }
          />
          {components.map((c) => (
            <Area
              key={c}
              type="monotone"
              dataKey={c}
              stackId="metric"
              name={c}
              stroke={COMPONENT_COLORS[c] ?? UNDP_GRAY}
              fill={COMPONENT_COLORS[c] ?? UNDP_GRAY}
              fillOpacity={0.18}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: FootprintRollup };

export function SustainabilityClient() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sustainability")
      .then((r) => {
        if (!r.ok) throw new Error(`Request failed (${r.status})`);
        return r.json() as Promise<FootprintRollup>;
      })
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setState({
            status: "error",
            message: err instanceof Error ? err.message : "Could not load footprint data",
          });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
      <header className="mb-8">
        <h1
          className="text-3xl sm:text-4xl text-[var(--undp-black)]"
          style={{ fontFamily: "ui-serif, Georgia, Cambria, serif" }}
        >
          AI sustainability footprint
        </h1>
        <p className="text-[var(--undp-gray)] mt-2 max-w-2xl leading-relaxed">
          The estimated environmental cost of the AI computation behind this tool,
          covering document analysis, the inference pipeline, and the chatbot. This
          is a transparency record for reporting, not policy advice.
        </p>
        <p className="text-xs text-[var(--undp-gray)] mt-3">
          AI-estimated using the{" "}
          <a
            href="https://ecologits.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--undp-blue)]"
          >
            EcoLogits
          </a>{" "}
          methodology. Figures are modelled estimates, not meter readings, and carry
          a margin of uncertainty.
        </p>
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-[var(--undp-gray)]">Loading footprint data...</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[var(--undp-red)]">
          Could not load footprint data: {state.message}
        </p>
      )}

      {state.status === "ready" && state.data.totals.event_count === 0 && (
        <div className="bg-[var(--undp-light)] border border-gray-100 rounded-lg p-8 text-center">
          <p className="text-sm text-[var(--undp-gray)]">
            No footprint recorded yet. Run an analysis or send a chat message, and
            this page will start tracking the AI compute behind it.
          </p>
        </div>
      )}

      {state.status === "ready" && state.data.totals.event_count > 0 && (
        <Dashboard data={state.data} />
      )}
    </main>
  );
}

function Dashboard({ data }: { data: FootprintRollup }) {
  const [metricKey, setMetricKey] = useState<keyof FootprintMetrics>("co2_geq");
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];

  const { totals } = data;
  const carbon = fmtCarbon(totals.co2_geq);
  const energy = fmtEnergy(totals.energy_wh);
  const water = fmtWater(totals.water_ml);
  const minerals = fmtMinerals(totals.minerals_ugsbeq);
  const callsLabel = `across ${compact(totals.call_count)} model calls`;
  const lastRecorded = data.latestTs ? data.latestTs.slice(0, 10) : "n/a";
  const stamp = new Date().toISOString().slice(0, 10);

  // Breakdown bars follow the selected metric (all four live in each bucket).
  // Sort by the selected metric so the longest bar is always on top -- the
  // buckets arrive sorted by carbon, which would otherwise misorder the bars
  // when a different metric is chosen.
  const toBars = (buckets: RollupBucket[], labelOf: (key: string) => string) =>
    buckets
      .map((b) => ({ label: labelOf(b.key), value: b[metricKey], calls: b.call_count }))
      .sort((a, b) => b.value - a.value);
  const componentBars = toBars(
    data.byComponent,
    (k) => COMPONENT_LABELS[k as FootprintComponent] ?? k,
  );
  const modelBars = toBars(data.byModel, (k) => k);
  const regionBars = toBars(data.byRegion, (k) => k);

  const exportCsv = () =>
    download(`cpc-footprint-${stamp}.csv`, toCsv(data.events), "text/csv");
  const exportJson = () =>
    download(
      `cpc-footprint-${stamp}.json`,
      JSON.stringify(data, null, 2),
      "application/json",
    );

  return (
    <div className="space-y-8">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="text-xs font-medium text-[var(--undp-blue)] border border-[var(--undp-blue)]/30 rounded px-3 py-1.5 hover:bg-[var(--undp-blue)]/5 transition-colors"
        >
          Export CSV
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="text-xs font-medium text-[var(--undp-blue)] border border-[var(--undp-blue)]/30 rounded px-3 py-1.5 hover:bg-[var(--undp-blue)]/5 transition-colors"
        >
          Export JSON
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label="Carbon"
          value={carbon.value}
          unit={carbon.unit}
          unitTitle="CO2e: carbon dioxide equivalent"
          sub={callsLabel}
        />
        <MetricTile
          label="Energy"
          value={energy.value}
          unit={energy.unit}
          unitTitle="kWh: kilowatt hours; Wh: watt hours"
          sub={`last recorded ${lastRecorded}`}
        />
        <MetricTile
          label="Water"
          value={water.value}
          unit={water.unit}
          unitTitle="Water consumption footprint (data-centre cooling)"
          sub="consumption footprint"
        />
        <MetricTile
          label="Minerals"
          value={minerals.value}
          unit={minerals.unit}
          unitTitle="ADPe: abiotic depletion potential, antimony (Sb) equivalent"
          sub="abiotic resource use"
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--undp-gray)]">
            Break down by resource:
          </span>
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              aria-pressed={m.key === metricKey}
              className={`text-xs font-medium rounded-full px-3 py-1 border transition-colors ${
                m.key === metricKey
                  ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                  : "text-[var(--undp-gray)] border-gray-200 hover:border-[var(--undp-blue)]/40"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BreakdownBars
            title={`${metric.label} by component`}
            data={componentBars}
            name={metric.label}
            fmt={metric.fmt}
          />
          <BreakdownBars
            title={`${metric.label} by model`}
            data={modelBars}
            name={metric.label}
            fmt={metric.fmt}
          />
          <BreakdownBars
            title={`${metric.label} by region`}
            data={regionBars}
            name={metric.label}
            fmt={metric.fmt}
          />
        </div>

        <CumulativeImpact
          events={data.events}
          metricKey={metricKey}
          metricLabel={metric.label}
          fmt={metric.fmt}
        />
      </div>

      <EventsTable data={data} />
    </div>
  );
}

function EventsTable({ data }: { data: FootprintRollup }) {
  const rows = [...data.events].sort((a, b) => b.ts.localeCompare(a.ts));
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 overflow-x-auto">
      <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
        Recorded activity
      </h3>
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-[var(--undp-gray)] border-b border-gray-100">
            <th className="py-2 pr-3 font-semibold">Date</th>
            <th className="py-2 pr-3 font-semibold">Component</th>
            <th className="py-2 pr-3 font-semibold">Model</th>
            <th className="py-2 pr-3 font-semibold">Region</th>
            <th className="py-2 pr-3 font-semibold text-right">Calls</th>
            <th className="py-2 pr-3 font-semibold text-right">Energy</th>
            <th className="py-2 pr-3 font-semibold text-right">Carbon</th>
            <th className="py-2 font-semibold">Basis</th>
          </tr>
        </thead>
        <tbody className="text-[var(--undp-black)]">
          {rows.map((e, i) => {
            const energy = fmtEnergy(e.energy_wh);
            const carbon = fmtCarbon(e.co2_geq);
            return (
              <tr key={`${e.ts}-${i}`} className="border-b border-gray-50">
                <td className="py-2 pr-3 whitespace-nowrap">{e.ts.slice(0, 10)}</td>
                <td className="py-2 pr-3 whitespace-nowrap">
                  {COMPONENT_LABELS[e.component] ?? e.component}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap">{e.model}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{e.region}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {e.call_count.toLocaleString()}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                  {energy.value} {energy.unit}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                  {carbon.value} {carbon.unit}
                </td>
                <td className="py-2 whitespace-nowrap text-[var(--undp-gray)]">
                  {SOURCE_LABELS[e.source] ?? e.source}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
