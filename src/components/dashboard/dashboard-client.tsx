"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { countByCategory, DOC_LABELS } from "@/lib/utils";
import { NbsBarChart } from "@/components/viz/nbs-bar-chart";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { AlignmentHeatmap } from "@/components/viz/alignment-heatmap";
import { AlignmentNetworkSelector } from "@/components/viz/alignment-network-selector";
import { DashboardStats } from "@/components/viz/dashboard-stats";
import { OutcomeStats } from "@/components/viz/outcome-stats";
import { CoherencyChord } from "@/components/viz/coherency-chord";
import { ContradictionSummary } from "@/components/viz/contradiction-summary";
import { isContradiction } from "@/types";
import type {
  Target,
  PolicyDocumentType,
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  Theme,
} from "@/types";

interface DashboardData {
  targets: Target[];
  nbsCategories: NbsCategory[];
  themes: (Theme & { isCustom?: boolean })[];
  classifications: ThematicClassification[];
  alignment: AlignmentResult[];
}

/** Filter alignment to pairs between two document types */
function filterAlignmentByDocPair(
  alignment: AlignmentResult[],
  targets: Target[],
  docA: string,
  docB: string
): AlignmentResult[] {
  const idsA = new Set(
    targets.filter((t) => t.sourceDocument === docA).map((t) => t.id)
  );
  const idsB = new Set(
    targets.filter((t) => t.sourceDocument === docB).map((t) => t.id)
  );
  return alignment.filter(
    (a) =>
      (idsA.has(a.targetAId) && idsB.has(a.targetBId)) ||
      (idsB.has(a.targetAId) && idsA.has(a.targetBId))
  );
}

/** Ensure targets have optional fields */
function normalizeTarget(t: Record<string, unknown>): Target {
  return {
    id: String(t.id),
    text: String(t.text),
    sourceDocument: t.sourceDocument as Target["sourceDocument"],
    sourceLabel: String(t.sourceLabel),
    country: String(t.country),
    isQuantitative: Boolean(t.isQuantitative),
    isTimeBound: Boolean(t.isTimeBound),
    quantitativeDetails: t.quantitativeDetails ? String(t.quantitativeDetails) : undefined,
    timeBoundDetails: t.timeBoundDetails ? String(t.timeBoundDetails) : undefined,
  };
}

/** Add isCustom to themes from API */
function normalizeTheme(t: Record<string, unknown>): Theme {
  return {
    id: String(t.id),
    name: String(t.name),
    description: String(t.description ?? ""),
    isCustom: false,
  };
}

export function DashboardClient({ analysisId }: { analysisId?: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = analysisId
      ? `/api/dashboard?analysisId=${encodeURIComponent(analysisId)}`
      : "/api/dashboard";
    fetch(url)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      })
      .then((raw) => {
        setData({
          targets: (raw.targets ?? []).map(normalizeTarget),
          nbsCategories: raw.nbsCategories ?? [],
          themes: (raw.themes ?? []).map(normalizeTheme),
          classifications: raw.classifications ?? [],
          alignment: raw.alignment ?? [],
        });
      })
      .catch((e) => setError(e?.error ?? String(e)));
  }, [analysisId]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-white p-8">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-lg font-medium text-red-600 mb-2">
            Could not load dashboard data
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mb-4">{error}</p>
          <p className="text-sm text-[var(--undp-gray)]">
            Run the pipeline first:{" "}
            <code className="bg-gray-100 px-2 py-1 rounded">
              cd python && uv run python -m src.run_analysis
            </code>
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <p className="text-[var(--undp-gray)]">Loading dashboard…</p>
      </div>
    );
  }

  const targets = data.targets;

  // Group targets by document type (dynamic)
  const targetsByDoc = new Map<string, Target[]>();
  for (const t of targets) {
    const list = targetsByDoc.get(t.sourceDocument) || [];
    list.push(t);
    targetsByDoc.set(t.sourceDocument, list);
  }

  const nbsClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "nbs"
  );
  const themeClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "theme"
  );

  const nbsCounts = countByCategory(
    targets,
    nbsClassifications,
    data.nbsCategories
  );
  const themeCounts = countByCategory(
    targets,
    themeClassifications,
    data.themes
  );

  const targetsWithNbs = new Set(
    nbsClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;

  const documentTypes = Array.from(targetsByDoc.keys()) as Target["sourceDocument"][];
  const nbsSorted = [...nbsCounts].sort((a, b) => b.total - a.total);
  const themeSorted = [...themeCounts].sort((a, b) => b.total - a.total);

  // Generate all document-type pair combinations for heatmaps
  const docPairs: { docA: string; docB: string; label: string; rowTargets: Target[]; colTargets: Target[] }[] = [];
  for (let i = 0; i < documentTypes.length; i++) {
    for (let j = i + 1; j < documentTypes.length; j++) {
      const docA = documentTypes[i];
      const docB = documentTypes[j];
      const rowTargets = targetsByDoc.get(docA) ?? [];
      const colTargets = targetsByDoc.get(docB) ?? [];
      if (rowTargets.length > 0 && colTargets.length > 0) {
        docPairs.push({
          docA,
          docB,
          label: `${DOC_LABELS[docA]} Targets × ${DOC_LABELS[docB]} Targets`,
          rowTargets,
          colTargets,
        });
      }
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4">
              <Image
                src="/undp-logo.png"
                alt="UNDP"
                width={48}
                height={72}
                className="h-12 w-auto"
              />
              <div>
                <p className="text-sm font-medium text-[var(--undp-black)]">
                  Policy Coherence Tracker
                </p>
                <p className="text-xs text-[var(--undp-gray)]">
                  {data?.targets[0]?.country ?? "Dashboard"}
                </p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link
              href="/upload"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Upload Data
            </Link>
            <Link
              href="/"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors"
            >
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        <section className="mb-10">
          <h1 className="text-2xl font-medium text-[var(--undp-black)] mb-1">
            {data.targets[0]?.country ?? "Country"} Nature-Climate Target Assessment
          </h1>
          <p className="text-sm text-[var(--undp-gray)]">
            AI-assisted assessment for national review and consideration
          </p>
        </section>

        <DashboardStats
          targets={targets}
          alignmentCount={data.alignment.filter((a) => !isContradiction(a.alignment) && a.alignment !== "none").length}
          contradictionCount={data.alignment.filter((a) => isContradiction(a.alignment)).length}
        />

        {/* --- Thematic Classification --- */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--undp-black)]">
              Thematic Classification
            </h2>
            <p className="text-sm text-[var(--undp-gray)] mt-1">
              How targets map to nature-based solutions and cross-cutting themes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-[var(--undp-light)] border border-gray-100 p-6">
              <NbsBarChart
                title="Nature-Based Solutions Breakdown"
                subtitle={`${targetsWithNbs} targets (${Math.round((targetsWithNbs / targets.length) * 100)}%) appear to refer to Nature-Based Solutions. Click a segment to see which targets.`}
                data={nbsSorted}
                documentTypes={[...documentTypes]}
                targets={targets}
                nbsClassifications={nbsClassifications}
              />
            </div>
            <div className="flex flex-col h-full">
              <OutcomeStats
                quantitativeTargets={targets.filter((t) => t.isQuantitative)}
                timeBoundTargets={targets.filter((t) => t.isTimeBound)}
                totalTargets={targets.length}
              />
            </div>
          </div>
        </section>

        <section className="bg-[var(--undp-light)] border border-gray-100 p-6 mb-10">
          <ThemeBarChart
            title="Cross-Cutting Themes"
            subtitle="Number of targets that appear to pertain to each theme. Click a segment to see which targets."
            data={themeSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={themeClassifications}
          />
        </section>

        {/* --- Alignment & Contradictions Analysis --- */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--undp-black)]">
              Cross-Document Alignment &amp; Contradictions
            </h2>
            <p className="text-sm text-[var(--undp-gray)] mt-1">
              How targets across policy documents align with or contradict each other.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-[var(--undp-light)] border border-gray-100 p-6">
              <CoherencyChord
                alignmentData={data.alignment}
                targets={targets}
                onPairClick={(docA: PolicyDocumentType, docB: PolicyDocumentType) => {
                  const el = document.getElementById(`heatmap-${docA}-${docB}`) ??
                    document.getElementById(`heatmap-${docB}-${docA}`);
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              />
            </div>
            <div className="bg-[var(--undp-light)] border border-gray-100 p-6 overflow-hidden">
              <AlignmentNetworkSelector
                alignmentData={data.alignment}
                targets={targets}
                nbsCategories={data.nbsCategories}
                themes={data.themes}
                classifications={data.classifications}
              />
            </div>
          </div>
        </section>

        {/* --- Contradiction Summary --- */}
        <ContradictionSummary
          alignmentData={data.alignment}
          targets={targets}
        />

        {/* --- Pairwise Detail --- */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--undp-black)]">
              Pairwise Detail
            </h2>
            <p className="text-sm text-[var(--undp-gray)] mt-1">
              Hover over cells to see relationship rationale between target pairs.
              Green indicates alignment, red/amber indicates contradiction.
            </p>
          </div>

          {docPairs.map((pair) => (
            <div key={`${pair.docA}-${pair.docB}`} id={`heatmap-${pair.docA}-${pair.docB}`} className="bg-[var(--undp-light)] border border-gray-100 p-6 mb-4 scroll-mt-20">
              <AlignmentHeatmap
                title={pair.label}
                alignmentData={filterAlignmentByDocPair(data.alignment, targets, pair.docA, pair.docB)}
                rowTargets={pair.rowTargets}
                colTargets={pair.colTargets}
                rowLabel={`${DOC_LABELS[pair.docA as Target["sourceDocument"]]} ↓`}
                colLabel={`${DOC_LABELS[pair.docB as Target["sourceDocument"]]} →`}
              />
            </div>
          ))}
        </section>

        <section className="mb-10 bg-[var(--undp-light)] border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-2">
            About this analysis
          </h3>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-3">
            This dashboard displays results from the Nature-Climate Target
            Assessment pipeline. {targets.length} targets
            from {documentTypes.length} document source{documentTypes.length !== 1 ? "s" : ""} were
            classified against {data.nbsCategories.length} NBS categories
            and {data.themes.length} cross-cutting themes. Alignment and
            contradictions are assessed pairwise across documents.
          </p>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
            <strong>Note:</strong> All results should be validated with national
            experts.
          </p>
        </section>
      </main>

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
