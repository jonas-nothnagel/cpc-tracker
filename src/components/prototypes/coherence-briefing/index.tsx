"use client";

/**
 * CoherenceBriefing — findings-first home page.
 *
 * One scrolled page with four sections (Direction, Sectors, Misalignments,
 * Explore). The wheel sits in a sticky right column and reacts to the
 * section in the viewport via IntersectionObserver. The user can scroll, hop
 * with the jump nav, or interact in the Explore section.
 *
 * Per-section wheel defaults:
 *   direction      → groupBy doc, focus anchor doc, filter all
 *   sectors        → groupBy sector, focus top-flagged sector, filter tensions
 *   misalignments  → groupBy doc, focus most-flagged doc, filter tensions
 *   explore        → user controls everything
 *
 * Drill-downs (primer card, sector card, fault line row) open side drawers.
 * The deck never advances.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  SECTORS_SECTION_ID,
  SectorsSection,
} from "./sections/sectors";
import {
  MISALIGNMENTS_SECTION_ID,
  RelationshipsSection,
  type ThemeTypeFilter,
} from "./sections/relationships";
import {
  EXPLORE_SECTION_ID,
  ExploreSection,
  type ExploreSectorSelection,
} from "./sections/explore";
import { WheelCenterpiece } from "./centerpiece/wheel";
import type {
  WheelFilter,
  WheelFocus,
  WheelGroupBy,
  WheelState,
} from "./centerpiece/wheel";
import { SectorDrawer } from "./sector-drawer";
import { PairDrawer, type PairDrawerData } from "./pair-drawer";
import type { PrimerHighlightPair } from "./primer-card";
import type { LensId, LensOption } from "./lens";
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import {
  buildAnchorHeadline,
  buildSectorAlignmentDensity,
  buildSectorBriefing,
  buildSectorTensionDensity,
  computeConcentrationStat,
  findDocPairDisagreement,
  indexSectorSyntheses,
  parseContributingDocPair,
  pickFaultLines,
  pickHeadlineVerdict,
  pickPrimerExamples,
  type FaultLine,
  type SectorAlignment,
  type SectorBriefing,
  type SectorTension,
} from "@/lib/coherence-briefing";
import type {
  AlignmentResult,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  GlobeCategory,
  IpccSector,
  NbsCategory,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const FAULT_LINES_TO_SHOW = 6;
/** Threshold for switching the Explore section's default grouping. */
const SECTOR_AUTO_SWITCH_DOC_COUNT = 6;

type SectionId =
  | typeof MISALIGNMENTS_SECTION_ID
  | typeof SECTORS_SECTION_ID
  | typeof EXPLORE_SECTION_ID;

// `MISALIGNMENTS_SECTION_ID` still resolves to the hash "misalignments"
// for backward compatibility with existing deep-links, but after the
// round-2 merge this section's user-facing label is "Direction" — it
// answers the framing question "are these policies pulling the same
// direction?".
const SECTION_LABELS: Record<SectionId, string> = {
  [MISALIGNMENTS_SECTION_ID]: "Direction",
  [SECTORS_SECTION_ID]: "Sectors",
  [EXPLORE_SECTION_ID]: "Explore",
};

const SECTION_ORDER: SectionId[] = [
  MISALIGNMENTS_SECTION_ID,
  SECTORS_SECTION_ID,
  EXPLORE_SECTION_ID,
];

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
  docPairSyntheses?: DocPairSynthesis[];
  corpusThemes?: CorpusThemes | null;
  sectorSyntheses?: SectorSynthesis[];
}

export function CoherenceBriefing({
  countryName,
  countryId,
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  docPairSyntheses = [],
  corpusThemes = null,
  sectorSyntheses = [],
}: CoherenceBriefingProps) {
  // ── Derived data ────────────────────────────────────────────────
  const verdict = useMemo(() => pickHeadlineVerdict(alignment), [alignment]);
  const faultLines = useMemo(
    () => pickFaultLines(alignment, targets, FAULT_LINES_TO_SHOW),
    [alignment, targets],
  );
  const primer = useMemo(
    () => pickPrimerExamples(alignment, targets),
    [alignment, targets],
  );
  const anchorHeadline = useMemo(
    () => buildAnchorHeadline({ targets, alignment, countryConfig }),
    [targets, alignment, countryConfig],
  );
  const docPairDisagreements = useMemo(
    () => findDocPairDisagreement(alignment, targets),
    [alignment, targets],
  );
  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets],
  );
  const documentCount = useMemo(() => {
    const docs = new Set<string>();
    for (const t of targets) docs.add(t.sourceDocument);
    return docs.size;
  }, [targets]);
  const availableDocs = useMemo<PolicyDocumentType[]>(() => {
    const docs = new Set<PolicyDocumentType>();
    for (const t of targets) docs.add(t.sourceDocument);
    return Array.from(docs).sort();
  }, [targets]);

  // Sector lens — GLOBE by default, with IPCC and country sectors as
  // alternatives when the underlying classifications back them.
  const availableLenses = useMemo<LensOption[]>(() => {
    const candidates: LensOption[] = [];
    if (globeCategories.length > 0) {
      candidates.push({
        id: "globe",
        label: "GLOBE",
        taxonomyType: "globe",
        categories: globeCategories.map((g) => ({ id: g.id, name: g.name })),
      });
    }
    if (sectors.length > 0) {
      candidates.push({
        id: "ipcc",
        label: "IPCC sectors",
        taxonomyType: "sector",
        categories: sectors.map((s) => ({ id: s.id, name: s.name })),
      });
    }
    const countryCats = countryConfig?.countrySectors ?? [];
    if (countryCats.length > 0) {
      candidates.push({
        id: "country",
        label: "Country sectors",
        taxonomyType: "sector",
        categories: countryCats.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        })),
      });
    }
    // Drop lenses whose category list has no matching primary classifications
    // in the data — keeps the switcher honest about what the user can actually
    // see.
    return candidates.filter((opt) => {
      const idSet = new Set(opt.categories.map((c) => c.id));
      return classifications.some(
        (c) =>
          c.isPrimary &&
          c.taxonomyType === opt.taxonomyType &&
          idSet.has(c.categoryId),
      );
    });
  }, [globeCategories, sectors, countryConfig, classifications]);

  const [activeLensId, setActiveLensId] = useState<LensId | null>(null);

  const lens = useMemo<LensOption | null>(() => {
    if (availableLenses.length === 0) return null;
    if (activeLensId) {
      const found = availableLenses.find((l) => l.id === activeLensId);
      if (found) return found;
    }
    return availableLenses[0]; // GLOBE first per ordering above
  }, [availableLenses, activeLensId]);

  const sectorRows = useMemo<SectorTension[]>(() => {
    if (!lens) return [];
    const density = buildSectorTensionDensity({
      targets,
      alignment,
      classifications,
      categories: lens.categories.map((c) => ({ id: c.id, name: c.name })),
      taxonomyType: lens.taxonomyType,
    });
    return [...density].sort((a, b) => {
      if (b.tensionCount !== a.tensionCount) {
        return b.tensionCount - a.tensionCount;
      }
      return b.targetCount - a.targetCount;
    });
  }, [lens, targets, alignment, classifications]);

  const sectorAlignments = useMemo<SectorAlignment[]>(() => {
    if (!lens) return [];
    return buildSectorAlignmentDensity({
      targets,
      alignment,
      classifications,
      categories: lens.categories.map((c) => ({ id: c.id, name: c.name })),
      taxonomyType: lens.taxonomyType,
    });
  }, [lens, targets, alignment, classifications]);

  const sectorSynthesesIndex = useMemo(
    () => indexSectorSyntheses(sectorSyntheses),
    [sectorSyntheses],
  );

  const sectorCategories = useMemo(
    () => lens?.categories ?? [],
    [lens],
  );
  const lensTaxonomyType = lens?.taxonomyType ?? "sector";
  const topTensionSector = useMemo(
    () => sectorRows.find((s) => s.tensionCount > 0) ?? sectorRows[0] ?? null,
    [sectorRows],
  );
  const concentration = useMemo(
    () => computeConcentrationStat(sectorRows),
    [sectorRows],
  );

  // ── Drawer state ────────────────────────────────────────────────
  const [pairData, setPairData] = useState<PairDrawerData | null>(null);
  const [sectorFocusForDrawer, setSectorFocusForDrawer] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);

  // Section 3 relationships state — theme filter selection + hover key
  // for wheel highlightPair + doc-pair drawer open via discriminated union.
  const [selectedThemeNames, setSelectedThemeNames] = useState<string[]>([]);
  const [themeTypeFilter, setThemeTypeFilter] =
    useState<ThemeTypeFilter>("all");
  const [hoveredDocPairKey, setHoveredDocPairKey] = useState<string | null>(
    null,
  );

  const toggleTheme = useCallback((name: string) => {
    setSelectedThemeNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }, []);

  const openPairFromFaultLine = useCallback((line: FaultLine) => {
    setPairData({
      mode: "target-pair",
      pair: line.pair,
      targetA: line.targetA,
      targetB: line.targetB,
    });
  }, []);

  const openPairById = useCallback(
    (aId: string, bId: string) => {
      const tA = targetMap.get(aId);
      const tB = targetMap.get(bId);
      if (!tA || !tB) return;
      const conn = alignment.find(
        (p) =>
          (p.targetAId === aId && p.targetBId === bId) ||
          (p.targetAId === bId && p.targetBId === aId),
      );
      if (!conn) return;
      setPairData({
        mode: "target-pair",
        pair: conn,
        targetA: tA,
        targetB: tB,
      });
    },
    [alignment, targetMap],
  );

  // Section 3 doc-pair drawer: opens with the synthesis block + the full
  // slice of alignment records for the doc-pair. The drawer itself decides
  // how to render (flagged-only default + show-aligned expand).
  const openDocPairDrawer = useCallback(
    (dp: DocPairSynthesis) => {
      const matchingPairs = alignment.filter((a) => {
        const tA = targetMap.get(a.targetAId);
        const tB = targetMap.get(a.targetBId);
        if (!tA || !tB) return false;
        const sA = tA.sourceDocument;
        const sB = tB.sourceDocument;
        return (
          (sA === dp.doc_a && sB === dp.doc_b) ||
          (sA === dp.doc_b && sB === dp.doc_a)
        );
      });
      setPairData({
        mode: "doc-pair",
        docPair: dp,
        pairs: matchingPairs,
        targetsById: targetMap,
      });
    },
    [alignment, targetMap],
  );

  const openSectorDrawer = useCallback(
    (s: { categoryId: string; categoryName: string; taxonomyType: string }) =>
      setSectorFocusForDrawer(s),
    [],
  );

  const drawerBriefing = useMemo<SectorBriefing | null>(() => {
    if (!sectorFocusForDrawer) return null;
    return buildSectorBriefing({
      categoryId: sectorFocusForDrawer.categoryId,
      categoryName: sectorFocusForDrawer.categoryName,
      taxonomyType: sectorFocusForDrawer.taxonomyType,
      targets,
      alignment,
      classifications,
      cap: 6,
    });
  }, [sectorFocusForDrawer, targets, alignment, classifications]);

  const drawerSectorSynthesis = useMemo(() => {
    if (!sectorFocusForDrawer) return null;
    return (
      sectorSynthesesIndex.get(
        `${sectorFocusForDrawer.taxonomyType}:${sectorFocusForDrawer.categoryId}`,
      ) ?? null
    );
  }, [sectorFocusForDrawer, sectorSynthesesIndex]);

  // ── Active section + focus override (driven by IntersectionObserver) ──
  const [activeSection, setActiveSection] = useState<SectionId>(
    MISALIGNMENTS_SECTION_ID,
  );
  const [focusBySection, setFocusBySection] = useState<
    Partial<Record<SectionId, WheelFocus | null>>
  >({});

  // ── Explore-section state (chips drive the wheel) ───────────────
  const [exploreFilter, setExploreFilter] = useState<WheelFilter>("all");
  const [exploreDoc, setExploreDoc] = useState<PolicyDocumentType | null>(
    null,
  );
  const [exploreSector, setExploreSector] =
    useState<ExploreSectorSelection | null>(null);

  // Primer-card hover spotlight (lives in the merged section after R1).
  const [primerHighlight, setPrimerHighlight] =
    useState<PrimerHighlightPair | null>(null);
  // Section 2 row hover → wheel sector focus preview.
  const [sectorHoverId, setSectorHoverId] = useState<string | null>(null);
  // Section 2 filter (exposes the wheel's filter axis to the user). Default
  // "tensions" because the question Section 2 answers is about flagged pairs.
  const [sectorFilter, setSectorFilter] = useState<WheelFilter>("tensions");

  // Switching lens invalidates any stored sector focus + Explore sector
  // selection, which carry category IDs from the previous taxonomy.
  const handleLensChange = useCallback((id: LensId) => {
    setActiveLensId(id);
    setFocusBySection((prev) => {
      if (!(SECTORS_SECTION_ID in prev)) return prev;
      const next = { ...prev };
      delete next[SECTORS_SECTION_ID];
      return next;
    });
    setExploreSector(null);
  }, []);

  // Multi-doc ghost set derived from the selected corpus themes: union of
  // each selected storyline's spans_documents. When empty, the wheel ghosts
  // nothing (current behaviour). Only active in Section 3.
  const themeGhostDocs = useMemo(() => {
    if (!corpusThemes || selectedThemeNames.length === 0) return undefined;
    const selected = corpusThemes.storylines.filter((s) =>
      selectedThemeNames.includes(s.name),
    );
    if (selected.length === 0) return undefined;
    const out = new Set<string>();
    for (const s of selected) {
      for (const d of s.spans_documents) out.add(d);
    }
    return out.size > 0 ? Array.from(out) : undefined;
  }, [corpusThemes, selectedThemeNames]);

  // When a doc-pair row is hovered, highlight a representative pair on the
  // wheel by picking the first alignment record touching that doc-pair.
  const docPairHighlightPair = useMemo(() => {
    if (!hoveredDocPairKey) return undefined;
    const parsed = parseContributingDocPair(hoveredDocPairKey);
    if (!parsed) return undefined;
    const match = alignment.find((a) => {
      if (a.alignment === "none") return false;
      const tA = targetMap.get(a.targetAId);
      const tB = targetMap.get(a.targetBId);
      if (!tA || !tB) return false;
      return (
        (tA.sourceDocument === parsed.a && tB.sourceDocument === parsed.b) ||
        (tA.sourceDocument === parsed.b && tB.sourceDocument === parsed.a)
      );
    });
    return match
      ? { aId: match.targetAId, bId: match.targetBId }
      : undefined;
  }, [hoveredDocPairKey, alignment, targetMap]);

  // ── Per-section wheel defaults ──────────────────────────────────
  const wheelState: WheelState = useMemo(() => {
    const sectionFocusOverride = focusBySection[activeSection];
    const exploreAutoGroup: WheelGroupBy =
      documentCount >= SECTOR_AUTO_SWITCH_DOC_COUNT ? "sector" : "document";
    switch (activeSection) {
      case SECTORS_SECTION_ID: {
        const defaultFocus: WheelFocus = topTensionSector
          ? {
              type: "sector",
              id: topTensionSector.categoryId,
              taxonomyType: lensTaxonomyType,
            }
          : null;
        const hoverFocus: WheelFocus = sectorHoverId
          ? {
              type: "sector",
              id: sectorHoverId,
              taxonomyType: lensTaxonomyType,
            }
          : null;
        const stickyFocus =
          sectionFocusOverride === undefined
            ? defaultFocus
            : sectionFocusOverride;
        return {
          groupBy: "sector",
          focus: hoverFocus ?? stickyFocus,
          filter: sectorFilter,
        };
      }
      case MISALIGNMENTS_SECTION_ID: {
        // After the round-2 merge this is the top-of-page section: it
        // answers "are these policies pulling the same direction?" plus
        // the relationships drill-down. Default focus is the country's
        // anchor doc (Vision 2050, etc.) — the doc everything is
        // compared against — matching the verdict sentence's framing.
        const defaultFocus: WheelFocus = anchorHeadline.isAnchored
          ? { type: "doc", id: anchorHeadline.anchorDocType! }
          : null;
        // When themes are active, clear the single-doc focus so the
        // multi-doc ghost reads as the dominant signal. Doc-pair hover
        // and primer hover both surface as highlightPair; doc-pair takes
        // precedence (active interaction) over the static primer.
        return {
          groupBy: "document",
          focus:
            themeGhostDocs && themeGhostDocs.length > 0
              ? null
              : sectionFocusOverride === undefined
                ? defaultFocus
                : sectionFocusOverride,
          filter: "all",
          highlightPair: docPairHighlightPair ?? primerHighlight ?? undefined,
          ghostExceptDocs: themeGhostDocs,
        };
      }
      case EXPLORE_SECTION_ID:
      default: {
        const userFocus: WheelFocus = exploreSector
          ? {
              type: "sector",
              id: exploreSector.categoryId,
              taxonomyType: exploreSector.taxonomyType,
            }
          : exploreDoc
            ? { type: "doc", id: exploreDoc }
            : null;
        const groupBy: WheelGroupBy = exploreSector
          ? "sector"
          : exploreDoc
            ? "document"
            : exploreAutoGroup;
        return {
          groupBy,
          focus: userFocus,
          filter: exploreFilter,
        };
      }
    }
  }, [
    activeSection,
    focusBySection,
    documentCount,
    anchorHeadline.isAnchored,
    anchorHeadline.anchorDocType,
    topTensionSector,
    lensTaxonomyType,
    themeGhostDocs,
    docPairHighlightPair,
    exploreFilter,
    exploreDoc,
    exploreSector,
    primerHighlight,
    sectorHoverId,
    sectorFilter,
  ]);

  const handleWheelArcClick = useCallback(
    (focus: WheelFocus) => {
      if (activeSection === EXPLORE_SECTION_ID) {
        if (!focus) {
          setExploreDoc(null);
          setExploreSector(null);
        } else if (focus.type === "doc") {
          setExploreDoc(focus.id);
          setExploreSector(null);
        } else {
          const cat = sectorCategories.find((c) => c.id === focus.id);
          setExploreSector(
            cat
              ? {
                  categoryId: cat.id,
                  categoryName: cat.name,
                  taxonomyType: focus.taxonomyType,
                }
              : null,
          );
          setExploreDoc(null);
        }
        return;
      }
      setFocusBySection((prev) => ({ ...prev, [activeSection]: focus }));
    },
    [activeSection, sectorCategories],
  );

  // ── IntersectionObserver wiring ────────────────────────────────
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    [MISALIGNMENTS_SECTION_ID]: null,
    [SECTORS_SECTION_ID]: null,
    [EXPLORE_SECTION_ID]: null,
  });

  useEffect(() => {
    const sections: SectionId[] = SECTION_ORDER;
    const visibility = new Map<SectionId, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // The ref wraps the section; the `id` attribute sits on the inner
          // <section>. Read our own data-section-id from the wrapper instead.
          const id = entry.target.getAttribute(
            "data-section-id",
          ) as SectionId | null;
          if (!id) continue;
          visibility.set(id, entry.intersectionRatio);
        }
        let bestId: SectionId | null = null;
        let bestRatio = -1;
        for (const id of sections) {
          const r = visibility.get(id) ?? 0;
          if (r > bestRatio) {
            bestId = id;
            bestRatio = r;
          }
        }
        if (bestId && bestRatio > 0) {
          setActiveSection((prev) => (prev === bestId ? prev : bestId));
        }
      },
      {
        rootMargin: "-30% 0px -50% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );
    for (const id of sections) {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const setSectionRef = useCallback(
    (id: SectionId) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    [],
  );

  // ── Render ─────────────────────────────────────────────────────
  return (
    <main className="flex-1 w-full">
      <div className="max-w-7xl mx-auto px-6 pb-24">
        <BriefingHeader
          countryName={countryName}
          documentCount={documentCount}
        />
        <JumpNav active={activeSection} />

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] gap-x-10 gap-y-8 mt-8">
          {/* Content column */}
          <div className="space-y-24">
            <div
              ref={setSectionRef(MISALIGNMENTS_SECTION_ID)}
              data-section-id={MISALIGNMENTS_SECTION_ID}
            >
              <RelationshipsSection
                countryName={countryName}
                documentCount={documentCount}
                anchor={anchorHeadline}
                verdict={verdict}
                primer={primer}
                faultLines={faultLines}
                docPairDisagreements={docPairDisagreements}
                docPairSyntheses={docPairSyntheses}
                corpusThemes={corpusThemes}
                countryConfig={countryConfig}
                onOpenPair={openPairFromFaultLine}
                onOpenDocPair={openDocPairDrawer}
                selectedThemeNames={selectedThemeNames}
                onToggleTheme={toggleTheme}
                themeTypeFilter={themeTypeFilter}
                onThemeTypeChange={setThemeTypeFilter}
                onHoverDocPair={setHoveredDocPairKey}
                onHighlightPair={setPrimerHighlight}
              />
            </div>
            <div
              ref={setSectionRef(SECTORS_SECTION_ID)}
              data-section-id={SECTORS_SECTION_ID}
            >
              <SectorsSection
                sectorRows={sectorRows}
                sectorAlignments={sectorAlignments}
                sectorSyntheses={sectorSynthesesIndex}
                concentration={concentration}
                verdict={verdict}
                lensLabel={lens?.label ?? null}
                taxonomyType={lensTaxonomyType}
                availableLenses={availableLenses}
                activeLensId={lens?.id ?? null}
                onLensChange={handleLensChange}
                filter={sectorFilter}
                onFilterChange={setSectorFilter}
                countryConfig={countryConfig}
                onOpenSector={openSectorDrawer}
                onHoverSector={setSectorHoverId}
              />
            </div>
            <div
              ref={setSectionRef(EXPLORE_SECTION_ID)}
              data-section-id={EXPLORE_SECTION_ID}
            >
              <ExploreSection
                targets={targets}
                alignment={alignment}
                classifications={classifications}
                sectors={sectors}
                globeCategories={globeCategories}
                countryConfig={countryConfig}
                availableDocs={availableDocs}
                sectorRows={sectorRows}
                lensTaxonomyType={lensTaxonomyType}
                filter={exploreFilter}
                onFilter={setExploreFilter}
                activeDoc={exploreDoc}
                onDoc={(d) => {
                  setExploreDoc(d);
                  setExploreSector(null);
                }}
                activeSector={exploreSector}
                onSector={(s) => {
                  setExploreSector(s);
                  setExploreDoc(null);
                }}
                onOpenSectorDrawer={openSectorDrawer}
              />
            </div>
          </div>

          {/* Sticky wheel column */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2 text-center">
                {SECTION_LABELS[activeSection]}
              </p>
              {wheelState.groupBy === "sector" && (
                <DocLegend
                  docs={availableDocs}
                  countryConfig={countryConfig}
                />
              )}
              <WheelCenterpiece
                targets={targets}
                alignments={alignment}
                classifications={classifications}
                countryConfig={countryConfig}
                state={wheelState}
                sectorCategories={sectorCategories}
                sectorTaxonomyType={lensTaxonomyType}
                onArcClick={handleWheelArcClick}
                onPairClick={openPairById}
              />
              <WheelLegend />
            </div>
          </aside>
        </div>
      </div>

      <SectorDrawer
        briefing={drawerBriefing}
        sectorSynthesis={drawerSectorSynthesis}
        countryConfig={countryConfig}
        onClose={() => setSectorFocusForDrawer(null)}
      />
      <PairDrawer
        data={pairData}
        countryConfig={countryConfig}
        onClose={() => setPairData(null)}
      />
      <FooterLink countryId={countryId} />
    </main>
  );
}

// ─── Header + nav ────────────────────────────────────────────────

function BriefingHeader({
  countryName,
  documentCount,
}: {
  countryName: string;
  documentCount: number;
}) {
  return (
    <header className="pt-10 pb-2">
      <p className="text-[11px] uppercase tracking-[0.24em] text-[var(--undp-gray)] mb-2">
        Policy coherence
      </p>
      <h1
        className="text-[36px] sm:text-[44px] leading-[1.1] text-[var(--undp-black)] font-medium"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {countryName}.
      </h1>
      <p className="mt-2 text-sm text-[var(--undp-gray)]">
        {documentCount} document{documentCount === 1 ? "" : "s"} compared
        pairwise. Scroll for the findings or jump to a section.
      </p>
    </header>
  );
}

function JumpNav({ active }: { active: SectionId }) {
  return (
    <nav className="sticky top-0 z-10 -mx-6 px-6 py-3 bg-[#fbfaf7]/85 backdrop-blur border-b border-gray-200/70">
      <ul className="flex items-center gap-1 sm:gap-2 flex-wrap">
        {SECTION_ORDER.map((id, i) => {
          const isActive = active === id;
          return (
            <li key={id} className="flex items-center">
              <a
                href={`#${id}`}
                aria-current={isActive ? "true" : undefined}
                className={`px-2.5 py-1 rounded text-[12px] font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--undp-black)] text-white"
                    : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                }`}
              >
                <span className="text-[10px] tabular-nums opacity-60 mr-1.5">
                  0{i + 1}
                </span>
                {SECTION_LABELS[id]}
              </a>
              {i < SECTION_ORDER.length - 1 && (
                <span
                  aria-hidden="true"
                  className="text-[var(--undp-gray)]/40 px-1"
                >
                  ·
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function WheelLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-[var(--undp-gray)]">
      <LegendDot color="#196127" label="Alignment" />
      <LegendDot color="#dc2626" label="Flagged pair" dashed />
      <span className="text-[10px] text-[var(--undp-gray)]/70">
        ribbon width = number of pairs
      </span>
    </div>
  );
}

function DocLegend({
  docs,
  countryConfig,
}: {
  docs: PolicyDocumentType[];
  countryConfig: CountryConfig | null;
}) {
  if (docs.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-[var(--undp-gray)]">
      {docs.map((d) => (
        <span key={d} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: getDocColor(countryConfig, d) }}
          />
          {getDocMediumLabel(countryConfig, d)}
        </span>
      ))}
    </div>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block w-4 h-[3px] rounded-full"
        style={{
          background: dashed
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}

function FooterLink({ countryId }: { countryId?: string }) {
  const dashboardHref = countryId
    ? `/dashboard?country=${encodeURIComponent(countryId)}`
    : "/";
  return (
    <div className="fixed bottom-3 left-6 z-10 text-[10px] text-[var(--undp-gray)]">
      <Link
        href={dashboardHref}
        className="hover:text-[var(--undp-black)] hover:underline"
      >
        ← Full coherence explorer
      </Link>
    </div>
  );
}

// Re-export shared types for prototypes-client.
export type { WheelState } from "./centerpiece/wheel";
