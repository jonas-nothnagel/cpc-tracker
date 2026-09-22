"use client";

/**
 * The single wheel legend, shared by the briefing's sticky aside, the expand
 * modal, and the landing. One compact line: the two alignment dashes plus the
 * ribbon-width clause; the warm-arc note appears only while the sector view's
 * rim arcs are active. Rendered once per surface, outside the centerpiece
 * switch, so it does not remount (and re-teach) on every slide change.
 */

import { useTranslations } from "next-intl";
import { ALIGNED_COLOR, FLAGGED_COLOR } from "@/lib/utils";

export function WheelLegend({
  showArcNote = false,
  justify = "center",
}: {
  /** Show the warm-rim-arc clause (sector view only). */
  showArcNote?: boolean;
  /** Horizontal alignment; the landing's left column passes "start". */
  justify?: "center" | "start";
}) {
  const t = useTranslations("briefing.legend");
  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-[var(--undp-gray)] ${
        justify === "start" ? "justify-start" : "justify-center"
      }`}
    >
      <LegendDash color={ALIGNED_COLOR} label={t("aligned")} />
      <LegendDash color={FLAGGED_COLOR} label={t("flagged")} dashed />
      <span className="text-[var(--undp-gray)]/80">{t("ribbonWidth")}</span>
      {/* The arc rule, always visible: the Sri Lanka review (Aug 2026) found
          the segmentation unexplained; the rule lived only in the opt-in
          walkthrough. */}
      <span className="text-[var(--undp-gray)]/80">{t("arcShare")}</span>
      {showArcNote && <LegendGradient label={t("warmerArcHint")} />}
    </div>
  );
}

function LegendDash({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block w-4 h-[3px] rounded-full"
        style={{
          background: dashed
            ? // 6/4 dash rhythm, matching the flagged ribbon core in wheel.tsx
              `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}

function LegendGradient({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-8 rounded-full"
        style={{
          // Mirrors the rim arc scale (doc-coherence-matrix cellColor): green
          // below the corpus norm, pale near it, terracotta above.
          background:
            "linear-gradient(90deg, rgba(25,97,39,0.55), rgba(25,97,39,0.10) 45%, rgba(220,38,38,0.12) 55%, rgba(220,38,38,0.60))",
        }}
      />
      {label}
    </span>
  );
}
