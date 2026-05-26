"use client";

/**
 * PrimerCard — a real pair of targets shown in the Direction section to
 * teach the reader what a "pair" is. Two real target excerpts with a
 * centred relationship label between them. Hover signals the wheel via
 * `onHoverChange`; click opens the pair drawer via `onSelect`.
 *
 * Visual structure (target A on top, centred middle row with horizontal
 * dividers, target B below) so the relationship label clearly belongs
 * to the relationship between the two targets, not the card as a whole.
 */

import { ALIGNMENT_COLORS, getDocMediumLabel } from "@/lib/utils";
import type { FaultLine } from "@/lib/coherence-briefing";
import type { CountryConfig } from "@/types";

export interface PrimerHighlightPair {
  aId: string;
  bId: string;
}

export function PrimerCard({
  kind,
  line,
  countryConfig,
  onSelect,
  onHoverChange,
}: {
  kind: "aligned" | "flagged";
  line: FaultLine;
  countryConfig: CountryConfig | null;
  onSelect: () => void;
  onHoverChange?: (pair: PrimerHighlightPair | null) => void;
}) {
  const color =
    kind === "aligned"
      ? ALIGNMENT_COLORS.high
      : ALIGNMENT_COLORS.flagged;
  const labelA = getDocMediumLabel(countryConfig, line.targetA.sourceDocument);
  const labelB = getDocMediumLabel(countryConfig, line.targetB.sourceDocument);
  const relationLabel =
    kind === "aligned" ? "ALIGNED WITH" : "POSSIBLY MISALIGNED WITH";
  const pair: PrimerHighlightPair = {
    aId: line.targetA.id,
    bId: line.targetB.id,
  };
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={() => onHoverChange?.(pair)}
      onMouseLeave={() => onHoverChange?.(null)}
      onFocus={() => onHoverChange?.(pair)}
      onBlur={() => onHoverChange?.(null)}
      className="group w-full text-left rounded-md border border-gray-200 bg-white p-4 hover:border-[var(--undp-black)] focus:outline-none focus:border-[var(--undp-black)] transition-colors"
    >
      <p
        className="text-[9px] uppercase tracking-wider font-semibold mb-1.5 text-[var(--undp-gray)]"
      >
        {labelA} · {line.targetA.sourceLabel}
      </p>
      <p className="text-[13px] text-[var(--undp-black)] leading-snug line-clamp-3">
        {line.targetA.text}
      </p>

      <div className="my-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-px flex-1"
          style={{ backgroundColor: `${color}80` }}
        />
        <span
          className="text-[9px] uppercase tracking-wider font-semibold whitespace-nowrap"
          style={{ color }}
        >
          {relationLabel}
        </span>
        <span
          aria-hidden="true"
          className="h-px flex-1"
          style={{ backgroundColor: `${color}80` }}
        />
      </div>

      <p
        className="text-[9px] uppercase tracking-wider font-semibold mb-1.5 text-[var(--undp-gray)]"
      >
        {labelB} · {line.targetB.sourceLabel}
      </p>
      <p className="text-[13px] text-[var(--undp-black)] leading-snug line-clamp-3">
        {line.targetB.text}
      </p>
    </button>
  );
}
