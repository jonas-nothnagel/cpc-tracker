"use client";

/**
 * CoherenceBriefing — Phase A of the findings-first prototype.
 *
 * Walks the user from a quiet hero through a primer, a build-up prelude, the
 * centerpiece visual (Scene 4), and a verdict. Below the scrollytell sits a
 * top-N fault lines list and the Q2 sector grid. Per-sector briefings open
 * in a side drawer in Phase C; here, tile click is a no-op placeholder.
 *
 * No LLM calls. Every count and verdict bucket is derived from the data
 * passed in (see `lib/coherence-briefing.ts`).
 */

import { useCallback, useMemo, useRef } from "react";
import { ScrollytellShell, Scene } from "./scrollytell-shell";
import {
  HeroScene,
  PrimerScene,
  BuildupPreludeScene,
  VerdictScene,
} from "./scenes";
import { CenterpieceFrame } from "./centerpiece";
import { SectorGrid } from "./sector-grid";
import {
  pickHeadlineVerdict,
  pickFaultLines,
  pickPrimerExamples,
  type FaultLine,
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
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  nbsCategories,
  countryConfig,
}: CoherenceBriefingProps) {
  // Derived briefing inputs, computed once per dataset.
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

  // Anchors so the verdict CTAs scroll the reader to the right section.
  const faultLinesRef = useRef<HTMLDivElement | null>(null);
  const sectorGridRef = useRef<HTMLDivElement | null>(null);
  const jumpToFaultLines = useCallback(() => {
    faultLinesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const jumpToSectors = useCallback(() => {
    sectorGridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="flex-1 w-full">
      <ScrollytellShell totalScenes={5}>
        <Scene id={0}>
          <HeroScene
            countryName={countryName}
            docCount={docCount}
            targetCount={targets.length}
            pairCount={pairCount}
          />
        </Scene>

        <Scene id={1}>
          <PrimerScene
            aligned={primer.aligned}
            tension={primer.tension}
            countryConfig={countryConfig}
          />
        </Scene>

        <Scene id={2}>
          <BuildupPreludeScene targetCount={targets.length} />
        </Scene>

        <Scene id={3} fullBleed minHeight="min-h-[100vh]">
          <CenterpieceFrame
            targets={targets}
            alignments={alignment}
            countryConfig={countryConfig}
          />
        </Scene>

        <Scene id={4}>
          <VerdictScene
            verdict={verdict}
            faultLineCount={faultLines.length}
            onJumpToFaultLines={jumpToFaultLines}
            onJumpToSectors={jumpToSectors}
          />
        </Scene>
      </ScrollytellShell>

      <div ref={faultLinesRef} className="py-16 md:py-24">
        <FaultLinesSection
          faultLines={faultLines}
          countryConfig={countryConfig}
        />
      </div>

      <div ref={sectorGridRef} className="pb-24 md:pb-32">
        <SectorGrid
          targets={targets}
          alignment={alignment}
          classifications={classifications}
          sectors={sectors}
          globeCategories={globeCategories}
          nbsCategories={nbsCategories}
          countryConfig={countryConfig}
        />
      </div>
    </main>
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
  if (faultLines.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-3">
          Fault lines
        </p>
        <h2
          className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-tight mb-3"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          No flagged pairs in this dataset.
        </h2>
        <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
          Either the pipeline scored everything as alignment or none, or the
          dataset is too sparse to flag review-worthy tensions.
        </p>
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-3">
        Fault lines
      </p>
      <h2
        className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-tight mb-3"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        The {faultLines.length} pairs that look most worth a closer look.
      </h2>
      <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-8">
        Sorted by flagged severity, cross-document pairs first. Each is one
        verdict from the pipeline, not a settled finding. The pair-detail
        drawer with the AI rationale ships in Phase C.
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
    <li className="py-5 grid grid-cols-[2rem_1fr] gap-4 items-start">
      <span
        className="text-xs text-[var(--undp-gray)] tabular-nums pt-0.5"
        aria-hidden="true"
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <div className="flex items-center gap-2 mb-2">
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
          <span className="text-[11px] text-[var(--undp-gray)]">
            {docA} {targetA.sourceLabel} {isContra ? "↮" : "↔"} {docB}{" "}
            {targetB.sourceLabel}
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <p
            className="text-sm text-[var(--undp-black)] leading-snug overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {targetA.text}
          </p>
          <p
            className="text-sm text-[var(--undp-black)] leading-snug overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
            }}
          >
            {targetB.text}
          </p>
        </div>
        {pair.description && (
          <p className="mt-3 text-xs text-[var(--undp-gray)] italic leading-relaxed line-clamp-2">
            <span className="not-italic font-medium mr-1 uppercase tracking-wider">
              AI rationale:
            </span>
            {pair.description}
          </p>
        )}
      </div>
    </li>
  );
}
