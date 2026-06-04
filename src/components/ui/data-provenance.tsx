"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { formatSourceRef } from "@/lib/source-ref";
import type { SourceRef } from "@/types";

/**
 * Where the data shown in a visualization came from.
 * - "user-uploaded": every value originates in a document or table the user uploaded
 * - "ai-inferred": values are produced by an LLM or model (e.g. pairwise alignment, classification)
 * - "mixed": AI inferences computed *over* user-uploaded inputs — the dominant case in this app
 */
type ProvenanceOrigin = "user-uploaded" | "ai-inferred" | "mixed";

export interface ProvenanceSource {
  /** Human-readable label for the source (e.g. "Mongolia NDC targets"). */
  label: string;
  /** Structured citation. Preferred when available so formatting stays consistent. */
  ref?: SourceRef;
  /** Pre-formatted citation string for cases without a SourceRef (e.g. country-config strings). */
  citation?: string;
}

interface DataProvenanceProps {
  origin: ProvenanceOrigin;
  /** Sources that fed this viz. Render each on its own line in the popover. */
  sources?: ProvenanceSource[];
  /**
   * One- or two-sentence note on how the values shown were produced.
   * Required in spirit for "ai-inferred" and "mixed" — without it the badge
   * communicates that AI was involved but not what it actually did.
   */
  method?: ReactNode;
  /** Limitations or confidence note. Shown as an italic footer. */
  caveat?: ReactNode;
}

const ORIGIN_TONE: Record<ProvenanceOrigin, string> = {
  "user-uploaded":
    "bg-gray-50 text-[var(--undp-gray)] border-gray-200 hover:bg-gray-100",
  "ai-inferred":
    "bg-[var(--undp-blue)]/8 text-[var(--undp-blue)] border-[var(--undp-blue)]/30 hover:bg-[var(--undp-blue)]/12",
  mixed:
    "bg-[var(--undp-blue)]/8 text-[var(--undp-blue)] border-[var(--undp-blue)]/30 hover:bg-[var(--undp-blue)]/12",
};

const ORIGIN_ICON: Record<ProvenanceOrigin, ReactNode> = {
  "user-uploaded": (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 1.8v5.4M3.6 4.2L6 1.8l2.4 2.4M2.4 8.4v.6A1.2 1.2 0 003.6 10.2h4.8A1.2 1.2 0 009.6 9v-.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  "ai-inferred": (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M5 1.5l.9 2.1L8 4.5l-2.1.9L5 7.5l-.9-2.1L2 4.5l2.1-.9L5 1.5zM9 7l.5 1.1L10.6 8.6l-1.1.5L9 10.2l-.5-1.1L7.4 8.6l1.1-.5L9 7z"
        fill="currentColor"
      />
    </svg>
  ),
  mixed: (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M5 1.5l.9 2.1L8 4.5l-2.1.9L5 7.5l-.9-2.1L2 4.5l2.1-.9L5 1.5z"
        fill="currentColor"
      />
    </svg>
  ),
};

/**
 * Standardised provenance disclosure for visualizations. Renders an inline
 * badge that names the origin (user-uploaded / AI-inferred / mixed) and opens
 * a popover with the underlying sources, the method used to produce the
 * values, and any caveats.
 *
 * Pair with `<InfoBox>` rather than replacing it — `InfoBox` explains *what
 * the chart means*; `DataProvenance` explains *where the numbers come from*.
 *
 * Why: the tool computes coherence and contradiction signals via LLMs over
 * user-uploaded policy text. Without surfacing this every chart looks like
 * empirical measurement, which it is not.
 */
export function DataProvenance({
  origin,
  sources,
  method,
  caveat,
}: DataProvenanceProps) {
  const t = useTranslations("common.provenance");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tone = ORIGIN_TONE[origin];
  const icon = ORIGIN_ICON[origin];
  const label = t(`origin.${origin === "user-uploaded" ? "userUploaded" : origin === "ai-inferred" ? "aiInferred" : "mixed"}`);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const hasContent =
    (sources && sources.length > 0) || method != null || caveat != null;

  return (
    <span
      ref={ref}
      className="relative inline-flex items-center align-middle ml-2"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-label={t("ariaLabel", { label })}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border transition-colors cursor-pointer ${tone}`}
      >
        {icon}
        <span className="leading-none">{label}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("detailsAria")}
          className="absolute left-0 top-full mt-2 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-80 text-xs leading-relaxed text-[var(--undp-black)] font-normal"
          onClick={(e) => e.stopPropagation()}
        >
          {sources && sources.length > 0 && (
            <ProvenanceSection title={t("sourcesHeading")}>
              <ul className="space-y-1">
                {sources.map((s, i) => {
                  const cite = s.citation ?? formatSourceRef(s.ref);
                  return (
                    <li key={`${s.label}-${i}`}>
                      <span className="font-medium">{s.label}</span>
                      {cite && (
                        <span className="text-[var(--undp-gray)]">
                          {" "}
                          — {cite}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </ProvenanceSection>
          )}

          {method != null && (
            <ProvenanceSection
              title={origin === "user-uploaded" ? t("aggregationHeading") : t("methodHeading")}
            >
              <p>{method}</p>
            </ProvenanceSection>
          )}

          {caveat != null && (
            <div className="text-[var(--undp-gray)] italic border-t border-gray-100 pt-2 mt-2">
              {caveat}
            </div>
          )}

          {!hasContent && (
            <p className="text-[var(--undp-gray)] italic">
              {t("noDetails")}
            </p>
          )}
        </div>
      )}
    </span>
  );
}

function ProvenanceSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="font-semibold text-[11px] uppercase tracking-wide text-[var(--undp-gray)] mb-1">
        {title}
      </p>
      {children}
    </div>
  );
}
