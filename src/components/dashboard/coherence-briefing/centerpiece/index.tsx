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
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

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
            className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              isActive
                ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
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

export function WheelLegend({
  justify = "center",
}: {
  /** Horizontal alignment of the legend items. Defaults to centered (under the
   * wheel); the landing left column passes "start" to left-align it. */
  justify?: "center" | "start";
}) {
  const t = useTranslations("briefing.centerLegend");
  return (
    <div
      className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--undp-gray)] ${
        justify === "start" ? "justify-start" : "justify-center"
      }`}
    >
      <LegendDot color="#196127" label={t("legend.aligned")} />
      <LegendDot color="#dc2626" label={t("legend.potentialMis")} dashed />
      <span className="text-[11px] text-[var(--undp-gray)]/70">
        {t("legend.ribbonWidth")}
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
            ? // 6/4 dash rhythm, matching the flagged ribbon core in wheel.tsx
              `repeating-linear-gradient(90deg, ${color} 0 6px, transparent 6px 10px)`
            : color,
        }}
      />
      {label}
    </span>
  );
}
