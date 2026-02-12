import Image from "next/image";
import Link from "next/link";
import {
  MONGOLIA_TARGETS,
  NBS_CATEGORIES,
  THEMES,
  MONGOLIA_NBS_CLASSIFICATIONS,
  MONGOLIA_THEME_CLASSIFICATIONS,
  MONGOLIA_CLASSIFICATIONS,
  MONGOLIA_ALIGNMENT,
  NBT_NDC_ALIGNMENT,
  NBT_NAP_ALIGNMENT,
  NDC_NAP_ALIGNMENT,
} from "@/data";
import { countByCategory } from "@/lib/utils";
import { NbsBarChart } from "@/components/viz/nbs-bar-chart";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { AlignmentHeatmap } from "@/components/viz/alignment-heatmap";
import { AlignmentNetworkSelector } from "@/components/viz/alignment-network-selector";
import { DashboardStats } from "@/components/viz/dashboard-stats";
import { OutcomeStats } from "@/components/viz/outcome-stats";

export const metadata = {
  title: "Mongolia Dashboard — CPC Tracker",
};

export default function DashboardPage() {
  const targets = MONGOLIA_TARGETS;

  // Target subsets
  const napTargets = targets.filter((t) => t.sourceDocument === "NAP");
  const ndcTargets = targets.filter((t) => t.sourceDocument === "NDC");
  const nbtTargets = targets.filter((t) => t.sourceDocument === "NBSAP");

  const nbsCounts = countByCategory(targets, MONGOLIA_NBS_CLASSIFICATIONS, NBS_CATEGORIES);
  const themeCounts = countByCategory(targets, MONGOLIA_THEME_CLASSIFICATIONS, THEMES);

  const targetsWithNbs = new Set(
    MONGOLIA_NBS_CLASSIFICATIONS.filter((c) => c.isRelevant).map((c) => c.targetId)
  ).size;

  const documentTypes = ["NDC", "NBSAP", "NAP"] as const;
  const nbsSorted = [...nbsCounts].sort((a, b) => b.total - a.total);
  const themeSorted = [...themeCounts].sort((a, b) => b.total - a.total);

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-4">
              <Image src="/undp-logo.png" alt="UNDP" width={40} height={60} className="h-9 w-auto" />
              <div>
                <p className="text-sm font-medium text-[var(--undp-black)]">Policy Coherence Tracker</p>
                <p className="text-xs text-[var(--undp-gray)]">Mongolia Pilot</p>
              </div>
            </Link>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/upload" className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors">
              Upload Data
            </Link>
            <Link href="/" className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors">
              Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Page title */}
        <section className="mb-10">
          <h1 className="text-2xl font-medium text-[var(--undp-black)] mb-1">
            Mongolia Nature-Climate Target Assessment
          </h1>
          <p className="text-sm text-[var(--undp-gray)]">
            AI-assisted assessment for national review and consideration
          </p>
        </section>

        {/* Key stats row — click to view targets */}
        <DashboardStats
          totalTargets={targets.length}
          nbtTargets={nbtTargets}
          ndcTargets={ndcTargets}
          napTargets={napTargets}
          alignmentCount={MONGOLIA_ALIGNMENT.length}
        />

        {/* NBS bar chart + side stats */}
        <section className="grid md:grid-cols-3 gap-6 mb-10">
          <div className="md:col-span-2 bg-[var(--undp-light)] p-6">
            <NbsBarChart
              title="Nature-Based Solutions Breakdown"
              subtitle={`${targetsWithNbs} targets (${Math.round((targetsWithNbs / targets.length) * 100)}%) appear to refer to Nature-Based Solutions. Click a segment to see which targets.`}
              data={nbsSorted}
              documentTypes={[...documentTypes]}
              targets={targets}
              nbsClassifications={MONGOLIA_NBS_CLASSIFICATIONS}
            />
          </div>
          <OutcomeStats
            quantitativeTargets={targets.filter((t) => t.isQuantitative)}
            timeBoundTargets={targets.filter((t) => t.isTimeBound)}
            totalTargets={targets.length}
          />
        </section>

        {/* Cross-cutting themes */}
        <section className="bg-[var(--undp-light)] p-6 mb-10">
          <ThemeBarChart
            title="Cross-Cutting Themes"
            subtitle="Number of targets that appear to pertain to each theme. Click a segment to see which targets."
            data={themeSorted}
            documentTypes={[...documentTypes]}
            targets={targets}
            themeClassifications={MONGOLIA_THEME_CLASSIFICATIONS}
          />
        </section>

        {/* Alignment Network Graph — filterable by NBS category or theme */}
        <section className="bg-[var(--undp-light)] p-6 mb-10">
          <AlignmentNetworkSelector
            alignmentData={MONGOLIA_ALIGNMENT}
            targets={targets}
            nbsCategories={NBS_CATEGORIES}
            themes={THEMES}
            classifications={MONGOLIA_CLASSIFICATIONS}
          />
        </section>

        {/* Alignment Heatmaps */}
        <section className="mb-10">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[var(--undp-black)]">
              Pairwise Alignment Analysis
            </h2>
            <p className="text-sm text-[var(--undp-gray)] mt-1">
              Hover over cells to see alignment rationale between target pairs.
              Green intensity indicates alignment strength.
            </p>
          </div>

          {/* NBT × NDC */}
          <div className="bg-[var(--undp-light)] p-6 mb-6">
            <AlignmentHeatmap
              title="National Biodiversity Targets × NDC Targets"
              alignmentData={NBT_NDC_ALIGNMENT}
              rowTargets={nbtTargets}
              colTargets={ndcTargets}
              rowLabel="NBTs ↓"
              colLabel="NDC Targets →"
            />
          </div>

          {/* NBT × NAP */}
          <div className="bg-[var(--undp-light)] p-6 mb-6">
            <AlignmentHeatmap
              title="National Biodiversity Targets × NAP Targets"
              alignmentData={NBT_NAP_ALIGNMENT}
              rowTargets={nbtTargets}
              colTargets={napTargets}
              rowLabel="NBTs ↓"
              colLabel="NAP Targets →"
            />
          </div>

          {/* NDC × NAP */}
          <div className="bg-[var(--undp-light)] p-6 mb-6">
            <AlignmentHeatmap
              title="NDC Targets × NAP Targets"
              alignmentData={NDC_NAP_ALIGNMENT}
              rowTargets={ndcTargets}
              colTargets={napTargets}
              rowLabel="NDC Targets ↓"
              colLabel="NAP Targets →"
            />
          </div>
        </section>

        {/* Methodology note */}
        <section className="mb-10 bg-[var(--undp-light)] p-6">
          <h3 className="text-sm font-semibold text-[var(--undp-black)] mb-2">
            About this analysis
          </h3>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-3">
            This dashboard displays pilot results from Mongolia&apos;s
            Nature-Climate Target Alignment Assessment. {targets.length} targets
            from the 2025 NAP, NDC 3.0, and National Biodiversity Targets were
            classified against 10 NBS categories and 10 cross-cutting themes.
          </p>
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
            <strong>Note:</strong> Classification and alignment data was
            extracted from the existing static report for prototyping purposes.
            In production, these results will be generated live by the
            multi-agent LLM pipeline. All results should be validated with
            national experts.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
