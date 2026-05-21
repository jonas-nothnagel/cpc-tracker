"use client";

/**
 * CoherenceBriefing — Phase A3 of the findings-first prototype.
 *
 * Architecture change: replaced the scrollytell with a slide deck. The
 * visual (wheel or constellation) is a PERSISTENT element on the right
 * of the viewport that reacts to scene-driven state. The user advances
 * via next/prev (or arrow keys), no vertical scroll inside the briefing.
 *
 * The final slide is an "explore" layout: the text panel becomes a chat
 * input + sector picker, the wheel becomes interactive. The chat hits
 * the existing /api/coherence-chat route.
 *
 * Fingerprint and River centerpiece variants were dropped after the A2
 * round. Only Wheel + Constellation remain.
 */

import { useCallback, useMemo, useState } from "react";
import { SlideDeckShell, type SlideDef } from "./slide-deck-shell";
import { Centerpiece } from "./centerpiece";
import { ChatPanel } from "./chat-panel";
import { SectorDrawer } from "./sector-drawer";
import {
  ALIGNMENT_COLORS,
  getDocMediumLabel,
} from "@/lib/utils";
import {
  buildSectorBriefing,
  buildSectorTensionDensity,
  pickFaultLines,
  pickHeadlineVerdict,
  pickPrimerExamples,
  type FaultLine,
  type SectorBriefing,
  type VerdictBucket,
} from "@/lib/coherence-briefing";
import type { WheelState } from "./centerpiece/wheel";
import type {
  AlignmentResult,
  CountryConfig,
  GlobeCategory,
  IpccSector,
  NbsCategory,
  Target,
  ThematicClassification,
  PolicyDocumentType,
} from "@/types";

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

interface SectorRow {
  id: string;
  name: string;
  count: number;
  taxonomyType: string;
}

export function CoherenceBriefing({
  countryName,
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
}: CoherenceBriefingProps) {
  // ── Derived briefing inputs ─────────────────────────────────────
  const verdict = useMemo(() => pickHeadlineVerdict(alignment), [alignment]);
  const faultLines = useMemo(
    () => pickFaultLines(alignment, targets, 6),
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
  const availableDocs = useMemo<PolicyDocumentType[]>(() => {
    const docs = new Set<PolicyDocumentType>();
    for (const t of targets) docs.add(t.sourceDocument);
    return Array.from(docs);
  }, [targets]);

  // Top sectors picked under the country's default lens. Drives the Q2
  // hinge slides + the explore-mode sector grid.
  const { lensTaxonomy, topSectors } = useMemo(() => {
    const countryCats = countryConfig?.countrySectors ?? [];
    const lens =
      countryCats.length > 0
        ? {
            taxonomyType: "sector",
            categories: countryCats.map((c) => ({ id: c.id, name: c.name })),
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
    if (!lens) return { lensTaxonomy: null, topSectors: [] as SectorRow[] };
    const density = buildSectorTensionDensity({
      targets,
      alignment,
      classifications,
      categories: lens.categories,
      taxonomyType: lens.taxonomyType,
    });
    const top = density
      .filter((d) => d.tensionCount > 0)
      .sort((a, b) => b.tensionCount - a.tensionCount)
      .slice(0, 3)
      .map((d) => ({
        id: d.categoryId,
        name: d.categoryName,
        count: d.tensionCount,
        taxonomyType: lens.taxonomyType,
      }));
    return { lensTaxonomy: lens.taxonomyType, topSectors: top };
  }, [
    targets,
    alignment,
    classifications,
    sectors,
    globeCategories,
    countryConfig,
  ]);

  // ── Centerpiece variant (shared across slides) ──────────────────
  const [variant, setVariant] = useState<"wheel" | "constellation">("wheel");

  // ── Explore-mode state ──────────────────────────────────────────
  const [exploreState, setExploreState] = useState<WheelState>({
    mode: "aggregate",
  });
  const [selection, setSelection] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);
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

  // ── Slides ──────────────────────────────────────────────────────
  const slides: SlideDef[] = buildSlides({
    countryName,
    docCount,
    targetCount: targets.length,
    pairCount,
    verdict,
    primer,
    faultLines,
    topSectors,
    countryConfig,
  });

  // ── Visual state per slide ──────────────────────────────────────
  const slideStates = useMemo<WheelState[]>(
    () => deriveSlideStates(primer, topSectors, lensTaxonomy),
    [primer, topSectors, lensTaxonomy],
  );

  // ── Render visual ───────────────────────────────────────────────
  const renderVisual = useCallback(
    (idx: number) => {
      const slide = slides[idx];
      const state: WheelState = slide?.exploreLayout
        ? exploreState
        : slideStates[idx] ?? { mode: "idle" };
      return (
        <Centerpiece
          targets={targets}
          alignments={alignment}
          classifications={classifications}
          countryConfig={countryConfig}
          state={state}
          variant={variant}
          onVariantChange={setVariant}
          showPicker={!!slide?.exploreLayout}
        />
      );
    },
    [
      slides,
      slideStates,
      exploreState,
      targets,
      alignment,
      classifications,
      countryConfig,
      variant,
    ],
  );

  // ── Render explore mode left panel ──────────────────────────────
  const renderExplore = useCallback(
    () => (
      <ExploreMode
        targets={targets}
        alignment={alignment}
        classifications={classifications}
        sectors={sectors}
        globeCategories={globeCategories}
        countryConfig={countryConfig}
        availableDocs={availableDocs}
        topSectors={topSectors}
        exploreState={exploreState}
        onExploreState={setExploreState}
        onOpenSector={(s) => {
          setSelection(s);
          setExploreState({
            mode: "sector",
            sectorCategoryId: s.categoryId,
            sectorTaxonomyType: s.taxonomyType,
          });
        }}
      />
    ),
    [
      targets,
      alignment,
      classifications,
      sectors,
      globeCategories,
      countryConfig,
      availableDocs,
      topSectors,
      exploreState,
    ],
  );

  return (
    <main className="flex-1 w-full">
      <SlideDeckShell
        slides={slides}
        renderVisual={renderVisual}
        renderExplore={renderExplore}
      />
      <SectorDrawer
        briefing={drawerBriefing}
        countryConfig={countryConfig}
        onClose={handleCloseDrawer}
      />
    </main>
  );
}

// ─── Slide content builder ──────────────────────────────────────────

function buildSlides(args: {
  countryName: string;
  docCount: number;
  targetCount: number;
  pairCount: number;
  verdict: ReturnType<typeof pickHeadlineVerdict>;
  primer: ReturnType<typeof pickPrimerExamples>;
  faultLines: FaultLine[];
  topSectors: SectorRow[];
  countryConfig: CountryConfig | null;
}): SlideDef[] {
  const {
    countryName,
    docCount,
    targetCount,
    pairCount,
    verdict,
    primer,
    faultLines,
    topSectors,
    countryConfig,
  } = args;

  const slides: SlideDef[] = [];

  // 0 — Hero
  slides.push({
    eyebrow: `Policy coherence briefing · ${countryName}`,
    headline: <>A briefing in two questions.</>,
    body: (
      <>
        <p>
          {docCount} {docCount === 1 ? "document" : "documents"},{" "}
          {targetCount.toLocaleString()} targets,{" "}
          {pairCount.toLocaleString()} pairwise comparisons. We answer
          both questions in the next few slides.
        </p>
      </>
    ),
    extra: (
      <ol className="space-y-3 mt-2">
        <li className="flex gap-4 items-baseline">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--undp-gray)] tabular-nums">
            Q1
          </span>
          <span
            className="text-lg text-[var(--undp-black)]"
            style={{ fontFamily: HEADLINE_SERIF }}
          >
            Are these policies pulling the same direction?
          </span>
        </li>
        <li className="flex gap-4 items-baseline">
          <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--undp-gray)] tabular-nums">
            Q2
          </span>
          <span
            className="text-lg text-[var(--undp-black)]"
            style={{ fontFamily: HEADLINE_SERIF }}
          >
            And where are the biggest gaps, sector by sector?
          </span>
        </li>
      </ol>
    ),
  });

  // 1 — Primer 1: aligned example
  slides.push({
    eyebrow: "What you are looking at",
    headline: <>Each line is a pair of targets.</>,
    body: (
      <p>
        Two targets, drawn from two different policy documents, with a
        verdict on whether they pull in the same direction.
      </p>
    ),
    extra: primer.aligned ? (
      <PairCard
        kind="aligned"
        line={primer.aligned}
        countryConfig={countryConfig}
      />
    ) : undefined,
  });

  // 2 — Primer 2: tension example
  slides.push({
    eyebrow: "What you are looking at",
    headline: <>Or sometimes against each other.</>,
    body: (
      <p>
        The pipeline flags these for human review as possible
        misalignments, possible conflicts, or likely conflicts. It does
        not declare a final verdict.
      </p>
    ),
    extra: primer.tension ? (
      <PairCard
        kind="tension"
        line={primer.tension}
        countryConfig={countryConfig}
      />
    ) : undefined,
  });

  // 3 — Reveal
  slides.push({
    eyebrow: "Question 1",
    headline: (
      <>
        Now all {targetCount.toLocaleString()} targets, in one frame.
      </>
    ),
    body: (
      <>
        <p>
          Each ribbon shows the relationship between a pair of documents.
          Green means most pairs across them align; red means most are
          flagged for review.
        </p>
        <p className="text-xs italic text-[var(--undp-gray)]/80">
          Hover a ribbon to see the counts.
        </p>
      </>
    ),
  });

  // 4 — Q1 Verdict
  slides.push({
    eyebrow: "Answer to question 1",
    headline: <>{verdict.headline}</>,
    body: (
      <>
        <p>
          Of {(verdict.alignmentPairs + verdict.tensionPairs).toLocaleString()}{" "}
          scored pairs,{" "}
          <strong className="text-[var(--undp-black)] font-medium">
            {verdict.alignmentPairs.toLocaleString()}
          </strong>{" "}
          show medium or strong alignment.{" "}
          <strong className="text-[var(--undp-black)] font-medium">
            {verdict.tensionPairs.toLocaleString()}
          </strong>{" "}
          are flagged for review.
        </p>
        <p className="text-xs italic text-[var(--undp-gray)]/80">
          Visual filtered to alignment ribbons only.
        </p>
      </>
    ),
    extra: <VerdictBadge bucket={verdict.bucket} />,
  });

  // 5 — Q2 Intro
  slides.push({
    eyebrow: "On to question 2",
    headline: (
      <>
        Where do those{" "}
        {verdict.tensionPairs.toLocaleString()} tensions concentrate?
      </>
    ),
    body: (
      <>
        <p>
          The visual now shows only the red side, document pair by
          document pair. Two stand out as the heaviest contributors to
          the country&rsquo;s flagged set.
        </p>
        <p className="text-xs italic text-[var(--undp-gray)]/80">
          Next, we zoom into the sectors carrying most of those flags.
        </p>
      </>
    ),
  });

  // 6, 7, 8 — Sector tours (up to 3 top sectors)
  for (let i = 0; i < topSectors.length; i++) {
    const s = topSectors[i];
    // Show the country-wide top fault line on the first sector slide only,
    // as the illustrative example. Resolving sector membership per fault
    // line would need a back-lookup we don't carry here.
    const fl = i === 0 ? faultLines[0] : undefined;
    slides.push({
      eyebrow: `Sector ${i + 1} of ${topSectors.length}`,
      headline: <>{s.name}</>,
      body: (
        <>
          <p>
            <strong className="text-[var(--undp-black)] font-medium">
              {s.count}
            </strong>{" "}
            flagged pairs touch a target primary-classified to{" "}
            {s.name.toLowerCase()}.
          </p>
          {fl && i === 0 && (
            <p className="text-xs text-[var(--undp-gray)]">
              The headline tension across the dataset:{" "}
              {getDocMediumLabel(countryConfig, fl.targetA.sourceDocument)}{" "}
              {fl.targetA.sourceLabel} vs{" "}
              {getDocMediumLabel(countryConfig, fl.targetB.sourceDocument)}{" "}
              {fl.targetB.sourceLabel}.
            </p>
          )}
        </>
      ),
    });
  }

  // Final — Explore
  slides.push({
    eyebrow: "Take it further",
    headline: <>Now make the briefing your own.</>,
    exploreLayout: true,
  });

  return slides;
}

// ─── Visual state per slide ─────────────────────────────────────────

function deriveSlideStates(
  primer: ReturnType<typeof pickPrimerExamples>,
  topSectors: SectorRow[],
  lensTaxonomy: string | null,
): WheelState[] {
  const states: WheelState[] = [];
  // 0 hero
  states.push({ mode: "idle" });
  // 1 primer aligned
  states.push(
    primer.aligned
      ? {
          mode: "pair",
          pair: {
            aId: primer.aligned.pair.targetAId,
            bId: primer.aligned.pair.targetBId,
          },
        }
      : { mode: "idle" },
  );
  // 2 primer tension
  states.push(
    primer.tension
      ? {
          mode: "pair",
          pair: {
            aId: primer.tension.pair.targetAId,
            bId: primer.tension.pair.targetBId,
          },
        }
      : { mode: "idle" },
  );
  // 3 reveal
  states.push({ mode: "aggregate" });
  // 4 Q1 verdict — alignments only
  states.push({ mode: "alignments" });
  // 5 Q2 intro — tensions only
  states.push({ mode: "tensions" });
  // 6..n sector tours
  for (const s of topSectors) {
    states.push({
      mode: "sector",
      sectorCategoryId: s.id,
      sectorTaxonomyType: lensTaxonomy ?? s.taxonomyType,
    });
  }
  // explore (state managed separately)
  states.push({ mode: "aggregate" });
  return states;
}

// ─── Pair card ──────────────────────────────────────────────────────

function PairCard({
  kind,
  line,
  countryConfig,
}: {
  kind: "aligned" | "tension";
  line: FaultLine;
  countryConfig: CountryConfig | null;
}) {
  const color =
    kind === "aligned"
      ? ALIGNMENT_COLORS.high
      : ALIGNMENT_COLORS.possible_conflict;
  const { targetA, targetB } = line;
  const labelA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const labelB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <Snippet docLabel={labelA} sourceLabel={targetA.sourceLabel} text={targetA.text} />
      <div className="flex items-center gap-2 my-2 pl-1">
        <span
          aria-hidden="true"
          className="block h-px flex-1"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          }}
        />
        <span
          className="text-[9px] uppercase tracking-wider font-medium"
          style={{ color }}
        >
          {kind === "aligned" ? "supports" : "in tension with"}
        </span>
        <span
          aria-hidden="true"
          className="block h-px flex-1"
          style={{
            backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          }}
        />
      </div>
      <Snippet docLabel={labelB} sourceLabel={targetB.sourceLabel} text={targetB.text} />
    </div>
  );
}

function Snippet({
  docLabel,
  sourceLabel,
  text,
}: {
  docLabel: string;
  sourceLabel: string;
  text: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1">
        {docLabel} · {sourceLabel}
      </p>
      <p
        className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ─── Verdict badge ──────────────────────────────────────────────────

function VerdictBadge({ bucket }: { bucket: VerdictBucket }) {
  const palette: Record<VerdictBucket, { color: string; label: string }> = {
    mostly_aligned: { color: ALIGNMENT_COLORS.high, label: "Mostly aligned" },
    mixed: { color: ALIGNMENT_COLORS.medium, label: "Mixed signals" },
    lots_of_tension: {
      color: ALIGNMENT_COLORS.possible_conflict,
      label: "Substantial tension",
    },
  };
  const p = palette[bucket];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: `${p.color}1a`,
        color: p.color,
        border: `1px solid ${p.color}55`,
      }}
    >
      <span
        className="block w-2 h-2 rounded-full"
        style={{ backgroundColor: p.color }}
        aria-hidden="true"
      />
      {p.label}
    </span>
  );
}

// ─── Explore mode left panel ────────────────────────────────────────

function ExploreMode({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
  topSectors,
  exploreState,
  onExploreState,
  onOpenSector,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
  topSectors: SectorRow[];
  exploreState: WheelState;
  onExploreState: (s: WheelState) => void;
  onOpenSector: (s: {
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  }) => void;
}) {
  const sectorsForChat = useMemo(
    () =>
      sectors.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
    [sectors],
  );
  const globesForChat = useMemo(
    () =>
      globeCategories.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
      })),
    [globeCategories],
  );
  return (
    <div className="flex flex-col gap-5 h-full overflow-hidden">
      <div className="shrink-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
          Take it further
        </p>
        <h2
          className="text-2xl text-[var(--undp-black)] font-medium leading-tight mb-1"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          Make the briefing your own.
        </h2>
        <p className="text-xs text-[var(--undp-gray)]">
          Ask a question, or click a sector to focus the wheel on its
          tensions.
        </p>
      </div>

      <div className="border-t border-gray-200 pt-4 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onExploreState({ mode: "aggregate" })}
            className={chip(exploreState.mode === "aggregate")}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => onExploreState({ mode: "alignments" })}
            className={chip(exploreState.mode === "alignments")}
          >
            Alignments only
          </button>
          <button
            type="button"
            onClick={() => onExploreState({ mode: "tensions" })}
            className={chip(exploreState.mode === "tensions")}
          >
            Tensions only
          </button>
        </div>
        {topSectors.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
              Top sectors by tension count
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topSectors.map((s) => {
                const isActive =
                  exploreState.mode === "sector" &&
                  exploreState.sectorCategoryId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() =>
                      onOpenSector({
                        categoryId: s.id,
                        categoryName: s.name,
                        taxonomyType: s.taxonomyType,
                      })
                    }
                    className={chip(isActive)}
                    title={`Open ${s.name} (${s.count} flagged pairs)`}
                  >
                    {s.name}{" "}
                    <span className="opacity-60 ml-1">{s.count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 pt-4 flex-1 overflow-hidden flex flex-col min-h-0">
        <ChatPanel
          targets={targets}
          alignment={alignment}
          classifications={classifications}
          sectors={sectorsForChat}
          globeCategories={globesForChat}
          countryConfig={countryConfig}
          availableDocs={availableDocs}
          starterPrompts={[
            "Which two documents disagree the most?",
            "Which target shows up in the most tensions?",
            "Which sector has the strongest alignment?",
          ]}
        />
      </div>
    </div>
  );
}

function chip(active: boolean): string {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
      : "bg-white border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
  }`;
}

// Re-export the type alias so prototypes-client doesn't need its own import.
export type { WheelState };
