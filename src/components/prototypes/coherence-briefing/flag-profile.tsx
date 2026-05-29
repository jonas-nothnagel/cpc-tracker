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

import { useEffect, useMemo } from "react";
import {
  CONTRADICTION_TYPE_LABELS,
  getDocColor,
  getDocMediumLabel,
} from "@/lib/utils";
import { buildFlagSubsetProfile } from "@/lib/coherence-briefing";
import { SubFieldChip } from "./theme-drawer";
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
const AI_DISCLAIMER =
  "AI-generated flags. Treat as prompts to review, not settled findings.";
const EXAMPLE_CAP = 6;
const BAR_NEUTRAL = "#94a3b8";
const BAR_TRACK = "#e5e7eb";

export type FlagProfileSubject =
  | { kind: "friction-type"; mechanism: AlignmentMechanism }
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
  subject,
  alignment,
  targets,
  classifications,
  categories,
  taxonomyType,
  lensLabel,
  totalFlagged,
  countryConfig,
  onClose,
  onOpenTarget,
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
  onOpenTarget: (target: Target) => void;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  useEffect(() => {
    if (!subject) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [subject, onClose]);

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
      return alignment.filter(
        (a) => a.alignment === "flagged" && a.mechanism === subject.mechanism,
      );
    }
    const id = subject.target.id;
    return alignment.filter(
      (a) =>
        a.alignment === "flagged" &&
        (a.targetAId === id || a.targetBId === id),
    );
  }, [subject, alignment]);

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

  if (!subject || !profile) return null;

  const total = profile.total;
  const sharePct =
    totalFlagged > 0 ? Math.round((total / totalFlagged) * 100) : 0;
  const headerTitle =
    subject.kind === "friction-type"
      ? CONTRADICTION_TYPE_LABELS[subject.mechanism]
      : subject.target.sourceLabel;
  const themeNoun = lensLabel === "GLOBE" ? "categories" : "themes";

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close profile"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Profile: ${headerTitle}`}
        className="relative h-full w-full sm:w-[560px] md:w-[640px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
                {subject.kind === "friction-type"
                  ? "Potential misalignment type"
                  : "Target in focus"}
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
              {subject.kind === "target" && (
                <p className="mt-1 text-[12px] text-[var(--undp-gray)] leading-snug line-clamp-3">
                  {subject.target.text}
                </p>
              )}
              <p className="mt-2 text-xs text-[var(--undp-gray)] tabular-nums">
                {total.toLocaleString()} potentially misaligned pair
                {total === 1 ? "" : "s"}
                {totalFlagged > 0 &&
                  ` · ${sharePct}% of all potential misalignment`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none shrink-0"
            >
              ×
            </button>
          </div>
        </header>

        <div className="px-6 py-6 space-y-7">
          {total === 0 ? (
            <p className="text-sm italic text-[var(--undp-gray)]">
              No potential misalignment in this subset.
            </p>
          ) : (
            <>
              <CompositionGrid
                profile={profile}
                subject={subject}
                countryConfig={countryConfig}
                themeNoun={themeNoun}
                onOpenTarget={onOpenTarget}
              />
              <ManageabilityBar
                manageability={profile.manageability}
                total={total}
              />
              <RepresentativePairs
                examples={examples}
                countryConfig={countryConfig}
                onOpenPair={onOpenPair}
                subjectKind={subject.kind}
              />
              <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
                {AI_DISCLAIMER}
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
  const docRows: CompositionRow[] = profile.byDocPair.map((d) => ({
    key: `${d.a}__${d.b}`,
    label:
      d.a === d.b
        ? `within ${getDocMediumLabel(countryConfig, d.a)}`
        : `${getDocMediumLabel(countryConfig, d.a)} ↔ ${getDocMediumLabel(countryConfig, d.b)}`,
    count: d.count,
  }));
  const themeRows: CompositionRow[] = profile.byTheme.map((t) => ({
    key: t.categoryId,
    label: t.categoryName,
    count: t.count,
  }));
  // Recurring targets are clickable: they pivot the drawer to that target's
  // own profile (the "follow the chain" drill the user asked for).
  const targetRows: CompositionRow[] = profile.recurringTargets.map((r) => ({
    key: r.target.id,
    label: `${getDocMediumLabel(countryConfig, r.target.sourceDocument)} ${r.target.sourceLabel}`,
    count: r.count,
    onClick: () => onOpenTarget(r.target),
  }));
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
      <CompositionColumn title="Across document pairs" rows={docRows} />
      <CompositionColumn
        title={`Across ${themeNoun}`}
        rows={themeRows}
        emptyText="No primary-classified themes."
      />
      <CompositionColumn
        title={
          subject.kind === "target"
            ? "Most misaligned with"
            : "Recurs on targets"
        }
        rows={targetRows}
      />
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
  const max = rows[0]?.count ?? 0;
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-[11px] italic text-[var(--undp-gray)]/70">
          {emptyText ?? "None"}
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
  const { manageable, fundamental } = manageability;
  if (manageable + fundamental === 0) return null;
  const mPct = Math.round((manageable / total) * 100);
  const fPct = Math.round((fundamental / total) * 100);
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        Where the misalignment sits
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
        The AI reads {mPct}% of these as coordination-level (the misalignment
        could likely be eased by aligning delivery, sequencing, or safeguards
        rather than changing the targets)
        {fundamental > 0
          ? `, and ${fPct}% as design-level, where a target itself may need revisiting`
          : ""}
        . A per-pair AI assessment, worth verifying.
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
  return (
    <div className="border-t border-gray-200 pt-4">
      <p className="text-[9.5px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
        {subjectKind === "target"
          ? "Potentially misaligned pairs"
          : "Representative pairs"}
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
