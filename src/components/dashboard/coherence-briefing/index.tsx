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

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
// Removable usage analytics: see src/lib/analytics/README.md.
import { track } from "@/lib/analytics/client";
import { Modal } from "@/components/ui/modal";
import {
  SECTORS_SECTION_ID,
  SectorsSection,
  SectorWheelFilter,
} from "./sections/sectors";
import {
  DIRECTION_SECTION_ID,
  DirectionSection,
  SynthesisSentence,
} from "./sections/direction";
import type { ThemeSpotlight } from "./storyline-card";
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
import {
  IMPLEMENTATION_SECTION_ID,
  ImplementationSection,
} from "./sections/implementation";
import { WheelCenterpiece } from "./centerpiece/wheel";
import { WheelLegend } from "./centerpiece/wheel-legend";
import { DocCoherenceMatrix } from "./centerpiece/doc-coherence-matrix";
import { DeliveryRoster } from "./centerpiece/delivery-roster";
import { InstitutionFlow } from "./centerpiece/institution-flow";
import { FinancingCenterpiece } from "./centerpiece/financing-centerpiece";
import { PolicyCoherenceExplorer } from "@/components/viz/policy-coherence-explorer";
import type {
  WheelFilter,
  WheelFocus,
  WheelState,
} from "./centerpiece/wheel";
import { BriefingPanelHost } from "./briefing-panels";
import { useBriefingPanels } from "./use-briefing-panels";
import { DocFilterControl, DocToggleLegend } from "./doc-filter-control";
import {
  BRIEFING_SCOPE_ID,
  GuidedReadOffer,
} from "./tour/guided-read-offer";
import { TourButton } from "./tour/tour-button";
import type { BriefingTourId } from "./tour/steps";
import type { PrimerHighlightPair } from "./primer-card";
import type { LensId, LensOption } from "./lens";
import { isUnclassifiedCategoryId } from "@/lib/unclassified-bucket";
import { getDocTypeOrder } from "@/lib/utils";
import { docTierSortKey, hasDocTaxonomy } from "@/lib/doc-taxonomy";
import { resolveStages } from "./nav-stages";
import { TargetsBrowseBar } from "./targets-access";
import {
  buildSectorCoherenceShare,
  buildSectorTensionDensity,
  canonicalHiddenKey,
  computeCoverageConcentration,
  computeTargetConcentration,
  frictionTypeTotalsFromAlignment,
  indexSectorSyntheses,
  pickHeadlineVerdict,
  pickPrimerExamples,
  rankTargetsByFriction,
  selectCorpusThemesForState,
  selectSectorSynthesesForState,
  type CorpusThemesPayload,
  type CoverageConcentrationStat,
  type FaultLine,
  type HeadlineVerdict,
  type PrimerExamples,
  type SectorCoherenceShareSummary,
  type SectorSynthesisPayload,
  type SectorTension,
  type TargetConcentration,
} from "@/lib/coherence-briefing";
import {
  computeBudgetCoverage,
  computeFinancingCoherence,
  computeFundingGrid,
  type BudgetCoverage,
  type FinancingCoherenceSummary,
} from "@/lib/financing-coherence";
import {
  computeBudgetByGlobeCategory,
  computeBudgetByTaxonomy,
  computeOutcomeSubcategories,
  type CategoryBudgetSummary,
  type OutcomeSubcategory,
} from "@/lib/coherence-budget";
import {
  buildActionMeta,
  computeActionPlanAlignment,
  computeDeliveryRoster,
  computeImplementationCoverage,
  computeInstitutionFlow,
  type ActionPlanAlignmentSummary,
  type DeliveryRosterModel,
  type ImplementationCoverage,
  type InstitutionFlowModel,
} from "@/lib/implementation-coherence";
import { orgAcronymsFor } from "@/data/org-acronyms";
import type {
  AlignmentResult,
  BerData,
  BtrData,
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  GlobeCategory,
  GgaCategory,
  HrCategory,
  GlobeSubcategory,
  IpccSector,
  NbsCategory,
  Nr7Data,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

const HEADLINE_SERIF = "var(--font-display)";

type SectionId =
  | typeof DIRECTION_SECTION_ID
  | typeof DOC_FOCUS_SECTION_ID
  | typeof DOC_PAIRS_SECTION_ID
  | typeof FRICTION_TYPES_SECTION_ID
  | typeof SECTORS_SECTION_ID
  | typeof WHERE_TO_FOCUS_SECTION_ID
  | typeof FINANCING_SECTION_ID
  | typeof IMPLEMENTATION_SECTION_ID
  | typeof EXPLORE_SECTION_ID;

function useSectionLabels(): Record<SectionId, string> {
  const t = useTranslations("briefing.sections");
  return {
    [DIRECTION_SECTION_ID]: t("direction"),
    [DOC_FOCUS_SECTION_ID]: t("docFocus"),
    [DOC_PAIRS_SECTION_ID]: t("docPairs"),
    [FRICTION_TYPES_SECTION_ID]: t("frictionTypes"),
    [SECTORS_SECTION_ID]: t("sectors"),
    [WHERE_TO_FOCUS_SECTION_ID]: t("whereToFocus"),
    [FINANCING_SECTION_ID]: t("financing"),
    [IMPLEMENTATION_SECTION_ID]: t("implementation"),
    [EXPLORE_SECTION_ID]: t("explore"),
  };
}

// Canonical order. The Financing slide only renders for countries with BER
// data (Mongolia today); the Implementation slide only for countries with BTR
// data. Each is dropped from the jump-nav via `visibleSectionOrder` below and
// never mounts when its data is absent.
const SECTION_ORDER: SectionId[] = [
  DIRECTION_SECTION_ID,
  DOC_FOCUS_SECTION_ID,
  DOC_PAIRS_SECTION_ID,
  FRICTION_TYPES_SECTION_ID,
  WHERE_TO_FOCUS_SECTION_ID,
  SECTORS_SECTION_ID,
  FINANCING_SECTION_ID,
  IMPLEMENTATION_SECTION_ID,
  EXPLORE_SECTION_ID,
];

/** Distinct, semantically-evocative swatches for the seven GGA climate-resilience
 *  themes (decision 2/CMA.5). Keyed by category id so the mapping is stable
 *  regardless of array order. Colour is presentation only (no source claim). */
const GGA_LENS_COLORS: Record<string, string> = {
  gga_water: "#0468b1",
  gga_agriculture_food: "#d97706",
  gga_health: "#dc2626",
  gga_ecosystems_biodiversity: "#059669",
  gga_infrastructure_settlements: "#64748b",
  gga_livelihoods: "#7c3aed",
  gga_cultural_heritage: "#b45309",
};

/** Distinct swatches for the nine human rights themes. Keyed by category id so
 *  the mapping is stable regardless of array order. Colour is presentation only:
 *  it carries no judgement about a theme and makes no source claim. */
const HR_LENS_COLORS: Record<string, string> = {
  hr_information_education: "#0468b1",
  hr_participation: "#7c3aed",
  hr_access_justice: "#b45309",
  hr_indigenous_local_communities: "#059669",
  hr_gender_equality: "#db2777",
  hr_children_youth: "#d97706",
  hr_defenders: "#dc2626",
  hr_business: "#64748b",
  hr_disabilities: "#0891b2",
  // Derived "no clear theme" bucket: deliberately neutral grey so it reads as
  // an absence of signal rather than as another theme competing for attention.
  hr_unclassified: "#cbd5e1",
};

interface CoherenceBriefingProps {
  countryName: string;
  countryId?: string;
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  /** GGA climate-resilience themes (decision 2/CMA.5), surfaced as a lens. */
  ggaCategories?: GgaCategory[];
  /** Human rights themes (UNDP guidance; DRAFT), surfaced as a lens. */
  hrCategories?: HrCategory[];
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
  ggaCategories = [],
  hrCategories = [],
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
  const t = useTranslations("briefing");
  const locale = useLocale();
  const sectionLabels = useSectionLabels();
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
      ggaCategories,
      hrCategories,
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
      ggaCategories,
      hrCategories,
      classifications,
      nr7Data,
      btrData,
      berData,
      countryConfig,
    ],
  );
  // ── Document include/exclude filter ─────────────────────────────
  // Soft-hidden docs ship to the browser but start hidden; users can toggle any
  // document on/off. Every narrative number, wheel ribbon, and matrix cell below
  // is derived from these visible arrays, so they all recompute live with no
  // pipeline re-run. The Explore workbench (explorerProps above) owns its OWN
  // hiddenDocs and keeps the full corpus.
  //
  // The briefing default-hidden set = docs hidden everywhere
  // (`defaultHiddenDocTypes`) PLUS the country's second-tier docs
  // (`secondaryDocTypes`), which are hidden from the briefing analytical views
  // but stay visible in Explore. So every view here leads with the strategic
  // documents while the second-tier ones are one click away.
  const defaultHiddenDocTypes = useMemo(
    () =>
      Array.from(
        new Set([
          ...(countryConfig?.defaultHiddenDocTypes ?? []),
          ...(countryConfig?.secondaryDocTypes ?? []),
        ]),
      ),
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

  // Every document in the FULL corpus — drives the filter control so a hidden
  // doc still appears as a toggle, and sets the order the wheel arcs, matrix
  // axes and legend inherit. Ordered by national hierarchy where the country
  // has declared one (see src/lib/doc-taxonomy), otherwise config order, which
  // is what this did before the taxonomy existed.
  const allDocs = useMemo<PolicyDocumentType[]>(() => {
    const docs = new Set<PolicyDocumentType>();
    for (const t of targets) docs.add(t.sourceDocument);
    const byConfig = (id: PolicyDocumentType) =>
      getDocTypeOrder(countryConfig, id);
    return Array.from(docs).sort((a, b) =>
      hasDocTaxonomy(countryConfig)
        ? docTierSortKey(countryConfig, a, byConfig(a)) -
          docTierSortKey(countryConfig, b, byConfig(b))
        : byConfig(a) - byConfig(b),
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
  // and Panama today). Built on hard BER facts alone — no budget↔policy alignment, no
  // taxonomy. Null → the Financing slide is dropped entirely. The commitment
  // count it compares against is the live visible-target count (recomputes
  // with the document toggle).
  const financing = useMemo<FinancingCoherenceSummary | null>(() => {
    if (!berData || !berData.programs || berData.programs.length === 0) {
      return null;
    }
    return computeFinancingCoherence(berData, locale);
  }, [berData, locale]);

  // Wide-grid evidence for the financing slide, or null for the dot-map.
  // Non-null only when the country opts in (countryConfig.financingLayout ===
  // "grid") AND the data yields funding rows. Everything wide-grid about the
  // slide — suppressed centerpiece, widened column, invisible aside, the
  // fundingGrid tour — derives from this, never from the country id.
  const fundingGrid = useMemo(
    () =>
      computeFundingGrid({
        targets,
        budgetAlignment,
        berData,
        countryConfig,
        locale,
      }),
    [targets, budgetAlignment, berData, countryConfig, locale],
  );
  const financingUsesWideGrid = fundingGrid !== null;

  // Reviewed spending rolled up to the biodiversity-OUTCOME taxonomy (primary
  // GLOBE), so the centerpiece can lead with where money concentrates AND which
  // outcome areas carry policy targets but no classified budget — the signal the
  // raw program-name view can't show (an absent budget line never appears).
  // Pass the FULL classifications array: BER_* programme classifications are not
  // document-scoped, so visibleClassifications (policy-target filtered) would
  // strip them and zero the budget. Target counts are scoped via visibleTargets,
  // so the gap list's counts track the document toggle while spend stays fixed.
  // Null (no GLOBE-classified BER) → the centerpiece falls back to the raw view.
  const outcomeBudget = useMemo<CategoryBudgetSummary | null>(() => {
    if (!financing || !berData) return null;
    return computeBudgetByGlobeCategory({
      berData,
      globeCategories,
      globeSubcategories,
      classifications,
      targets: visibleTargets,
      alignment: visibleAlignment,
    });
  }, [
    financing,
    berData,
    globeCategories,
    globeSubcategories,
    classifications,
    visibleTargets,
    visibleAlignment,
  ]);

  // Per-outcome subcategory distribution (the rows a category expands into).
  // Same FULL-classifications / visible-targets scoping as outcomeBudget.
  const outcomeSubcategories = useMemo<Map<string, OutcomeSubcategory[]>>(() => {
    if (!outcomeBudget || !berData) return new Map();
    return computeOutcomeSubcategories({
      berData,
      globeSubcategories,
      classifications,
      targets: visibleTargets,
    });
  }, [outcomeBudget, berData, globeSubcategories, classifications, visibleTargets]);

  // GGA finance view: when the climate-resilience lens is active, regroup the
  // reviewed BER spend by the seven GGA themes (single-level — no subcategory
  // rollup). Computed unconditionally (cheap); null unless the country has BER
  // data and GGA classifications, so non-BER countries are unaffected.
  const outcomeBudgetGga = useMemo<CategoryBudgetSummary | null>(() => {
    if (!financing || !berData || ggaCategories.length === 0) return null;
    return computeBudgetByTaxonomy({
      berData,
      categories: ggaCategories,
      primaryTaxonomyType: "gga",
      classifications,
      targets: visibleTargets,
      alignment: visibleAlignment,
    });
  }, [
    financing,
    berData,
    ggaCategories,
    classifications,
    visibleTargets,
    visibleAlignment,
  ]);

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

  // ── Implementation (Level 3) — the BTR lens ─────────────────────
  // What the BTR self-reports against the plan. Null → the Implementation
  // slide is dropped entirely. Uses the FULL `alignment` (the merged array
  // carries the BTR measure↔policy pairs that `visibleAlignment` strips); the
  // policy side is gated on `visibleTargets` so it tracks the document toggle.
  // Per-country sourced acronym map: collapses an acronym ("MET") and the full
  // name ("Ministry of Environment and Climate Change") into one label in the
  // neutral institution context shown on action detail.
  // Empty until confirmed against the BTR's own abbreviations list (raw render).
  const orgMap = useMemo(() => orgAcronymsFor(countryId), [countryId]);

  const implementation = useMemo<ActionPlanAlignmentSummary | null>(() => {
    if (!btrData || !btrData.mitigationMeasures?.length) return null;
    return computeActionPlanAlignment(alignment, btrData, visibleTargets, 5, orgMap);
  }, [btrData, alignment, visibleTargets, orgMap]);

  // Coverage: which visible targets have >= 1 strongly aligned reported
  // action (the slide's lead story, mirroring the Financing dot-map).
  const implementationCoverage = useMemo<ImplementationCoverage | null>(() => {
    if (!btrData || !btrData.mitigationMeasures?.length) return null;
    return computeImplementationCoverage(alignment, btrData, visibleTargets, orgMap);
  }, [btrData, alignment, visibleTargets, orgMap]);

  // The report object for the right column: who is named on the reported
  // actions, with each institution's actions as status-coloured dots.
  // Neutral involvement as stated by the report, never a strain ranking.
  const deliveryRoster = useMemo<DeliveryRosterModel | null>(() => {
    if (!btrData || !btrData.mitigationMeasures?.length) return null;
    return computeDeliveryRoster(btrData, orgMap);
  }, [btrData, orgMap]);

  // Alternative right-column view: where each institution's reported actions
  // land across the policy documents (entity→document flow). Same neutral
  // involvement framing as the roster; gated on the BTR and the document
  // toggle (visibleTargets).
  const institutionFlow = useMemo<InstitutionFlowModel | null>(() => {
    if (!btrData || !btrData.mitigationMeasures?.length) return null;
    return computeInstitutionFlow(alignment, btrData, visibleTargets, orgMap);
  }, [btrData, alignment, visibleTargets, orgMap]);
  const [implCenterView, setImplCenterView] = useState<"roster" | "flow">(
    "roster",
  );
  // Pop the active centerpiece into a large overlay so relationships are
  // explorable at size (the sticky column is only ~480px wide).
  const [expanded, setExpanded] = useState(false);

  // Synthetic Target stand-ins for reported actions, so an action↔target row
  // in the Implementation drill-down opens the SAME PairDrawer as everywhere
  // else in the briefing. sourceDocument "BTR" uses the reserved doc token;
  // sourceLabel carries the country-reported status ("BTR · Ongoing").
  const actionPairTargets = useMemo(() => {
    const map = new Map<string, Target>();
    if (!btrData?.mitigationMeasures?.length) return map;
    for (const [id, meta] of buildActionMeta(btrData)) {
      const status = (meta.measure.status ?? "").trim();
      map.set(id, {
        id,
        text: meta.measure.description
          ? `${meta.name}. ${meta.measure.description}`
          : meta.name,
        sourceDocument: "BTR",
        sourceLabel: status,
        country: countryName,
        isQuantitative: false,
        isTimeBound: false,
      });
    }
    return map;
  }, [btrData, countryName]);

  // Synthetic Target stand-ins for funded budget lines, so a budget↔commitment
  // match on the Financing slide (non-Panama DocumentCoverage layout) opens the
  // SAME PairDrawer (full rationale + both sides). sourceDocument "BER" uses
  // the reserved doc token; sourceLabel carries the budget code.
  const budgetPairTargets = useMemo(() => {
    const map = new Map<string, Target>();
    if (!berData?.programs?.length) return map;
    for (const p of berData.programs) {
      const id = `BER_${p.code}`;
      map.set(id, {
        id,
        text: p.description ? `${p.name}. ${p.description}` : p.name,
        sourceDocument: "BER",
        sourceLabel: p.code,
        country: countryName,
        isQuantitative: false,
        isTimeBound: false,
      });
    }
    return map;
  }, [berData, countryName]);

  // Jump-nav / slide order with the Financing and Implementation slides each
  // gated independently on their data.
  const visibleSectionOrder = useMemo(() => {
    let order = SECTION_ORDER;
    if (!financing) order = order.filter((id) => id !== FINANCING_SECTION_ID);
    if (!implementation)
      order = order.filter((id) => id !== IMPLEMENTATION_SECTION_ID);
    return order;
  }, [financing, implementation]);

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
    ? t("storylineCaveat.updating")
    : corpusIsOffPath && !liveCorpusForKey
      ? t("storylineCaveat.corpusOffPath")
      : sectorIsFullSetFallback
        ? t("storylineCaveat.sectorFallback")
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
        label: t("lens.globe"),
        taxonomyType: "globe",
        categories: globeCategories.map((g) => ({ id: g.id, name: g.name })),
      });
    }
    if (sectors.length > 0) {
      candidates.push({
        id: "ipcc",
        label: t("lens.ipcc"),
        taxonomyType: "sector",
        categories: sectors.map((s) => ({ id: s.id, name: s.name })),
      });
    }
    const countryCats = countryConfig?.countrySectors ?? [];
    if (countryCats.length > 0) {
      candidates.push({
        id: "country",
        label: t("lens.country"),
        taxonomyType: "sector",
        categories: countryCats.map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
        })),
      });
    }
    // GGA climate-resilience lens (decision 2/CMA.5). Offered only when the
    // pipeline has classified targets against it; the filter below also enforces
    // at least one primary `gga` classification in the currently-visible set.
    if (ggaCategories.length > 0) {
      candidates.push({
        id: "gga",
        label: t("lens.gga"),
        tooltip: t("lens.ggaTooltip"),
        taxonomyType: "gga",
        categories: ggaCategories.map((c) => ({
          id: c.id,
          name: c.name,
          color: GGA_LENS_COLORS[c.id] ?? "#9ca3af",
        })),
      });
    }
    // Human rights lens (UNDP guidance, DRAFT under expert review). Same
    // data-driven gating as every other lens: offered only when the pipeline
    // has classified targets against it.
    if (hrCategories.length > 0) {
      candidates.push({
        id: "hr",
        label: t("lens.hr"),
        tooltip: t("lens.hrTooltip"),
        taxonomyType: "hr",
        categories: hrCategories.map((c) => ({
          id: c.id,
          name: c.name,
          color: HR_LENS_COLORS[c.id] ?? "#9ca3af",
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
  }, [t, globeCategories, ggaCategories, hrCategories, sectors, countryConfig, visibleClassifications]);

  const [activeLensId, setActiveLensId] = useState<LensId | null>(null);

  const lens = useMemo<LensOption | null>(() => {
    if (availableLenses.length === 0) return null;
    if (activeLensId) {
      const found = availableLenses.find((l) => l.id === activeLensId);
      if (found) return found;
    }
    return availableLenses[0];
  }, [availableLenses, activeLensId]);

  // Targets the active lens could not place in any real category (they sit in
  // the derived "no clear theme" bucket). Empty for lenses without a bucket.
  const unclassifiedTargetIds = useMemo(() => {
    const ids = new Set<string>();
    if (!lens) return ids;
    for (const c of visibleClassifications) {
      if (
        c.isPrimary &&
        c.taxonomyType === lens.taxonomyType &&
        isUnclassifiedCategoryId(c.categoryId)
      ) {
        ids.add(c.targetId);
      }
    }
    return ids;
  }, [lens, visibleClassifications]);

  // Opt-in focus mode: drop those targets from this lens's views so the
  // remaining themes can be compared without the bucket dominating. Off by
  // default — hiding them by default would understate how much of the corpus
  // the lens does not actually cover.
  const [hideUnclassified, setHideUnclassified] = useState(false);
  const canHideUnclassified = unclassifiedTargetIds.size > 0;
  const hidingUnclassified = hideUnclassified && canHideUnclassified;

  const lensTargets = useMemo(
    () =>
      hidingUnclassified
        ? visibleTargets.filter((t) => !unclassifiedTargetIds.has(t.id))
        : visibleTargets,
    [hidingUnclassified, visibleTargets, unclassifiedTargetIds],
  );
  const lensAlignment = useMemo(
    () =>
      hidingUnclassified
        ? visibleAlignment.filter(
            (a) =>
              !unclassifiedTargetIds.has(a.targetAId) &&
              !unclassifiedTargetIds.has(a.targetBId),
          )
        : visibleAlignment,
    [hidingUnclassified, visibleAlignment, unclassifiedTargetIds],
  );
  const lensClassifications = useMemo(
    () =>
      hidingUnclassified
        ? visibleClassifications.filter(
            (c) => !unclassifiedTargetIds.has(c.targetId),
          )
        : visibleClassifications,
    [hidingUnclassified, visibleClassifications, unclassifiedTargetIds],
  );
  const lensCategories = useMemo(
    () =>
      hidingUnclassified
        ? (lens?.categories ?? []).filter(
            (c) => !isUnclassifiedCategoryId(c.id),
          )
        : (lens?.categories ?? []),
    [hidingUnclassified, lens],
  );

  const sectorRows = useMemo<SectorTension[]>(() => {
    if (!lens) return [];
    const density = buildSectorTensionDensity({
      targets: lensTargets,
      alignment: lensAlignment,
      classifications: lensClassifications,
      categories: lensCategories.map((c) => ({ id: c.id, name: c.name })),
      taxonomyType: lens.taxonomyType,
    });
    return [...density].sort((a, b) => {
      if (b.tensionCount !== a.tensionCount) {
        return b.tensionCount - a.tensionCount;
      }
      return b.targetCount - a.targetCount;
    });
  }, [lens, lensTargets, lensAlignment, lensClassifications, lensCategories]);

  const sectorShares = useMemo<SectorCoherenceShareSummary | null>(() => {
    if (!lens) return null;
    return buildSectorCoherenceShare({
      targets: lensTargets,
      alignment: lensAlignment,
      classifications: lensClassifications,
      categories: lensCategories.map((c) => ({ id: c.id, name: c.name })),
      taxonomyType: lens.taxonomyType,
    });
  }, [lens, lensTargets, lensAlignment, lensClassifications, lensCategories]);

  const sectorSynthesesIndex = useMemo(
    () => indexSectorSyntheses(visibleSectorSyntheses),
    [visibleSectorSyntheses],
  );

  const sectorCategories = lensCategories;
  const lensTaxonomyType = lens?.taxonomyType ?? "sector";
  const topTensionSector = useMemo(
    () => sectorRows.find((s) => s.tensionCount > 0) ?? sectorRows[0] ?? null,
    [sectorRows],
  );
  const coverageConcentration = useMemo<CoverageConcentrationStat>(
    () => computeCoverageConcentration(sectorRows),
    [sectorRows],
  );

  // ── Panel trail ─────────────────────────────────────────────────
  // One back-navigable stack for every drill-down. Opening from the page
  // starts a fresh trail; drilling from inside a panel pushes onto it.
  const panels = useBriefingPanels();
  const openPanel = panels.open;

  const openThemeDrawer = useCallback(
    (s: CorpusStoryline) => openPanel({ kind: "theme", name: s.name }),
    [openPanel],
  );

  const openPairFromFaultLine = useCallback(
    (line: FaultLine) =>
      // Reading order comes from the row, not from the stored pair record.
      openPanel({
        kind: "target-pair",
        aId: line.targetA.id,
        bId: line.targetB.id,
      }),
    [openPanel],
  );

  const openPairById = useCallback(
    (aId: string, bId: string) => {
      // Checked here rather than in the panel so a row that cannot resolve
      // simply does nothing, instead of flashing a panel open and shut.
      if (!targetMap.has(aId) || !targetMap.has(bId)) return;
      const conn = visibleAlignment.some(
        (p) =>
          (p.targetAId === aId && p.targetBId === bId) ||
          (p.targetAId === bId && p.targetBId === aId),
      );
      if (!conn) return;
      openPanel({ kind: "target-pair", aId, bId });
    },
    [visibleAlignment, targetMap, openPanel],
  );

  // Implementation drill-down: open an action↔target relation in the same
  // PairDrawer. The pair lives in the RAW merged `alignment` (measure pairs
  // are stripped from `visibleAlignment`); the action side is a synthetic
  // Target stand-in from `actionPairTargets`.
  const openActionPair = useCallback(
    (actionId: string, targetId: string) => {
      if (!targetMap.has(targetId) || !actionPairTargets.has(actionId)) return;
      const conn = alignment.some(
        (p) =>
          (p.targetAId === actionId && p.targetBId === targetId) ||
          (p.targetAId === targetId && p.targetBId === actionId),
      );
      if (!conn) return;
      // Action first: the connector reads in delivery direction ("BTR action
      // supports / is possibly misaligned with the policy target").
      openPanel({ kind: "target-pair", aId: actionId, bId: targetId });
    },
    [targetMap, actionPairTargets, alignment, openPanel],
  );

  // Financing drill-down (non-Panama DocumentCoverage layout): open a
  // budget-line↔commitment match in the same PairDrawer. The pair lives in
  // `budgetAlignment`; the budget side is a synthetic Target stand-in from
  // `budgetPairTargets`.
  const openBudgetPair = useCallback(
    (programBerId: string, targetId: string) => {
      if (!targetMap.has(targetId) || !budgetPairTargets.has(programBerId)) {
        return;
      }
      const conn = budgetAlignment?.some(
        (p) =>
          (p.targetAId === programBerId && p.targetBId === targetId) ||
          (p.targetAId === targetId && p.targetBId === programBerId),
      );
      if (!conn) return;
      // Budget line first: the connector reads in funding direction ("budget
      // line supports the policy commitment").
      openPanel({ kind: "target-pair", aId: programBerId, bId: targetId });
    },
    [targetMap, budgetPairTargets, budgetAlignment, openPanel],
  );

  const openDocPairDrawer = useCallback(
    (dp: DocPairSynthesis) =>
      openPanel({ kind: "doc-pair", docA: dp.doc_a, docB: dp.doc_b }),
    [openPanel],
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
      openPanel({ kind: "sector", ...s }),
    [openPanel],
  );

  const openDocTargets = useCallback(
    (doc: PolicyDocumentType) => openPanel({ kind: "doc-targets", doc }),
    [openPanel],
  );

  /** Targets per document, over the whole corpus rather than the visible
   *  subset: an excluded document still shows its real count, because that is
   *  what the reader needs in order to decide whether to bring it back in. */
  const targetCountByDoc = useMemo(() => {
    const counts = new Map<PolicyDocumentType, number>();
    for (const target of targets) {
      counts.set(
        target.sourceDocument,
        (counts.get(target.sourceDocument) ?? 0) + 1,
      );
    }
    return counts;
  }, [targets]);

  /** EVERYTHING the analysis touches, including the BTR reported-action and BER
   *  budget-line stand-ins that the analytical views deliberately exclude.
   *
   *  Feeds the browse bar and the targets drawer ONLY. This widens what a reader
   *  can open and read; it never changes what the briefing compares, which stays
   *  on the filtered `targets`. Without this the BTR chip would open an empty
   *  drawer, because `targets` has both stand-in kinds filtered out upstream. */
  const browsableTargets = useMemo<Target[]>(() => {
    const byId = new Map<string, Target>();
    for (const target of explorerData) byId.set(target.id, target);
    // The BER stand-ins are built in this component from `berData` rather than
    // arriving in the payload's target list, so they have to be folded in here.
    for (const target of budgetPairTargets.values()) byId.set(target.id, target);
    return [...byId.values()];
  }, [explorerData, budgetPairTargets]);

  const browsableCountByDoc = useMemo(() => {
    const counts = new Map<PolicyDocumentType, number>();
    for (const target of browsableTargets) {
      counts.set(
        target.sourceDocument,
        (counts.get(target.sourceDocument) ?? 0) + 1,
      );
    }
    return counts;
  }, [browsableTargets]);

  const browsableDocs = useMemo<PolicyDocumentType[]>(() => {
    const extra = new Set<PolicyDocumentType>();
    for (const target of browsableTargets) {
      if (!allDocs.includes(target.sourceDocument)) extra.add(target.sourceDocument);
    }
    // allDocs first (already tier-ordered), then whatever only the wider corpus
    // has; the bar re-sorts and puts the stand-ins last regardless.
    return [...allDocs, ...extra];
  }, [allDocs, browsableTargets]);

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
  // Theme-box hover spotlight: fades the wheel to the hovered theme's
  // documents and filters its ribbons to the theme's polarity.
  const [themeSpotlight, setThemeSpotlight] = useState<ThemeSpotlight | null>(
    null,
  );
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
        // Corpus-level backdrop. No focus — the per-doc exploration lives on
        // the Doc-in-Focus slide. Primer-card hover spotlights a single pair
        // in red; theme-box hover fades the wheel to the theme's documents
        // and shows only its polarity's ribbons.
        return {
          groupBy: "document",
          focus: null,
          filter: themeSpotlight
            ? themeSpotlight.polarity === "friction"
              ? "tensions"
              : "alignments"
            : "all",
          frictionArcs: true,
          highlightPair: primerHighlight ?? undefined,
          ghostExceptDocs: themeSpotlight?.docs,
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
    themeSpotlight,
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
    [IMPLEMENTATION_SECTION_ID]: null,
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

  // Removable usage analytics: see src/lib/analytics/README.md.
  useEffect(() => void track("section_viewed", { section: activeSection }), [activeSection]);

  const setSectionRef = useCallback(
    (id: SectionId) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el;
    },
    [],
  );

  // The active section's sticky visual. Extracted so the same graphic + legend
  // Scope root for the guided tour: `data-tour` targets are resolved inside
  // this element, so the tour spotlights the inline centerpiece rather than
  // the copy inside the expand overlay.
  const stickyCenterRef = useRef<HTMLDivElement | null>(null);
  // Which "How to read this chart" tour matches the centerpiece currently in
  // the sticky column. Mirrors renderActiveCenterpiece's branches.
  const activeTourId: BriefingTourId =
    activeSection === DOC_PAIRS_SECTION_ID
      ? "docMatrix"
      : activeSection === FINANCING_SECTION_ID &&
          financing &&
          !financingUsesWideGrid
        ? "financing"
        : activeSection === IMPLEMENTATION_SECTION_ID && deliveryRoster
          ? implCenterView === "flow" && institutionFlow
            ? "institutionFlow"
            : "deliveryRoster"
          : "wheel";

  // renders both inline (the ~480px column) and inside the expand overlay; the
  // only difference is the wheel's height cap.
  const renderActiveCenterpiece = (inModal: boolean) => {
    if (activeSection === DOC_PAIRS_SECTION_ID) {
      return (
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
      );
    }
    if (activeSection === FINANCING_SECTION_ID && financing) {
      // The wide-grid layout drops the centerpiece: the FundingTargetGrid
      // stretches across both columns via `lg:w-[calc(100%+520px)]` +
      // `lg:invisible` on the aside, so the finance-outcome centerpiece would
      // be duplicative — the slide's own GlobeSpendBreakdown carries the
      // GLOBE rollup there. Dot-map countries keep the centerpiece (the
      // budget object itself: what it is, where money concentrates,
      // unspent share).
      if (financingUsesWideGrid) return null;
      return (
        <FinancingCenterpiece
          summary={financing}
          outcomeBudget={
            lens?.taxonomyType === "gga" ? outcomeBudgetGga : outcomeBudget
          }
          outcomeSubcategories={
            lens?.taxonomyType === "gga" ? null : outcomeSubcategories
          }
          countryName={countryName}
        />
      );
    }
    if (activeSection === IMPLEMENTATION_SECTION_ID && deliveryRoster) {
      return (
        <div>
          {/* Toggle the reported-snapshot column between WHO delivers
              (roster) and WHERE that effort lands in the plan (flow). */}
          <div className="flex items-center gap-1.5 mb-3">
            {(["roster", "flow"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setImplCenterView(v)}
                aria-pressed={implCenterView === v}
                className={`text-caption px-2.5 py-0.5 rounded-full border transition-colors ${
                  implCenterView === v
                    ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                    : "text-[var(--undp-gray)] border-gray-300 hover:text-[var(--undp-black)]"
                }`}
              >
                {t(
                  v === "roster"
                    ? "implementationCenter.flow.toggleRoster"
                    : "implementationCenter.flow.toggleFlow",
                )}
              </button>
            ))}
          </div>
          {implCenterView === "flow" && institutionFlow ? (
            <InstitutionFlow
              model={institutionFlow}
              countryConfig={countryConfig}
              countryName={countryName}
              onOpenActionPair={openActionPair}
            />
          ) : (
            <DeliveryRoster roster={deliveryRoster} countryName={countryName} />
          )}
        </div>
      );
    }
    return (
      <>
        <WheelCenterpiece
          targets={lensTargets}
          alignments={lensAlignment}
          classifications={lensClassifications}
          countryConfig={countryConfig}
          state={wheelState}
          sectorCategories={sectorCategories}
          sectorTaxonomyType={lensTaxonomyType}
          maxHeightPx={inModal ? 680 : 620}
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
      </>
    );
  };

  // True while the sticky graphic is the wheel itself (not the matrix,
  // financing, or reported-snapshot centerpiece): gates the shared legend.
  const wheelIsActiveCenterpiece =
    activeSection !== DOC_PAIRS_SECTION_ID &&
    !(activeSection === FINANCING_SECTION_ID && financing) &&
    !(activeSection === IMPLEMENTATION_SECTION_ID && deliveryRoster);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <main className="flex-1 w-full">
      <div id={BRIEFING_SCOPE_ID} className="max-w-7xl mx-auto px-6 pb-24">
        <BriefingHeader
          countryName={countryName}
          documentCount={documentCount}
          verdict={availableDocs.length > 0 ? verdict : null}
          concentration={targetConcentration}
          primer={primer}
          countryConfig={countryConfig}
          onOpenPair={openPairFromFaultLine}
          onHighlightPair={setPrimerHighlight}
        />
        {/* First-visit orientation: offered, never forced. Hidden when no
            documents are visible (no sections to walk through). */}
        {availableDocs.length > 0 && <GuidedReadOffer />}
        {/* The uploaded data, on the first screen: which source documents the
            briefing covers and every target in them (an explicit stakeholder
            request — readers must always know where to reach the data). Sits
            after the verdict so the first thing read is the finding, but
            before the nav so data access never needs a scroll. */}
        <div data-tour="guided-corpus" className="scroll-mt-24">
          <TargetsBrowseBar
            allDocs={browsableDocs}
            countryConfig={countryConfig}
            targetCountByDoc={browsableCountByDoc}
            onViewTargets={openDocTargets}
          />
          <DocFilterControl
            allDocs={allDocs}
            hiddenDocs={hiddenDocs}
            defaultHiddenDocTypes={defaultHiddenDocTypes}
            countryConfig={countryConfig}
            onToggle={toggleDoc}
            onReset={resetHiddenDocs}
            targetCountByDoc={targetCountByDoc}
            onViewTargets={openDocTargets}
          />
          {storylineCaveat && (
            <p className="mt-1.5 text-caption text-[var(--undp-gray)]">
              {storylineCaveat}
            </p>
          )}
        </div>

        {availableDocs.length === 0 ? (
          <div className="mt-10 border-y border-gray-200 py-16 text-center">
            <p className="text-body text-[var(--undp-gray)]">
              {t("emptyState.allDocsHidden")}
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
                primer={primer}
                countryConfig={countryConfig}
                corpusThemes={visibleCorpusThemes}
                alignment={policyAlignment}
                targets={visibleTargets}
                onOpenStoryline={openThemeDrawer}
                onOpenPair={openPairFromFaultLine}
                onHighlightPair={setPrimerHighlight}
                onSpotlightTheme={setThemeSpotlight}
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
                  onViewTargets={openDocTargets}
                  onOpenType={(mechanism) =>
                    openPanel({
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
                  openPanel({ kind: "friction-type", mechanism })
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
                  openPanel({ kind: "target-profile", targetId: target.id })
                }
              />
            </div>
            <div
              ref={setSectionRef(SECTORS_SECTION_ID)}
              data-section-id={SECTORS_SECTION_ID}
            >
              <SectorsSection
                sectorRows={sectorRows}
                sectorShares={sectorShares}
                coverageConcentration={coverageConcentration}
                taxonomyType={lensTaxonomyType}
                availableLenses={availableLenses}
                activeLensId={lens?.id ?? null}
                onLensChange={handleLensChange}
                onOpenSector={openSectorDrawer}
                onHoverSector={setSectorHoverId}
                canHideUnclassified={canHideUnclassified}
                hideUnclassified={hidingUnclassified}
                onHideUnclassifiedChange={setHideUnclassified}
                unclassifiedCount={unclassifiedTargetIds.size}
              />
            </div>
            {financing && (
              <div
                ref={setSectionRef(FINANCING_SECTION_ID)}
                data-section-id={FINANCING_SECTION_ID}
                // The wide-grid layout has no sticky centerpiece
                // (renderActiveCenterpiece returns null and the aside is
                // invisible), so the FundingTargetGrid extends 520px to the
                // right into the empty aside area (480px aside + 40px gap-x
                // on the outer grid). Dot-map countries keep the normal
                // column width with their FinancingCenterpiece on the right.
                className={
                  "lg:min-h-[80vh] " +
                  (financingUsesWideGrid ? "lg:w-[calc(100%+520px)]" : "")
                }
              >
                <FinancingSection
                  summary={financing}
                  commitmentCount={visibleTargets.length}
                  coverage={budgetCoverage}
                  countryConfig={countryConfig}
                  countryName={countryName}
                  grid={fundingGrid}
                  berData={berData}
                  globeSpend={outcomeBudget}
                  onOpenBudgetPair={openBudgetPair}
                />
              </div>
            )}
            {implementation && implementationCoverage && (
              <div
                ref={setSectionRef(IMPLEMENTATION_SECTION_ID)}
                data-section-id={IMPLEMENTATION_SECTION_ID}
                // Same short-section fix as Financing: fill the column on
                // desktop so this brief finding stays in sync with its sticky
                // reported-snapshot centerpiece.
                className="lg:min-h-[80vh]"
              >
                <ImplementationSection
                  coverage={implementationCoverage}
                  summary={implementation}
                  nr7Data={nr7Data}
                  countryName={countryName}
                  countryConfig={countryConfig}
                  onOpenActionPair={openActionPair}
                />
              </div>
            )}
          </div>

          {/* Sticky visual column. The doc-pairs slide swaps the wheel for
              the coherence matrix (synced with the ranked list on the left);
              where-to-focus swaps in the concentration waffle; every other
              slide shows the wheel. In the wide-grid financing layout the
              slide hides the aside so the FundingTargetGrid can stretch into
              this space — its per-doc dot rows already carry the doc filter
              implicitly. */}
          <aside
            className={
              "hidden lg:block " +
              (activeSection === FINANCING_SECTION_ID && financingUsesWideGrid
                ? "lg:invisible"
                : "")
            }
          >
            {/* data-section-id: attributes centerpiece clicks to the section
                driving the sticky swap (removable usage analytics). */}
            <div
              ref={stickyCenterRef}
              className="sticky top-[124px]"
              data-section-id={activeSection}
            >
              {/* Interactive doc legend: add/remove documents right at the
                  visual, so toggling a document visibly adds or drops its arc
                  (or matrix row). Also the document colour key. */}
              <div data-tour="doc-toggle">
                <DocToggleLegend
                  allDocs={allDocs}
                  hiddenDocs={hiddenDocs}
                  countryConfig={countryConfig}
                  onToggle={toggleDoc}
                  targetCountByDoc={targetCountByDoc}
                  onViewTargets={openDocTargets}
                />
              </div>
              <div className="mb-2 flex items-center justify-between">
                {/* Guided walkthrough of the current centerpiece. */}
                <TourButton
                  tourId={activeTourId}
                  scopeRef={stickyCenterRef}
                  labelled
                />
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  aria-label={t("expand.aria")}
                  title={t("expand.aria")}
                  className="inline-flex items-center gap-1 text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] transition-colors"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 5V2h3M12 9v3h-3M9 2h3v3M5 12H2V9"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{t("expand.button")}</span>
                </button>
              </div>
              {/* The ribbon filter controls the wheel, so it sits with the
                  wheel while the Sectors slide is active. */}
              {activeSection === SECTORS_SECTION_ID && (
                <SectorWheelFilter
                  filter={sectorFilter}
                  onFilterChange={setSectorFilter}
                />
              )}
              {renderActiveCenterpiece(false)}
              {wheelIsActiveCenterpiece && (
                <WheelLegend showArcNote={wheelState.frictionArcs === true} />
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

      <BriefingPanelHost
        panels={panels}
        countryConfig={countryConfig}
        countryId={countryId}
        targetMap={targetMap}
        actionPairTargets={actionPairTargets}
        budgetPairTargets={budgetPairTargets}
        visibleAlignment={visibleAlignment}
        alignment={alignment}
        budgetAlignment={budgetAlignment ?? null}
        policyAlignment={policyAlignment}
        docPairSyntheses={visibleDocPairSyntheses}
        corpusThemes={visibleCorpusThemes}
        visibleTargets={visibleTargets}
        visibleClassifications={visibleClassifications}
        sectorCategories={sectorCategories}
        lensTaxonomyType={lensTaxonomyType}
        sectorSynthesesIndex={sectorSynthesesIndex}
        totalFlagged={frictionTotals.total}
        totalDocCount={documentCount}
        allTargets={browsableTargets}
        hiddenDocs={hiddenDocs}
      />
      {/* Expand the active centerpiece to a large overlay so relationships are
          explorable at size; the same graphic + legend renders bigger here. */}
      <Modal
        open={expanded}
        onClose={() => setExpanded(false)}
        title={sectionLabels[activeSection]}
        maxWidth="max-w-5xl"
      >
        <div
          className="p-6 flex flex-col items-center"
          data-section-id={activeSection}
        >
          {expanded ? renderActiveCenterpiece(true) : null}
          {expanded && wheelIsActiveCenterpiece && (
            <WheelLegend showArcNote={wheelState.frictionArcs === true} />
          )}
        </div>
      </Modal>
      <FooterLink countryId={countryId} />
    </main>
  );
}

// ─── Header + nav ────────────────────────────────────────────────

/**
 * Verdict-first header (Aug 2026): the first thing a reader meets after the
 * country name is the corpus verdict and its synthesis sentence — the one
 * finding that orients a first-time visitor — rather than utility controls.
 * The Panama focus group (23 Jul 2026) showed the barrier is "quickly
 * understanding what the results show"; the verdict is that understanding.
 */
function BriefingHeader({
  countryName,
  documentCount,
  verdict,
  concentration,
  primer,
  countryConfig,
  onOpenPair,
  onHighlightPair,
}: {
  countryName: string;
  documentCount: number;
  /** Corpus verdict for the visible documents. Null (the all-documents-hidden
   *  empty state) falls back to the plain subtitle line. */
  verdict: HeadlineVerdict | null;
  concentration: TargetConcentration;
  primer: PrimerExamples;
  countryConfig: CountryConfig | null;
  onOpenPair: (line: FaultLine) => void;
  onHighlightPair: (pair: PrimerHighlightPair | null) => void;
}) {
  const t = useTranslations("briefing.header");
  const tDirection = useTranslations("briefing.direction");
  return (
    <header className="pt-10 pb-2 scroll-mt-24" data-tour="guided-header">
      <h1
        className="text-display tracking-[-0.02em] text-[var(--undp-black)] font-semibold"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {countryName}.
      </h1>
      {verdict ? (
        <>
          <p className="mt-3 font-display text-headline sm:text-headline-lg text-[var(--undp-black)] font-medium max-w-4xl">
            {tDirection(`verdict.${verdict.bucket}`)}
          </p>
          <p className="mt-3 text-body text-[var(--undp-black)] max-w-prose">
            <SynthesisSentence
              countryName={countryName}
              documentCount={documentCount}
              verdict={verdict}
              concentration={concentration}
              primer={primer}
              countryConfig={countryConfig}
              onOpenPair={onOpenPair}
              onHighlightPair={onHighlightPair}
            />
          </p>
        </>
      ) : (
        <p className="mt-2 text-body text-[var(--undp-gray)]">
          {t("subtitle", { count: documentCount })}
        </p>
      )}
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
  const sectionLabels = useSectionLabels();
  const t = useTranslations("briefing.stages");
  const stages = resolveStages(order);

  const chip = (id: SectionId, index: number) => (
    <li key={id} className="flex items-center">
      <a
        href={`#${id}`}
        aria-current={active === id ? "true" : undefined}
        className={`px-2.5 py-1 rounded text-data font-medium transition-colors ${
          active === id
            ? "bg-[var(--undp-blue)] text-white"
            : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
        }`}
      >
        <span className="text-caption tabular-nums opacity-60 mr-1.5">
          0{index + 1}
        </span>
        {sectionLabels[id]}
      </a>
    </li>
  );

  // Rollback path: with no stages the nav is the flat list it always was.
  if (!stages) {
    return (
      <nav
        data-tour="guided-nav"
        className="sticky top-[72px] z-10 -mx-6 px-6 py-3 bg-[#ffffff]/85 backdrop-blur border-b border-gray-200/70"
      >
        <ul className="flex items-center gap-1 sm:gap-2 flex-wrap">
          {order.map((id, i) => chip(id, i))}
        </ul>
      </nav>
    );
  }

  const activeStage = stages.find((s) => s.sections.includes(active));

  return (
    <nav
      data-tour="guided-nav"
      className="sticky top-[72px] z-10 -mx-6 px-6 py-2.5 bg-[#ffffff]/85 backdrop-blur border-b border-gray-200/70"
    >
      <div className="flex items-start gap-x-6 gap-y-2 flex-wrap">
        {stages.map((stage) => (
          <div key={`${stage.id}-${stage.firstIndex}`}>
            <p
              className={`text-[11px] uppercase tracking-wider font-semibold mb-0.5 px-2.5 transition-colors ${
                stage === activeStage
                  ? "text-[var(--undp-black)]"
                  : "text-[var(--undp-gray)]/70"
              }`}
            >
              {t(`${stage.id}.label`)}
            </p>
            <ul className="flex items-center gap-1 sm:gap-2 flex-wrap">
              {stage.sections.map((id) =>
                chip(id, order.indexOf(id)),
              )}
            </ul>
          </div>
        ))}
      </div>
      {/* One caption, for the stage the reader is currently in. Showing all
          four at once was the density the focus group was already objecting
          to; showing the current one answers "what is this group for?" as
          they arrive in it. */}
      {activeStage && (
        <p className="mt-1.5 px-2.5 text-caption text-[var(--undp-gray)]">
          {t(`${activeStage.id}.caption`)}
        </p>
      )}
    </nav>
  );
}

function FooterLink({ countryId }: { countryId?: string }) {
  const t = useTranslations("briefing.footerLink");
  // Points at the demoted explorer dashboard, which now lives on /prototypes.
  const dashboardHref = countryId
    ? `/prototypes?country=${encodeURIComponent(countryId)}`
    : "/";
  return (
    <div className="fixed bottom-3 left-6 z-10 text-caption text-[var(--undp-gray)]">
      <Link
        href={dashboardHref}
        className="hover:text-[var(--undp-black)] hover:underline"
      >
        ← {t("fullExplorer")}
      </Link>
    </div>
  );
}

export type { WheelState } from "./centerpiece/wheel";
