"use client";

/**
 * FlagProfileDrawer — decomposes a subset of flagged pairs into "what it
 * consists of": which document-pairs, which themes, which targets recur, the
 * manageability split, and a few representative pairs. One drawer, two
 * subjects: a friction TYPE (every flagged pair of one mechanism) or a single
 * TARGET (every flagged pair touching it). Replaces the old "one cherry-picked
 * example" drill-down so an aggregate like "53% delivery friction" opens its
 * actual composition. Shares the shell conventions of SectorDrawer.
 */

import { useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  getDocColor,
  getDocMediumLabel,
  MECHANISM_COLORS,
} from "@/lib/utils";
import { useContradictionTypeLabels } from "@/lib/labels";
import {
  buildFlagSubsetProfile,
  buildTargetFrictionTree,
  type TargetFrictionTree,
} from "@/lib/coherence-briefing";
import { useDrawerHistory } from "@/lib/use-drawer-history";
import { DrawerBackButton } from "@/components/ui/drawer-back-button";
import { FrictionDimensionChip, SubFieldChip } from "./theme-drawer";
import type {
  AlignmentConfidence,
  AlignmentManageability,
  AlignmentMechanism,
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
  ThematicClassification,
} from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const EXAMPLE_CAP = 6;
const BAR_NEUTRAL = "#94a3b8";
const BAR_TRACK = "#e5e7eb";

export type FlagProfileSubject =
  | {
      kind: "friction-type";
      mechanism: AlignmentMechanism;
      /** When set, scope to this one document's cross-document misalignment. */
      doc?: PolicyDocumentType;
    }
  | { kind: "target"; target: Target };

const CONFIDENCE_RANK: Record<AlignmentConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const MANAGEABILITY_RANK: Record<AlignmentManageability, number> = {
  fundamental: 0,
  manageable: 1,
};

export function FlagProfileDrawer({
  subject: rootSubject,
  alignment,
  targets,
  classifications,
  categories,
  taxonomyType,
  lensLabel,
  totalFlagged,
  countryConfig,
  onClose,
  onOpenPair,
}: {
  subject: FlagProfileSubject | null;
  alignment: AlignmentResult[];
  targets: Target[];
  classifications: ThematicClassification[];
  categories: { id: string; name: string }[];
  taxonomyType: string;
  lensLabel: string | null;
  totalFlagged: number;
  countryConfig: CountryConfig | null;
  onClose: () => void;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  const contradictionLabels = useContradictionTypeLabels();
  // Drill-into-target navigation (Recurring Targets column) is owned by the
  // drawer, not the parent — clicking pushes a new subject onto the internal
  // stack and the Back button pops it. Resets automatically when the parent
  // hands us a different rootSubject.
  const {
    current: subject,
    push: pushSubject,
    back: goBack,
    canGoBack,
  } = useDrawerHistory<FlagProfileSubject>(rootSubject);
  const handleOpenTarget = useCallback(
    (target: Target) => pushSubject({ kind: "target", target }),
    [pushSubject],
  );
  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (canGoBack) goBack();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, canGoBack, goBack, onClose]);

  useEffect(() => {
    if (!subject) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [subject]);

  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets],
  );

  const subset = useMemo(() => {
    if (!subject) return [];
    if (subject.kind === "friction-type") {
      const base = alignment.filter(
        (a) => a.alignment === "flagged" && a.mechanism === subject.mechanism,
      );
      if (!subject.doc) return base;
      // Doc-scoped: keep only cross-document flags with exactly one side in the
      // focused doc, matching buildDocFocusFrictions so the drawer reflects the
      // same set the section-02 breakdown bar is built from.
      const doc = subject.doc;
      return base.filter((a) => {
        const tA = targetMap.get(a.targetAId);
        const tB = targetMap.get(a.targetBId);
        if (!tA || !tB) return false;
        return (tA.sourceDocument === doc) !== (tB.sourceDocument === doc);
      });
    }
    const id = subject.target.id;
    return alignment.filter(
      (a) =>
        a.alignment === "flagged" &&
        (a.targetAId === id || a.targetBId === id),
    );
  }, [subject, alignment, targetMap]);

  const profile = useMemo(() => {
    if (!subject) return null;
    return buildFlagSubsetProfile({
      pairs: subset,
      targets,
      classifications,
      categories,
      taxonomyType,
      excludeTargetId:
        subject.kind === "target" ? subject.target.id : undefined,
      cap: 5,
    });
  }, [subject, subset, targets, classifications, categories, taxonomyType]);

  const examples = useMemo(() => {
    const rows = subset
      .map((pair) => {
        const a = targetMap.get(pair.targetAId);
        const b = targetMap.get(pair.targetBId);
        return a && b ? { pair, a, b } : null;
      })
      .filter(
        (x): x is { pair: AlignmentResult; a: Target; b: Target } => x !== null,
      );
    rows.sort((x, y) => {
      const xCross = x.a.sourceDocument !== x.b.sourceDocument ? 0 : 1;
      const yCross = y.a.sourceDocument !== y.b.sourceDocument ? 0 : 1;
      if (xCross !== yCross) return xCross - yCross;
      const xM = x.pair.manageability ? MANAGEABILITY_RANK[x.pair.manageability] : 9;
      const yM = y.pair.manageability ? MANAGEABILITY_RANK[y.pair.manageability] : 9;
      if (xM !== yM) return xM - yM;
      const xC = x.pair.confidence ? CONFIDENCE_RANK[x.pair.confidence] : 9;
      const yC = y.pair.confidence ? CONFIDENCE_RANK[y.pair.confidence] : 9;
      if (xC !== yC) return xC - yC;
      return x.pair.targetAId.localeCompare(y.pair.targetAId);
    });
    return rows.slice(0, EXAMPLE_CAP);
  }, [subset, targetMap]);

  // For a doc-scoped friction type, the share is relative to that document's own
  // flagged total (its cross-document pairs), not the corpus, so "% of …" reads
  // honestly against the bar it was opened from.
  const docScopedFlaggedTotal = useMemo(() => {
    if (!subject || subject.kind !== "friction-type" || !subject.doc)
      return null;
    const doc = subject.doc;
    let n = 0;
    for (const a of alignment) {
      // Require a mechanism so this denominator matches the section-02
      // breakdown bar (frictionTypeTotalsFromAlignment counts mechanism-tagged
      // pairs only); the share then equals the clicked segment's percentage.
      if (a.alignment !== "flagged" || !a.mechanism) continue;
      const tA = targetMap.get(a.targetAId);
      const tB = targetMap.get(a.targetBId);
      if (!tA || !tB) continue;
      if ((tA.sourceDocument === doc) !== (tB.sourceDocument === doc)) n += 1;
    }
    return n;
  }, [subject, alignment, targetMap]);

  // Three-level hierarchy (mechanism → peer doc → counterpart) for the target view.
  const frictionTree = useMemo<TargetFrictionTree | null>(() => {
    if (!subject || subject.kind !== "target") return null;
    return buildTargetFrictionTree({
      focalTargetId: subject.target.id,
      pairs: subset,
      targets,
    });
  }, [subject, subset, targets]);

  if (!subject || !profile) return null;

  const total = profile.total;
  const docScope =
    subject.kind === "friction-type" && subject.doc ? subject.doc : null;
  const docScopeLabel = docScope
    ? getDocMediumLabel(countryConfig, docScope)
    : null;
  const shareDenom =
    docScope != null ? (docScopedFlaggedTotal ?? 0) : totalFlagged;
  const sharePct =
    shareDenom > 0 ? Math.round((total / shareDenom) * 100) : 0;
  const headerTitle =
    subject.kind === "friction-type"
      ? contradictionLabels[subject.mechanism]
      : subject.target.sourceLabel;
  const themeNoun = lensLabel === "GLOBE" ? t("themeNoun.globe") : t("themeNoun.sectors");

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label={t("closeAria")}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("dialogAria", { name: headerTitle })}
        className="relative h-full w-full sm:w-[560px] md:w-[640px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        {canGoBack && <DrawerBackButton onBack={goBack} />}
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
                {subject.kind === "friction-type"
                  ? t("eyebrow.friction")
                  : t("eyebrow.target")}
              </p>
              {subject.kind === "target" && (
                <DocBadge
                  docType={subject.target.sourceDocument}
                  countryConfig={countryConfig}
                />
              )}
              <h3
                className="text-xl text-[var(--undp-black)] font-medium leading-tight"
                style={{ fontFamily: HEADLINE_SERIF }}
              >
                {headerTitle}
              </h3>
              {docScopeLabel && (
                <p className="mt-1 text-[12px] text-[var(--undp-gray)] leading-snug">
                  {t("withinDoc", { doc: docScopeLabel })}
                </p>
              )}
              {subject.kind === "target" && (
                <p className="mt-1 text-[12px] text-[var(--undp-gray)] leading-snug line-clamp-3">
                  {subject.target.text}
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--undp-gray)] tabular-nums">
                {t("pairCount", { count: total })}
                {shareDenom > 0 &&
                  " · " +
                    t("pairShareOfDoc", {
                      pct: sharePct,
                      scope: docScopeLabel ?? "",
                      docScoped: docScopeLabel ? 1 : 0,
                    })}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("closeBtnAria")}
              className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
            >
              ×
            </button>
          </div>
        </header>

        <div className="px-6 py-6 space-y-7">
          {total === 0 ? (
            <p className="text-sm italic text-[var(--undp-gray)]">
              {t("empty")}
            </p>
          ) : (
            <>
              <CompositionGrid
                profile={profile}
                subject={subject}
                countryConfig={countryConfig}
                themeNoun={themeNoun}
                onOpenTarget={handleOpenTarget}
              />
              <ManageabilityBar
                manageability={profile.manageability}
                total={total}
              />
              {subject.kind === "target" && frictionTree ? (
                <TargetFrictionTreeView
                  tree={frictionTree}
                  focalDoc={subject.target.sourceDocument}
                  countryConfig={countryConfig}
                  onOpenPair={onOpenPair}
                />
              ) : (
                <RepresentativePairs
                  examples={examples}
                  countryConfig={countryConfig}
                  onOpenPair={onOpenPair}
                  subjectKind={subject.kind}
                />
              )}
              <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
                {t("aiDisclaimer")}
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function DocBadge({
  docType,
  countryConfig,
}: {
  docType: PolicyDocumentType;
  countryConfig: CountryConfig | null;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 mb-1">
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: getDocColor(countryConfig, docType) }}
      />
      <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
        {getDocMediumLabel(countryConfig, docType)}
      </span>
    </span>
  );
}

interface CompositionRow {
  key: string;
  label: string;
  count: number;
  onClick?: () => void;
}

function CompositionGrid({
  profile,
  subject,
  countryConfig,
  themeNoun,
  onOpenTarget,
}: {
  profile: ReturnType<typeof buildFlagSubsetProfile>;
  subject: FlagProfileSubject;
  countryConfig: CountryConfig | null;
  themeNoun: string;
  onOpenTarget: (target: Target) => void;
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  const docRows: CompositionRow[] = profile.byDocPair.map((d) => ({
    key: `${d.a}__${d.b}`,
    label:
      d.a === d.b
        ? t("withinDoc", { doc: getDocMediumLabel(countryConfig, d.a) })
        : `${getDocMediumLabel(countryConfig, d.a)} ↔ ${getDocMediumLabel(countryConfig, d.b)}`,
    count: d.count,
  }));
  const themeRows: CompositionRow[] = profile.byTheme.map((row) => ({
    key: row.categoryId,
    label: row.categoryName,
    count: row.count,
  }));
  // Recurring targets are clickable: they pivot the drawer to that target's
  // own profile (the "follow the chain" drill the user asked for).
  const targetRows: CompositionRow[] = profile.recurringTargets.map((r) => ({
    key: r.target.id,
    label: `${getDocMediumLabel(countryConfig, r.target.sourceDocument)} ${r.target.sourceLabel}`,
    count: r.count,
    onClick: () => onOpenTarget(r.target),
  }));
  // Target view: the three-level tree below owns the counterpart breakdown, so
  // the summary grid drops the recurring-targets column (two orthogonal cuts —
  // document pairs and themes — instead of duplicating counterparts).
  const isTarget = subject.kind === "target";
  return (
    <div
      className={`grid grid-cols-1 gap-5 ${isTarget ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
    >
      <CompositionColumn title={t("composition.acrossDocPairs")} rows={docRows} />
      <CompositionColumn
        title={t("composition.acrossThemes", { themeNoun })}
        rows={themeRows}
        emptyText={t("composition.noThemes")}
      />
      {!isTarget && (
        <CompositionColumn title={t("composition.recurringTargets")} rows={targetRows} />
      )}
    </div>
  );
}

function CompositionColumn({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: CompositionRow[];
  emptyText?: string;
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  const max = rows[0]?.count ?? 0;
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] italic text-[var(--undp-gray)]/70">
          {emptyText ?? t("composition.none")}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => {
            const inner = (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[11.5px] text-[var(--undp-black)] truncate"
                    title={r.label}
                  >
                    {r.label}
                  </span>
                  <span className="text-[11px] tabular-nums text-[var(--undp-gray)] shrink-0">
                    {r.count.toLocaleString()}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="mt-0.5 block h-1 w-full rounded-full"
                  style={{ backgroundColor: BAR_TRACK }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${max > 0 ? Math.max(6, (r.count / max) * 100) : 0}%`,
                      backgroundColor: BAR_NEUTRAL,
                    }}
                  />
                </span>
              </>
            );
            return (
              <li key={r.key}>
                {r.onClick ? (
                  <button
                    type="button"
                    onClick={r.onClick}
                    className="w-full text-left rounded -mx-1 px-1 py-0.5 hover:bg-gray-50 transition-colors"
                    title={`Open ${r.label}`}
                  >
                    {inner}
                  </button>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ManageabilityBar({
  manageability,
  total,
}: {
  manageability: { manageable: number; fundamental: number; unknown: number };
  total: number;
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  const { manageable, fundamental } = manageability;
  if (manageable + fundamental === 0) return null;
  const mPct = Math.round((manageable / total) * 100);
  const fPct = Math.round((fundamental / total) * 100);
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {t("manageability.title")}
      </p>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: BAR_TRACK }}
      >
        <span
          style={{
            width: `${(manageable / total) * 100}%`,
            backgroundColor: "#196127",
          }}
        />
        <span
          style={{
            width: `${(fundamental / total) * 100}%`,
            backgroundColor: "#64748b",
          }}
        />
      </div>
      <p className="mt-1.5 text-[11.5px] text-[var(--undp-black)] leading-snug">
        {t("manageability.summary", {
          mPct,
          fPct,
          hasFundamental: fundamental > 0 ? 1 : 0,
        })}
      </p>
    </div>
  );
}

function RepresentativePairs({
  examples,
  countryConfig,
  onOpenPair,
  subjectKind,
}: {
  examples: { pair: AlignmentResult; a: Target; b: Target }[];
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
  subjectKind: FlagProfileSubject["kind"];
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {subjectKind === "target"
          ? t("examples.target")
          : t("examples.representative")}
      </p>
      <ol className="space-y-2">
        {examples.map(({ pair, a, b }) => (
          <li key={`${pair.targetAId}__${pair.targetBId}`}>
            <button
              type="button"
              onClick={() => onOpenPair(pair.targetAId, pair.targetBId)}
              className="w-full text-left rounded hover:bg-gray-50 transition-colors p-2"
            >
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                {pair.mechanism && (
                  <SubFieldChip variant="mechanism" value={pair.mechanism} />
                )}
                {pair.manageability && (
                  <SubFieldChip
                    variant="manageability"
                    value={pair.manageability}
                  />
                )}
                <FrictionDimensionChip
                  mechanism={pair.mechanism}
                  contestedResources={pair.contestedResources}
                  sharedContext={pair.sharedContext}
                />
              </div>
              <p className="text-[10px] text-[var(--undp-gray)] mb-1">
                {getDocMediumLabel(countryConfig, a.sourceDocument)}{" "}
                {a.sourceLabel} ↔{" "}
                {getDocMediumLabel(countryConfig, b.sourceDocument)}{" "}
                {b.sourceLabel}
              </p>
              {pair.description && (
                <p
                  className="text-[11.5px] text-[var(--undp-black)] leading-snug italic overflow-hidden"
                  style={{
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {pair.description}
                </p>
              )}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * TargetFrictionTreeView — the high-friction-target drill-in. Renders one focal
 * target's flagged pairs as a three-level indented hierarchy: friction mechanism
 * (colour-anchored to the chart palette) → peer document → counterpart target.
 * Uniform rows, no variable node sizes; every counterpart opens the full pair.
 * Replaces the old flat 6-capped example list so a target that carries a lot of
 * misalignment reads as a structure rather than a truncated sample.
 */
function TargetFrictionTreeView({
  tree,
  focalDoc,
  countryConfig,
  onOpenPair,
}: {
  tree: TargetFrictionTree;
  focalDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  if (tree.byMechanism.length === 0) return null;
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-3">
        {t("tree.heading")}
      </p>
      <div className="space-y-4">
        {tree.byMechanism.map((group) => (
          <MechanismBranch
            key={group.mechanism ?? "__none__"}
            group={group}
            focalDoc={focalDoc}
            countryConfig={countryConfig}
            onOpenPair={onOpenPair}
          />
        ))}
      </div>
    </div>
  );
}

function MechanismBranch({
  group,
  focalDoc,
  countryConfig,
  onOpenPair,
}: {
  group: TargetFrictionTree["byMechanism"][number];
  focalDoc: PolicyDocumentType;
  countryConfig: CountryConfig | null;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("briefing.drawer.flagProfile");
  const contradictionLabels = useContradictionTypeLabels();
  const color = group.mechanism
    ? MECHANISM_COLORS[group.mechanism]
    : BAR_NEUTRAL;
  const label = group.mechanism
    ? contradictionLabels[group.mechanism]
    : t("tree.unclassified");
  return (
    <div>
      {/* L1 — mechanism */}
      <div className="flex items-baseline gap-2">
        <span
          aria-hidden="true"
          className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 translate-y-[1px]"
          style={{ backgroundColor: color }}
        />
        <span
          className="text-[12px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--undp-gray)]">
          {group.count.toLocaleString()}
        </span>
      </div>
      {/* L2 — peer document, L3 — counterpart target */}
      <div className="mt-1.5 ml-[0.3rem] border-l border-gray-200 pl-3.5 space-y-2.5">
        {group.byDoc.map((doc) => (
          <div key={doc.peerDoc}>
            <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
              {doc.peerDoc === focalDoc ? "within" : "vs"}{" "}
              {getDocMediumLabel(countryConfig, doc.peerDoc)}
              <span className="ml-1.5 tabular-nums">
                {doc.count.toLocaleString()}
              </span>
            </p>
            <ul className="mt-1 space-y-1">
              {doc.counterparts.map(({ counterpart, pair }) => (
                <li key={`${pair.targetAId}__${pair.targetBId}`}>
                  <button
                    type="button"
                    onClick={() => onOpenPair(pair.targetAId, pair.targetBId)}
                    className="w-full text-left rounded -mx-1 px-1 py-0.5 hover:bg-gray-50 transition-colors"
                    title={`Open ${counterpart.sourceLabel}`}
                  >
                    <span className="text-[11.5px] text-[var(--undp-black)] font-medium">
                      {counterpart.sourceLabel}
                    </span>
                    <span
                      className="block text-[11px] text-[var(--undp-gray)] leading-snug overflow-hidden"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                      }}
                    >
                      {counterpart.text}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
