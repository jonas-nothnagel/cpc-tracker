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
import Link from "next/link";
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
import { EXPLORE_SECTION_ID, ExploreSection } from "./sections/explore";
import {
  FINANCING_SECTION_ID,
  FinancingSection,
} from "./sections/financing";
import { WheelCenterpiece } from "./centerpiece/wheel";
import { DocCoherenceMatrix } from "./centerpiece/doc-coherence-matrix";
import { FinancingCenterpiece } from "./centerpiece/financing-centerpiece";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import type {
  WheelFilter,
  WheelFocus,
  WheelState,
} from "./centerpiece/wheel";
import { SectorDrawer } from "./sector-drawer";
import { PairDrawer, type PairDrawerData } from "./pair-drawer";
import { ThemeDrawer } from "./theme-drawer";
import { FlagProfileDrawer, type FlagProfileSubject } from "./flag-profile";
import { DocFilterControl, DocToggleLegend } from "./doc-filter-control";
import type { PrimerHighlightPair } from "./primer-card";
import type { LensId, LensOption } from "./lens";
import { getDocTypeOrder } from "@/lib/utils";
import {
  buildSectorAlignmentDensity,
  buildSectorBriefing,
  buildSectorTensionDensity,
  canonicalHiddenKey,
  computeConcentrationStat,
  computeTargetConcentration,
  frictionTypeTotalsFromAlignment,
  indexSectorSyntheses,
  pickHeadlineVerdict,
  pickPrimerExamples,
  rankTargetsByFriction,
  selectCorpusThemesForState,
  selectSectorSynthesesForState,
  type CorpusThemesPayload,
  type FaultLine,
  type SectorAlignment,
  type SectorBriefing,
  type SectorSynthesisPayload,
  type SectorTension,
} from "@/lib/coherence-briefing";
import {
  computeBudgetCoverage,
  computeFinancingCoherence,
  type BudgetCoverage,
  type FinancingCoherenceSummary,
} from "@/lib/financing-coherence";
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

type SectionId =
  | typeof DIRECTION_SECTION_ID
  | typeof DOC_FOCUS_SECTION_ID
  | typeof DOC_PAIRS_SECTION_ID
  | typeof FRICTION_TYPES_SECTION_ID
  | typeof SECTORS_SECTION_ID
  | typeof WHERE_TO_FOCUS_SECTION_ID
  | typeof FINANCING_SECTION_ID
  | typeof EXPLORE_SECTION_ID;

const SECTION_LABELS: Record<SectionId, string> = {
  [DIRECTION_SECTION_ID]: "Direction",
  [DOC_FOCUS_SECTION_ID]: "Doc in focus",
  [DOC_PAIRS_SECTION_ID]: "Doc pairs",
  [FRICTION_TYPES_SECTION_ID]: "Friction types",
  [SECTORS_SECTION_ID]: "Sectors",
  [WHERE_TO_FOCUS_SECTION_ID]: "Where to focus",
  [FINANCING_SECTION_ID]: "Financing",
  [EXPLORE_SECTION_ID]: "Explore",
};

// Canonical order. The Financing slide only renders for countries with BER
// data (Mongolia today); on countries without it the section is dropped from
// the jump-nav via `visibleSectionOrder` below and never mounts.
const SECTION_ORDER: SectionId[] = [
  DIRECTION_SECTION_ID,
  DOC_FOCUS_SECTION_ID,
  DOC_PAIRS_SECTION_ID,
  FRICTION_TYPES_SECTION_ID,
  WHERE_TO_FOCUS_SECTION_ID,
  SECTORS_SECTION_ID,
  FINANCING_SECTION_ID,
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
  /** Raw corpus_themes payload (carries the `states` map); a legacy
   *  CorpusThemes without states is also accepted. */
  corpusThemes?: CorpusThemesPayload | CorpusThemes | null;
  /** Raw sector_synthesis payload (object with `states`) or a legacy array. */
  sectorSyntheses?: SectorSynthesisPayload | SectorSynthesis[];
  /** FULL target set (incl. BTR + BER pseudo-targets) for the re-hosted
   *  PolicyCoherenceExplorer. Distinct from `targets`, which is policy-only
   *  for the narrative sections. Falls back to `targets` when omitted. */
  explorerTargets?: Target[];
  btrData?: BtrData | null;
  berData?: BerData | null;
  /** BER program × policy-target alignment. Drives the per-document
   *  budget-reach read on the Financing slide (AI-estimated). */
  budgetAlignment?: AlignmentResult[] | null;
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
  budgetAlignment = null,
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
  // ── Document include/exclude filter ─────────────────────────────
  // Soft-hidden docs (defaultHiddenDocTypes) ship to the browser but start
  // hidden; users can toggle any document on/off. Every narrative number,
  // wheel ribbon, and matrix cell below is derived from these visible arrays,
  // so they all recompute live with no pipeline re-run. The Explore workbench
  // (explorerProps above) owns its OWN hiddenDocs and keeps the full corpus.
  const defaultHiddenDocTypes = useMemo(
    () => countryConfig?.defaultHiddenDocTypes ?? [],
    [countryConfig],
  );
  const [hiddenDocs, setHiddenDocs] = useState<Set<string>>(
    () => new Set(defaultHiddenDocTypes),
  );
  const toggleDoc = useCallback((doc: PolicyDocumentType) => {
    setHiddenDocs((prev) => {
      const next = new Set(prev);
      if (next.has(doc)) next.delete(doc);
      else next.add(doc);
      return next;
    });
  }, []);
  const resetHiddenDocs = useCallback(
    () => setHiddenDocs(new Set(defaultHiddenDocTypes)),
    [defaultHiddenDocTypes],
  );

  // Every document in the FULL corpus, in config order — drives the filter
  // control so a hidden doc still appears as a toggle.
  const allDocs = useMemo<PolicyDocumentType[]>(() => {
    const docs = new Set<PolicyDocumentType>();
    for (const t of targets) docs.add(t.sourceDocument);
    return Array.from(docs).sort(
      (a, b) =>
        getDocTypeOrder(countryConfig, a) - getDocTypeOrder(countryConfig, b),
    );
  }, [targets, countryConfig]);

  const visibleTargets = useMemo(
    () => targets.filter((t) => !hiddenDocs.has(t.sourceDocument)),
    [targets, hiddenDocs],
  );
  const visibleTargetIds = useMemo(
    () => new Set(visibleTargets.map((t) => t.id)),
    [visibleTargets],
  );
  const visibleAlignment = useMemo(
    () =>
      alignment.filter(
        (a) =>
          visibleTargetIds.has(a.targetAId) &&
          visibleTargetIds.has(a.targetBId),
      ),
    [alignment, visibleTargetIds],
  );
  const visibleClassifications = useMemo(
    () => classifications.filter((c) => visibleTargetIds.has(c.targetId)),
    [classifications, visibleTargetIds],
  );
  const visibleDocPairSyntheses = useMemo(
    () =>
      docPairSyntheses.filter(
        (dp) => !hiddenDocs.has(dp.doc_a) && !hiddenDocs.has(dp.doc_b),
      ),
    [docPairSyntheses, hiddenDocs],
  );

  // ── Financing coherence (Level 2) ───────────────────────────────
  // Only shown for countries with a Biodiversity Expenditure Review (Mongolia
  // today). Built on hard BER facts alone — no budget↔policy alignment, no
  // taxonomy. Null → the Financing slide is dropped entirely. The commitment
  // count it compares against is the live visible-target count (recomputes
  // with the document toggle).
  const financing = useMemo<FinancingCoherenceSummary | null>(() => {
    if (!berData || !berData.programs || berData.programs.length === 0) {
      return null;
    }
    return computeFinancingCoherence(berData);
  }, [berData]);

  // Softer, AI-estimated per-document budget reach for the left-column read.
  // Recomputes with the document toggle (visibleTargets). Null without budget
  // alignment to draw on.
  const budgetCoverage = useMemo<BudgetCoverage | null>(() => {
    if (!financing || !budgetAlignment || budgetAlignment.length === 0) {
      return null;
    }
    const funded = financing.programs.filter((p) => p.hasSpend);
    return computeBudgetCoverage(budgetAlignment, funded, visibleTargets);
  }, [financing, budgetAlignment, visibleTargets]);

  // Jump-nav / slide order with the Financing slide gated on its data.
  const visibleSectionOrder = useMemo(
    () =>
      financing
        ? SECTION_ORDER
        : SECTION_ORDER.filter((id) => id !== FINANCING_SECTION_ID),
    [financing],
  );

  // Storyline-layer selection for the current hidden set. Corpus + sector
  // storylines come from precomputed states; doc-pair storylines are filtered
  // live above. The numbers always reflect the live arrays — only the LLM prose
  // may fall back to full-corpus for an arbitrary selection with no precomputed
  // state (never reached for Panama's "" / "ENR" states).
  const corpusSelection = useMemo(
    () => selectCorpusThemesForState(corpusThemes, hiddenDocs),
    [corpusThemes, hiddenDocs],
  );
  const sectorSelection = useMemo(
    () => selectSectorSynthesesForState(sectorSyntheses, hiddenDocs),
    [sectorSyntheses, hiddenDocs],
  );
  const visibleSectorSyntheses = sectorSelection.syntheses;

  // ── On-demand corpus storyline for off-path selections ──────────
  // For an arbitrary hidden-set with no precomputed state, the corpus summary
  // falls back to full-corpus prose. When a country slug is available we
  // regenerate just the corpus layer on demand (one synthesis call, debounced,
  // cached) so off-path selections still read consistently. Sector storylines
  // stay on the caveated full-set fallback (regenerating ~26 live would be too
  // heavy). Numbers + doc-pair storylines are already exact regardless.
  const hiddenKey = useMemo(() => canonicalHiddenKey(hiddenDocs), [hiddenDocs]);
  const corpusIsOffPath = hiddenDocs.size > 0 && !corpusSelection.isExact;
  // Successful live results, keyed by hidden-set. `liveFailedKeys` records keys
  // whose fetch failed (or returned no usable storylines) so we show the
  // full-set caveat instead of a perpetual "updating" state and don't refetch.
  const [liveCorpus, setLiveCorpus] = useState<Record<string, CorpusThemes>>(
    {},
  );
  const [liveFailedKeys, setLiveFailedKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (
      !corpusIsOffPath ||
      !countryId ||
      liveCorpus[hiddenKey] ||
      liveFailedKeys.has(hiddenKey)
    ) {
      return;
    }
    let cancelled = false;
    const key = hiddenKey;
    const timer = setTimeout(() => {
      fetch(
        `/api/storyline-state?country=${encodeURIComponent(
          countryId,
        )}&hidden=${encodeURIComponent(key)}`,
      )
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch"))))
        .then((data: { corpusThemes?: CorpusThemes }) => {
          if (cancelled) return;
          if (data?.corpusThemes) {
            setLiveCorpus((prev) => ({ ...prev, [key]: data.corpusThemes! }));
          } else {
            throw new Error("no corpusThemes");
          }
        })
        .catch(() => {
          // Mark failed so the UI falls back to the full-set caveat rather than
          // showing "updating" forever, and so we don't hammer a failing subset.
          if (!cancelled) {
            setLiveFailedKeys((prev) => new Set(prev).add(key));
          }
        });
    }, 700);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [corpusIsOffPath, countryId, hiddenKey, liveCorpus, liveFailedKeys]);

  const liveCorpusForKey = corpusIsOffPath ? liveCorpus[hiddenKey] : undefined;
  const visibleCorpusThemes = liveCorpusForKey ?? corpusSelection.themes;
  // Quiet caveat under the filter control: only the LLM prose may be full-set;
  // every number stays exact. "Updating" while a live regeneration is in
  // flight; the full-set fallback once it lands-or-fails; sector-only note when
  // the corpus is exact but sector prose still reflects all documents.
  const liveUpdating =
    corpusIsOffPath &&
    !!countryId &&
    !liveCorpusForKey &&
    !liveFailedKeys.has(hiddenKey);
  const sectorIsFullSetFallback =
    hiddenDocs.size > 0 && !sectorSelection.isExact;
  const storylineCaveat: string | null = liveUpdating
    ? "Updating storylines for your current selection…"
    : corpusIsOffPath && !liveCorpusForKey
      ? "Storylines reflect all policy documents; the figures reflect your current selection."
      : sectorIsFullSetFallback
        ? "Sector storylines reflect all policy documents; everything else reflects your current selection."
        : null;

  const verdict = useMemo(
    () => pickHeadlineVerdict(visibleAlignment),
    [visibleAlignment],
  );
  const primer = useMemo(
    () => pickPrimerExamples(visibleAlignment, visibleTargets),
    [visibleAlignment, visibleTargets],
  );
  const targetMap = useMemo(
    () => new Map(visibleTargets.map((t) => [t.id, t])),
    [visibleTargets],
  );
  // Policy-coherence scope is target×target. Some datasets also carry BTR/BER
  // measure×target flagged pairs in `alignment`; drop them here so the
  // friction-type bar and its drawer match the rest of the misalignment story
  // (concentration, matrix, doc-pairs are all target×target) rather than
  // reporting a larger count on one slide.
  const policyAlignment = useMemo(
    () =>
      visibleAlignment.filter(
        (a) => targetMap.has(a.targetAId) && targetMap.has(a.targetBId),
      ),
    [visibleAlignment, targetMap],
  );
  const frictionTotals = useMemo(
    () => frictionTypeTotalsFromAlignment(policyAlignment),
    [policyAlignment],
  );
  const targetConcentration = useMemo(
    () => computeTargetConcentration(policyAlignment, visibleTargets),
    [policyAlignment, visibleTargets],
  );
  const frictionHotspots = useMemo(
    () => rankTargetsByFriction(policyAlignment, visibleTargets, 8),
    [policyAlignment, visibleTargets],
  );
  const documentCount = useMemo(() => {
    const docs = new Set<string>();
    for (const t of visibleTargets) docs.add(t.sourceDocument);
    return docs.size;
  }, [visibleTargets]);
  // Visible docs = all docs minus the hidden ones, keeping `allDocs`' config
  // order (so the doc list reads consistently with the wheel legend).
  const availableDocs = useMemo<PolicyDocumentType[]>(
    () => allDocs.filter((d) => !hiddenDocs.has(d)),
    [allDocs, hiddenDocs],
  );

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
      return visibleClassifications.some(
        (c) =>
          c.isPrimary &&
          c.taxonomyType === opt.taxonomyType &&
          idSet.has(c.categoryId),
      );
    });
  }, [globeCategories, sectors, countryConfig, visibleClassifications]);

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
      targets: visibleTargets,
      alignment: visibleAlignment,
      classifications: visibleClassifications,
      categories: lens.categories.map((c) => ({ id: c.id, name: c.name })),
      taxonomyType: lens.taxonomyType,
    });
    return [...density].sort((a, b) => {
      if (b.tensionCount !== a.tensionCount) {
        return b.tensionCount - a.tensionCount;
      }
      return b.targetCount - a.targetCount;
    });
  }, [lens, visibleTargets, visibleAlignment, visibleClassifications]);

  const sectorAlignments = useMemo<SectorAlignment[]>(() => {
    if (!lens) return [];
    return buildSectorAlignmentDensity({
      targets: visibleTargets,
      alignment: visibleAlignment,
      classifications: visibleClassifications,
      categories: lens.categories.map((c) => ({ id: c.id, name: c.name })),
      taxonomyType: lens.taxonomyType,
    });
  }, [lens, visibleTargets, visibleAlignment, visibleClassifications]);

  const sectorSynthesesIndex = useMemo(
    () => indexSectorSyntheses(visibleSectorSyntheses),
    [visibleSectorSyntheses],
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
      const conn = visibleAlignment.find(
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
    [visibleAlignment, targetMap],
  );

  const openDocPairDrawer = useCallback(
    (dp: DocPairSynthesis) => {
      const matchingPairs = visibleAlignment.filter((a) => {
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
    [visibleAlignment, targetMap],
  );

  const openDocPairByDocs = useCallback(
    (a: PolicyDocumentType, b: PolicyDocumentType) => {
      const dp = visibleDocPairSyntheses.find(
        (d) =>
          (d.doc_a === a && d.doc_b === b) || (d.doc_a === b && d.doc_b === a),
      );
      if (dp) {
        openDocPairDrawer(dp);
        return;
      }
      for (const al of visibleAlignment) {
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
    [
      visibleDocPairSyntheses,
      openDocPairDrawer,
      visibleAlignment,
      targetMap,
      openPairById,
    ],
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
      targets: visibleTargets,
      alignment: visibleAlignment,
      classifications: visibleClassifications,
      cap: 6,
    });
  }, [
    sectorFocusForDrawer,
    visibleTargets,
    visibleAlignment,
    visibleClassifications,
  ]);

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
  // The Explore finale renders its own full-width workbench wheel
  // (PolicyCoherenceExplorer, variant="workbench"), which owns all of its
  // interaction state internally: group-by, filter, target search, hidden
  // docs, budget overlay, target/category selection, and chat. The briefing no
  // longer mirrors that state here.

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

  // If the user hides the document currently in focus, ignore the manual
  // selection so the slide falls back to the anchor / first visible doc. The
  // selection itself is kept, so re-showing the doc restores the focus.
  const focusedDoc =
    selectedFocusDoc && !hiddenDocs.has(selectedFocusDoc)
      ? selectedFocusDoc
      : defaultFocusDoc;

  const handleLensChange = useCallback((id: LensId) => {
    setActiveLensId(id);
    setFocusBySection((prev) => {
      if (!(SECTORS_SECTION_ID in prev)) return prev;
      const next = { ...prev };
      delete next[SECTORS_SECTION_ID];
      return next;
    });
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
        // The Explore finale renders its own full-width workbench wheel, so the
        // sticky narrative wheel is never the Explore surface. This is a quiet
        // fallback for the (off-screen) sticky wheel when Explore is active.
        return { groupBy: "document", focus: null, filter: "all" };
      }
    }
  }, [
    activeSection,
    focusBySection,
    topTensionSector,
    lensTaxonomyType,
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
      setFocusBySection((prev) => ({ ...prev, [activeSection]: focus }));
    },
    [activeSection, scrollToSection],
  );

  // ── IntersectionObserver wiring ────────────────────────────────
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    [DIRECTION_SECTION_ID]: null,
    [DOC_FOCUS_SECTION_ID]: null,
    [DOC_PAIRS_SECTION_ID]: null,
    [FRICTION_TYPES_SECTION_ID]: null,
    [SECTORS_SECTION_ID]: null,
    [WHERE_TO_FOCUS_SECTION_ID]: null,
    [FINANCING_SECTION_ID]: null,
    [EXPLORE_SECTION_ID]: null,
  });

  useEffect(() => {
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
        <DocFilterControl
          allDocs={allDocs}
          hiddenDocs={hiddenDocs}
          defaultHiddenDocTypes={defaultHiddenDocTypes}
          countryConfig={countryConfig}
          onToggle={toggleDoc}
          onReset={resetHiddenDocs}
        />
        {storylineCaveat && (
          <p className="mt-1.5 text-[11px] italic text-[var(--undp-gray)]">
            {storylineCaveat}
          </p>
        )}

        {availableDocs.length === 0 ? (
          <div className="mt-10 border-y border-gray-200 py-16 text-center">
            <p className="text-sm text-[var(--undp-gray)]">
              All documents are hidden. Add at least one document above to see
              the coherence briefing.
            </p>
          </div>
        ) : (
          <>
            <JumpNav active={activeSection} order={visibleSectionOrder} />

            {/* Sections 1-6: the scrollytelling narrative with the shared sticky
                wheel. The Explore finale lives in its own full-width block below. */}
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
                corpusThemes={visibleCorpusThemes}
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
                  targets={visibleTargets}
                  alignment={visibleAlignment}
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
                docPairSyntheses={visibleDocPairSyntheses}
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
            {financing && (
              <div
                ref={setSectionRef(FINANCING_SECTION_ID)}
                data-section-id={FINANCING_SECTION_ID}
                // The finding copy is brief; without a min-height this short
                // section would win "active" while still low in the viewport,
                // leaving the previous section visible beside the sticky
                // Financing visual. Fill the column on desktop so the finding
                // stays in sync with its centerpiece (top-aligned, not centred,
                // to match the top-pinned sticky visual).
                className="lg:min-h-[80vh]"
              >
                <FinancingSection
                  summary={financing}
                  commitmentCount={visibleTargets.length}
                  coverage={budgetCoverage}
                  countryConfig={countryConfig}
                  countryName={countryName}
                />
              </div>
            )}
          </div>

          {/* Sticky visual column. The doc-pairs slide swaps the wheel for
              the coherence matrix (synced with the ranked list on the left);
              where-to-focus swaps in the concentration waffle; every other
              slide shows the wheel. */}
          <aside className="hidden lg:block">
            <div className="sticky top-[124px]">
              {/* Interactive doc legend: add/remove documents right at the
                  visual, so toggling a document visibly adds or drops its arc
                  (or matrix row). Also the document colour key. */}
              <DocToggleLegend
                allDocs={allDocs}
                hiddenDocs={hiddenDocs}
                countryConfig={countryConfig}
                onToggle={toggleDoc}
              />
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2 text-center">
                {SECTION_LABELS[activeSection]}
              </p>
              {activeSection === DOC_PAIRS_SECTION_ID ? (
                <div className="flex justify-center">
                  <DocCoherenceMatrix
                    targets={visibleTargets}
                    alignment={visibleAlignment}
                    countryConfig={countryConfig}
                    onCellClick={openDocPairByDocs}
                    highlightedKey={hoveredDocPairKey}
                    onHoverPair={setHoveredDocPairKey}
                  />
                </div>
              ) : activeSection === FINANCING_SECTION_ID && financing ? (
                <FinancingCenterpiece
                  summary={financing}
                  countryName={countryName}
                />
              ) : (
                <>
                  <WheelCenterpiece
                    targets={visibleTargets}
                    alignments={visibleAlignment}
                    classifications={visibleClassifications}
                    countryConfig={countryConfig}
                    state={wheelState}
                    sectorCategories={sectorCategories}
                    sectorTaxonomyType={lensTaxonomyType}
                    onArcClick={handleWheelArcClick}
                    onPairClick={
                      activeSection === DIRECTION_SECTION_ID ||
                      activeSection === DOC_FOCUS_SECTION_ID
                        ? undefined
                        : openPairById
                    }
                    onRibbonNavigate={
                      activeSection === DIRECTION_SECTION_ID
                        ? handleRibbonNavigate
                        : activeSection === DOC_FOCUS_SECTION_ID
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

        {/* Explore finale: the full-width interactive workbench. */}
        <div
          ref={setSectionRef(EXPLORE_SECTION_ID)}
          data-section-id={EXPLORE_SECTION_ID}
          className="mt-24"
        >
          <ExploreSection>
            <PolicyCoherenceExplorer {...explorerProps} variant="workbench" />
          </ExploreSection>
        </div>
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
          showAllStorylines && visibleCorpusThemes
            ? visibleCorpusThemes.storylines
            : null
        }
        alignment={visibleAlignment}
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
        targets={visibleTargets}
        classifications={visibleClassifications}
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
