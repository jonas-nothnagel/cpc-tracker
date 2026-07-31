"use client";

/**
 * Document include/exclude controls for the briefing.
 *
 * A country office may commission a document (e.g. Panama's ENR REDD+ strategy)
 * that a reviewer considers skews every visual. The resolution is to let users
 * decide for their own context: hide documents from the analysis, or add them
 * back. These controls make that obvious without visual overstimulation, and
 * always DISCLOSE which documents are excluded so a commissioned document is
 * never silently dropped.
 *
 * Two surfaces share one toggle item, styled to match the briefing's plain,
 * minimal-typography aesthetic (no card frames, no boxy checkboxes):
 *   - DocFilterControl  — a quiet disclosure line under the header that expands
 *     to a vertical toggle list. The canonical control (and the only one on
 *     narrow screens, where the wheel column is hidden).
 *   - DocToggleLegend   — a horizontal, interactive doc legend that sits with
 *     the wheel/matrix so adding or removing a document is visible right where
 *     its arc appears. Doubles as the wheel's document colour key.
 *
 * All labels and colours trace to the country config via the getDoc* helpers.
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { getDocColor, getDocMediumLabel, getDocMeta } from "@/lib/utils";
import type { CountryConfig, PolicyDocumentType } from "@/types";
import { DocHoverCard, DocMetaCard } from "./doc-meta-card";
import { ViewTargetsAction } from "./view-targets-action";

/** One document toggle: colour dot + label. Included reads solid; excluded
 *  reads dimmed with a hollow dot and a strikethrough, so it is obviously
 *  re-addable rather than gone. */
function DocToggleItem({
  doc,
  included,
  countryConfig,
  onToggle,
  showDetails = false,
  targetCount,
  onViewTargets,
}: {
  doc: PolicyDocumentType;
  included: boolean;
  countryConfig: CountryConfig | null;
  onToggle: (doc: PolicyDocumentType) => void;
  /** When true, render the reference metadata inline (the add/remove overview);
   *  otherwise the metadata appears in a hover card (the wheel legend). */
  showDetails?: boolean;
  /** Targets in this document, over the whole corpus. Optional so the hover-card
   *  variant keeps calling this with no extra wiring. */
  targetCount?: number;
  onViewTargets?: (doc: PolicyDocumentType) => void;
}) {
  const t = useTranslations("briefing.docFilter");
  const color = getDocColor(countryConfig, doc);
  const label = getDocMediumLabel(countryConfig, doc);
  const toggle = (
    <button
      type="button"
      onClick={() => onToggle(doc)}
      aria-pressed={included}
      aria-label={
        included
          ? t("removeDoc", { name: label })
          : t("addDoc", { name: label })
      }
      className={`inline-flex items-center gap-1.5 transition-opacity ${
        included
          ? "opacity-100 hover:opacity-80"
          : "opacity-45 hover:opacity-75"
      }`}
    >
      <span
        aria-hidden="true"
        className="inline-block w-2 h-2 rounded-full shrink-0"
        style={
          included
            ? { backgroundColor: color }
            : { boxShadow: `inset 0 0 0 1.5px ${color}` }
        }
      />
      <span
        className={
          included
            ? "text-[var(--undp-black)]"
            : "text-[var(--undp-gray)] line-through"
        }
      >
        {label}
      </span>
    </button>
  );
  if (showDetails) {
    const meta = getDocMeta(countryConfig, doc);
    const hasMeta = Boolean(
      meta.docKind ||
        meta.published ||
        meta.author ||
        meta.objective ||
        meta.url ||
        // A document with no sourced record still has targets worth opening.
        (onViewTargets && targetCount),
    );
    return (
      <div className="flex flex-col gap-1 text-data">
        {toggle}
        {hasMeta && (
          <div className={`pl-3.5 ${included ? "" : "opacity-50"}`}>
            <DocMetaCard
              meta={meta}
              color={color}
              hideDot
              footer={
                onViewTargets && targetCount !== undefined ? (
                  <ViewTargetsAction
                    count={targetCount}
                    onClick={() => onViewTargets(doc)}
                  />
                ) : undefined
              }
            />
          </div>
        )}
      </div>
    );
  }
  return (
    <DocHoverCard
      doc={doc}
      countryConfig={countryConfig}
      footer={
        onViewTargets && targetCount !== undefined ? (
          <ViewTargetsAction
            count={targetCount}
            onClick={() => onViewTargets(doc)}
          />
        ) : undefined
      }
    >
      {toggle}
    </DocHoverCard>
  );
}

interface DocControlBaseProps {
  /** All toggleable documents, in `documentTypes` order. */
  allDocs: PolicyDocumentType[];
  hiddenDocs: Set<string>;
  countryConfig: CountryConfig | null;
  onToggle: (doc: PolicyDocumentType) => void;
}

interface DocFilterControlProps extends DocControlBaseProps {
  /** The config default, so "Reset to default" can restore it. */
  defaultHiddenDocTypes: string[];
  onReset: () => void;
  /** Targets per document across the whole corpus, so an excluded document
   *  still reports what it holds while the reader decides about it. */
  targetCountByDoc: Map<PolicyDocumentType, number>;
  onViewTargets: (doc: PolicyDocumentType) => void;
}

export function DocFilterControl({
  allDocs,
  hiddenDocs,
  defaultHiddenDocTypes,
  countryConfig,
  onToggle,
  onReset,
  targetCountByDoc,
  onViewTargets,
}: DocFilterControlProps) {
  const t = useTranslations("briefing.docFilter");
  const [expanded, setExpanded] = useState(false);

  const visibleCount = useMemo(
    () => allDocs.filter((d) => !hiddenDocs.has(d)).length,
    [allDocs, hiddenDocs],
  );
  const excludedNames = useMemo(
    () =>
      allDocs
        .filter((d) => hiddenDocs.has(d))
        .map((d) => getDocMediumLabel(countryConfig, d)),
    [allDocs, hiddenDocs, countryConfig],
  );

  const isDefault = useMemo(() => {
    const def = new Set(defaultHiddenDocTypes);
    if (def.size !== hiddenDocs.size) return false;
    for (const d of hiddenDocs) if (!def.has(d)) return false;
    return true;
  }, [defaultHiddenDocTypes, hiddenDocs]);

  if (allDocs.length === 0) return null;

  return (
    <div className="mt-3 text-caption text-[var(--undp-gray)]">
      <p className="leading-relaxed">
        <span>
          {t("included", { visible: visibleCount, total: allDocs.length })}
        </span>
        {excludedNames.length > 0 && (
          <span className="text-[var(--undp-black)]">
            {" "}
            {t("excluded", { names: excludedNames.join(", ") })}
          </span>
        )}{" "}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-[var(--undp-black)] underline underline-offset-2 hover:text-[var(--undp-black)]"
        >
          {expanded ? t("done") : t("addOrRemove")}
        </button>
      </p>

      {expanded && (
        <div className="mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
            {allDocs.map((doc) => (
              <DocToggleItem
                key={doc}
                doc={doc}
                included={!hiddenDocs.has(doc)}
                countryConfig={countryConfig}
                onToggle={onToggle}
                showDetails
                targetCount={targetCountByDoc.get(doc) ?? 0}
                onViewTargets={onViewTargets}
              />
            ))}
          </div>
          {!isDefault && (
            <button
              type="button"
              onClick={onReset}
              className="mt-4 text-caption text-[var(--undp-gray)] underline underline-offset-2 hover:text-[var(--undp-black)]"
            >
              {t("resetToDefault")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Interactive document legend for the wheel/matrix column. Shows every
 * document (hidden ones dimmed + struck) as a clickable toggle, so the user can
 * add or remove a document and immediately see its arc appear or disappear.
 * Also serves as the wheel's document colour key.
 */
export function DocToggleLegend({
  allDocs,
  hiddenDocs,
  countryConfig,
  onToggle,
  targetCountByDoc,
  onViewTargets,
}: DocControlBaseProps & {
  targetCountByDoc: Map<PolicyDocumentType, number>;
  onViewTargets: (doc: PolicyDocumentType) => void;
}) {
  if (allDocs.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-caption">
        {allDocs.map((doc) => (
          <DocToggleItem
            key={doc}
            doc={doc}
            included={!hiddenDocs.has(doc)}
            countryConfig={countryConfig}
            onToggle={onToggle}
            targetCount={targetCountByDoc.get(doc) ?? 0}
            onViewTargets={onViewTargets}
          />
        ))}
      </div>
    </div>
  );
}
