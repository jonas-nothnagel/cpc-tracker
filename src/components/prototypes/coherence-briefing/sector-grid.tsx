"use client";

/**
 * SectorGrid — Q2 of the briefing: "where are the gaps, sector by sector?"
 *
 * Phase A renders a static read-out. Click is a no-op for now; the side
 * drawer with the per-sector briefing arrives in Phase C.
 *
 * The lens defaults to the country's most natural taxonomy: IPCC for
 * countries where mitigation framing dominates (e.g. Mongolia), the country's
 * own sector list when one is declared (e.g. Panama). A lens chip-row lets
 * the user switch between every taxonomy that has populated categories.
 */

import { useMemo, useState } from "react";
import {
  buildSectorTensionDensity,
  type SectorTension,
} from "@/lib/coherence-briefing";
import { ALIGNMENT_COLORS, ALIGNMENT_LABELS } from "@/lib/utils";
import type {
  AlignmentResult,
  CountryConfig,
  GlobeCategory,
  IpccSector,
  NbsCategory,
  Target,
  ThematicClassification,
} from "@/types";

type LensId = "sector" | "globe" | "nbs" | "country";

interface LensOption {
  id: LensId;
  label: string;
  taxonomyType: string;
  categories: { id: string; name: string }[];
}

export interface SectorSelection {
  categoryId: string;
  categoryName: string;
  taxonomyType: string;
}

export function SectorGrid({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  nbsCategories,
  countryConfig,
  onSectorSelect,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  nbsCategories: NbsCategory[];
  countryConfig: CountryConfig | null;
  onSectorSelect?: (selection: SectorSelection) => void;
}) {
  const lenses = useMemo<LensOption[]>(() => {
    const out: LensOption[] = [];
    if (sectors.length > 0) {
      out.push({
        id: "sector",
        label: "IPCC sectors",
        taxonomyType: "sector",
        categories: sectors.map((s) => ({ id: s.id, name: s.name })),
      });
    }
    if (globeCategories.length > 0) {
      out.push({
        id: "globe",
        label: "GLOBE biodiversity",
        taxonomyType: "globe",
        categories: globeCategories.map((g) => ({ id: g.id, name: g.name })),
      });
    }
    if (nbsCategories.length > 0) {
      out.push({
        id: "nbs",
        label: "Nature-based solutions",
        taxonomyType: "nbs",
        categories: nbsCategories.map((n) => ({ id: n.id, name: n.name })),
      });
    }
    const country = countryConfig?.countrySectors ?? [];
    if (country.length > 0) {
      out.push({
        id: "country",
        label: "Country sectors",
        taxonomyType: "sector",
        categories: country.map((c) => ({ id: c.id, name: c.name })),
      });
    }
    return out;
  }, [sectors, globeCategories, nbsCategories, countryConfig]);

  // Default lens: country-custom if the country declares one (e.g. Panama),
  // otherwise the first available (IPCC for most others).
  const defaultLens: LensId = useMemo(() => {
    const hasCountry = lenses.some((l) => l.id === "country");
    if (hasCountry) return "country";
    return lenses[0]?.id ?? "sector";
  }, [lenses]);
  const [activeLens, setActiveLens] = useState<LensId>(defaultLens);

  const lens = lenses.find((l) => l.id === activeLens) ?? lenses[0];

  const rows = useMemo<SectorTension[]>(() => {
    if (!lens) return [];
    const all = buildSectorTensionDensity({
      targets,
      alignment,
      classifications,
      categories: lens.categories,
      taxonomyType: lens.taxonomyType,
    });
    // Sort: most tensions first, then largest target population to break ties.
    return [...all].sort((a, b) => {
      if (b.tensionCount !== a.tensionCount) {
        return b.tensionCount - a.tensionCount;
      }
      return b.targetCount - a.targetCount;
    });
  }, [lens, targets, alignment, classifications]);

  if (!lens) {
    return (
      <div className="max-w-3xl mx-auto px-6 text-center text-sm text-[var(--undp-gray)]">
        No taxonomy available for this country yet.
      </div>
    );
  }

  const peakTension = rows.reduce((m, r) => Math.max(m, r.tensionCount), 0);

  return (
    <div className="max-w-5xl mx-auto px-6">
      <div className="mb-6">
        <p className="text-sm text-[var(--undp-gray)] max-w-2xl leading-relaxed">
          Each tile counts how many flagged pairs touch a target in that
          category. Click a tile to see the pairs behind the number.
        </p>
        {lenses.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {lenses.map((l) => {
              const isActive = l.id === activeLens;
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setActiveLens(l.id)}
                  aria-pressed={isActive}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    isActive
                      ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
                      : "bg-white border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rows.map((row) => (
          <SectorTile
            key={row.categoryId}
            row={row}
            peakTension={peakTension}
            onSelect={
              onSectorSelect
                ? () =>
                    onSectorSelect({
                      categoryId: row.categoryId,
                      categoryName: row.categoryName,
                      taxonomyType: lens.taxonomyType,
                    })
                : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function SectorTile({
  row,
  peakTension,
  onSelect,
}: {
  row: SectorTension;
  peakTension: number;
  onSelect?: () => void;
}) {
  const peakColor = row.peakSeverity
    ? ALIGNMENT_COLORS[row.peakSeverity]
    : "#d4d4d4";
  const peakLabel = row.peakSeverity
    ? ALIGNMENT_LABELS[row.peakSeverity]
    : "No flagged pairs";
  // 5-block density bar. Number of filled blocks scales with this row's
  // tensionCount relative to the dataset peak.
  const filled = peakTension > 0
    ? Math.min(5, Math.max(row.tensionCount > 0 ? 1 : 0, Math.round((row.tensionCount / peakTension) * 5)))
    : 0;
  const interactive = !!onSelect && row.targetCount > 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!interactive}
      className={`text-left rounded-md border bg-white p-4 transition-colors ${
        interactive
          ? "border-gray-200 hover:border-[var(--undp-black)] hover:shadow-sm cursor-pointer"
          : "border-gray-200 opacity-60 cursor-not-allowed"
      }`}
    >
      <p className="text-sm font-medium text-[var(--undp-black)] leading-snug mb-3 line-clamp-2">
        {row.categoryName}
      </p>
      <div className="flex items-center gap-1.5 mb-3" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="block h-2 flex-1 rounded-sm"
            style={{
              backgroundColor: i < filled ? peakColor : "#f1f1ed",
            }}
          />
        ))}
      </div>
      <div className="flex items-baseline justify-between text-xs text-[var(--undp-gray)]">
        <span>
          <span className="font-medium text-[var(--undp-black)]">
            {row.tensionCount}
          </span>{" "}
          {row.tensionCount === 1 ? "flagged pair" : "flagged pairs"}
        </span>
        <span>{row.targetCount} targets</span>
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-[var(--undp-gray)]">
        Peak: {peakLabel}
      </p>
    </button>
  );
}
