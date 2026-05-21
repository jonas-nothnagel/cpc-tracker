"use client";

/**
 * Scene 4 of the briefing: the centerpiece visualisation.
 *
 * Hosts a chip-row picker over four candidate visualisations so the user can
 * A/B them on real data. The wheel is the leading candidate and ships in
 * Phase A; the other three render a "coming in Phase B" placeholder so the
 * slate is visible.
 *
 * All variants accept the same props (see WheelCenterpieceProps); the
 * placeholders ignore them by design.
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
} from "@/types";

type Variant = "wheel" | "constellation" | "fingerprint" | "river";

interface VariantOption {
  id: Variant;
  label: string;
  status: "ready" | "stub";
}

const VARIANTS: VariantOption[] = [
  { id: "wheel", label: "Wheel", status: "ready" },
  { id: "constellation", label: "Constellation", status: "stub" },
  { id: "fingerprint", label: "Fingerprint", status: "stub" },
  { id: "river", label: "River", status: "stub" },
];

export function CenterpieceFrame({
  targets,
  alignments,
  countryConfig,
  buildup = 1,
  onPairClick,
}: {
  targets: Target[];
  alignments: AlignmentResult[];
  countryConfig: CountryConfig | null;
  buildup?: number;
  onPairClick?: (a: string, b: string) => void;
}) {
  const [active, setActive] = useState<Variant>("wheel");
  return (
    <div className="w-full max-w-[1080px] mx-auto">
      <VariantPicker active={active} onChange={setActive} />
      <div className="mt-2">
        {active === "wheel" && (
          <WheelCenterpiece
            targets={targets}
            alignments={alignments}
            countryConfig={countryConfig}
            buildup={buildup}
            onPairClick={onPairClick}
          />
        )}
        {active === "constellation" && <ConstellationCenterpiece />}
        {active === "fingerprint" && <FingerprintCenterpiece />}
        {active === "river" && <RiverCenterpiece />}
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
    <div className="flex flex-wrap items-center gap-2 justify-center mb-4">
      {VARIANTS.map((v) => {
        const isActive = v.id === active;
        const isStub = v.status === "stub";
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-pressed={isActive}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              isActive
                ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
                : "bg-white border-gray-300 text-[var(--undp-black)] hover:border-[var(--undp-black)]"
            }`}
          >
            {v.label}
            {isStub && (
              <span
                className={`text-[9px] uppercase tracking-wider ${
                  isActive ? "text-white/70" : "text-[var(--undp-gray)]"
                }`}
              >
                soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-[var(--undp-gray)]">
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
