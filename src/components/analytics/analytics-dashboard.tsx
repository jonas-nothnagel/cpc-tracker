"use client";

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

import type { AnalyticsSummary } from "@/lib/analytics/types";

/**
 * Internal usage-analytics dashboard renderer. Receives the pre-aggregated,
 * identifier-free summary from the server page; follows the visual idiom of
 * src/components/sustainability/sustainability-client.tsx (UNDP palette,
 * thin marks, recessive grid).
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

const UNDP_BLUE = "#0468b1";
const TEAL = "#02a38a";
const GRID = "#f0f0f0";

export function AnalyticsDashboard({
  summary,
  months,
}: {
  summary: AnalyticsSummary;
  months: number;
}) {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10 text-slate-800">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Usage analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Internal dashboard · last {months} month{months === 1 ? "" : "s"}
          {summary.range.from &&
            ` · ${summary.range.from.slice(0, 10)} to ${summary.range.to.slice(0, 10)}`}
          {" · anonymous first-party events"}
        </p>
      </header>

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Visitors" value={summary.totals.visitors} />
        <StatTile label="Page views" value={summary.totals.views} />
        <StatTile label="Sessions" value={summary.sessions.count} />
        <StatTile
          label="Median session"
          value={fmtDuration(summary.sessions.medianDurationMs)}
        />
        <StatTile
          label="Views (24 h)"
          value={summary.last24h.views}
          hint={`${summary.last24h.visitors} visitor${summary.last24h.visitors === 1 ? "" : "s"}`}
        />
      </section>

      <Section title="Daily activity">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart
            data={summary.dailyUniques}
            margin={{ left: 4, right: 16, top: 4, bottom: 0 }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="views"
              name="Page views"
              stroke={UNDP_BLUE}
              strokeWidth={2}
              fill={UNDP_BLUE}
              fillOpacity={0.12}
            />
            <Area
              type="monotone"
              dataKey="visitors"
              name="Visitors"
              stroke={TEAL}
              strokeWidth={2}
              fill="none"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Views by page">
          <RouteBars
            data={summary.viewsByRoute.map((r) => ({
              name: r.route,
              value: r.views,
            }))}
          />
        </Section>
        <Section title="Views by country">
          {summary.countrySplit.length === 0 ? (
            <Empty />
          ) : (
            <RouteBars
              data={summary.countrySplit.map((c) => ({
                name: c.country,
                value: c.views,
              }))}
            />
          )}
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Top clicks">
          <PlainTable
            head={["Page", "Element", "Clicks"]}
            rows={summary.topClicks.map((c) => [c.route, c.label, c.count])}
          />
        </Section>
        <Section title="Tracked interactions">
          <PlainTable
            head={["Event", "Count"]}
            rows={summary.topTrackEvents.map((t) => [t.name, t.count])}
          />
        </Section>
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Time on page (median)">
          <PlainTable
            head={["Page", "Median", "Measured views"]}
            rows={summary.durationByRoute.map((d) => [
              d.route,
              fmtDuration(d.medianMs),
              d.views,
            ])}
          />
        </Section>
        <Section title="Locales">
          <PlainTable
            head={["Locale", "Views"]}
            rows={summary.localeSplit.map((l) => [l.locale, l.views])}
          />
        </Section>
      </div>

      <Section title="Recent activity (last 24 h)">
        <PlainTable
          head={["Time (UTC)", "Type", "Page", "Country", "Detail"]}
          rows={summary.last24h.recent.map((e) => [
            e.ts.slice(11, 19),
            e.type,
            e.route,
            e.country ?? "—",
            e.detail,
          ])}
        />
      </Section>
    </main>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {title}
      </h2>
      {children}
    </section>
  );
}

function RouteBars({ data }: { data: { name: string; value: number }[] }) {
  const height = Math.max(120, data.length * 34);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 32, top: 0, bottom: 0 }}
      >
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={170}
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip />
        <Bar
          dataKey="value"
          name="Views"
          fill={UNDP_BLUE}
          radius={[0, 4, 4, 0]}
          barSize={16}
          label={{ position: "right", fontSize: 12, fill: "#55606e" }}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function PlainTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  if (rows.length === 0) return <Empty />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 30).map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="px-3 py-1.5 tabular-nums first:whitespace-nowrap"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-slate-400">No data yet.</p>;
}

function fmtDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}
