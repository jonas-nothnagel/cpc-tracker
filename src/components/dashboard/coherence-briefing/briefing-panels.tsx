"use client";

/**
 * BriefingPanelHost — turns the current entry on the panel trail into a rendered
 * panel.
 *
 * Entries on the trail are identifiers (see panel-stack.ts), so this is where
 * they become the objects a panel body needs, resolved fresh on every render
 * against the currently visible targets and alignment. A panel whose subject can
 * no longer be resolved (the reader hid a document while it was open) steps back
 * rather than rendering an empty shell.
 *
 * It also owns the two pieces of chrome that depend on the whole trail rather
 * than on one panel: the contextual back label ("Back to Agriculture") and the
 * usage analytics.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DrawerShell } from "@/components/ui/drawer-shell";
import { track } from "@/lib/analytics/client";
import {
  buildSectorBriefing,
  rankTargetsByFriction,
  type SectorBriefing,
} from "@/lib/coherence-briefing";
import { useContradictionTypeLabels } from "@/lib/labels";
import { getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import {
  DocTargetsDrawer,
  DEFAULT_DOC_TARGETS_VIEW,
  type DocTargetsView,
} from "./doc-targets-drawer";
import { FlagProfileDrawer, type FlagProfileSubject } from "./flag-profile";
import { PairDrawer, type PairDrawerData } from "./pair-drawer";
import { SectorDrawer } from "./sector-drawer";
import { ThemeDrawer } from "./theme-drawer";
import {
  backLabelKey,
  panelAnalyticsKind,
  panelKey,
  type BriefingPanel,
} from "./panel-stack";
import type { BriefingPanels } from "./use-briefing-panels";
import type {
  AlignmentResult,
  CorpusStoryline,
  CorpusThemes,
  CountryConfig,
  DocPairSynthesis,
  PolicyDocumentType,
  SectorSynthesis,
  Target,
  ThematicClassification,
} from "@/types";

/** Back labels interpolate names that can be whole sentences (storylines) or
 *  long document titles. Trim on a word boundary and keep the full string in
 *  the title attribute. */
const BACK_LABEL_MAX = 42;

function truncate(value: string): string {
  if (value.length <= BACK_LABEL_MAX) return value;
  const cut = value.slice(0, BACK_LABEL_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export interface BriefingPanelHostProps {
  panels: BriefingPanels;
  countryConfig: CountryConfig | null;
  countryId?: string;

  /** Visible policy targets, keyed by id. The primary lookup for every panel. */
  targetMap: Map<string, Target>;
  /** Reported-action stand-ins (BTR), used by the implementation drill-down. */
  actionPairTargets: Map<string, Target>;
  /** Budget-line stand-ins (BER), used by the financing drill-down. */
  budgetPairTargets: Map<string, Target>;

  /** Target-to-target pairs among visible documents. */
  visibleAlignment: AlignmentResult[];
  /** The raw merged set, which still carries reported-action pairs. */
  alignment: AlignmentResult[];
  budgetAlignment: AlignmentResult[] | null;
  /** Policy-only pairs: the denominator the friction profiles are built from. */
  policyAlignment: AlignmentResult[];

  docPairSyntheses: DocPairSynthesis[];
  corpusThemes: CorpusThemes | null;

  visibleTargets: Target[];
  visibleClassifications: ThematicClassification[];
  sectorCategories: { id: string; name: string }[];
  lensTaxonomyType: string;
  sectorSynthesesIndex: Map<string, SectorSynthesis>;
  totalFlagged: number;
  totalDocCount: number;

  /** Every policy target, including those in documents the reader has hidden:
   *  the browser is how they decide whether to bring one back in. */
  allTargets: Target[];
  hiddenDocs: Set<string>;
}

export function BriefingPanelHost(props: BriefingPanelHostProps) {
  const { panels } = props;
  const { current, previous, depth, canGoBack, back, close, push } = panels;

  const resolved = useResolvedPanel(current, props);
  const backLabel = useBackLabel(previous, props);
  const dialogLabels = useDialogLabels();

  // Reuses the ranking the "Where to focus" slide is built from, so the per
  // target counts in the browser and on that slide can never drift apart.
  const flaggedCountByTargetId = useMemo(
    () =>
      new Map(
        rankTargetsByFriction(props.policyAlignment, props.visibleTargets).map(
          (row) => [row.target.id, row.flaggedPairCount],
        ),
      ),
    [props.policyAlignment, props.visibleTargets],
  );

  // Search, filters and reveal count survive a drill into a target and back,
  // keyed by document so a trail through two documents keeps both.
  const [docTargetsView, setDocTargetsView] = useState<
    Record<string, DocTargetsView>
  >({});

  // Closing discards what the browser had set up, so reopening a document is a
  // fresh look. This mirrors opening from the page, which starts a fresh trail
  // rather than resuming the last one.
  const closeAll = useCallback(() => {
    setDocTargetsView({});
    close();
  }, [close]);

  // A subject that stopped resolving (a document toggle removed its pair) must
  // not leave an empty panel on screen.
  useEffect(() => {
    if (current && !resolved) {
      if (canGoBack) back();
      else closeAll();
    }
  }, [current, resolved, canGoBack, back, closeAll]);

  // Removable usage analytics: see src/lib/analytics/README.md.
  // drawer_opened keeps its pre-trail meaning (a panel opened from the page);
  // drilling deeper is a separate event so section attribution stays honest.
  const lastDepth = useRef(0);
  useEffect(() => {
    const previousDepth = lastDepth.current;
    lastDepth.current = depth;
    if (!current || depth < previousDepth) return;
    const kind = panelAnalyticsKind(current);
    if (depth <= 1) track("drawer_opened", { kind });
    else track("panel_drilled", { kind, depth });
  }, [current, depth]);

  if (!current || !resolved) return null;

  const labels = dialogLabels(current, props);

  return (
    <DrawerShell
      open
      onClose={closeAll}
      onBack={canGoBack ? back : undefined}
      backLabel={backLabel}
      dialogLabel={labels.dialog}
      closeLabel={labels.close}
      panelKey={panelKey(current)}
    >
      {resolved.kind === "pair" && (
        <PairDrawer
          data={resolved.data}
          countryConfig={props.countryConfig}
          countryId={props.countryId}
          onOpenTargetPair={(aId, bId) =>
            push({ kind: "target-pair", aId, bId })
          }
        />
      )}
      {resolved.kind === "theme" && (
        <ThemeDrawer
          theme={resolved.theme}
          allStorylines={resolved.allStorylines}
          alignment={props.visibleAlignment}
          targetsById={props.targetMap}
          countryConfig={props.countryConfig}
          classifications={props.visibleClassifications}
          categories={props.sectorCategories}
          taxonomyType={props.lensTaxonomyType}
          totalDocCount={props.totalDocCount}
          countryId={props.countryId}
          onOpenSingleTheme={(s) => push({ kind: "theme", name: s.name })}
          onOpenTargetPair={(_pair, tA, tB) =>
            push({ kind: "target-pair", aId: tA.id, bId: tB.id })
          }
          onOpenTargetProfile={(target) =>
            push({ kind: "target-profile", targetId: target.id })
          }
        />
      )}
      {resolved.kind === "sector" && (
        <SectorDrawer
          briefing={resolved.briefing}
          sectorSynthesis={resolved.synthesis}
          countryConfig={props.countryConfig}
          onOpenTargetPair={(_pair, tA, tB) =>
            push({ kind: "target-pair", aId: tA.id, bId: tB.id })
          }
        />
      )}
      {resolved.kind === "flag-profile" && (
        <FlagProfileDrawer
          subject={resolved.subject}
          alignment={props.policyAlignment}
          targets={props.visibleTargets}
          classifications={props.visibleClassifications}
          categories={props.sectorCategories}
          taxonomyType={props.lensTaxonomyType}
          totalFlagged={props.totalFlagged}
          countryConfig={props.countryConfig}
          onOpenPair={(aId, bId) => push({ kind: "target-pair", aId, bId })}
          onOpenTarget={(target) =>
            push({ kind: "target-profile", targetId: target.id })
          }
        />
      )}
      {resolved.kind === "doc-targets" && (
        <DocTargetsDrawer
          doc={resolved.doc}
          targets={props.allTargets}
          flaggedCountByTargetId={flaggedCountByTargetId}
          isDocExcluded={props.hiddenDocs.has(resolved.doc)}
          countryConfig={props.countryConfig}
          view={docTargetsView[resolved.doc] ?? DEFAULT_DOC_TARGETS_VIEW}
          onViewChange={(next) =>
            setDocTargetsView((prev) => ({ ...prev, [resolved.doc]: next }))
          }
          onOpenTargetProfile={(targetId) =>
            push({ kind: "target-profile", targetId })
          }
        />
      )}
    </DrawerShell>
  );
}

// ─── Resolution ────────────────────────────────────────────────────

type ResolvedPanel =
  | { kind: "pair"; data: PairDrawerData }
  | {
      kind: "theme";
      theme: CorpusStoryline | null;
      allStorylines: CorpusStoryline[] | null;
    }
  | { kind: "sector"; briefing: SectorBriefing; synthesis: SectorSynthesis | null }
  | { kind: "flag-profile"; subject: FlagProfileSubject }
  | { kind: "doc-targets"; doc: PolicyDocumentType };

function useResolvedPanel(
  panel: BriefingPanel | null,
  props: BriefingPanelHostProps,
): ResolvedPanel | null {
  const {
    targetMap,
    actionPairTargets,
    budgetPairTargets,
    visibleAlignment,
    alignment,
    budgetAlignment,
    visibleTargets,
    visibleClassifications,
    docPairSyntheses,
    corpusThemes,
    sectorSynthesesIndex,
  } = props;

  // Reported-action and budget-line stand-ins live outside the visible policy
  // target map, and their pairs outside `visibleAlignment`, so every lookup
  // walks the same three sources in the same order.
  const lookup = useMemo(() => {
    const findTarget = (id: string) =>
      targetMap.get(id) ??
      actionPairTargets.get(id) ??
      budgetPairTargets.get(id);
    const findPair = (aId: string, bId: string) => {
      const matches = (p: AlignmentResult) =>
        (p.targetAId === aId && p.targetBId === bId) ||
        (p.targetAId === bId && p.targetBId === aId);
      return (
        visibleAlignment.find(matches) ??
        alignment.find(matches) ??
        budgetAlignment?.find(matches)
      );
    };
    return { findTarget, findPair };
  }, [
    targetMap,
    actionPairTargets,
    budgetPairTargets,
    visibleAlignment,
    alignment,
    budgetAlignment,
  ]);

  return useMemo<ResolvedPanel | null>(() => {
    if (!panel) return null;
    switch (panel.kind) {
      case "target-pair": {
        const targetA = lookup.findTarget(panel.aId);
        const targetB = lookup.findTarget(panel.bId);
        const pair = lookup.findPair(panel.aId, panel.bId);
        if (!targetA || !targetB || !pair) return null;
        return {
          kind: "pair",
          data: { mode: "target-pair", pair, targetA, targetB },
        };
      }
      case "doc-pair": {
        const docPair = docPairSyntheses.find(
          (d) =>
            (d.doc_a === panel.docA && d.doc_b === panel.docB) ||
            (d.doc_a === panel.docB && d.doc_b === panel.docA),
        );
        if (!docPair) return null;
        const pairs = visibleAlignment.filter((a) => {
          const tA = targetMap.get(a.targetAId);
          const tB = targetMap.get(a.targetBId);
          if (!tA || !tB) return false;
          const sA = tA.sourceDocument;
          const sB = tB.sourceDocument;
          return (
            (sA === docPair.doc_a && sB === docPair.doc_b) ||
            (sA === docPair.doc_b && sB === docPair.doc_a)
          );
        });
        return {
          kind: "pair",
          data: { mode: "doc-pair", docPair, pairs, targetsById: targetMap },
        };
      }
      case "theme": {
        const theme =
          corpusThemes?.storylines.find((s) => s.name === panel.name) ?? null;
        if (!theme) return null;
        return { kind: "theme", theme, allStorylines: null };
      }
      case "all-storylines": {
        const storylines = corpusThemes?.storylines ?? null;
        if (!storylines || storylines.length === 0) return null;
        return { kind: "theme", theme: null, allStorylines: storylines };
      }
      case "sector": {
        const briefing = buildSectorBriefing({
          categoryId: panel.categoryId,
          categoryName: panel.categoryName,
          taxonomyType: panel.taxonomyType,
          targets: visibleTargets,
          alignment: visibleAlignment,
          classifications: visibleClassifications,
          cap: 6,
        });
        if (!briefing) return null;
        return {
          kind: "sector",
          briefing,
          synthesis:
            sectorSynthesesIndex.get(
              `${panel.taxonomyType}:${panel.categoryId}`,
            ) ?? null,
        };
      }
      case "friction-type":
        return {
          kind: "flag-profile",
          subject: {
            kind: "friction-type",
            mechanism: panel.mechanism,
            doc: panel.doc,
          },
        };
      case "target-profile": {
        const target = targetMap.get(panel.targetId);
        if (!target) return null;
        return { kind: "flag-profile", subject: { kind: "target", target } };
      }
      case "doc-targets":
        // The browser derives everything from props at render time; there is
        // nothing to fail to resolve, and a document with no targets has its
        // own empty state rather than a missing panel.
        return { kind: "doc-targets", doc: panel.doc };
    }
  }, [
    panel,
    lookup,
    targetMap,
    visibleAlignment,
    visibleTargets,
    visibleClassifications,
    docPairSyntheses,
    corpusThemes,
    sectorSynthesesIndex,
  ]);
}

// ─── Chrome copy ───────────────────────────────────────────────────

/**
 * "Back to {what}", named after where back actually leads. Without the name a
 * reader three levels into a trail cannot tell whether back returns to the
 * sector they started from or to the target in between.
 */
function useBackLabel(
  previous: BriefingPanel | null,
  props: BriefingPanelHostProps,
): string | undefined {
  const t = useTranslations("briefing.drawer.backTo");
  const mechanismLabels = useContradictionTypeLabels();
  const { countryConfig, targetMap, corpusThemes } = props;

  if (!previous) return undefined;
  const key = backLabelKey(previous);
  switch (previous.kind) {
    case "target-pair": {
      const a = targetMap.get(previous.aId);
      const b = targetMap.get(previous.bId);
      if (!a || !b) return undefined;
      return t(key, {
        a: truncate(a.sourceLabel),
        b: truncate(b.sourceLabel),
      });
    }
    case "doc-pair":
      return t(key, {
        a: getDocMediumLabel(countryConfig, previous.docA),
        b: getDocMediumLabel(countryConfig, previous.docB),
      });
    case "theme":
      return t(key, { name: truncate(previous.name) });
    case "all-storylines":
      return corpusThemes ? t(key) : undefined;
    case "sector":
      return t(key, { name: truncate(previous.categoryName) });
    case "friction-type":
      return t(key, { name: mechanismLabels[previous.mechanism] });
    case "target-profile": {
      const target = targetMap.get(previous.targetId);
      return target ? t(key, { name: truncate(target.sourceLabel) }) : undefined;
    }
    case "doc-targets":
      return t(key, {
        name: getDocMediumLabel(countryConfig, previous.doc),
      });
  }
}

/** aria-labels for the dialog and its scrim, per panel kind. */
function useDialogLabels() {
  const tPair = useTranslations("briefing.drawer.pair");
  const tTheme = useTranslations("briefing.drawer.theme");
  const tSector = useTranslations("briefing.drawer.sector");
  const tFlag = useTranslations("briefing.drawer.flagProfile");
  const mechanismLabels = useContradictionTypeLabels();

  return (panel: BriefingPanel, props: BriefingPanelHostProps) => {
    switch (panel.kind) {
      case "target-pair":
        return {
          dialog: tPair("targetPairDialogAria"),
          close: tPair("closeAria"),
        };
      case "doc-pair":
        return {
          dialog: tPair("docPairDialogAria"),
          close: tPair("closeAria"),
        };
      case "theme":
        return {
          dialog: tTheme("dialogAria", { name: panel.name }),
          close: tTheme("closeAria"),
        };
      case "all-storylines":
        return {
          dialog: tTheme("all.dialogAria"),
          close: tTheme("all.closeAria"),
        };
      case "sector":
        return {
          dialog: tSector("dialogAria", { name: panel.categoryName }),
          close: tSector("closeAria"),
        };
      case "friction-type":
        return {
          dialog: tFlag("dialogAria", {
            name: mechanismLabels[panel.mechanism],
          }),
          close: tFlag("closeAria"),
        };
      case "target-profile": {
        const target = props.targetMap.get(panel.targetId);
        return {
          dialog: tFlag("dialogAria", { name: target?.sourceLabel ?? "" }),
          close: tFlag("closeAria"),
        };
      }
      case "doc-targets":
        return {
          dialog: getDocFullLabel(props.countryConfig, panel.doc),
          close: tPair("closeAria"),
        };
    }
  };
}

export type { PolicyDocumentType };
