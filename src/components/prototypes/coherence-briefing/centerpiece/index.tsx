"use client";

/**
 * Scene 4 of the briefing: the centerpiece visualisation.
 *
 * Hosts a chip-row picker over four candidate visualisations so the user can
 * A/B them on real data. All four share the same data source; only the
 * encoding differs.
 *
 * Variants share the same target / alignment props. Fingerprint needs the
 * classifications array in addition to compute its X axis; River and
 * Constellation also benefit from countryConfig for colour resolution.
 */

import { useState } from "react";
import { WheelCenterpiece } from "./wheel";
import { ConstellationCenterpiece } from "./constellation";
import { FingerprintCenterpiece } from "./fingerprint";
import { RiverCenterpiece } from "./river";
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

type Variant = "wheel" | "constellation" | "fingerprint" | "river";

interface VariantOption {
  id: Variant;
  label: string;
  caption: string;
}

const VARIANTS: VariantOption[] = [
  {
    id: "wheel",
    label: "Wheel",
    caption: "Targets on a circular rim grouped by document, chords for pairs.",
  },
  {
    id: "constellation",
    label: "Constellation",
    caption:
      "Force-clustered nodes per document, faint lines for the network.",
  },
  {
    id: "fingerprint",
    label: "Fingerprint",
    caption:
      "Every pair as one dot; X is thematic distance, Y is signed alignment.",
  },
  {
    id: "river",
    label: "River braids",
    caption:
      "One lane per document; diagonals show cross-document alignment and tension.",
  },
];

export function CenterpieceFrame({
  targets,
  alignments,
  classifications,
  countryConfig,
  buildup = 1,
  onPairClick,
}: {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig: CountryConfig | null;
  buildup?: number;
  onPairClick?: (a: string, b: string) => void;
}) {
  const [active, setActive] = useState<Variant>("wheel");
  const activeOption = VARIANTS.find((v) => v.id === active) ?? VARIANTS[0];
  return (
    <div className="w-full max-w-[1080px] mx-auto">
      <VariantPicker active={active} onChange={setActive} />
      <p className="text-center text-[11px] text-[var(--undp-gray)] mt-1 mb-3 max-w-2xl mx-auto">
        {activeOption.caption}
      </p>
      <div className="mt-1">
        {active === "wheel" && (
          <WheelCenterpiece
            targets={targets}
            alignments={alignments}
            countryConfig={countryConfig}
            buildup={buildup}
            onPairClick={onPairClick}
          />
        )}
        {active === "constellation" && (
          <ConstellationCenterpiece
            targets={targets}
            alignments={alignments}
            countryConfig={countryConfig}
            buildup={buildup}
          />
        )}
        {active === "fingerprint" && (
          <FingerprintCenterpiece
            targets={targets}
            alignments={alignments}
            classifications={classifications}
            countryConfig={countryConfig}
            buildup={buildup}
          />
        )}
        {active === "river" && (
          <RiverCenterpiece
            targets={targets}
            alignments={alignments}
            countryConfig={countryConfig}
            buildup={buildup}
          />
        )}
      </div>
      <Legend />
    </div>
  );
}

function VariantPicker({
  active,
  onChange,
}: {
  active: Variant;
  onChange: (v: Variant) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 justify-center">
      {VARIANTS.map((v) => {
        const isActive = v.id === active;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-pressed={isActive}
            className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              isActive
                ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
                : "bg-white border-gray-300 text-[var(--undp-black)] hover:border-[var(--undp-black)]"
            }`}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[10.5px] text-[var(--undp-gray)]">
      <LegendDot color="#196127" label="Strong alignment" />
      <LegendDot color="#7bc96f" label="Medium" />
      <LegendDot color="#c6e48b" label="Partial" />
      <LegendDot color="#f87171" label="Possible misalignment" dashed />
      <LegendDot color="#dc2626" label="Possible conflict" dashed />
      <LegendDot color="#b91c1c" label="Likely conflict" dashed />
    </div>
  );
}

function LegendDot({
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
            ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}
