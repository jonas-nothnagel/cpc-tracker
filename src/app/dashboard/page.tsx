import Image from "next/image";
import Link from "next/link";
import {
  MONGOLIA_TARGETS,
  NBS_CATEGORIES,
  THEMES,
  MONGOLIA_NBS_CLASSIFICATIONS,
  MONGOLIA_THEME_CLASSIFICATIONS,
  MONGOLIA_ALIGNMENT,
  NBT_NDC_ALIGNMENT,
  NBT_NAP_ALIGNMENT,
  NDC_NAP_ALIGNMENT,
} from "@/data";
import { countByCategory } from "@/lib/utils";
import { NbsBarChart } from "@/components/viz/nbs-bar-chart";
import { ThemeBarChart } from "@/components/viz/theme-bar-chart";
import { AlignmentHeatmap } from "@/components/viz/alignment-heatmap";
import { AlignmentNetwork } from "@/components/viz/alignment-network";
import { TargetTable } from "@/components/viz/target-table";

export const metadata = {
  title: "Mongolia Dashboard — CPC Tracker",
};

export default function DashboardPage() {
  const targets = MONGOLIA_TARGETS;

  // Target subsets
  const napTargets = targets.filter((t) => t.sourceDocument === "NAP");
  const ndcTargets = targets.filter((t) => t.sourceDocument === "NDC");
  const nbtTargets = targets.filter((t) => t.sourceDocument === "NBSAP");

  const quantitativeCount = targets.filter((t) => t.isQuantitative).length;
  const timeBoundCount = targets.filter((t) => t.isTimeBound).length;

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
      <header className="border-b border-gray-200 sticky top-0 bg-white z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image src="/undp-logo.png" alt="UNDP" width={40} height={64} className="h-10 w-auto" />
            </Link>
            <div className="border-l border-gray-200 pl-4">
              <p className="text-sm font-medium text-[var(--undp-black)]">Policy Coherence Tracker</p>
              <p className="text-xs text-[var(--undp-gray)]">🇲🇳 Mongolia Pilot</p>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/upload" className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors">
              Upload Data
            </Link>
            <Link href="/" className="text-[var(--undp-gray)] hover:text-[var(--undp-blue)] transition-colors">
              ← Home
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-6 py-8 w-full">
        {/* Hero banner */}
        <section className="relative rounded-lg overflow-hidden mb-8">
          <div className="bg-gradient-to-r from-[#1a365d] to-[#0468b1] px-8 py-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/60 mb-2">Key Findings</p>
                <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
                  Mongolia Nature-Climate Target Assessment
                </h1>
                <p className="text-sm text-white/70">
                  AI-assisted assessment for national review and consideration
                </p>
              </div>
              {/* UNDP logo on blue banner — white pill for visibility */}
              <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 hidden md:block">
                <Image
                  src="/undp-logo.png"
                  alt="UNDP"
                  width={48}
                  height={72}
                  className="h-12 w-auto brightness-0 invert"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Key stats row */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <div className="col-span-2 md:col-span-1 border border-gray-200 rounded-lg p-5 flex flex-col items-center justify-center text-center">
            <p className="text-4xl font-bold text-[var(--undp-blue)] tabular-nums">{targets.length}</p>
            <p className="text-sm text-[var(--undp-gray)] mt-1">targets from 3 sources</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 text-center">
            <p className="text-3xl font-bold text-[var(--undp-green)] tabular-nums">{nbtTargets.length}</p>
            <p className="text-xs text-[var(--undp-gray)] mt-1 leading-snug">National Biodiversity<br />Targets</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 text-center">
            <p className="text-3xl font-bold text-[var(--undp-blue)] tabular-nums">{ndcTargets.length}</p>
            <p className="text-xs text-[var(--undp-gray)] mt-1 leading-snug">Nationally Determined<br />Contributions</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 text-center">
            <p className="text-3xl font-bold text-[var(--undp-yellow)] tabular-nums">{napTargets.length}</p>
            <p className="text-xs text-[var(--undp-gray)] mt-1 leading-snug">National Adaptation<br />Plan Targets</p>
          </div>
          <div className="border border-gray-200 rounded-lg p-5 text-center">
            <p className="text-3xl font-bold text-[var(--undp-blue-light)] tabular-nums">{MONGOLIA_ALIGNMENT.length}</p>
            <p className="text-xs text-[var(--undp-gray)] mt-1 leading-snug">Alignment<br />Opportunities</p>
          </div>
        </section>

        {/* NBS bar chart + side stats */}
        <section className="grid md:grid-cols-3 gap-6 mb-10">
          <div className="md:col-span-2 border border-gray-200 rounded-lg p-6">
            <NbsBarChart
              title="Nature-Based Solutions Breakdown"
              subtitle={`${targetsWithNbs} targets (${Math.round((targetsWithNbs / targets.length) * 100)}%) appear to refer to Nature-Based Solutions`}
              data={nbsSorted}
              documentTypes={[...documentTypes]}
            />
          </div>
          <div className="flex flex-col gap-4">
            <div className="border border-gray-200 rounded-lg p-6 flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-5xl font-bold text-[var(--undp-blue)] tabular-nums">
                {Math.round((quantitativeCount / targets.length) * 100)}%
              </p>
              <p className="text-sm text-[var(--undp-gray)] mt-2">
                of targets include<br />measurable outcomes
              </p>
            </div>
            <div className="border border-gray-200 rounded-lg p-6 flex-1 flex flex-col items-center justify-center text-center">
              <p className="text-5xl font-bold text-[var(--undp-blue)] tabular-nums">
                {Math.round((timeBoundCount / targets.length) * 100)}%
              </p>
              <p className="text-sm text-[var(--undp-gray)] mt-2">
                of targets include<br />time-bound commitments
              </p>
            </div>
          </div>
        </section>

        {/* Cross-cutting themes */}
        <section className="border border-gray-200 rounded-lg p-6 mb-10">
          <ThemeBarChart
            title="Cross-Cutting Themes"
            subtitle="Number of targets that appear to pertain to each theme"
            data={themeSorted}
            documentTypes={[...documentTypes]}
          />
        </section>

        {/* Alignment Network Graph */}
        <section className="border border-gray-200 rounded-lg p-6 mb-10">
          <AlignmentNetwork
            title="Target Alignment Network"
            subtitle="Most connected targets across all policy documents. Hover a node to see its connections. Edge color indicates alignment strength."
            alignmentData={MONGOLIA_ALIGNMENT}
            targets={targets}
            maxNodes={12}
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
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
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
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
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
          <div className="border border-gray-200 rounded-lg p-6 mb-6">
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

        {/* Target Explorer */}
        <section className="mb-10">
          <h3 className="text-lg font-semibold text-[var(--undp-black)] mb-4">
            Target Explorer
          </h3>
          <TargetTable targets={targets} />
        </section>

        {/* Methodology note */}
        <section className="mb-10 bg-[var(--undp-light)] border border-gray-200 rounded-lg p-6">
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
      <footer className="border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker Prototype
        </div>
      </footer>
    </div>
  );
}
