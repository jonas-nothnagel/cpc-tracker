"use client";

import { useState, useMemo } from "react";
import { AlignmentNetwork } from "./alignment-network";
import type {
  AlignmentResult,
  Target,
  ThematicClassification,
  NbsCategory,
  Theme,
} from "@/types";

type TaxonomyType = "nbs" | "theme";

interface AlignmentNetworkSelectorProps {
  alignmentData: AlignmentResult[];
  targets: Target[];
  nbsCategories: NbsCategory[];
  themes: Theme[];
  classifications: ThematicClassification[];
}

/**
 * Wrapper around AlignmentNetwork that lets the user pick an
 * NBS category or cross-cutting theme to filter the network.
 *
 * Mirrors the report structure: one network diagram per category/theme
 * (Figures 4.2–4.10 for NBS, 4.12–4.17+ for themes).
 */
export function AlignmentNetworkSelector({
  alignmentData,
  targets,
  nbsCategories,
  themes,
  classifications,
}: AlignmentNetworkSelectorProps) {
  const [taxonomyType, setTaxonomyType] = useState<TaxonomyType>("nbs");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    nbsCategories[0]?.id ?? ""
  );

  const categories = taxonomyType === "nbs" ? nbsCategories : themes;

  // When switching taxonomy type, reset to first category
  const handleTaxonomyChange = (type: TaxonomyType) => {
    setTaxonomyType(type);
    const firstCategory = type === "nbs" ? nbsCategories[0] : themes[0];
    setSelectedCategoryId(firstCategory?.id ?? "");
  };

  // Get the selected category name
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // Filter targets: only those classified under the selected category
  const filteredTargetIds = useMemo(() => {
    return new Set(
      classifications
        .filter(
          (c) =>
            c.categoryId === selectedCategoryId &&
            c.isRelevant &&
            c.taxonomyType === taxonomyType
        )
        .map((c) => c.targetId)
    );
  }, [classifications, selectedCategoryId, taxonomyType]);

  const filteredTargets = useMemo(
    () => targets.filter((t) => filteredTargetIds.has(t.id)),
    [targets, filteredTargetIds]
  );

  // Filter alignment data: only pairs where BOTH targets are in the filtered set
  const filteredAlignment = useMemo(
    () =>
      alignmentData.filter(
        (a) =>
          filteredTargetIds.has(a.targetAId) &&
          filteredTargetIds.has(a.targetBId)
      ),
    [alignmentData, filteredTargetIds]
  );

  // Compute possible pairs and alignment ratio
  const totalPossiblePairs = useMemo(() => {
    // Count targets by document type for cross-document pairs only
    const byDoc = new Map<string, string[]>();
    for (const t of filteredTargets) {
      const existing = byDoc.get(t.sourceDocument) ?? [];
      existing.push(t.id);
      byDoc.set(t.sourceDocument, existing);
    }
    // Cross-document pairs only (as in the report)
    const docTypes = [...byDoc.keys()];
    let pairs = 0;
    for (let i = 0; i < docTypes.length; i++) {
      for (let j = i + 1; j < docTypes.length; j++) {
        pairs +=
          (byDoc.get(docTypes[i])?.length ?? 0) *
          (byDoc.get(docTypes[j])?.length ?? 0);
      }
    }
    return pairs;
  }, [filteredTargets]);

  const alignmentRatio =
    totalPossiblePairs > 0
      ? Math.round((filteredAlignment.length / totalPossiblePairs) * 100)
      : 0;

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-[var(--undp-black)]">
          Target Alignment Network
        </h3>
        <p className="text-sm text-[var(--undp-gray)] mt-1">
          One network per category/theme, showing alignment opportunities between
          targets. As reported in the assessment (Figures 4.2–4.17).
        </p>
      </div>

      {/* Taxonomy type toggle + category selector */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Toggle: NBS vs Themes */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm shrink-0">
          <button
            onClick={() => handleTaxonomyChange("nbs")}
            className={`px-4 py-2 transition-colors ${
              taxonomyType === "nbs"
                ? "bg-[var(--undp-blue)] text-white"
                : "bg-white text-[var(--undp-gray)] hover:bg-gray-50"
            }`}
          >
            NBS Categories
          </button>
          <button
            onClick={() => handleTaxonomyChange("theme")}
            className={`px-4 py-2 transition-colors ${
              taxonomyType === "theme"
                ? "bg-[var(--undp-blue)] text-white"
                : "bg-white text-[var(--undp-gray)] hover:bg-gray-50"
            }`}
          >
            Cross-Cutting Themes
          </button>
        </div>

        {/* Category dropdown */}
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30 focus:border-[var(--undp-blue)]"
        >
          {categories.map((cat) => {
            const count = classifications.filter(
              (c) =>
                c.categoryId === cat.id &&
                c.isRelevant &&
                c.taxonomyType === taxonomyType
            ).length;
            return (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({count} targets)
              </option>
            );
          })}
        </select>
      </div>

      {/* Summary stats for selected category */}
      {filteredTargets.length > 0 && (
        <div className="bg-[var(--undp-light)] rounded-lg px-4 py-3 mb-5 text-sm text-[var(--undp-gray)]">
          <strong className="text-[var(--undp-black)]">
            {selectedCategory?.name}:
          </strong>{" "}
          {filteredTargets.length} targets ·{" "}
          {filteredAlignment.length} of {totalPossiblePairs} cross-document
          pairs ({alignmentRatio}%) show opportunities for alignment.
        </div>
      )}

      {/* Network graph */}
      {filteredTargets.length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--undp-gray)]">
          No targets classified under this{" "}
          {taxonomyType === "nbs" ? "NBS category" : "theme"}.
        </div>
      ) : filteredAlignment.length === 0 ? (
        <div className="text-center py-16 text-sm text-[var(--undp-gray)]">
          {filteredTargets.length} target{filteredTargets.length !== 1 ? "s" : ""}{" "}
          classified, but no cross-document alignment opportunities identified.
        </div>
      ) : (
        <AlignmentNetwork
          title=""
          alignmentData={filteredAlignment}
          targets={filteredTargets}
          maxNodes={Math.min(filteredTargets.length, 16)}
        />
      )}
    </div>
  );
}
