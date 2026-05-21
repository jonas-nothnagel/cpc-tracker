"use client";

/**
 * Centerpiece dispatcher. The slide deck owns the WheelState; this
 * component just switches between Wheel and Constellation as the
 * aesthetic and passes the state through.
 *
 * Fingerprint and River variants were dropped after A2 user testing.
 */

import { useState } from "react";
import { WheelCenterpiece, type WheelState } from "./wheel";
import { ConstellationCenterpiece } from "./constellation";
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

type Variant = "wheel" | "constellation";

export function Centerpiece({
  targets,
  alignments,
  classifications,
  countryConfig,
  state,
  variant: variantProp,
  onVariantChange,
  showPicker = true,
}: {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig: CountryConfig | null;
  state: WheelState;
  variant?: Variant;
  onVariantChange?: (v: Variant) => void;
  showPicker?: boolean;
}) {
  const [internalVariant, setInternalVariant] = useState<Variant>("wheel");
  const variant = variantProp ?? internalVariant;
  const setVariant = onVariantChange ?? setInternalVariant;
  return (
    <div className="w-full max-w-[760px] mx-auto">
      {showPicker && <VariantPicker active={variant} onChange={setVariant} />}
      <div className="mt-2">
        {variant === "wheel" ? (
          <WheelCenterpiece
            targets={targets}
            alignments={alignments}
            classifications={classifications}
            countryConfig={countryConfig}
            state={state}
          />
        ) : (
          <ConstellationCenterpiece
            targets={targets}
            alignments={alignments}
            countryConfig={countryConfig}
            state={state}
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
    <div className="flex items-center gap-1.5 justify-center mb-1">
      {(["wheel", "constellation"] as const).map((v) => {
        const isActive = v === active;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={isActive}
            className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              isActive
                ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
                : "bg-white/70 border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
            }`}
          >
            {v === "wheel" ? "Wheel" : "Constellation"}
          </button>
        );
      })}
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-[var(--undp-gray)]">
      <LegendDot color="#196127" label="Alignment" />
      <LegendDot color="#dc2626" label="Flagged tension" dashed />
      <span className="text-[10px] text-[var(--undp-gray)]/70">
        ribbon width = number of pairs
      </span>
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
