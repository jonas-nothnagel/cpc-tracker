"use client";

/**
 * PairDrawer — side drawer for a single pair (clicked from a fault-line
 * row or a wheel chord). Same affordances as SectorDrawer: Escape closes,
 * body scroll locks. Shows full target text + AI rationale.
 */

import { useEffect } from "react";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  CONTRADICTION_TYPE_LABELS,
  getDocMediumLabel,
  getDocFullLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type { AlignmentResult, CountryConfig, Target } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export interface PairDrawerData {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
}

export function PairDrawer({
  data,
  countryConfig,
  onClose,
}: {
  data: PairDrawerData | null;
  countryConfig: CountryConfig | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  useEffect(() => {
    if (!data) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [data]);

  if (!data) return null;
  const { pair, targetA, targetB } = data;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const contra = isContradiction(pair.alignment);
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close pair detail"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Pair detail"
        className="relative h-full w-full sm:w-[520px] md:w-[600px] shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
              Pair detail
            </p>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-tight"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {ALIGNMENT_LABELS[pair.alignment]}
              {pair.contradictionType && (
                <span className="block text-xs font-normal text-[var(--undp-gray)] mt-1">
                  {CONTRADICTION_TYPE_LABELS[pair.contradictionType]}
                </span>
              )}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-6 space-y-5">
          <TargetCard
            target={targetA}
            countryConfig={countryConfig}
            color={color}
          />
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="block h-px flex-1"
              style={{
                backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              }}
            />
            <span
              className="text-[10px] uppercase tracking-wider font-medium"
              style={{ color }}
            >
              {contra ? "in tension with" : "supports"}
            </span>
            <span
              aria-hidden="true"
              className="block h-px flex-1"
              style={{
                backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
              }}
            />
          </div>
          <TargetCard
            target={targetB}
            countryConfig={countryConfig}
            color={color}
          />

          {pair.description && (
            <section className="border-t border-gray-200 pt-4">
              <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
                AI rationale
              </p>
              <p className="text-sm text-[var(--undp-black)] leading-relaxed italic">
                {pair.description}
              </p>
              <p className="mt-3 text-[10px] text-[var(--undp-gray)] leading-relaxed">
                AI-generated assessment of this pair. Treat as a prompt to
                review, not a settled finding.
              </p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

function TargetCard({
  target,
  countryConfig,
  color,
}: {
  target: Target;
  countryConfig: CountryConfig | null;
  color: string;
}) {
  const docLabel = getDocMediumLabel(countryConfig, target.sourceDocument);
  const docFull = getDocFullLabel(countryConfig, target.sourceDocument);
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p
        className="text-[10px] uppercase tracking-wider font-medium mb-2"
        style={{ color }}
      >
        {docLabel} · {target.sourceLabel}
      </p>
      <p className="text-sm text-[var(--undp-black)] leading-relaxed">
        {target.text}
      </p>
      {(target.isQuantitative || target.isTimeBound) && (
        <p className="mt-2 text-[10px] text-[var(--undp-gray)] uppercase tracking-wider">
          {[
            target.isQuantitative ? "Quantitative" : null,
            target.isTimeBound ? "Time-bound" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="mt-2 text-[10px] text-[var(--undp-gray)]">
        Source: {docFull}
      </p>
    </div>
  );
}
