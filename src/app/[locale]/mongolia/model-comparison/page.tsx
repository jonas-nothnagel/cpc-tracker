import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/ui/header";
import { Link } from "@/i18n/navigation";
import {
  listAvailableModels,
  loadModelComparison,
} from "@/lib/dashboard-data";
import { AnalysisSections } from "@/components/model-comparison/analysis-sections";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");
const COUNTRY = "mongolia";

interface FootprintSnap {
  energy_wh?: number;
  water_ml?: number;
  co2_geq?: number;
  minerals_ugsbeq?: number;
  call_count?: number;
  tracked_call_count?: number;
  estimated_call_count?: number;
  cached_call_count?: number;
  source?: "measured" | "estimated" | "mixed" | "unavailable";
}

interface StatusFile {
  status?: string;
  summary?: {
    totalTargets?: number;
    totalPairs?: number;
    elapsedSeconds?: number;
    alignmentLevels?: Record<string, number>;
    totalContradictions?: number;
  };
  footprint?: FootprintSnap;
}

interface Row {
  slug: string;
  status: string | null;
  elapsed: number | null;
  totalPairs: number | null;
  highAlignments: number | null;
  flagged: number | null;
  callCount: number | null;
  energyWh: number | null;
  co2Geq: number | null;
  waterMl: number | null;
  source: FootprintSnap["source"];
}

function readJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function loadRow(slug: string): Row {
  const status = readJson<StatusFile>(
    join(PYTHON_OUTPUT, COUNTRY, slug, "status.json"),
  );
  const fp =
    status?.footprint ??
    readJson<FootprintSnap>(
      join(PYTHON_OUTPUT, COUNTRY, slug, "footprint.json"),
    );
  return {
    slug,
    status: status?.status ?? null,
    elapsed: status?.summary?.elapsedSeconds ?? null,
    totalPairs: status?.summary?.totalPairs ?? null,
    highAlignments: status?.summary?.alignmentLevels?.high ?? null,
    flagged: status?.summary?.alignmentLevels?.flagged ?? null,
    callCount: fp?.call_count ?? null,
    energyWh: fp?.energy_wh ?? null,
    co2Geq: fp?.co2_geq ?? null,
    waterMl: fp?.water_ml ?? null,
    source: fp?.source,
  };
}

function fmtNumber(n: number | null, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtElapsed(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function prettifySlug(slug: string): string {
  const known: Record<string, string> = {
    "gpt-5-4": "GPT-5.4",
    "gpt-5-4-mini": "GPT-5.4 mini",
    "deepseek-v4-pro": "DeepSeek V4 Pro",
    "llama-4-maverick-17b-128e-instruct-fp8": "Llama 4 Maverick 17B",
  };
  return known[slug] ?? slug;
}

export async function generateMetadata() {
  return { title: "Mongolia model comparison | CPC Analyzer" };
}

export default async function MongoliaModelComparisonPage() {
  const t = await getTranslations("dashboard");
  const models = listAvailableModels(COUNTRY);
  if (models.length === 0) notFound();

  const rows = models.map(loadRow);
  // Analytic artifact is optional — when missing (fresh country, no
  // analyzer run yet) the page still renders the summary table.
  const report = loadModelComparison(COUNTRY);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fbfaf7" }}>
      <Header subtitle="Mongolia · Model comparison" basePath="/mongolia" />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h1 className="text-2xl font-medium text-[var(--undp-black)]">
            Mongolia · model comparison
          </h1>
          <Link
            href="/mongolia/model-evaluation"
            className="text-sm text-[var(--undp-blue)] hover:underline"
          >
            Open manual evaluation tool →
          </Link>
        </div>
        <p className="text-sm text-[var(--undp-gray)] mb-6 max-w-3xl">
          The same Mongolia inputs (153 targets, 9,678 cross-document pairs) run
          through the pipeline on four different LLMs. AI-generated outputs;
          comparison runs, not the production result. These runs predate the
          August 2026 target re-curation (the production corpus now separates
          the official NDC 3.0 from the Resolution 91 national targets: 178
          targets), so they remain comparable with each other but not with the
          current dashboard. Footprint values flagged <em>estimated</em> use
          generic per-token coefficients (model not in the EcoLogits registry).
        </p>

        <div className="overflow-x-auto border border-gray-100 bg-white rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--undp-gray)]">
              <tr>
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-right px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Wall-clock</th>
                <th className="text-right px-4 py-3">LLM calls</th>
                <th className="text-right px-4 py-3">Pairs</th>
                <th className="text-right px-4 py-3">High</th>
                <th className="text-right px-4 py-3">Flagged</th>
                <th className="text-right px-4 py-3">Energy (Wh)</th>
                <th className="text-right px-4 py-3">CO₂e (g)</th>
                <th className="text-right px-4 py-3">Water (mL)</th>
                <th className="text-right px-4 py-3">Footprint source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/mongolia?model=${row.slug}`}
                      className="text-[var(--undp-blue)] hover:underline"
                    >
                      {prettifySlug(row.slug)}
                    </Link>
                  </td>
                  <td className="text-right px-4 py-3 text-xs text-[var(--undp-gray)]">
                    {row.status ?? "—"}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtElapsed(row.elapsed)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.callCount)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.totalPairs)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.highAlignments)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.flagged)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.energyWh, 0)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.co2Geq, 0)}
                  </td>
                  <td className="text-right px-4 py-3 tabular-nums">
                    {fmtNumber(row.waterMl, 0)}
                  </td>
                  <td className="text-right px-4 py-3">
                    {row.source === "estimated" ? (
                      <em className="text-amber-700">estimated</em>
                    ) : row.source === "mixed" ? (
                      <em className="text-amber-700">mixed</em>
                    ) : row.source === "measured" ? (
                      <span className="text-green-700">measured</span>
                    ) : (
                      <span className="text-[var(--undp-gray)]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-[var(--undp-gray)] mt-4 max-w-3xl">
          Click a model name to open the Mongolia dashboard with that model&apos;s
          outputs. {t("footer.text")}
        </p>

        {report ? (
          <AnalysisSections report={report} />
        ) : (
          <p className="text-xs text-[var(--undp-gray)] mt-8 italic max-w-3xl">
            Run <code className="font-mono text-[10px] px-1 bg-gray-100">uv run
            python -m src.analyze_model_comparison --country {COUNTRY}</code> to
            generate the detailed cross-model analysis sections.
          </p>
        )}
      </main>
    </div>
  );
}
