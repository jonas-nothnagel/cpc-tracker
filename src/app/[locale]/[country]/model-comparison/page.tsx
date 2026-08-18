import { readFileSync } from "fs";
import { join } from "path";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/ui/header";
import { Link } from "@/i18n/navigation";
import { getCountry, isValidCountryId } from "@/config/countries";
import {
  listAvailableModels,
  loadModelComparison,
} from "@/lib/dashboard-data";
import { AnalysisSections } from "@/components/model-comparison/analysis-sections";

const PROJECT_ROOT = process.cwd();
const PYTHON_OUTPUT = join(PROJECT_ROOT, "python", "output");

interface PageProps {
  params: Promise<{ country: string }>;
}

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
  totalTargets: number | null;
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

function loadRow(country: string, slug: string): Row {
  const status = readJson<StatusFile>(
    join(PYTHON_OUTPUT, country, slug, "status.json"),
  );
  const fp =
    status?.footprint ??
    readJson<FootprintSnap>(
      join(PYTHON_OUTPUT, country, slug, "footprint.json"),
    );
  return {
    slug,
    status: status?.status ?? null,
    elapsed: status?.summary?.elapsedSeconds ?? null,
    totalTargets: status?.summary?.totalTargets ?? null,
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

export async function generateMetadata({ params }: PageProps) {
  const { country } = await params;
  const entry = isValidCountryId(country.toLowerCase())
    ? getCountry(country.toLowerCase())
    : undefined;
  if (!entry?.visible) return { title: "CPC Analyzer" };
  return { title: `${entry.name} model comparison | CPC Analyzer` };
}

export default async function ModelComparisonPage({ params }: PageProps) {
  const { country } = await params;
  const lower = country.toLowerCase();
  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  const t = await getTranslations("modelComparison");
  const tDash = await getTranslations("dashboard");
  const models = listAvailableModels(entry.id);
  if (models.length === 0) notFound();

  const rows = models.map((slug) => loadRow(entry.id, slug));
  // models[0] is the production default (PREFERRED_DEFAULT_SLUGS promotion in
  // listAvailableModels). When another row ran on a different corpus size,
  // surface that: its deltas mix corpus change with model change.
  const reference = rows[0];
  const staleCorpus = rows.some(
    (r) =>
      r.slug !== reference.slug &&
      r.totalPairs != null &&
      reference.totalPairs != null &&
      r.totalPairs !== reference.totalPairs,
  );

  // Analytic artifact is optional — when missing (fresh country, no
  // analyzer run yet) the page still renders the summary table.
  const report = loadModelComparison(entry.id);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#fbfaf7" }}>
      <Header
        subtitle={t("subtitle", { country: entry.name })}
        basePath={`/${entry.id}`}
      />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h1 className="text-2xl font-medium text-[var(--undp-black)]">
            {t("title", { country: entry.name })}
          </h1>
          <Link
            href={`/${entry.id}/model-evaluation`}
            className="text-sm text-[var(--undp-blue)] hover:underline"
          >
            {t("openEvaluation")}
          </Link>
        </div>
        <p className="text-sm text-[var(--undp-gray)] mb-6 max-w-3xl">
          {t("intro", { country: entry.name, count: models.length })}
          {staleCorpus && (
            <>
              {" "}
              {t("corpusCaveat", {
                reference: prettifySlug(reference.slug),
                targets: reference.totalTargets ?? 0,
                pairs: reference.totalPairs ?? 0,
              })}
            </>
          )}
        </p>

        <div className="overflow-x-auto border border-gray-100 bg-white rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--undp-gray)]">
              <tr>
                <th className="text-left px-4 py-3">{t("th.model")}</th>
                <th className="text-right px-4 py-3">{t("th.status")}</th>
                <th className="text-right px-4 py-3">{t("th.wallClock")}</th>
                <th className="text-right px-4 py-3">{t("th.llmCalls")}</th>
                <th className="text-right px-4 py-3">{t("th.targets")}</th>
                <th className="text-right px-4 py-3">{t("th.pairs")}</th>
                <th className="text-right px-4 py-3">{t("th.high")}</th>
                <th className="text-right px-4 py-3">{t("th.flagged")}</th>
                <th className="text-right px-4 py-3">{t("th.energy")}</th>
                <th className="text-right px-4 py-3">{t("th.co2")}</th>
                <th className="text-right px-4 py-3">{t("th.water")}</th>
                <th className="text-right px-4 py-3">{t("th.footprintSource")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.slug} className="border-t border-gray-100">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/${entry.id}?model=${row.slug}`}
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
                    {fmtNumber(row.totalTargets)}
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
                      <em className="text-amber-700">{t("source.estimated")}</em>
                    ) : row.source === "mixed" ? (
                      <em className="text-amber-700">{t("source.mixed")}</em>
                    ) : row.source === "measured" ? (
                      <span className="text-green-700">{t("source.measured")}</span>
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
          {t("clickHint", { country: entry.name })} {tDash("footer.text")}
        </p>

        {report ? (
          <AnalysisSections report={report} />
        ) : (
          <p className="text-xs text-[var(--undp-gray)] mt-8 italic max-w-3xl">
            {t.rich("runHint", {
              command: (chunks) => (
                <code className="font-mono text-[10px] px-1 bg-gray-100">
                  {chunks}
                </code>
              ),
              country: entry.id,
            })}
          </p>
        )}
      </main>
    </div>
  );
}
