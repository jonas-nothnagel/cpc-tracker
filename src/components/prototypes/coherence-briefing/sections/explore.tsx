"use client";

/**
 * Explore section — the open-ended finale of the findings home.
 *
 * Chat-led: the user asks the corpus a question, lets a rotating insight
 * surprise them, or clicks the wheel. A single "Group the wheel by" control
 * (Documents or a sector lens) restructures the wheel, with Documents as the
 * clear/reset; focus is then set by the wheel, by an insight's "Show me", or
 * by the chat. The grouping + lens are local to Explore. The sticky wheel
 * (owned by index.tsx) reacts to whatever drove it via onApplyAction.
 */

import { useMemo, useState } from "react";
import { ChatPanel } from "../chat-panel";
import { detectInsights, type Insight } from "@/lib/coherence-insights";
import { pickExampleQueries } from "@/lib/coherence-chat";
import type { ChatAction, ChatTaxCategory } from "@/lib/coherence-chat";
import type { LensId, LensOption } from "../lens";
import type {
  AlignmentResult,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  GlobeCategory,
  IpccSector,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

export const EXPLORE_SECTION_ID = "explore";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export type ExploreFilter = "all" | "alignments" | "tensions";

export interface ExploreSectorSelection {
  categoryId: string;
  categoryName: string;
  taxonomyType: string;
}

export function ExploreSection({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
  availableLenses,
  exploreGroup,
  onExploreGroupChange,
  exploreLensId,
  onExploreLensChange,
  docPairSyntheses,
  corpusThemes,
  sectorSyntheses,
  onApplyAction,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
  availableLenses: LensOption[];
  exploreGroup: "documents" | "sectors";
  onExploreGroupChange: (next: "documents" | "sectors") => void;
  exploreLensId: LensId | null;
  onExploreLensChange: (id: LensId) => void;
  docPairSyntheses: DocPairSynthesis[];
  corpusThemes: CorpusThemes | null;
  sectorSyntheses: SectorSynthesis[];
  onApplyAction: (action: ChatAction) => void;
}) {
  // Map the domain taxonomies to the chat's lean {id,name,description} shape
  // once; both the insight detectors and the chat reuse it.
  const sectorCats = useMemo<ChatTaxCategory[]>(
    () =>
      sectors.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
    [sectors],
  );
  const globeCats = useMemo<ChatTaxCategory[]>(
    () =>
      globeCategories.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
      })),
    [globeCategories],
  );

  // Structural "surprise me" insights, computed on the same data the chat
  // sees (no LLM call). BTR is intentionally omitted in this prototype, so the
  // BTR-dependent detectors stay silent; the rest still fire.
  const insights = useMemo<Insight[]>(
    () =>
      detectInsights({
        targets,
        alignment,
        classifications,
        sectors: sectorCats,
        globeCategories: globeCats,
        availableDocs,
        countryConfig,
      }),
    [
      targets,
      alignment,
      classifications,
      sectorCats,
      globeCats,
      availableDocs,
      countryConfig,
    ],
  );

  const starterPrompts = useMemo<string[]>(() => {
    const base = pickExampleQueries({
      hasTensions: alignment.some((a) => a.alignment === "flagged"),
      globeCategoriesAvailable: globeCategories.length > 0,
      sectorsAvailable: sectors.length > 0,
      hasAdaptation: classifications.some(
        (c) => c.taxonomyType === "adaptation_goal",
      ),
      hasBtr: false,
      hasBudget: false,
    });
    // Surface the synthesis layer: when a corpus storyline exists, lead with a
    // big-picture probe that exercises the precomputed narrative.
    return corpusThemes && corpusThemes.storylines.length > 0
      ? ["What is the main storyline across these documents?", ...base].slice(
          0,
          4,
        )
      : base;
  }, [alignment, globeCategories, sectors, classifications, corpusThemes]);

  return (
    <section
      id={EXPLORE_SECTION_ID}
      // Reserve ~a viewport of height on large screens. As the last section it
      // needs enough room for the page to scroll its top up into the active
      // band; otherwise the jump-nav can't land on it and the sticky wheel
      // never switches to the Explore state. (scroll-mt-24 = 6rem offset.)
      className="scroll-mt-24 pt-2 lg:min-h-[calc(100vh-6rem)]"
      aria-labelledby={`${EXPLORE_SECTION_ID}-heading`}
    >
      <h2
        id={`${EXPLORE_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-3"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        Explore the policy coherence yourself.
      </h2>
      <p className="text-[14px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-6">
        Ask a question in your own words, surface an insight, or click the
        wheel. Insights and the wheel react together.
      </p>

      {availableLenses.length > 0 && (
        <div className="mb-5">
          <GroupByRow
            availableLenses={availableLenses}
            exploreGroup={exploreGroup}
            exploreLensId={exploreLensId}
            onExploreLensChange={onExploreLensChange}
            onExploreGroupChange={onExploreGroupChange}
          />
        </div>
      )}

      <InsightBar insights={insights} onApplyAction={onApplyAction} />

      <ChatPanel
        targets={targets}
        alignment={alignment}
        classifications={classifications}
        sectors={sectorCats}
        globeCategories={globeCats}
        countryConfig={countryConfig}
        availableDocs={availableDocs}
        docPairSyntheses={docPairSyntheses}
        corpusThemes={corpusThemes}
        sectorSyntheses={sectorSyntheses}
        starterPrompts={starterPrompts}
        onApplyAction={onApplyAction}
      />
    </section>
  );
}

/**
 * Rotating structural insight with a "Show me" that drives the wheel. Quiet
 * by design: a single light panel, plain type, no icons. Hidden entirely when
 * no detector fires (e.g. an upload dataset with thin signal).
 */
function InsightBar({
  insights,
  onApplyAction,
}: {
  insights: Insight[];
  onApplyAction: (action: ChatAction) => void;
}) {
  const [idx, setIdx] = useState(0);
  if (insights.length === 0) return null;
  const insight = insights[idx % insights.length];

  const showMe = () => {
    for (const a of insight.actions) onApplyAction(a);
    // A target-centric insight (e.g. "N contradictions converge on X") names a
    // specific target its actions can only focus at the document level. Route
    // it through the target intent so "Show me" also opens that target's
    // decomposition. Non-target insights have no subjectTargetId and skip this.
    if (insight.subjectTargetId) {
      onApplyAction({
        type: "select_target",
        targetId: insight.subjectTargetId,
      });
    }
    if (insight.filter) {
      onApplyAction({ type: "set_filter", filter: insight.filter });
    }
  };

  return (
    <div className="mb-6 rounded-md border border-gray-200 bg-white/60 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
          Worth a look
        </p>
        {insights.length > 1 && (
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % insights.length)}
            className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
          >
            ↻ Surprise me
          </button>
        )}
      </div>
      <p className="text-sm text-[var(--undp-black)] leading-relaxed">
        {insight.callout}
      </p>
      {insight.pathway && (
        <p className="mt-1 text-xs italic text-[var(--undp-gray)] leading-relaxed">
          {insight.pathway}
        </p>
      )}
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={showMe}
          className="text-xs font-medium text-[var(--undp-black)] hover:underline"
        >
          Show me →
        </button>
      </div>
    </div>
  );
}

/**
 * Single grouping control for the Explore wheel. "Documents" groups the rim by
 * source document (and is the clear/reset); each lens chip regroups the rim by
 * that taxonomy's categories, so the lens choice visibly restructures the
 * wheel. Grouping + lens are local to Explore.
 */
function GroupByRow({
  availableLenses,
  exploreGroup,
  exploreLensId,
  onExploreLensChange,
  onExploreGroupChange,
}: {
  availableLenses: LensOption[];
  exploreGroup: "documents" | "sectors";
  exploreLensId: LensId | null;
  onExploreLensChange: (id: LensId) => void;
  onExploreGroupChange: (next: "documents" | "sectors") => void;
}) {
  const activeLens = exploreLensId ?? availableLenses[0]?.id;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1.5">
        Group the wheel by
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onExploreGroupChange("documents")}
          aria-pressed={exploreGroup === "documents"}
          className={chip(exploreGroup === "documents")}
        >
          Documents
        </button>
        {availableLenses.map((opt) => {
          const isActive = exploreGroup === "sectors" && activeLens === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onExploreLensChange(opt.id);
                onExploreGroupChange("sectors");
              }}
              aria-pressed={isActive}
              className={chip(isActive)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function chip(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
      : "bg-white border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
  }`;
}
