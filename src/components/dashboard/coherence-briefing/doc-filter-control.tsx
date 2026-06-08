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
import { getDocColor, getDocMediumLabel } from "@/lib/utils";
import type { CountryConfig, PolicyDocumentType } from "@/types";

/** One document toggle: colour dot + label. Included reads solid; excluded
 *  reads dimmed with a hollow dot and a strikethrough, so it is obviously
 *  re-addable rather than gone. */
function DocToggleItem({
  doc,
  included,
  countryConfig,
  onToggle,
}: {
  doc: PolicyDocumentType;
  included: boolean;
  countryConfig: CountryConfig | null;
  onToggle: (doc: PolicyDocumentType) => void;
}) {
  const t = useTranslations("briefing.docFilter");
  const color = getDocColor(countryConfig, doc);
  const label = getDocMediumLabel(countryConfig, doc);
  return (
    <button
      type="button"
      onClick={() => onToggle(doc)}
      aria-pressed={included}
      title={included ? t("removeDoc", { name: label }) : t("addDoc", { name: label })}
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
}

export function DocFilterControl({
  allDocs,
  hiddenDocs,
  defaultHiddenDocTypes,
  countryConfig,
  onToggle,
  onReset,
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
    <div className="mt-3 text-[11px] text-[var(--undp-gray)]">
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
        <div className="mt-2.5 flex flex-col items-start gap-1.5 pl-0.5">
          {allDocs.map((doc) => (
            <DocToggleItem
              key={doc}
              doc={doc}
              included={!hiddenDocs.has(doc)}
              countryConfig={countryConfig}
              onToggle={onToggle}
            />
          ))}
          {!isDefault && (
            <button
              type="button"
              onClick={onReset}
              className="mt-1 text-[11px] text-[var(--undp-gray)] underline underline-offset-2 hover:text-[var(--undp-black)]"
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
}: DocControlBaseProps) {
  const t = useTranslations("briefing.docFilter");
  if (allDocs.length === 0) return null;
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px]">
        {allDocs.map((doc) => (
          <DocToggleItem
            key={doc}
            doc={doc}
            included={!hiddenDocs.has(doc)}
            countryConfig={countryConfig}
            onToggle={onToggle}
          />
        ))}
      </div>
      <p className="mt-1.5 text-center text-[9px] uppercase tracking-wider text-[var(--undp-gray)]/70">
        {t("toggle.clickToAddRemove")}
      </p>
    </div>
  );
}
