"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type {
  FootprintComponent,
  FootprintRollup,
  LedgerEvent,
  RollupBucket,
} from "@/lib/footprint/types";

const UNDP_BLUE = "#0468b1";
const UNDP_GRAY = "#55606e";

function useComponentLabels(): Record<FootprintComponent, string> {
  const t = useTranslations("sustainability.components");
  return {
    dev_pipeline: t("dev_pipeline"),
    user_pipeline: t("user_pipeline"),
    extract: t("extract"),
    chat: t("chat"),
  };
}

function useSourceLabels(): Record<string, string> {
  const t = useTranslations("sustainability.sources");
  return {
    measured: t("measured"),
    estimated: t("estimated"),
    api: t("api"),
    unavailable: t("unavailable"),
  };
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
}: {
  title: string;
  data: { label: string; co2_geq: number; calls: number }[];
}) {
  const t = useTranslations("sustainability");
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
            formatter={(value) => `${num(Number(value))} ${t("units.gCO2e")}`}
          />
          <Bar dataKey="co2_geq" name={t("seriesCarbon")} fill={UNDP_BLUE} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function TimeSeries({ byDay }: { byDay: RollupBucket[] }) {
  const t = useTranslations("sustainability");
  if (byDay.length === 0) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-lg p-5">
      <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-3">
        {t("charts.carbonOverTime")}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={byDay} margin={{ left: 4, right: 16, top: 4, bottom: 0 }}>
          <CartesianGrid stroke="#f0f0f0" />
          <XAxis dataKey="key" fontSize={11} stroke={UNDP_GRAY} tickLine={false} />
          <YAxis
            fontSize={11}
            stroke={UNDP_GRAY}
            tickFormatter={compact}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip formatter={(value) => `${num(Number(value))} ${t("units.gCO2e")}`} />
          <Area
            type="monotone"
            dataKey="co2_geq"
            name={t("seriesCarbon")}
            stroke={UNDP_BLUE}
            fill={UNDP_BLUE}
            fillOpacity={0.14}
            strokeWidth={2}
          />
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
  const componentLabels = useComponentLabels();
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

  const componentBars = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.data.byComponent.map((b) => ({
      label: componentLabels[b.key as FootprintComponent] ?? b.key,
      co2_geq: b.co2_geq,
      calls: b.call_count,
    }));
  }, [state, componentLabels]);

  const modelBars = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.data.byModel.map((b) => ({
      label: b.key,
      co2_geq: b.co2_geq,
      calls: b.call_count,
    }));
  }, [state]);

  const regionBars = useMemo(() => {
    if (state.status !== "ready") return [];
    return state.data.byRegion.map((b) => ({
      label: b.key,
      co2_geq: b.co2_geq,
      calls: b.call_count,
    }));
  }, [state]);

  return (
    <main className="max-w-5xl mx-auto px-5 sm:px-8 py-10">
      <header className="mb-8">
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
          <p className="text-sm text-[var(--undp-gray)]">
            {t("empty")}
          </p>
        </div>
      )}

      {state.status === "ready" && state.data.totals.event_count > 0 && (
        <Dashboard
          data={state.data}
          componentBars={componentBars}
          modelBars={modelBars}
          regionBars={regionBars}
        />
      )}
    </main>
  );
}

function Dashboard({
  data,
  componentBars,
  modelBars,
  regionBars,
}: {
  data: FootprintRollup;
  componentBars: { label: string; co2_geq: number; calls: number }[];
  modelBars: { label: string; co2_geq: number; calls: number }[];
  regionBars: { label: string; co2_geq: number; calls: number }[];
}) {
  const t = useTranslations("sustainability");
  const { totals } = data;
  const carbon = fmtCarbon(totals.co2_geq);
  const energy = fmtEnergy(totals.energy_wh);
  const water = fmtWater(totals.water_ml);
  const minerals = fmtMinerals(totals.minerals_ugsbeq);
  const callsLabel = t("tile.callsLabel", { calls: compact(totals.call_count) });
  const lastRecorded = data.latestTs ? data.latestTs.slice(0, 10) : t("tile.notAvailable");
  const stamp = new Date().toISOString().slice(0, 10);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BreakdownBars title={t("charts.byComponent")} data={componentBars} />
        <BreakdownBars title={t("charts.byModel")} data={modelBars} />
        <BreakdownBars title={t("charts.byRegion")} data={regionBars} />
      </div>

      <TimeSeries byDay={data.byDay} />

      <EventsTable data={data} />
    </div>
  );
}

function EventsTable({ data }: { data: FootprintRollup }) {
  const t = useTranslations("sustainability");
  const componentLabels = useComponentLabels();
  const sourceLabels = useSourceLabels();
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
                  {componentLabels[e.component] ?? e.component}
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
                  {sourceLabels[e.source] ?? e.source}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
