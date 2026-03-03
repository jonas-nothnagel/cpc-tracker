"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { countByCategory, DOC_LABELS } from "@/lib/utils";
import { NbsBarChart } from "@/components/viz/nbs-bar-chart";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { AlignmentHeatmap } from "@/components/viz/alignment-heatmap";
import { AlignmentNetworkSelector } from "@/components/viz/alignment-network-selector";
import { DataSourcesOverview } from "@/components/viz/data-sources-overview";
import { OutcomeStats } from "@/components/viz/outcome-stats";
import { CoherencyChord } from "@/components/viz/coherency-chord";
import { ContradictionSummary } from "@/components/viz/contradiction-summary";
import { SectorScorecard } from "@/components/viz/sector-scorecard";
import { EmissionsTrend } from "@/components/viz/emissions-trend";
import { isContradiction } from "@/types";
import type {
  Target,
  PolicyDocumentType,
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  IpccSector,
  BtrData,
} from "@/types";

interface DashboardData {
  targets: Target[];
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  classifications: ThematicClassification[];
  alignment: AlignmentResult[];
  btrData: BtrData | null;
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

function normalizeSector(t: Record<string, unknown>): IpccSector {
  return {
    id: String(t.id),
    name: String(t.name),
    description: String(t.description ?? ""),
  };
}

interface DocPair {
  docA: string;
  docB: string;
  label: string;
  rowTargets: Target[];
  colTargets: Target[];
}

/** Single heatmap with a tab strip to select which document pair to view. */
function HeatmapWithSelector({
  docPairs,
  alignment,
  targets,
}: {
  docPairs: DocPair[];
  alignment: AlignmentResult[];
  targets: Target[];
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const pair = docPairs[selectedIdx] ?? docPairs[0];

  const filteredAlignment = useMemo(
    () => pair ? filterAlignmentByDocPair(alignment, targets, pair.docA, pair.docB) : [],
    [alignment, targets, pair]
  );

  if (!pair) return null;

  return (
    <div className="bg-[var(--undp-light)] border border-gray-100 rounded-lg overflow-hidden">
      {/* Tab strip — only shown when more than one pair */}
      {docPairs.length > 1 && (
        <div className="flex flex-wrap gap-0 border-b border-gray-100 bg-white/60">
          {docPairs.map((p, i) => (
            <button
              key={`${p.docA}-${p.docB}`}
              type="button"
              onClick={() => setSelectedIdx(i)}
              className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${
                i === selectedIdx
                  ? "border-[var(--undp-blue)] text-[var(--undp-blue)] bg-white"
                  : "border-transparent text-[var(--undp-gray)] hover:text-[var(--undp-black)] hover:bg-gray-50"
              }`}
            >
              {DOC_LABELS[p.docA as Target["sourceDocument"]]} × {DOC_LABELS[p.docB as Target["sourceDocument"]]}
            </button>
          ))}
        </div>
      )}
      <div className="p-6">
        <AlignmentHeatmap
          title={pair.label}
          alignmentData={filteredAlignment}
          rowTargets={pair.rowTargets}
          colTargets={pair.colTargets}
          rowLabel={`${DOC_LABELS[pair.docA as Target["sourceDocument"]]} ↓`}
          colLabel={`${DOC_LABELS[pair.docB as Target["sourceDocument"]]} →`}
        />
      </div>
    </div>
  );
}

/** Alignment section — chord + network collapsed behind a toggle by default */
function AlignmentSection({
  alignment, targets, nbsCategories, sectors, classifications,
}: {
  alignment: AlignmentResult[];
  targets: Target[];
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  classifications: ThematicClassification[];
}) {
  const [showDetail, setShowDetail] = useState(false);

  const high = alignment.filter((a) => a.alignment === "high").length;
  const medium = alignment.filter((a) => a.alignment === "medium").length;
  const contradictionCount = alignment.filter((a) => isContradiction(a.alignment)).length;

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">Cross-Document Alignment &amp; Contradictions</h2>
          <p className="text-sm text-[var(--undp-gray)] mt-1">
            {alignment.length} target pairs assessed across policy documents —{" "}
            <span className="text-[#4c9f38] font-medium">{high} high</span> and{" "}
            <span className="text-[#0468b1] font-medium">{medium} medium</span> alignment found.
            {contradictionCount > 0 && (
              <>
                {" "}<span className="text-red-600 font-medium">{contradictionCount} contradiction{contradictionCount !== 1 ? "s" : ""}</span> detected.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--undp-blue)] border border-[var(--undp-blue)]/30 rounded-lg hover:bg-[var(--undp-blue)]/05 transition-colors"
        >
          {showDetail ? "Hide detail" : "Show detail"}
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`transition-transform ${showDetail ? "rotate-180" : ""}`}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {showDetail && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[var(--undp-light)] border border-gray-100 p-6">
            <CoherencyChord
              alignmentData={alignment}
              targets={targets}
              onPairClick={() => {
                const el = document.getElementById("heatmap-section");
                if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          </div>
          <div className="bg-[var(--undp-light)] border border-gray-100 p-6 overflow-hidden">
            <AlignmentNetworkSelector
              alignmentData={alignment}
              targets={targets}
              nbsCategories={nbsCategories}
              sectors={sectors}
              classifications={classifications}
            />
          </div>
        </div>
      )}
    </section>
  );
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
          sectors: (raw.sectors ?? []).map(normalizeSector),
          classifications: raw.classifications ?? [],
          alignment: raw.alignment ?? [],
          btrData: raw.btrData ?? null,
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
  const sectorClassifications = data.classifications.filter(
    (c) => c.taxonomyType === "sector"
  );

  const nbsCounts = countByCategory(
    targets,
    nbsClassifications,
    data.nbsCategories
  );
  const sectorCounts = countByCategory(
    targets,
    sectorClassifications,
    data.sectors
  );

  const targetsWithNbs = new Set(
    nbsClassifications.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;

  const documentTypes = Array.from(targetsByDoc.keys()) as Target["sourceDocument"][];
  const nbsSorted = [...nbsCounts].sort((a, b) => b.total - a.total);
  const sectorSorted = [...sectorCounts].sort((a, b) => b.total - a.total);


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

        <DataSourcesOverview
          targets={targets}
          alignmentOpportunities={data.alignment.filter((a) => a.alignment === "high" || a.alignment === "medium").length}
          btrData={data.btrData}
        />

        {/* --- Thematic Classification --- */}
        <section className="mb-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-[var(--undp-black)]">
              Thematic Classification
            </h2>
            <p className="text-sm text-[var(--undp-gray)] mt-1">
              How targets map to nature-based solutions and IPCC sectors.
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
            title="IPCC Sector Classification"
            subtitle="Number of targets per IPCC sector. Click a segment to see which targets."
            data={sectorSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={sectorClassifications}
            taxonomyType="sector"
          />
        </section>

        {/* --- Alignment & Contradictions Analysis --- */}
        <AlignmentSection
          alignment={data.alignment}
          targets={targets}
          nbsCategories={data.nbsCategories}
          sectors={data.sectors}
          classifications={data.classifications}
        />

        {/* --- Contradiction Summary --- */}
        <ContradictionSummary
          alignmentData={data.alignment}
          targets={targets}
        />

        {/* --- Pairwise Detail --- */}
        {docPairs.length > 0 && (
          <section className="mb-10" id="heatmap-section">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--undp-black)]">
                Pairwise Alignment Detail
              </h2>
              <p className="text-sm text-[var(--undp-gray)] mt-1">
                Select a document pair to explore target-level alignment. Hover cells for rationale.
                Green indicates alignment, red/amber indicates contradiction.
              </p>
            </div>
            <HeatmapWithSelector
              docPairs={docPairs}
              alignment={data.alignment}
              targets={targets}
            />
          </section>
        )}

        {/* --- Implementation Gap Analysis (BTR data) --- */}
        {data.btrData && data.btrData.mitigationMeasures.length > 0 && (
          <section className="mb-10">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-[var(--undp-black)]">
                Policy-to-Implementation Overview
              </h2>
              <p className="text-sm text-[var(--undp-gray)] mt-1">
                How national policy targets connect to reported implementation measures by sector.{" "}
                {data.btrData.mitigationMeasures.length} mitigation measures and{" "}
                {data.btrData.technologySupport.length + data.btrData.capacityBuilding.length} support
                projects from the Biennial Transparency Report.
              </p>
            </div>

            <SectorScorecard
              btrData={data.btrData}
              targets={targets}
              sectors={data.sectors}
              classifications={data.classifications}
            />

            <div className="bg-[var(--undp-light)] border border-gray-100 p-6 mt-4 rounded-lg">
              <EmissionsTrend btrData={data.btrData} />
            </div>
          </section>
        )}

        <section className="mb-10 bg-[var(--undp-light)] border border-gray-100 p-6">
          <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-2">
            About this analysis
          </h3>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-3">
            This dashboard displays results from the Nature-Climate Target
            Assessment pipeline. {targets.length} targets
            from {documentTypes.length} document source{documentTypes.length !== 1 ? "s" : ""} were
            classified against {data.nbsCategories.length} NBS categories
            and {data.sectors.length} IPCC sectors. Alignment and
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
