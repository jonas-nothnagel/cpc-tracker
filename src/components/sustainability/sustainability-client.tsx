"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
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
  FootprintMetrics,
  FootprintRollup,
  LedgerEvent,
  RollupBucket,
} from "@/lib/footprint/types";

const UNDP_BLUE = "#0468b1";
const UNDP_GRAY = "#55606e";

const COMPONENT_KEY_SET = new Set<string>([
  "dev_pipeline",
  "user_pipeline",
  "extract",
  "chat",
]);

// Resolve a footprint-component key to its translated label, falling back to the
// raw value for anything that is not a known component (e.g. model/region names).
function componentLabel(
  t: ReturnType<typeof useTranslations>,
  value: unknown,
): string {
  const key = String(value);
  return COMPONENT_KEY_SET.has(key) ? t(`components.${key}`) : key;
}

// Resolve a footprint-source key to its translated label, falling back to raw.
const SOURCE_KEY_SET = new Set<string>([
  "measured",
  "estimated",
  "api",
  "unavailable",
]);
function sourceLabel(
  t: ReturnType<typeof useTranslations>,
  value: unknown,
): string {
  const key = String(value);
  return SOURCE_KEY_SET.has(key) ? t(`sources.${key}`) : key;
}

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

// Each metric's display label is resolved at render time via t(`tile.${tileKey}`)
// so it stays translatable; module-level arrays cannot call hooks.
const METRICS: {
  key: keyof FootprintMetrics;
  tileKey: "carbon" | "energy" | "water" | "minerals";
  fmt: (v: number) => { value: string; unit: string };
}[] = [
  { key: "co2_geq", tileKey: "carbon", fmt: fmtCarbon },
  { key: "energy_wh", tileKey: "energy", fmt: fmtEnergy },
  { key: "water_ml", tileKey: "water", fmt: fmtWater },
  { key: "minerals_ugsbeq", tileKey: "minerals", fmt: fmtMinerals },
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
  const t = useTranslations("sustainability");
  const { points, components } = cumulativeByComponent(events, metricKey);
  if (points.length === 0) return null;
  const metricLower = metricLabel.toLowerCase();
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-1">
        {t("charts.cumulativeOverTime", { metric: metricLabel })}
      </h3>
      <p className="text-xs text-[var(--undp-gray)] mb-3">
        {t("charts.cumulativeDescription", { metric: metricLower })}
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
              return [`${f.value} ${f.unit}`, componentLabel(t, name)];
            }}
          />
          <Legend formatter={(value) => componentLabel(t, value)} />
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
  const t = useTranslations("sustainability");
  const router = useRouter();
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
            message: err instanceof Error ? err.message : t("errors.loadFailed"),
          });
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  return (
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
      <header className="mb-8">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors mb-4"
        >
          <span aria-hidden="true">&larr;</span> {t("back")}
        </button>
        <h1
          className="text-3xl sm:text-4xl text-[var(--undp-black)]"
          style={{ fontFamily: "ui-serif, Georgia, Cambria, serif" }}
        >
          {t("page.title")}
        </h1>
        <p className="text-[var(--undp-gray)] mt-2 max-w-2xl leading-relaxed">
          {t("page.intro")}
        </p>
        <p className="text-xs text-[var(--undp-gray)] mt-3">
          {t.rich("page.methodology", {
            link: (chunks) => (
              <a
                href="https://ecologits.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[var(--undp-blue)]"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </header>

      {state.status === "loading" && (
        <p className="text-sm text-[var(--undp-gray)]">{t("loading")}</p>
      )}

      {state.status === "error" && (
        <p className="text-sm text-[var(--undp-red)]">
          {t("errors.withMessage", { message: state.message })}
        </p>
      )}

      {state.status === "ready" && state.data.totals.event_count === 0 && (
        <div className="bg-[var(--undp-light)] border border-gray-100 rounded-lg p-8 text-center">
          <p className="text-sm text-[var(--undp-gray)]">{t("empty")}</p>
        </div>
      )}

      {state.status === "ready" && state.data.totals.event_count > 0 && (
        <Dashboard data={state.data} />
      )}
    </main>
  );
}

function Dashboard({ data }: { data: FootprintRollup }) {
  const t = useTranslations("sustainability");
  const [metricKey, setMetricKey] = useState<keyof FootprintMetrics>("co2_geq");
  const metric = METRICS.find((m) => m.key === metricKey) ?? METRICS[0];
  const metricLabel = t(`tile.${metric.tileKey}`);

  const { totals } = data;
  const carbon = fmtCarbon(totals.co2_geq);
  const energy = fmtEnergy(totals.energy_wh);
  const water = fmtWater(totals.water_ml);
  const minerals = fmtMinerals(totals.minerals_ugsbeq);
  const callsLabel = t("tile.callsLabel", { calls: compact(totals.call_count) });
  const lastRecorded = data.latestTs
    ? data.latestTs.slice(0, 10)
    : t("tile.notAvailable");
  const stamp = new Date().toISOString().slice(0, 10);

  // Breakdown bars follow the selected metric (all four live in each bucket).
  // Sort by the selected metric so the longest bar is always on top -- the
  // buckets arrive sorted by carbon, which would otherwise misorder the bars
  // when a different metric is chosen.
  const toBars = (buckets: RollupBucket[], labelOf: (key: string) => string) =>
    buckets
      .map((b) => ({ label: labelOf(b.key), value: b[metricKey], calls: b.call_count }))
      .sort((a, b) => b.value - a.value);
  const componentBars = toBars(data.byComponent, (k) => componentLabel(t, k));
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
          {t("exportCsv")}
        </button>
        <button
          type="button"
          onClick={exportJson}
          className="text-xs font-medium text-[var(--undp-blue)] border border-[var(--undp-blue)]/30 rounded px-3 py-1.5 hover:bg-[var(--undp-blue)]/5 transition-colors"
        >
          {t("exportJson")}
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricTile
          label={t("tile.carbon")}
          value={carbon.value}
          unit={carbon.unit}
          unitTitle={t("tile.carbonUnitTitle")}
          sub={callsLabel}
        />
        <MetricTile
          label={t("tile.energy")}
          value={energy.value}
          unit={energy.unit}
          unitTitle={t("tile.energyUnitTitle")}
          sub={t("tile.lastRecorded", { date: lastRecorded })}
        />
        <MetricTile
          label={t("tile.water")}
          value={water.value}
          unit={water.unit}
          unitTitle={t("tile.waterUnitTitle")}
          sub={t("tile.waterSub")}
        />
        <MetricTile
          label={t("tile.minerals")}
          value={minerals.value}
          unit={minerals.unit}
          unitTitle={t("tile.mineralsUnitTitle")}
          sub={t("tile.mineralsSub")}
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--undp-gray)]">
            {t("metricSelector.label")}
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
              {t(`tile.${m.tileKey}`)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BreakdownBars
            title={t("charts.byComponentMetric", { metric: metricLabel })}
            data={componentBars}
            name={metricLabel}
            fmt={metric.fmt}
          />
          <BreakdownBars
            title={t("charts.byModelMetric", { metric: metricLabel })}
            data={modelBars}
            name={metricLabel}
            fmt={metric.fmt}
          />
          <BreakdownBars
            title={t("charts.byRegionMetric", { metric: metricLabel })}
            data={regionBars}
            name={metricLabel}
            fmt={metric.fmt}
          />
        </div>

        <CumulativeImpact
          events={data.events}
          metricKey={metricKey}
          metricLabel={metricLabel}
          fmt={metric.fmt}
        />
      </div>

      <EventsTable data={data} />
    </div>
  );
}

function EventsTable({ data }: { data: FootprintRollup }) {
  const t = useTranslations("sustainability");
  const rows = [...data.events].sort((a, b) => b.ts.localeCompare(a.ts));
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5 overflow-x-auto">
      <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
        {t("table.title")}
      </h3>
      <table className="w-full text-xs text-left border-collapse">
        <thead>
          <tr className="text-[var(--undp-gray)] border-b border-gray-100">
            <th className="py-2 pr-3 font-semibold">{t("table.date")}</th>
            <th className="py-2 pr-3 font-semibold">{t("table.component")}</th>
            <th className="py-2 pr-3 font-semibold">{t("table.model")}</th>
            <th className="py-2 pr-3 font-semibold">{t("table.region")}</th>
            <th className="py-2 pr-3 font-semibold text-right">{t("table.calls")}</th>
            <th className="py-2 pr-3 font-semibold text-right">{t("table.energy")}</th>
            <th className="py-2 pr-3 font-semibold text-right">{t("table.carbon")}</th>
            <th className="py-2 font-semibold">{t("table.basis")}</th>
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
                  {componentLabel(t, e.component)}
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
                  {sourceLabel(t, e.source)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
