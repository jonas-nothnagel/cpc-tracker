"use client";

/**
 * CoherenceBriefing — findings-first home page.
 *
 * Scrollable slide-sections plus the Explore + chat finale. Each finding
 * slide answers one of the recurring policymaker questions:
 *
 *   01 direction      — Are policies pulling the same direction?
 *   02 doc-focus      — How does one document sit against the rest?
 *   03 doc-pairs      — Which documents pull with which (the gaps)?
 *   04 friction-types — What kind of friction (goal / resource / delivery)?
 *   05 where-to-focus — A few contested targets or many, and which?
 *   06 sectors        — Where does the friction concentrate (by sector)?
 *   07 explore        — Free interaction + chat for everything else.
 *
 * Each section sits inside SlideFrame (eyebrow + serif headline + body
 * + optional evidence/disclosure). Headlines carry the finding; the
 * evidence layer carries the substance; drawers carry the full depth.
 * The right column shows the wheel on every slide except doc-pairs, which
 * swaps to the doc-coherence matrix, synced with the ranked list on the left.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  SECTORS_SECTION_ID,
  SectorsSection,
} from "./sections/sectors";
import {
  DIRECTION_SECTION_ID,
  DirectionSection,
} from "./sections/direction";
import {
  DOC_FOCUS_SECTION_ID,
  DocFocusSection,
} from "./sections/doc-focus";
import {
  DOC_PAIRS_SECTION_ID,
  DocPairsSection,
} from "./sections/doc-pairs";
import {
  FRICTION_TYPES_SECTION_ID,
  FrictionTypesSection,
} from "./sections/friction-types";
import {
  WHERE_TO_FOCUS_SECTION_ID,
  WhereToFocusSection,
} from "./sections/where-to-focus";
import {
  EXPLORE_SECTION_ID,
  ExploreSection,
  type ExploreSectorSelection,
} from "./sections/explore";
import { WheelCenterpiece } from "./centerpiece/wheel";
import { DocCoherenceMatrix } from "./centerpiece/doc-coherence-matrix";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import type {
  WheelFilter,
  WheelFocus,
  WheelGroupBy,
  WheelState,
} from "./centerpiece/wheel";
import { SectorDrawer } from "./sector-drawer";
import { PairDrawer, type PairDrawerData } from "./pair-drawer";
import { ThemeDrawer } from "./theme-drawer";
import { FlagProfileDrawer, type FlagProfileSubject } from "./flag-profile";
import type { PrimerHighlightPair } from "./primer-card";
import type { LensId, LensOption } from "./lens";
import { resolveExploreAction } from "./explore-actions";
import type { ChatAction } from "@/lib/coherence-chat";
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import {
  buildSectorAlignmentDensity,
  buildSectorBriefing,
  buildSectorTensionDensity,
  computeConcentrationStat,
  computeTargetConcentration,
  frictionTypeTotalsFromAlignment,
  indexSectorSyntheses,
  pickHeadlineVerdict,
  pickPrimerExamples,
  rankTargetsByFriction,
  type FaultLine,
  type SectorAlignment,
  type SectorBriefing,
  type SectorTension,
} from "@/lib/coherence-briefing";
import type {
  AlignmentResult,
  BerData,
  BtrData,
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  GlobeCategory,
  GlobeSubcategory,
  IpccSector,
  NbsCategory,
  Nr7Data,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
/** Threshold for switching the Explore section's default grouping. */
const SECTOR_AUTO_SWITCH_DOC_COUNT = 6;

type SectionId =
  | typeof DIRECTION_SECTION_ID
  | typeof DOC_FOCUS_SECTION_ID
  | typeof DOC_PAIRS_SECTION_ID
  | typeof FRICTION_TYPES_SECTION_ID
  | typeof SECTORS_SECTION_ID
  | typeof WHERE_TO_FOCUS_SECTION_ID
  | typeof EXPLORE_SECTION_ID;

const SECTION_LABELS: Record<SectionId, string> = {
  [DIRECTION_SECTION_ID]: "Direction",
  [DOC_FOCUS_SECTION_ID]: "Doc in focus",
  [DOC_PAIRS_SECTION_ID]: "Doc pairs",
  [FRICTION_TYPES_SECTION_ID]: "Friction types",
  [SECTORS_SECTION_ID]: "Sectors",
  [WHERE_TO_FOCUS_SECTION_ID]: "Where to focus",
  [EXPLORE_SECTION_ID]: "Explore",
};

const SECTION_ORDER: SectionId[] = [
  DIRECTION_SECTION_ID,
  DOC_FOCUS_SECTION_ID,
  DOC_PAIRS_SECTION_ID,
  FRICTION_TYPES_SECTION_ID,
  WHERE_TO_FOCUS_SECTION_ID,
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
  /** FULL target set (incl. BTR + BER pseudo-targets) for the re-hosted
   *  PolicyCoherenceExplorer. Distinct from `targets`, which is policy-only
   *  for the narrative sections. Falls back to `targets` when omitted. */
  explorerTargets?: Target[];
  btrData?: BtrData | null;
  berData?: BerData | null;
  nr7Data?: Nr7Data | null;
  globeSubcategories?: GlobeSubcategory[];
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
  explorerTargets,
  btrData = null,
  berData = null,
  nr7Data = null,
  globeSubcategories = [],
}: CoherenceBriefingProps) {
  // ── Derived data ────────────────────────────────────────────────
  // The re-hosted explorer needs the FULL corpus (incl. BTR + BER) so BTR
  // nodes and the Biodiversity Budget overlay appear; the narrative sections
  // keep using `targets` (policy-only). Fall back to `targets` if a caller
  // didn't thread the full set.
  const explorerData = explorerTargets ?? targets;
  const explorerProps = useMemo(
    () => ({
      targets: explorerData,
      alignment,
      sectors,
      globeCategories,
      globeSubcategories,
      classifications,
      nr7Data,
      btrData,
      berData,
      countryConfig,
    }),
    [
      explorerData,
      alignment,
      sectors,
      globeCategories,
      globeSubcategories,
      classifications,
      nr7Data,
      btrData,
      berData,
      countryConfig,
    ],
  );
  const verdict = useMemo(() => pickHeadlineVerdict(alignment), [alignment]);
  const primer = useMemo(
    () => pickPrimerExamples(alignment, targets),
    [alignment, targets],
  );
  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets],
  );
  // Policy-coherence scope is target×target. Some datasets also carry BTR/BER
  // measure×target flagged pairs in `alignment`; drop them here so the
  // friction-type bar and its drawer match the rest of the misalignment story
  // (concentration, matrix, doc-pairs are all target×target) rather than
  // reporting a larger count on one slide.
  const policyAlignment = useMemo(
    () =>
      alignment.filter(
        (a) => targetMap.has(a.targetAId) && targetMap.has(a.targetBId),
      ),
    [alignment, targetMap],
  );
  const frictionTotals = useMemo(
    () => frictionTypeTotalsFromAlignment(policyAlignment),
    [policyAlignment],
  );
  const targetConcentration = useMemo(
    () => computeTargetConcentration(policyAlignment, targets),
    [policyAlignment, targets],
  );
  const frictionHotspots = useMemo(
    () => rankTargetsByFriction(policyAlignment, targets, 8),
    [policyAlignment, targets],
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
    return availableLenses[0];
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

  const sectorCategories = useMemo(() => lens?.categories ?? [], [lens]);
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
  const [flagProfile, setFlagProfile] = useState<FlagProfileSubject | null>(
    null,
  );
  const [sectorFocusForDrawer, setSectorFocusForDrawer] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);
  const [activeTheme, setActiveTheme] = useState<CorpusStoryline | null>(null);
  // Dormant: Direction now lists every theme inline, so nothing opens the
  // ThemeDrawer "all storylines" view. Kept until that view is removed.
  const [showAllStorylines, setShowAllStorylines] = useState(false);

  const openThemeDrawer = useCallback((s: CorpusStoryline) => {
    setActiveTheme(s);
    setShowAllStorylines(false);
  }, []);
  const closeThemeDrawer = useCallback(() => {
    setActiveTheme(null);
    setShowAllStorylines(false);
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

  const openDocPairByDocs = useCallback(
    (a: PolicyDocumentType, b: PolicyDocumentType) => {
      const dp = docPairSyntheses.find(
        (d) =>
          (d.doc_a === a && d.doc_b === b) || (d.doc_a === b && d.doc_b === a),
      );
      if (dp) {
        openDocPairDrawer(dp);
        return;
      }
      for (const al of alignment) {
        if (al.alignment !== "flagged") continue;
        const tA = targetMap.get(al.targetAId);
        const tB = targetMap.get(al.targetBId);
        if (!tA || !tB) continue;
        const docs = new Set([tA.sourceDocument, tB.sourceDocument]);
        if (docs.has(a) && docs.has(b)) {
          openPairById(al.targetAId, al.targetBId);
          return;
        }
      }
    },
    [docPairSyntheses, openDocPairDrawer, alignment, targetMap, openPairById],
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
    DIRECTION_SECTION_ID,
  );
  const [focusBySection, setFocusBySection] = useState<
    Partial<Record<SectionId, WheelFocus | null>>
  >({});

  // ── Explore-section state ───────────────────────────────────────
  // Set by wheel clicks (handleWheelArcClick) and by the insight bar / chat
  // via applyExploreAction. The lens row is the only on-screen control left.
  const [exploreFilter, setExploreFilter] = useState<WheelFilter>("all");
  const [exploreDoc, setExploreDoc] = useState<PolicyDocumentType | null>(
    null,
  );
  const [exploreSector, setExploreSector] =
    useState<ExploreSectorSelection | null>(null);
  // Explore's grouping axis and lens are LOCAL to this section: picking a lens
  // here regroups the Explore wheel without changing the lens the Sectors
  // section uses. Grouping defaults to the same doc-count heuristic the wheel
  // applied implicitly before it was switchable, so a small corpus (Mongolia)
  // still opens on documents.
  const [exploreGroup, setExploreGroup] = useState<"documents" | "sectors">(
    documentCount >= SECTOR_AUTO_SWITCH_DOC_COUNT ? "sectors" : "documents",
  );
  const [exploreLensId, setExploreLensId] = useState<LensId | null>(null);
  // In-page "Explore the full data" view: swaps the narrative for the full
  // explorer at page width, staying inside the briefing shell (no modal).
  const [explorerView, setExplorerView] = useState(false);
  const cameFromExplorer = useRef(false);
  const exploreLens = useMemo<LensOption | null>(() => {
    if (exploreLensId) {
      const found = availableLenses.find((l) => l.id === exploreLensId);
      if (found) return found;
    }
    return lens;
  }, [exploreLensId, availableLenses, lens]);

  // Switching the Explore grouping axis clears any stale focus carried over
  // from the other axis, so "Documents" doubles as the wheel's clear/reset.
  const handleExploreGroupChange = useCallback(
    (next: "documents" | "sectors") => {
      setExploreGroup(next);
      setExploreDoc(null);
      setExploreSector(null);
    },
    [],
  );

  // Bridge insight "Show me" (and the chat's own navigation tools) onto the
  // explore wheel state. resolveExploreAction is pure + unit-tested; this only
  // wires the resolved intent to the setters.
  const applyExploreAction = useCallback(
    (action: ChatAction) => {
      const intent = resolveExploreAction(action, {
        availableDocs,
        sectorCategoryIds: new Set(
          (exploreLens?.categories ?? []).map((c) => c.id),
        ),
        taxonomyType: exploreLens?.taxonomyType ?? "sector",
      });
      switch (intent.kind) {
        case "filter":
          setExploreFilter(intent.filter);
          break;
        case "doc":
          setExploreDoc(intent.id);
          setExploreSector(null);
          break;
        case "sector": {
          const cat = (exploreLens?.categories ?? []).find(
            (c) => c.id === intent.id,
          );
          setExploreSector(
            cat
              ? {
                  categoryId: cat.id,
                  categoryName: cat.name,
                  taxonomyType: intent.taxonomyType,
                }
              : null,
          );
          setExploreDoc(null);
          if (cat) setExploreGroup("sectors");
          break;
        }
        case "pair":
          openPairById(intent.a, intent.b);
          break;
        case "target": {
          const t = targetMap.get(intent.id);
          if (!t) break;
          // The wheel has no single-target focus, so refocus the target's
          // source document (document grouping) for spatial context...
          setExploreSector(null);
          setExploreDoc(t.sourceDocument);
          setExploreGroup("documents");
          // ...and open the flag-profile decomposition when the target
          // actually carries flagged pairs (the "N contradictions" payoff).
          const hasFlags = alignment.some(
            (a) =>
              a.alignment === "flagged" &&
              (a.targetAId === t.id || a.targetBId === t.id),
          );
          if (hasFlags) setFlagProfile({ kind: "target", target: t });
          break;
        }
        case "none":
          break;
      }
    },
    [availableDocs, exploreLens, targetMap, alignment, openPairById],
  );

  // Primer-card hover spotlight (lives in the Direction section).
  const [primerHighlight, setPrimerHighlight] =
    useState<PrimerHighlightPair | null>(null);
  // Sectors row hover → wheel sector focus preview.
  const [sectorHoverId, setSectorHoverId] = useState<string | null>(null);
  // Doc-in-Focus slide: the currently selected document. Null until the user
  // (or the IntersectionObserver-driven default) sets one. The Direction
  // slide no longer drives focus via hover — that interaction moved here.
  const [selectedFocusDoc, setSelectedFocusDoc] =
    useState<PolicyDocumentType | null>(null);
  // Doc Pairs slide pre-selection: set by clicking a ribbon on Direction so
  // the user lands on the matching doc-pair row instead of an arbitrary
  // target-pair drawer.
  const [pendingDocPair, setPendingDocPair] = useState<
    { docA: PolicyDocumentType; docB: PolicyDocumentType } | null
  >(null);
  // Doc Pairs slide: shared hovered pair key linking the ranked list and the
  // matrix — hovering a row lights the matching cell and vice versa.
  const [hoveredDocPairKey, setHoveredDocPairKey] = useState<string | null>(
    null,
  );
  // Sectors filter (exposes the wheel's filter axis to the user). Default
  // "tensions" because the question Sectors answers is about flagged pairs.
  const [sectorFilter, setSectorFilter] = useState<WheelFilter>("tensions");

  /**
   * Default doc for the Doc-in-Focus slide: the country's configured
   * anchor (Vision 2050 for Mongolia) if present, else the first
   * available doc. Falls back to null when no docs exist (unlikely).
   */
  const defaultFocusDoc = useMemo<PolicyDocumentType | null>(() => {
    const anchor = countryConfig?.anchorDocType;
    if (anchor && availableDocs.includes(anchor)) return anchor;
    return availableDocs[0] ?? null;
  }, [countryConfig, availableDocs]);

  const focusedDoc = selectedFocusDoc ?? defaultFocusDoc;

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

  // ── Per-section wheel defaults ──────────────────────────────────
  const wheelState: WheelState = useMemo(() => {
    const sectionFocusOverride = focusBySection[activeSection];
    switch (activeSection) {
      case DIRECTION_SECTION_ID: {
        // Corpus-level backdrop. No focus, no hover state — the per-doc
        // exploration lives on the Doc-in-Focus slide. Primer-card hover
        // still spotlights a single pair in red.
        return {
          groupBy: "document",
          focus: null,
          filter: "all",
          frictionArcs: true,
          highlightPair: primerHighlight ?? undefined,
        };
      }
      case DOC_FOCUS_SECTION_ID: {
        // The wheel locks onto the selected document and renders per-peer
        // balance bands. Centre readout is suppressed so the rim labels
        // stay clean; the doc summary is carried in the slide's left
        // column instead.
        return {
          groupBy: "document",
          focus: focusedDoc ? { type: "doc", id: focusedDoc } : null,
          filter: "all",
          suppressFocusReadout: true,
        };
      }
      case DOC_PAIRS_SECTION_ID: {
        // Matrix replaces the wheel in the right column for this slide.
        return {
          groupBy: "document",
          focus:
            sectionFocusOverride === undefined ? null : sectionFocusOverride,
          filter: "all",
        };
      }
      case FRICTION_TYPES_SECTION_ID: {
        // Filter wheel to red ribbons so it echoes the chart underneath.
        return {
          groupBy: "document",
          focus:
            sectionFocusOverride === undefined ? null : sectionFocusOverride,
          filter: "tensions",
        };
      }
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
      case WHERE_TO_FOCUS_SECTION_ID: {
        // Ambient red-ribbon backdrop: the slide names the hotspot targets,
        // the wheel shows the friction they sit in.
        return {
          groupBy: "document",
          focus:
            sectionFocusOverride === undefined ? null : sectionFocusOverride,
          filter: "tensions",
        };
      }
      case EXPLORE_SECTION_ID:
      default: {
        // The grouping axis is now an explicit, user-switchable control
        // (Documents vs a sector lens), so the lens visibly restructures the
        // wheel. Focus is the optional drill within that axis.
        const groupBy: WheelGroupBy =
          exploreGroup === "sectors" ? "sector" : "document";
        const userFocus: WheelFocus =
          groupBy === "sector"
            ? exploreSector
              ? {
                  type: "sector",
                  id: exploreSector.categoryId,
                  taxonomyType: exploreSector.taxonomyType,
                }
              : null
            : exploreDoc
              ? { type: "doc", id: exploreDoc }
              : null;
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
    topTensionSector,
    lensTaxonomyType,
    exploreFilter,
    exploreGroup,
    exploreDoc,
    exploreSector,
    primerHighlight,
    sectorHoverId,
    sectorFilter,
    focusedDoc,
  ]);

  const scrollToSection = useCallback((id: SectionId) => {
    if (typeof window === "undefined") return;
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const handleRibbonNavigate = useCallback(
    (arcAId: string, arcBId: string) => {
      // Direction-slide ribbon click → land the user on the Doc Pairs slide
      // with the matching doc-pair pre-selected. The wheel hands us arc ids
      // (doc ids when groupBy === "document").
      setPendingDocPair({
        docA: arcAId as PolicyDocumentType,
        docB: arcBId as PolicyDocumentType,
      });
      scrollToSection(DOC_PAIRS_SECTION_ID);
    },
    [scrollToSection],
  );

  // Stable so DocPairsSection's scroll-into-view effect runs once per focused
  // pair instead of on every parent render (an inline arrow re-fires the
  // effect, which re-centres the row and wedges scrolling).
  const clearPendingDocPair = useCallback(() => setPendingDocPair(null), []);

  const handleWheelArcClick = useCallback(
    (focus: WheelFocus) => {
      if (activeSection === DIRECTION_SECTION_ID) {
        // On the Direction slide, clicking a doc arc or its label
        // jumps to the Doc-in-Focus slide with that doc selected.
        if (focus && focus.type === "doc") {
          setSelectedFocusDoc(focus.id);
          scrollToSection(DOC_FOCUS_SECTION_ID);
        }
        return;
      }
      if (activeSection === DOC_FOCUS_SECTION_ID) {
        // On the Doc-in-Focus slide, clicking an arc swaps the focused
        // document directly (no toggle to null — the slide always needs
        // one in focus).
        if (focus && focus.type === "doc") {
          setSelectedFocusDoc(focus.id);
        }
        return;
      }
      if (activeSection === EXPLORE_SECTION_ID) {
        if (!focus) {
          setExploreDoc(null);
          setExploreSector(null);
        } else if (focus.type === "doc") {
          setExploreDoc(focus.id);
          setExploreSector(null);
          setExploreGroup("documents");
        } else {
          const cat = (exploreLens?.categories ?? []).find(
            (c) => c.id === focus.id,
          );
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
          setExploreGroup("sectors");
        }
        return;
      }
      setFocusBySection((prev) => ({ ...prev, [activeSection]: focus }));
    },
    [activeSection, exploreLens, scrollToSection],
  );

  // ── IntersectionObserver wiring ────────────────────────────────
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    [DIRECTION_SECTION_ID]: null,
    [DOC_FOCUS_SECTION_ID]: null,
    [DOC_PAIRS_SECTION_ID]: null,
    [FRICTION_TYPES_SECTION_ID]: null,
    [SECTORS_SECTION_ID]: null,
    [WHERE_TO_FOCUS_SECTION_ID]: null,
    [EXPLORE_SECTION_ID]: null,
  });

  useEffect(() => {
    if (explorerView) return; // narrative unmounted in full-data view — nothing to observe
    const visibility = new Map<SectionId, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.getAttribute(
            "data-section-id",
          ) as SectionId | null;
          if (!id) continue;
          visibility.set(id, entry.intersectionRatio);
        }
        let bestId: SectionId | null = null;
        let bestRatio = -1;
        for (const id of SECTION_ORDER) {
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
    for (const id of SECTION_ORDER) {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [explorerView]); // re-observe fresh section nodes after returning from full-data view

  // Entering the full-data view scrolls to its top; returning lands the user
  // back on the Explore section they triggered it from.
  useEffect(() => {
    if (explorerView) {
      window.scrollTo({ top: 0 });
    } else if (cameFromExplorer.current) {
      cameFromExplorer.current = false;
      requestAnimationFrame(() =>
        sectionRefs.current[EXPLORE_SECTION_ID]?.scrollIntoView({
          block: "start",
        }),
      );
    }
  }, [explorerView]);

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
        {explorerView ? (
          <div className="pt-2">
            <div className="flex items-center justify-between gap-4 mt-6 mb-5">
              <h2
                className="text-[22px] sm:text-[26px] leading-tight text-[var(--undp-black)] font-medium"
                style={{ fontFamily: HEADLINE_SERIF }}
              >
                Explore the full data
              </h2>
              <button
                type="button"
                onClick={() => {
                  cameFromExplorer.current = true;
                  setExplorerView(false);
                }}
                className="inline-flex items-center gap-1.5 text-[13px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors shrink-0"
              >
                <span aria-hidden="true">←</span> Back to chat
              </button>
            </div>
            <PolicyCoherenceExplorer {...explorerProps} variant="embed" />
          </div>
        ) : (
          <>
            <JumpNav active={activeSection} order={SECTION_ORDER} />

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] gap-x-10 gap-y-8 mt-8">
          {/* Content column */}
          <div className="space-y-24">
            <div
              ref={setSectionRef(DIRECTION_SECTION_ID)}
              data-section-id={DIRECTION_SECTION_ID}
            >
              <DirectionSection
                countryName={countryName}
                documentCount={documentCount}
                verdict={verdict}
                concentration={targetConcentration}
                primer={primer}
                countryConfig={countryConfig}
                corpusThemes={corpusThemes}
                onOpenStoryline={openThemeDrawer}
                onOpenPair={openPairFromFaultLine}
                onHighlightPair={setPrimerHighlight}
              />
            </div>
            {focusedDoc && (
              <div
                ref={setSectionRef(DOC_FOCUS_SECTION_ID)}
                data-section-id={DOC_FOCUS_SECTION_ID}
              >
                <DocFocusSection
                  targets={targets}
                  alignment={alignment}
                  countryConfig={countryConfig}
                  focusedDoc={focusedDoc}
                  availableDocs={availableDocs}
                  onSelectDoc={setSelectedFocusDoc}
                  onOpenPair={openPairById}
                  onOpenType={(mechanism) =>
                    setFlagProfile({
                      kind: "friction-type",
                      mechanism,
                      doc: focusedDoc,
                    })
                  }
                />
              </div>
            )}
            <div
              ref={setSectionRef(DOC_PAIRS_SECTION_ID)}
              data-section-id={DOC_PAIRS_SECTION_ID}
            >
              <DocPairsSection
                docPairSyntheses={docPairSyntheses}
                countryConfig={countryConfig}
                onOpenDocPair={openDocPairDrawer}
                onHoverDocPair={setHoveredDocPairKey}
                hoveredKey={hoveredDocPairKey}
                focusedDocPair={pendingDocPair}
                onClearFocusedDocPair={clearPendingDocPair}
              />
            </div>
            <div
              ref={setSectionRef(FRICTION_TYPES_SECTION_ID)}
              data-section-id={FRICTION_TYPES_SECTION_ID}
            >
              <FrictionTypesSection
                totals={frictionTotals}
                onOpenType={(mechanism) =>
                  setFlagProfile({ kind: "friction-type", mechanism })
                }
              />
            </div>
            <div
              ref={setSectionRef(WHERE_TO_FOCUS_SECTION_ID)}
              data-section-id={WHERE_TO_FOCUS_SECTION_ID}
            >
              <WhereToFocusSection
                hotspots={frictionHotspots}
                concentration={targetConcentration}
                countryConfig={countryConfig}
                onOpenTarget={(target) =>
                  setFlagProfile({ kind: "target", target })
                }
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
                lensLabel={lens?.label ?? null}
                taxonomyType={lensTaxonomyType}
                availableLenses={availableLenses}
                activeLensId={lens?.id ?? null}
                onLensChange={handleLensChange}
                filter={sectorFilter}
                onFilterChange={setSectorFilter}
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
                availableLenses={availableLenses}
                exploreGroup={exploreGroup}
                onExploreGroupChange={handleExploreGroupChange}
                exploreLensId={exploreLens?.id ?? null}
                onExploreLensChange={setExploreLensId}
                docPairSyntheses={docPairSyntheses}
                corpusThemes={corpusThemes}
                sectorSyntheses={sectorSyntheses}
                onApplyAction={applyExploreAction}
                onOpenFullData={() => setExplorerView(true)}
              />
            </div>
          </div>

          {/* Sticky visual column. The doc-pairs slide swaps the wheel for
              the coherence matrix (synced with the ranked list on the left);
              where-to-focus swaps in the concentration waffle; every other
              slide shows the wheel. */}
          <aside className="hidden lg:block">
            <div className="sticky top-[124px]">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2 text-center">
                {SECTION_LABELS[activeSection]}
              </p>
              {activeSection === DOC_PAIRS_SECTION_ID ? (
                <div className="flex justify-center">
                  <DocCoherenceMatrix
                    targets={targets}
                    alignment={alignment}
                    countryConfig={countryConfig}
                    onCellClick={openDocPairByDocs}
                    highlightedKey={hoveredDocPairKey}
                    onHoverPair={setHoveredDocPairKey}
                  />
                </div>
              ) : (
                <>
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
                    sectorCategories={
                      activeSection === EXPLORE_SECTION_ID
                        ? (exploreLens?.categories ?? [])
                        : sectorCategories
                    }
                    sectorTaxonomyType={
                      activeSection === EXPLORE_SECTION_ID
                        ? (exploreLens?.taxonomyType ?? "sector")
                        : lensTaxonomyType
                    }
                    onArcClick={handleWheelArcClick}
                    onPairClick={
                      activeSection === DIRECTION_SECTION_ID ||
                      activeSection === DOC_FOCUS_SECTION_ID ||
                      (activeSection === EXPLORE_SECTION_ID &&
                        exploreGroup === "sectors")
                        ? undefined
                        : openPairById
                    }
                    onRibbonNavigate={
                      activeSection === DIRECTION_SECTION_ID
                        ? handleRibbonNavigate
                        : activeSection === DOC_FOCUS_SECTION_ID ||
                            (activeSection === EXPLORE_SECTION_ID &&
                              exploreGroup === "documents")
                          ? (a, b) =>
                              openDocPairByDocs(
                                a as PolicyDocumentType,
                                b as PolicyDocumentType,
                              )
                          : undefined
                    }
                  />
                  <WheelLegend showArcNote={wheelState.frictionArcs === true} />
                </>
              )}
            </div>
          </aside>
            </div>
          </>
        )}
      </div>

      <SectorDrawer
        briefing={drawerBriefing}
        sectorSynthesis={drawerSectorSynthesis}
        countryConfig={countryConfig}
        onClose={() => setSectorFocusForDrawer(null)}
        onOpenTargetPair={(pair, tA, tB) => {
          setSectorFocusForDrawer(null);
          setPairData({
            mode: "target-pair",
            pair,
            targetA: tA,
            targetB: tB,
          });
        }}
      />
      <ThemeDrawer
        theme={activeTheme}
        allStorylines={
          showAllStorylines && corpusThemes
            ? corpusThemes.storylines
            : null
        }
        alignment={alignment}
        targetsById={targetMap}
        countryConfig={countryConfig}
        onClose={closeThemeDrawer}
        onOpenSingleTheme={openThemeDrawer}
        onOpenTargetPair={(pair, tA, tB) => {
          setActiveTheme(null);
          setShowAllStorylines(false);
          setPairData({
            mode: "target-pair",
            pair,
            targetA: tA,
            targetB: tB,
          });
        }}
      />
      <FlagProfileDrawer
        subject={flagProfile}
        alignment={policyAlignment}
        targets={targets}
        classifications={classifications}
        categories={sectorCategories}
        taxonomyType={lensTaxonomyType}
        lensLabel={lens?.label ?? null}
        totalFlagged={frictionTotals.total}
        countryConfig={countryConfig}
        onClose={() => setFlagProfile(null)}
        onOpenTarget={(target) => setFlagProfile({ kind: "target", target })}
        onOpenPair={(a, b) => {
          setFlagProfile(null);
          openPairById(a, b);
        }}
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

function JumpNav({
  active,
  order,
}: {
  active: SectionId;
  order: SectionId[];
}) {
  return (
    <nav className="sticky top-[72px] z-10 -mx-6 px-6 py-3 bg-[#fbfaf7]/85 backdrop-blur border-b border-gray-200/70">
      <ul className="flex items-center gap-1 sm:gap-2 flex-wrap">
        {order.map((id, i) => {
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
              {i < order.length - 1 && (
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

function WheelLegend({ showArcNote }: { showArcNote?: boolean }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-[var(--undp-gray)]">
      <LegendDot color="#196127" label="Aligned" />
      <LegendDot color="#dc2626" label="Potential misalignment" dashed />
      <span className="text-[10px] text-[var(--undp-gray)]/70">
        red = share of each link that is potentially misaligned
      </span>
      {showArcNote && (
        <LegendGradient label="warmer arc = document with more potential misalignment" />
      )}
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

function LegendGradient({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-8 rounded-full"
        style={{
          // Mirrors the rim arc scale (doc-coherence-matrix cellColor): green
          // below the corpus norm, pale near it, terracotta above.
          background:
            "linear-gradient(90deg, rgba(25,97,39,0.55), rgba(25,97,39,0.10) 45%, rgba(220,38,38,0.12) 55%, rgba(220,38,38,0.60))",
        }}
      />
      {label}
    </span>
  );
}

function FooterLink({ countryId }: { countryId?: string }) {
  // Points at the demoted explorer dashboard, which now lives on /prototypes.
  const dashboardHref = countryId
    ? `/prototypes?country=${encodeURIComponent(countryId)}`
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

export type { WheelState } from "./centerpiece/wheel";
