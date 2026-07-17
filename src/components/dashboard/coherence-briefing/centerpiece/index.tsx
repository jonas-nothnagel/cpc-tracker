"use client";

/**
 * Centerpiece dispatcher. The findings-home owns the WheelState; this
 * component just switches between Wheel and Constellation as the
 * aesthetic and passes the state through.
 *
 * Fingerprint and River variants were dropped after A2 user testing.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  WheelCenterpiece,
  type SectorCategoryRef,
  type WheelFocus,
  type WheelState,
} from "./wheel";
import { ConstellationCenterpiece } from "./constellation";
import { WheelLegend } from "./wheel-legend";
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

export { WheelLegend } from "./wheel-legend";

export type CenterpieceVariant = "wheel" | "constellation";
type Variant = CenterpieceVariant;

export function Centerpiece({
  targets,
  alignments,
  classifications,
  countryConfig,
  state,
  sectorCategories,
  sectorTaxonomyType,
  variant: variantProp,
  onVariantChange,
  showPicker = true,
  showLegend = true,
  onPairClick,
  onArcClick,
}: {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig: CountryConfig | null;
  state: WheelState;
  sectorCategories?: SectorCategoryRef[];
  sectorTaxonomyType?: string;
  variant?: Variant;
  onVariantChange?: (v: Variant) => void;
  showPicker?: boolean;
  showLegend?: boolean;
  onPairClick?: (a: string, b: string) => void;
  onArcClick?: (focus: WheelFocus) => void;
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
            sectorCategories={sectorCategories}
            sectorTaxonomyType={sectorTaxonomyType}
            onPairClick={onPairClick}
            onArcClick={onArcClick}
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
      {showLegend && <WheelLegend />}
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
  const t = useTranslations("briefing.centerLegend");
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
            className={`px-3 py-1 rounded-full text-caption font-medium border transition-colors ${
              isActive
                ? "bg-[var(--undp-blue)] border-[var(--undp-blue)] text-white"
                : "bg-white/70 border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
            }`}
          >
            {v === "wheel" ? t("variant.wheel") : t("variant.constellation")}
          </button>
        );
      })}
    </div>
  );
}

