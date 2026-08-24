import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/ui/header";
import { Link } from "@/i18n/navigation";
import { getCountry, isValidCountryId } from "@/config/countries";
import {
  computeModelAgreement,
  listAvailableModels,
  loadModelAlignmentLabels,
  loadModelComparison,
  loadModelFlaggedPairKeys,
  loadRatings,
  sanitizeForBlindEvaluation,
} from "@/lib/dashboard-data";
import { EvaluationSections } from "@/components/model-comparison/analysis-sections";

interface PageProps {
  params: Promise<{ country: string }>;
}

// Ratings and model outputs live on the persistent volume and change at
// runtime (reviewer clicks, pipeline re-runs). Without this the page is
// statically prerendered at DOCKER BUILD time, baking in the committed seed
// ledger — live ratings then silently vanish on every reload.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps) {
  const { country } = await params;
  const entry = isValidCountryId(country.toLowerCase())
    ? getCountry(country.toLowerCase())
    : undefined;
  if (!entry?.visible) return { title: "CPC Analyzer" };
  return { title: `${entry.name} model evaluation | CPC Analyzer` };
}

export default async function ModelEvaluationPage({ params }: PageProps) {
  const { country } = await params;
  const lower = country.toLowerCase();
  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  const t = await getTranslations("modelEvaluation");
  const models = listAvailableModels(entry.id);
  if (models.length === 0) notFound();

  const fullReport = loadModelComparison(entry.id);
  // Blind evaluation: only the sanitized slice ever reaches the client —
  // model verdicts and rationales must not be recoverable via view-source.
  const report = fullReport ? sanitizeForBlindEvaluation(fullReport) : null;
  const ratings = loadRatings(entry.id);
  const flaggedByModel = loadModelFlaggedPairKeys(entry.id);
  // Aggregate agreement only — per-pair model verdicts stay on the server.
  const modelAgreement = computeModelAgreement(
    loadModelAlignmentLabels(entry.id),
    ratings,
  );

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#fbfaf7" }}
    >
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
            href={`/${entry.id}/model-comparison`}
            className="text-sm text-[var(--undp-blue)] hover:underline"
          >
            {t("back")}
          </Link>
        </div>
        <p className="text-sm text-[var(--undp-gray)] mb-6 max-w-3xl">
          {t.rich("intro", {
            path: (chunks) => (
              <code className="font-mono text-[10px] px-1 bg-gray-100">
                {chunks}
              </code>
            ),
          })}
        </p>

        {report ? (
          <EvaluationSections
            report={report}
            initialRatings={ratings}
            flaggedByModel={flaggedByModel}
            modelAgreement={modelAgreement}
          />
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
