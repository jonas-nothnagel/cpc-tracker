"use client";

import { useEffect, useState } from "react";
import type { Target, BTRActionType, MitigationMeasure } from "@/types";
import type { TargetRow } from "@/lib/csv-parser";

/**
 * Two-letter language code chip displayed next to target text for rows
 * whose source was translated from another language (Panama targets were
 * originally in Spanish). Click opens an inline panel showing the original
 * text and the translated text side-by-side so reviewers can verify the
 * translation. Returns `null` when `textOriginal` is missing, so existing
 * English-sourced targets (Mongolia) render nothing new.
 *
 * `languageCode` defaults to "ES" because Panama is the only translated
 * country in the current scope. Future countries whose source language is
 * different should pass their own ISO-639-1 code.
 */
export function OriginalLanguageChip({
  target,
  languageCode = "ES",
  languageName = "Spanish",
}: {
  target: Pick<Target, "text" | "textOriginal" | "sourceLabel" | "sourceLabelOriginal">;
  languageCode?: string;
  languageName?: string;
}) {
  const [open, setOpen] = useState(false);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!target.textOriginal) return null;

  return (
    <span className="relative inline-block">
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen((v) => !v);
          }
        }}
        aria-expanded={open}
        aria-label={`Show original ${languageName} source text`}
        title={`Click to see the original ${languageName} source`}
        className="inline-flex items-center px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 text-[9px] font-semibold uppercase tracking-wide hover:bg-amber-100 transition-colors cursor-pointer"
      >
        {languageCode}
      </span>
      {open && (
        <span
          role="dialog"
          aria-label={`Original ${languageName} source and English translation`}
          className="absolute left-0 top-full mt-1.5 z-50 w-[420px] max-w-[90vw] bg-white border border-gray-200 rounded-lg shadow-lg p-3.5 text-[11px] text-[var(--undp-black)] leading-relaxed cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-2 gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Translated from {languageName}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-base leading-none shrink-0"
            >
              ×
            </button>
          </div>
          <div className="space-y-2.5">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] mb-0.5">
                Original ({languageName})
              </p>
              {target.sourceLabelOriginal && (
                <p className="font-medium text-[var(--undp-gray)] mb-1">
                  {target.sourceLabelOriginal}
                </p>
              )}
              <p className="italic text-[var(--undp-black)]">{target.textOriginal}</p>
            </div>
            <div className="border-t border-gray-100 pt-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--undp-gray)] mb-0.5">
                Translation (English)
              </p>
              {target.sourceLabel && (
                <p className="font-medium text-[var(--undp-gray)] mb-1">
                  {target.sourceLabel}
                </p>
              )}
              <p className="text-[var(--undp-black)]">{target.text}</p>
            </div>
          </div>
        </span>
      )}
    </span>
  );
}

/**
 * Variant of `OriginalLanguageChip` for BTR mitigation measures (which carry
 * `nameOriginal` / `objectivesOriginal` instead of the Target-shaped `textOriginal`).
 * Adapts the measure fields onto the chip's expected shape so policy reviewers
 * get the same click-to-inspect behaviour they have for translated targets.
 * Returns `null` when no original-language text is present.
 */
export function MeasureLanguageChip({
  measure,
  languageCode = "ES",
  languageName = "Spanish",
}: {
  measure: Pick<MitigationMeasure, "name" | "nameOriginal" | "objectives" | "objectivesOriginal">;
  languageCode?: string;
  languageName?: string;
}) {
  if (!measure.nameOriginal && !measure.objectivesOriginal) return null;
  return (
    <OriginalLanguageChip
      target={{
        text: measure.objectives || measure.name,
        textOriginal: measure.objectivesOriginal || measure.nameOriginal,
        sourceLabel: measure.name,
        sourceLabelOriginal: measure.nameOriginal,
      }}
      languageCode={languageCode}
      languageName={languageName}
    />
  );
}

/**
 * Small badge labeling a BTR row as "Mitigation" or "Adaptation". Shown next to
 * the BTR source label wherever BTR pseudo-targets appear in lists, so users can
 * tell at a glance whether an action is a mitigation measure (CTF Table 5) or
 * an adaptation action (Table III.9). Returns null for policy targets (no badge).
 *
 * Colors: mitigation uses purple (matches BTR document color `#7c3aed`);
 * adaptation uses fuchsia to avoid clashing with NBSAP teal elsewhere in the
 * palette. Text is the contract — color is decorative.
 */
export const BTR_MITIGATION_COLOR = "#7c3aed"; // violet / BTR doc color
export const BTR_ADAPTATION_COLOR = "#c026d3"; // fuchsia-600

export function ActionTypeBadge({ actionType }: { actionType?: BTRActionType }) {
  if (!actionType) return null;
  const isAdaptation = actionType === "adaptation";
  const label = isAdaptation ? "Adaptation" : "Mitigation";
  // Generic tooltip — country-specific source citations live on the BTR
  // data source chip in the Data Sources row, not here. Keeping this badge
  // country-agnostic means a second country does not need to touch this file.
  const title = isAdaptation
    ? "Reported adaptation action (BTR)"
    : "Reported mitigation measure (BTR)";
  const bg = isAdaptation ? "bg-fuchsia-50" : "bg-purple-50";
  const fg = isAdaptation ? "text-fuchsia-700" : "text-purple-700";
  const border = isAdaptation ? "border-fuchsia-200" : "border-purple-200";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide border ${bg} ${fg} ${border}`}
      title={title}
    >
      {label}
    </span>
  );
}

/**
 * Renders target text with quantitative and time-bound phrases highlighted.
 * Used in modals, tooltips, and lists where targets are displayed.
 */
export function TargetTextWithHighlights({ target }: { target: Target }) {
  const { text, quantitativeDetails, timeBoundDetails } = target;

  if (!quantitativeDetails && !timeBoundDetails) {
    return <span>{text}</span>;
  }

  const quantPhrases = (quantitativeDetails ?? "")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const timePhrases = (timeBoundDetails ?? "")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (quantPhrases.length === 0 && timePhrases.length === 0) {
    return <span>{text}</span>;
  }

  // Build list of (substring, className) to highlight, longest first
  const highlights: { str: string; className: string }[] = [
    ...quantPhrases.map((str) => ({ str, className: "bg-[var(--undp-blue)]/15 font-medium" })),
    ...timePhrases.map((str) => ({ str, className: "bg-amber-100 font-medium" })),
  ].sort((a, b) => b.str.length - a.str.length);

  let remaining = text;
  const parts: React.ReactNode[] = [];
  let key = 0;

  while (remaining.length > 0) {
    let best: { index: number; len: number; className: string } | null = null;
    for (const { str, className } of highlights) {
      if (!str) continue;
      const idx = remaining.indexOf(str);
      if (idx !== -1 && (best === null || idx < best.index)) {
        best = { index: idx, len: str.length, className };
      }
    }

    if (best === null) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (best.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, best.index)}</span>);
    }
    parts.push(
      <span key={key++} className={best.className} title="Measurable outcome">
        {remaining.slice(best.index, best.index + best.len)}
      </span>
    );
    remaining = remaining.slice(best.index + best.len);
  }

  return <span>{parts}</span>;
}

/**
 * Collapsible display of activities and actions/measures for a target.
 * Shows nothing if both fields are empty.
 */
export function ActivitiesActions({ target }: { target: Target | TargetRow }) {
  const [open, setOpen] = useState(false);
  const { activities, actions } = target;

  if (!activities && !actions) return null;

  const count = (activities ? 1 : 0) + (actions ? 1 : 0);

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] text-[var(--undp-blue)] hover:underline flex items-center gap-1"
      >
        <span className="inline-block transition-transform" style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          &#9654;
        </span>
        Activities &amp; Actions ({count})
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 pl-2 border-l-2 border-[var(--undp-blue)]/20">
          {activities && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                Activities
              </span>
              <p className="text-[11px] text-[var(--undp-black)] leading-relaxed mt-0.5">
                {activities}
              </p>
            </div>
          )}
          {actions && (
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)]">
                Actions / Measures
              </span>
              <p className="text-[11px] text-[var(--undp-black)] leading-relaxed mt-0.5">
                {actions}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
