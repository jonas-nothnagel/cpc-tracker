import { notFound } from "next/navigation";
import { Header } from "@/components/ui/header";
import { Link } from "@/i18n/navigation";
import {
  listAvailableModels,
  loadModelComparison,
  loadModelFlaggedPairKeys,
  loadRatings,
} from "@/lib/dashboard-data";
import { EvaluationSections } from "@/components/model-comparison/analysis-sections";

const COUNTRY = "mongolia";

// Ratings and model outputs live on the persistent volume and change at
// runtime (reviewer clicks, pipeline re-runs). Without this the page is
// statically prerendered at DOCKER BUILD time, baking in the committed seed
// ledger — live ratings then silently vanish on every reload.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: "Mongolia model evaluation | CPC Analyzer" };
}

export default async function MongoliaModelEvaluationPage() {
  const models = listAvailableModels(COUNTRY);
  if (models.length === 0) notFound();

  const report = loadModelComparison(COUNTRY);
  const ratings = loadRatings(COUNTRY);
  const flaggedByModel = loadModelFlaggedPairKeys(COUNTRY);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#fbfaf7" }}
    >
      <Header subtitle="Mongolia · Model evaluation" basePath="/mongolia" />
      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h1 className="text-2xl font-medium text-[var(--undp-black)]">
            Mongolia · manual evaluation
          </h1>
          <Link
            href="/mongolia/model-comparison"
            className="text-sm text-[var(--undp-blue)] hover:underline"
          >
            ← Back to model comparison
          </Link>
        </div>
        <p className="text-sm text-[var(--undp-gray)] mb-6 max-w-3xl">
          Rate individual flagged pairs as &ldquo;real concern&rdquo;,
          &ldquo;thin / not actionable&rdquo;, or &ldquo;skip&rdquo;. The
          tool produces a precision estimate per sample with a Wilson 95%
          confidence interval. Ratings persist to the server-side ledger{" "}
          <code className="font-mono text-[10px] px-1 bg-gray-100">
            python/output/ratings-ledger.jsonl
          </code>{" "}
          — visible across browsers, devices, and reviewers, and kept across
          model re-runs and deploys.
        </p>

        {report ? (
          <EvaluationSections
            report={report}
            initialRatings={ratings}
            flaggedByModel={flaggedByModel}
          />
        ) : (
          <p className="text-xs text-[var(--undp-gray)] mt-8 italic max-w-3xl">
            Run{" "}
            <code className="font-mono text-[10px] px-1 bg-gray-100">
              uv run python -m src.analyze_model_comparison --country {COUNTRY}
            </code>{" "}
            to generate the evaluation samples first.
          </p>
        )}
      </main>
    </div>
  );
}
