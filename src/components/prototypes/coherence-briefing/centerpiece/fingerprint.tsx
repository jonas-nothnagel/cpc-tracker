"use client";

/**
 * Fingerprint centerpiece — every pair as one dot.
 *
 *   X axis: thematic distance between the pair's two targets, derived from
 *           Jaccard distance on their relevant taxonomy categories.
 *           Left = close themes, right = distant themes.
 *
 *   Y axis: signed alignment level. Top = high alignment, bottom = likely
 *           conflict. The zero line splits the plot into "supports" above
 *           and "in tension with" below.
 *
 * The pattern that emerges is the "fingerprint": where alignments cluster
 * (usually upper-left, close themes that agree) and where tensions sit
 * (usually lower-right, distant themes pulled into conflict by the policy
 * environment, or lower-left when two targets on the same theme contradict).
 */

import { useMemo } from "react";
import { buildPairDots, type PairDot } from "@/lib/coherence-briefing";
import { ALIGNMENT_COLORS } from "@/lib/utils";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

const VB_W = 940;
const VB = 620;
const PAD_LEFT = 70;
const PAD_RIGHT = 30;
const PAD_TOP = 30;
const PAD_BOTTOM = 50;
const PLOT_W = VB_W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = VB - PAD_TOP - PAD_BOTTOM;

function project(dot: PairDot): { x: number; y: number } {
  const x = PAD_LEFT + dot.thematicDistance * PLOT_W;
  // alignmentY is in [-1, 1]; map +1 to top, -1 to bottom.
  const y = PAD_TOP + ((1 - dot.alignmentY) / 2) * PLOT_H;
  return { x, y };
}

export interface FingerprintCenterpieceProps {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig?: CountryConfig | null;
  buildup?: number;
}

export function FingerprintCenterpiece({
  targets,
  alignments,
  classifications,
  buildup = 1,
}: FingerprintCenterpieceProps) {
  const dots = useMemo(
    () => buildPairDots(alignments, targets, classifications),
    [alignments, targets, classifications],
  );

  // Tensions on top of alignments so they don't get buried under positive volume.
  const ordered = useMemo(() => {
    const aligns: PairDot[] = [];
    const tensions: PairDot[] = [];
    for (const d of dots) {
      if (isContradiction(d.pair.alignment)) tensions.push(d);
      else aligns.push(d);
    }
    return [...aligns, ...tensions];
  }, [dots]);

  const clampedBuildup = Math.max(0, Math.min(1, buildup));
  const zeroY = PAD_TOP + PLOT_H / 2;

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`0 0 ${VB_W} ${VB}`}
        className="w-full"
        style={{ maxHeight: 600 }}
        role="img"
        aria-label="Pair fingerprint: every scored pair as a dot, X = thematic distance, Y = signed alignment"
      >
        {/* Axes background */}
        <rect
          x={PAD_LEFT}
          y={PAD_TOP}
          width={PLOT_W}
          height={PLOT_H}
          fill="#ffffff"
          stroke="#e7e5e0"
        />

        {/* Zero alignment line — the hinge between supports and tensions */}
        <line
          x1={PAD_LEFT}
          y1={zeroY}
          x2={PAD_LEFT + PLOT_W}
          y2={zeroY}
          stroke="#bdb9af"
          strokeWidth={1}
          strokeDasharray="2 4"
        />

        {/* Y-axis labels */}
        <YAxisLabel y={PAD_TOP + 18} text="High alignment" />
        <YAxisLabel y={zeroY - 8} text="No relationship" muted />
        <YAxisLabel
          y={PAD_TOP + PLOT_H - 18}
          text="Likely conflict"
          tone="red"
        />

        {/* X-axis labels */}
        <text
          x={PAD_LEFT}
          y={VB - 18}
          fontSize={11}
          fill="var(--undp-gray)"
          className="select-none"
        >
          Close themes
        </text>
        <text
          x={PAD_LEFT + PLOT_W}
          y={VB - 18}
          textAnchor="end"
          fontSize={11}
          fill="var(--undp-gray)"
          className="select-none"
        >
          Distant themes
        </text>

        {/* Dots */}
        {ordered.map((d) => {
          const { x, y } = project(d);
          const contra = isContradiction(d.pair.alignment);
          return (
            <circle
              key={`${d.pair.targetAId}__${d.pair.targetBId}`}
              cx={x}
              cy={y}
              r={contra ? 3.2 : 2.4}
              fill={ALIGNMENT_COLORS[d.pair.alignment]}
              fillOpacity={(contra ? 0.85 : 0.55) * clampedBuildup}
              stroke={contra ? ALIGNMENT_COLORS[d.pair.alignment] : "none"}
              strokeOpacity={0.4 * clampedBuildup}
              strokeWidth={contra ? 0.6 : 0}
            />
          );
        })}
      </svg>
    </div>
  );
}

function YAxisLabel({
  y,
  text,
  tone,
  muted,
}: {
  y: number;
  text: string;
  tone?: "red";
  muted?: boolean;
}) {
  const fill =
    tone === "red"
      ? ALIGNMENT_COLORS.possible_conflict
      : muted
        ? "#bdb9af"
        : "var(--undp-gray)";
  return (
    <text
      x={PAD_LEFT - 12}
      y={y}
      textAnchor="end"
      dominantBaseline="central"
      fontSize={11}
      fill={fill}
      className="select-none"
    >
      {text}
    </text>
  );
}
