"use client";

/**
 * CoherenceBriefing — Phase A2 of the findings-first prototype.
 *
 * IA changes from A1:
 *   - Hero introduces both Q1 and Q2 up front (not Q1-then-bottom)
 *   - Tighter scrollytell rhythm: 4 scenes, lower per-scene min-height
 *   - Verdict scene hands off to the Q2 act naturally instead of dropping
 *     two CTAs
 *   - Q2 act is co-equal: section header + clickable sector grid + drawer
 *   - Briefing ends on something genuinely interactive (sector drawer +
 *     take-it-further exit ramp)
 *
 * Still no LLM calls in the briefing copy.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ScrollytellShell, Scene } from "./scrollytell-shell";
import {
  HeroScene,
  PrimerScene,
  CenterpieceIntroBlock,
  VerdictScene,
} from "./scenes";
import { CenterpieceFrame } from "./centerpiece";
import { SectorGrid, type SectorSelection } from "./sector-grid";
import { SectorDrawer } from "./sector-drawer";
import {
  buildSectorBriefing,
  buildSectorTensionDensity,
  pickFaultLines,
  pickHeadlineVerdict,
  pickPrimerExamples,
  type FaultLine,
  type SectorBriefing,
} from "@/lib/coherence-briefing";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  GlobeCategory,
  IpccSector,
  NbsCategory,
  Target,
  ThematicClassification,
} from "@/types";

const FAULT_LINES_TO_SHOW = 5;
const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

interface CoherenceBriefingProps {
  countryName: string;
  countryId?: string;
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  nbsCategories: NbsCategory[];
  countryConfig: CountryConfig | null;
}

export function CoherenceBriefing({
  countryName,
  countryId,
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  nbsCategories,
  countryConfig,
}: CoherenceBriefingProps) {
  // Derived briefing inputs — computed once per dataset.
  const verdict = useMemo(() => pickHeadlineVerdict(alignment), [alignment]);
  const faultLines = useMemo(
    () => pickFaultLines(alignment, targets, FAULT_LINES_TO_SHOW),
    [alignment, targets],
  );
  const primer = useMemo(
    () => pickPrimerExamples(alignment, targets),
    [alignment, targets],
  );
  const docCount = useMemo(() => {
    const docs = new Set<string>();
    for (const t of targets) docs.add(t.sourceDocument);
    return docs.size;
  }, [targets]);
  const pairCount = useMemo(
    () => alignment.filter((a) => a.alignment !== "none").length,
    [alignment],
  );

  // The verdict scene's hinge cites the top-tension sectors so the
  // transition reads as evidence-based, not generic. We compute against the
  // country's default lens (country-custom if available, else IPCC).
  const topSectors = useMemo(() => {
    const lensCats = countryConfig?.countrySectors?.length
      ? {
          taxonomyType: "sector",
          categories: countryConfig.countrySectors.map((c) => ({
            id: c.id,
            name: c.name,
          })),
        }
      : sectors.length > 0
        ? {
            taxonomyType: "sector",
            categories: sectors.map((s) => ({ id: s.id, name: s.name })),
          }
        : globeCategories.length > 0
          ? {
              taxonomyType: "globe",
              categories: globeCategories.map((g) => ({
                id: g.id,
                name: g.name,
              })),
            }
          : null;
    if (!lensCats) return [];
    const density = buildSectorTensionDensity({
      targets,
      alignment,
      classifications,
      categories: lensCats.categories,
      taxonomyType: lensCats.taxonomyType,
    });
    return density
      .filter((d) => d.tensionCount > 0)
      .sort((a, b) => b.tensionCount - a.tensionCount)
      .slice(0, 3)
      .map((d) => d.categoryName);
  }, [
    countryConfig,
    sectors,
    globeCategories,
    targets,
    alignment,
    classifications,
  ]);

  // Anchor for the Q2 act so the verdict CTA can scroll the reader to it.
  const q2Ref = useRef<HTMLDivElement | null>(null);
  const jumpToQ2 = useCallback(() => {
    q2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Sector drawer state.
  const [selection, setSelection] = useState<SectorSelection | null>(null);
  const handleSectorSelect = useCallback((s: SectorSelection) => {
    setSelection(s);
  }, []);
  const handleCloseDrawer = useCallback(() => setSelection(null), []);
  const drawerBriefing = useMemo<SectorBriefing | null>(() => {
    if (!selection) return null;
    return buildSectorBriefing({
      categoryId: selection.categoryId,
      categoryName: selection.categoryName,
      taxonomyType: selection.taxonomyType,
      targets,
      alignment,
      classifications,
      cap: 6,
    });
  }, [selection, targets, alignment, classifications]);

  return (
    <main className="flex-1 w-full">
      <ScrollytellShell totalScenes={4}>
        <Scene id={0} minHeight="min-h-[72vh]">
          <HeroScene
            countryName={countryName}
            docCount={docCount}
            targetCount={targets.length}
            pairCount={pairCount}
          />
        </Scene>

        <Scene id={1} minHeight="min-h-[52vh]">
          <PrimerScene
            aligned={primer.aligned}
            tension={primer.tension}
            countryConfig={countryConfig}
          />
        </Scene>

        <Scene id={2} fullBleed minHeight="min-h-[92vh]" paddingY="py-10">
          <CenterpieceIntroBlock
            targetCount={targets.length}
            countryName={countryName}
          />
          <CenterpieceFrame
            targets={targets}
            alignments={alignment}
            classifications={classifications}
            countryConfig={countryConfig}
          />
        </Scene>

        <Scene id={3} minHeight="min-h-[60vh]">
          <VerdictScene
            verdict={verdict}
            topSectors={topSectors}
            onContinue={jumpToQ2}
          />
        </Scene>
      </ScrollytellShell>

      <div ref={q2Ref} className="py-12 md:py-16">
        <Q2ActHeader />
        <div className="mt-6">
          <SectorGrid
            targets={targets}
            alignment={alignment}
            classifications={classifications}
            sectors={sectors}
            globeCategories={globeCategories}
            nbsCategories={nbsCategories}
            countryConfig={countryConfig}
            onSectorSelect={handleSectorSelect}
          />
        </div>
      </div>

      <div className="pb-12 md:pb-16">
        <FaultLinesSection
          faultLines={faultLines}
          countryConfig={countryConfig}
        />
      </div>

      <ExplorationFooter
        countryId={countryId}
        countryName={countryName}
        tensionCount={verdict.tensionPairs}
      />

      <SectorDrawer
        briefing={drawerBriefing}
        countryConfig={countryConfig}
        onClose={handleCloseDrawer}
      />
    </main>
  );
}

// ─── Q2 act header ──────────────────────────────────────────────────

function Q2ActHeader() {
  return (
    <div className="max-w-5xl mx-auto px-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
        Question 2
      </p>
      <h2
        className="text-3xl md:text-4xl text-[var(--undp-black)] font-medium leading-tight"
        style={{ fontFamily: HEADLINE_SERIF, letterSpacing: "-0.015em" }}
      >
        Where the gaps concentrate.
      </h2>
    </div>
  );
}

// ─── Fault lines section ────────────────────────────────────────────

function FaultLinesSection({
  faultLines,
  countryConfig,
}: {
  faultLines: FaultLine[];
  countryConfig: CountryConfig | null;
}) {
  if (faultLines.length === 0) return null;
  return (
    <div className="max-w-3xl mx-auto px-6">
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
        Country-wide top {faultLines.length}
      </p>
      <h2
        className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-tight mb-3"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        The single pairs most worth a closer look.
      </h2>
      <p className="text-xs text-[var(--undp-gray)] leading-relaxed mb-6">
        Sorted by flagged severity, cross-document pairs first. Each row is
        one verdict from the pipeline, not a settled finding.
      </p>
      <ol className="divide-y divide-gray-200 border-y border-gray-200">
        {faultLines.map((line, i) => (
          <FaultLineRow
            key={`${line.pair.targetAId}__${line.pair.targetBId}`}
            line={line}
            countryConfig={countryConfig}
            index={i}
          />
        ))}
      </ol>
    </div>
  );
}

function FaultLineRow({
  line,
  countryConfig,
  index,
}: {
  line: FaultLine;
  countryConfig: CountryConfig | null;
  index: number;
}) {
  const { targetA, targetB, pair } = line;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const isContra = isContradiction(pair.alignment);
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <li className="py-4 grid grid-cols-[2rem_1fr] gap-3 items-start">
      <span
        className="text-xs text-[var(--undp-gray)] tabular-nums pt-0.5"
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `${color}20`,
              color: color,
              border: `1px solid ${color}40`,
            }}
          >
            {ALIGNMENT_LABELS[pair.alignment]}
          </span>
          <span className="text-[10px] text-[var(--undp-gray)]">
            {docA} {targetA.sourceLabel} {isContra ? "↮" : "↔"} {docB}{" "}
            {targetB.sourceLabel}
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          <p
            className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {targetA.text}
          </p>
          <p
            className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {targetB.text}
          </p>
        </div>
      </div>
    </li>
  );
}

// ─── Exploration footer ─────────────────────────────────────────────

function ExplorationFooter({
  countryId,
  countryName,
  tensionCount,
}: {
  countryId?: string;
  countryName: string;
  tensionCount: number;
}) {
  const dashboardHref = countryId
    ? `/dashboard?country=${encodeURIComponent(countryId)}`
    : "/";
  return (
    <div className="border-t border-gray-200 bg-white/40">
      <div className="max-w-3xl mx-auto px-6 py-14">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
          Take it further
        </p>
        <h2
          className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-tight mb-4"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          Now make the briefing your own.
        </h2>
        <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-8 max-w-xl">
          Click any sector tile to drill into its pairs. Switch the
          centerpiece chip to compare four ways of seeing the same data.
          For the full filterable explorer, with chat and document toggles,
          open the {countryName} dashboard.
        </p>
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium border border-[var(--undp-black)]/50 text-[var(--undp-black)] hover:border-[var(--undp-black)] hover:bg-white transition-colors"
        >
          Open the full coherence explorer
          <span aria-hidden="true">→</span>
        </Link>
        <p className="mt-10 text-[11px] text-[var(--undp-gray)] leading-relaxed">
          This briefing flagged {tensionCount.toLocaleString()} pairs for
          review across the dataset. Pipeline outputs are LLM-derived
          verdicts on pairwise comparisons, not settled findings; treat each
          one as a prompt to look closer.
        </p>
      </div>
    </div>
  );
}
