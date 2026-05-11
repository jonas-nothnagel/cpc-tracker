"use client";

import { useState, useMemo } from "react";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  CONTRADICTION_TYPE_LABELS,
  getDocColor,
  getDocFullLabel,
  getDocLabel,
} from "@/lib/utils";
import { InfoBox } from "@/components/ui/info-box";
import { DataProvenance, type ProvenanceSource } from "@/components/ui/data-provenance";
import { TargetTextWithHighlights, ActionTypeBadge, OriginalLanguageChip } from "./target-text";
import { isContradiction } from "@/types";
import type {
  AlignmentResult,
  AlignmentLevel,
  CountryConfig,
  Target,
  ContradictionType,
  PolicyDocumentType,
  ThematicClassification,
  IpccSector,
  NbsCategory,
} from "@/types";

interface TensionClustersProps {
  alignmentData: AlignmentResult[];
  targets: Target[];
  classifications?: ThematicClassification[];
  sectors?: IpccSector[];
  nbsCategories?: NbsCategory[];
  globeCategories?: { id: string; name: string }[];
  onFocusTarget?: (targetId: string) => void;
  countryConfig?: CountryConfig | null;
}

const SEVERITY_ORDER: AlignmentLevel[] = [
  "high_contradiction",
  "moderate_contradiction",
  "low_tension",
];

const TAXONOMY_LABELS: Record<string, string> = {
  sector: "Climate Mitigation sectors",
  globe: "Biodiversity categories",
};

interface DriverTarget {
  target: Target;
  tensionCount: number;
  tensionPairs: AlignmentResult[];
  categories: string[]; // resolved category names
}

/* ─── Expanded driver detail (own state for rationale collapse) ──────── */

function DriverExpanded({
  driver,
  targetMap,
  countryConfig,
}: {
  driver: DriverTarget;
  targetMap: Map<string, Target>;
  countryConfig?: CountryConfig | null;
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showLow, setShowLow] = useState(false);

  const critical = driver.tensionPairs.filter(
    (p) => p.alignment !== "low_tension"
  );
  const low = driver.tensionPairs.filter(
    (p) => p.alignment === "low_tension"
  );

  const toggleRationale = (key: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderConflict = (pair: AlignmentResult) => {
    const otherId =
      pair.targetAId === driver.target.id ? pair.targetBId : pair.targetAId;
    const other = targetMap.get(otherId);
    if (!other) return null;
    const key = `${pair.targetAId}__${pair.targetBId}`;
    const isOpen = expandedIds.has(key);

    return (
      <li
        key={key}
        className="border-l-2 pl-2.5"
        style={{ borderColor: ALIGNMENT_COLORS[pair.alignment] }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
            style={{ backgroundColor: getDocColor(countryConfig, other.sourceDocument) }}
          >
            {getDocLabel(countryConfig, other.sourceDocument)}
          </span>
          <ActionTypeBadge actionType={other.actionType} />
          <span className="text-xs font-medium text-[var(--undp-black)]">
            {other.sourceLabel}
          </span>
          <span
            className="text-[10px] font-medium"
            style={{ color: ALIGNMENT_COLORS[pair.alignment] }}
          >
            {ALIGNMENT_LABELS[pair.alignment]}
          </span>
          {pair.contradictionType && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
              {CONTRADICTION_TYPE_LABELS[pair.contradictionType]}
            </span>
          )}
        </div>
        <p
          className={`text-xs text-[var(--undp-gray)] leading-relaxed mt-0.5 ${!isOpen ? "line-clamp-1" : ""}`}
        >
          <TargetTextWithHighlights target={other} />
        </p>
        {pair.description && (
          <>
            <button
              type="button"
              onClick={() => toggleRationale(key)}
              className="text-[10px] text-[var(--undp-blue)] hover:underline mt-0.5"
            >
              {isOpen ? "Hide analysis" : "Show analysis"}
            </button>
            {isOpen && (
              <p className="text-[11px] text-[var(--undp-gray)]/70 leading-relaxed mt-1 italic">
                {pair.description}
              </p>
            )}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="border-t border-gray-100 px-3 py-2.5 bg-[var(--undp-light)]/50">
      {/* Driver target text */}
      <p className="text-xs text-[var(--undp-gray)] leading-relaxed mb-3">
        <TargetTextWithHighlights target={driver.target} />
      </p>

      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
        Conflicts with
      </p>

      {/* Critical tensions: always visible with tinted background */}
      {critical.length > 0 && (
        <ul className="space-y-2.5 bg-red-50/40 rounded-lg p-2.5 mb-2">
          {critical.map(renderConflict)}
        </ul>
      )}

      {/* Low tensions: collapsed when critical exists, progressive when not */}
      {low.length > 0 &&
        (critical.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowLow((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
            >
              <span
                className="inline-block transition-transform text-[10px]"
                style={{
                  transform: showLow ? "rotate(90deg)" : "rotate(0deg)",
                }}
              >
                &#9654;
              </span>
              {low.length} low tension{low.length !== 1 ? "s" : ""}
            </button>
            {showLow && (
              <ul className="space-y-2 mt-1.5">
                {low.map(renderConflict)}
              </ul>
            )}
          </div>
        ) : (
          <div>
            <ul className="space-y-2">
              {(showLow ? low : low.slice(0, 5)).map(renderConflict)}
            </ul>
            {!showLow && low.length > 5 && (
              <button
                type="button"
                onClick={() => setShowLow(true)}
                className="text-[10px] text-[var(--undp-blue)] hover:underline mt-2"
              >
                Show all {low.length} tensions
              </button>
            )}
          </div>
        ))}
    </div>
  );
}

export function TensionClusters({
  alignmentData,
  targets,
  classifications,
  sectors,
  nbsCategories,
  globeCategories,
  onFocusTarget,
  countryConfig,
}: TensionClustersProps) {
  const [expandedDriver, setExpandedDriver] = useState<string | null>(null);
  const [showBrowse, setShowBrowse] = useState(false);
  const [filterType, setFilterType] = useState<ContradictionType | "all">(
    "all"
  );
  const [filterDoc, setFilterDoc] = useState<PolicyDocumentType | "all">(
    "all"
  );
  const [filterCat, setFilterCat] = useState<string>("all");
  const [taxonomyFilter, setTaxonomyFilter] = useState<{ taxonomyType: string; categoryId: string } | null>(null);

  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets]
  );

  // Build a combined category name map from all taxonomy arrays
  const categoryNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sectors ?? []) map.set(s.id, s.name);
    for (const n of nbsCategories ?? []) map.set(n.id, n.name);
    for (const g of globeCategories ?? []) map.set(g.id, g.name);
    return map;
  }, [sectors, nbsCategories, globeCategories]);

  // Structured per-target taxonomy lookup for the taxonomy filter.
  // Single-label: each target is associated with its primary category per
  // taxonomy. This keeps the filter consistent with the bar chart and
  // Coherence Explorer (a target picked under a category here is the same
  // set of targets shown there).
  const targetTaxonomyMap = useMemo(() => {
    if (!classifications || classifications.length === 0) return new Map<string, Set<string>>();
    const map = new Map<string, Set<string>>();
    for (const c of classifications) {
      if (c.isPrimary !== true) continue;
      const key = `${c.taxonomyType}::${c.categoryId}`;
      if (!map.has(c.targetId)) map.set(c.targetId, new Set());
      map.get(c.targetId)!.add(key);
    }
    return map;
  }, [classifications]);

  // All tension edges
  const tensions = useMemo(
    () =>
      alignmentData
        .filter((a) => isContradiction(a.alignment))
        .sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf(a.alignment) -
            SEVERITY_ORDER.indexOf(b.alignment)
        ),
    [alignmentData]
  );

  const provenanceSources = useMemo<ProvenanceSource[]>(() => {
    const docTypes = new Set<PolicyDocumentType>();
    for (const t of tensions) {
      const tA = targetMap.get(t.targetAId);
      const tB = targetMap.get(t.targetBId);
      if (tA) docTypes.add(tA.sourceDocument);
      if (tB) docTypes.add(tB.sourceDocument);
    }
    return Array.from(docTypes).map((dt) => ({
      label: getDocFullLabel(countryConfig, dt),
      citation: countryConfig?.docProvenance?.[dt],
    }));
  }, [tensions, targetMap, countryConfig]);

  // Apply taxonomy filter to all tensions (affects drivers + browse + summary)
  const visibleTensions = useMemo(() => {
    if (!taxonomyFilter) return tensions;
    if (taxonomyFilter.categoryId === "*") {
      const prefix = `${taxonomyFilter.taxonomyType}::`;
      return tensions.filter((t) => {
        const catsA = targetTaxonomyMap.get(t.targetAId);
        const catsB = targetTaxonomyMap.get(t.targetBId);
        const matchA = catsA ? [...catsA].some(k => k.startsWith(prefix)) : false;
        const matchB = catsB ? [...catsB].some(k => k.startsWith(prefix)) : false;
        return matchA || matchB;
      });
    }
    const filterKey = `${taxonomyFilter.taxonomyType}::${taxonomyFilter.categoryId}`;
    return tensions.filter((t) => {
      const catsA = targetTaxonomyMap.get(t.targetAId);
      const catsB = targetTaxonomyMap.get(t.targetBId);
      return (catsA?.has(filterKey) || false) || (catsB?.has(filterKey) || false);
    });
  }, [tensions, taxonomyFilter, targetTaxonomyMap]);

  // Severity counts
  const severityCounts = useMemo(() => {
    const high = visibleTensions.filter(
      (t) => t.alignment === "high_contradiction"
    ).length;
    const moderate = visibleTensions.filter(
      (t) => t.alignment === "moderate_contradiction"
    ).length;
    const low = visibleTensions.filter(
      (t) => t.alignment === "low_tension"
    ).length;
    return { high, moderate, low };
  }, [visibleTensions]);

  // Dominant contradiction type
  const dominantType = useMemo(() => {
    const counts = new Map<ContradictionType, number>();
    for (const t of visibleTensions) {
      if (t.contradictionType)
        counts.set(
          t.contradictionType,
          (counts.get(t.contradictionType) ?? 0) + 1
        );
    }
    let best: { type: ContradictionType; count: number } | null = null;
    for (const [type, count] of counts) {
      if (!best || count > best.count) best = { type, count };
    }
    return best;
  }, [visibleTensions]);

  // Document pair stats
  const docPairStats = useMemo(() => {
    const pairCounts = new Map<string, { docA: PolicyDocumentType; docB: PolicyDocumentType; count: number }>();
    for (const t of visibleTensions) {
      const tA = targetMap.get(t.targetAId);
      const tB = targetMap.get(t.targetBId);
      if (!tA || !tB) continue;
      const [d1, d2] = [tA.sourceDocument, tB.sourceDocument].sort();
      if (d1 === d2) continue; // skip same-document
      const key = `${d1}__${d2}`;
      const existing = pairCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        pairCounts.set(key, {
          docA: d1 as PolicyDocumentType,
          docB: d2 as PolicyDocumentType,
          count: 1,
        });
      }
    }
    return Array.from(pairCounts.values()).sort((a, b) => b.count - a.count);
  }, [visibleTensions, targetMap]);

  // Per-target classification lookup -- primary category per taxonomy
  // (single-label, consistent with the bar chart and Coherence Explorer).
  const targetCategories = useMemo(() => {
    if (!classifications || classifications.length === 0) return new Map<string, string[]>();
    const map = new Map<string, string[]>();
    for (const c of classifications) {
      if (c.isPrimary !== true) continue;
      const name = categoryNameMap.get(c.categoryId);
      if (!name) continue;
      if (!map.has(c.targetId)) map.set(c.targetId, []);
      const list = map.get(c.targetId)!;
      if (!list.includes(name)) list.push(name);
    }
    return map;
  }, [classifications, categoryNameMap]);

  // Label of the taxonomy with the best coverage among tension-involved targets.
  const taxonomyLabel = useMemo(() => {
    if (!classifications || classifications.length === 0) return "";

    const tensionTargetIds = new Set<string>();
    for (const t of tensions) {
      tensionTargetIds.add(t.targetAId);
      tensionTargetIds.add(t.targetBId);
    }

    const coverageByType = new Map<string, number>();
    for (const c of classifications) {
      if (c.isPrimary !== true || !tensionTargetIds.has(c.targetId)) continue;
      coverageByType.set(
        c.taxonomyType,
        (coverageByType.get(c.taxonomyType) ?? 0) + 1
      );
    }

    let bestType = "";
    let bestCoverage = 0;
    for (const [type, count] of coverageByType) {
      if (count > bestCoverage) {
        bestCoverage = count;
        bestType = type;
      }
    }

    if (!bestType) return "";
    return TAXONOMY_LABELS[bestType] ?? bestType;
  }, [classifications, tensions]);

  // All unique categories for browse filter
  const filterableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const names of targetCategories.values()) {
      for (const n of names) cats.add(n);
    }
    return Array.from(cats).sort();
  }, [targetCategories]);

  // Driver targets: top targets by cross-document tension count
  const drivers = useMemo(() => {
    const tensionCountMap = new Map<
      string,
      { total: number; crossDoc: number; pairs: AlignmentResult[] }
    >();

    for (const t of visibleTensions) {
      const tA = targetMap.get(t.targetAId);
      const tB = targetMap.get(t.targetBId);
      if (!tA || !tB) continue;

      const isCrossDoc = tA.sourceDocument !== tB.sourceDocument;

      for (const id of [t.targetAId, t.targetBId]) {
        if (!tensionCountMap.has(id))
          tensionCountMap.set(id, { total: 0, crossDoc: 0, pairs: [] });
        const entry = tensionCountMap.get(id)!;
        entry.total++;
        if (isCrossDoc) entry.crossDoc++;
        entry.pairs.push(t);
      }
    }

    const result: DriverTarget[] = [];
    for (const [id, { crossDoc, pairs }] of tensionCountMap) {
      if (crossDoc < 3) continue; // minimum threshold
      const target = targetMap.get(id);
      if (!target) continue;
      result.push({
        target,
        tensionCount: pairs.length,
        tensionPairs: pairs.sort(
          (a, b) =>
            SEVERITY_ORDER.indexOf(a.alignment) -
            SEVERITY_ORDER.indexOf(b.alignment)
        ),
        categories: (targetCategories.get(id) ?? []).slice(0, 3),
      });
    }

    result.sort((a, b) => b.tensionCount - a.tensionCount);
    return result.slice(0, 7);
  }, [visibleTensions, targetMap, targetCategories]);

  // Document types for filters
  const documentTypes = useMemo(() => {
    const types = new Set<PolicyDocumentType>();
    for (const t of targets) types.add(t.sourceDocument);
    return Array.from(types);
  }, [targets]);

  // Contradiction types for filters
  const contradictionTypes = useMemo(() => {
    const types = new Set<ContradictionType>();
    for (const t of visibleTensions) {
      if (t.contradictionType) types.add(t.contradictionType);
    }
    return Array.from(types);
  }, [visibleTensions]);

  // Filtered tensions for browse view
  const filteredTensions = useMemo(() => {
    if (!showBrowse) return [];
    return visibleTensions.filter((c) => {
      if (filterType !== "all" && c.contradictionType !== filterType)
        return false;
      if (filterDoc !== "all") {
        const tA = targetMap.get(c.targetAId);
        const tB = targetMap.get(c.targetBId);
        if (
          tA?.sourceDocument !== filterDoc &&
          tB?.sourceDocument !== filterDoc
        )
          return false;
      }
      if (filterCat !== "all") {
        const catsA = targetCategories.get(c.targetAId) ?? [];
        const catsB = targetCategories.get(c.targetBId) ?? [];
        if (!catsA.includes(filterCat) && !catsB.includes(filterCat))
          return false;
      }
      return true;
    });
  }, [
    showBrowse,
    visibleTensions,
    filterType,
    filterDoc,
    filterCat,
    targetMap,
    targetCategories,
  ]);

  if (tensions.length === 0) return null;

  const maxDriverCount = drivers[0]?.tensionCount ?? 1;

  return (
    <section id="tensions" className="mb-10">
      {/* ── Layer 1: Summary ─────────────────────────────────────────── */}
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-[var(--undp-black)] flex items-center flex-wrap gap-y-1">
          Policy Tensions
          <InfoBox>
            Tensions are cases where policy targets may work against each other.
            <br />
            <br />
            <strong>Goal conflict:</strong> targets aim for incompatible
            outcomes.
            <br />
            <strong>Resource competition:</strong> targets compete for the same
            resources.
            <br />
            <strong>Implementation tension:</strong> implementing one target
            makes the other harder.
            <br />
            <strong>Scale/scope mismatch:</strong> targets operate at
            incompatible scales.
          </InfoBox>
          <DataProvenance
            origin="mixed"
            sources={provenanceSources}
            method={
              <>
                Pairs of policy targets are scored by an LLM on a seven-level
                scale (high contradiction → high alignment). Tensions are the
                pairs the model flagged on the negative side; the contradiction
                type and rationale shown for each entry come from the same
                model output.
              </>
            }
            caveat={
              <>
                Adaptation actions are reported in country-specific narrative
                formats and are scored here as policy coherence, not as GHG
                implementation parity. Government self-reports rarely
                contradict their own targets — interpret &ldquo;no
                contradiction&rdquo; as a neutral signal, not validation.
              </>
            }
          />
        </h2>

        {/* Taxonomy filter */}
        {(sectors && sectors.length > 0) || (globeCategories && globeCategories.length > 0) ? (
          <div className="flex items-center gap-2 mt-2 mb-2">
            <select
              value={taxonomyFilter ? `${taxonomyFilter.taxonomyType}::${taxonomyFilter.categoryId}` : "all"}
              onChange={(e) => {
                if (e.target.value === "all") {
                  setTaxonomyFilter(null);
                } else {
                  const [taxonomyType, categoryId] = e.target.value.split("::");
                  setTaxonomyFilter({ taxonomyType, categoryId });
                }
              }}
              className="border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-[var(--undp-black)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]/30"
            >
              <option value="all">All categories</option>
              {globeCategories && globeCategories.length > 0 && (
                <optgroup label="Biodiversity Taxonomy">
                  <option value="globe::*">All Biodiversity categories</option>
                  {globeCategories.map((g) => (
                    <option key={`globe::${g.id}`} value={`globe::${g.id}`}>{g.name}</option>
                  ))}
                </optgroup>
              )}
              {sectors && sectors.length > 0 && (
                <optgroup label="Climate Mitigation Taxonomy">
                  <option value="sector::*">All Climate Mitigation sectors</option>
                  {sectors.map((s) => (
                    <option key={`sector::${s.id}`} value={`sector::${s.id}`}>{s.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            {taxonomyFilter && (
              <button
                type="button"
                onClick={() => setTaxonomyFilter(null)}
                className="text-xs text-[var(--undp-blue)] hover:underline"
              >
                Clear
              </button>
            )}
          </div>
        ) : null}

        <p className="text-sm text-[var(--undp-gray)] mt-1">
          {visibleTensions.length} potential tension
          {visibleTensions.length !== 1 ? "s" : ""}{taxonomyFilter ? " matching this category" : " detected across policy targets"}.
          {dominantType &&
            ` ${CONTRADICTION_TYPE_LABELS[dominantType.type]} is the most common type (${dominantType.count} of ${visibleTensions.length}).`}
        </p>

        {/* Severity proportion bar */}
        <div className="mt-2.5">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100" style={{ width: "14rem" }}>
            {severityCounts.high > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${Math.max((severityCounts.high / visibleTensions.length) * 100, 4)}%`,
                  backgroundColor: ALIGNMENT_COLORS.high_contradiction,
                }}
              />
            )}
            {severityCounts.moderate > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${Math.max((severityCounts.moderate / visibleTensions.length) * 100, 4)}%`,
                  backgroundColor: ALIGNMENT_COLORS.moderate_contradiction,
                }}
              />
            )}
            {severityCounts.low > 0 && (
              <div
                className="h-full"
                style={{
                  width: `${Math.max((severityCounts.low / visibleTensions.length) * 100, 3)}%`,
                  backgroundColor: ALIGNMENT_COLORS.low_tension,
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--undp-gray)]">
            {severityCounts.high > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.high_contradiction }} />
                {severityCounts.high} high
              </span>
            )}
            {severityCounts.moderate > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.moderate_contradiction }} />
                {severityCounts.moderate} moderate
              </span>
            )}
            {severityCounts.low > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ backgroundColor: ALIGNMENT_COLORS.low_tension }} />
                {severityCounts.low} low
              </span>
            )}
          </div>
        </div>

        {/* Document pair breakdown -- mini bar chart */}
        {docPairStats.length > 0 && (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-1">
              Cross-document tensions
            </p>
            {docPairStats.slice(0, 5).map((pair) => {
              const barPct = (pair.count / docPairStats[0].count) * 100;
              return (
                <div
                  key={`${pair.docA}__${pair.docB}`}
                  className="flex items-center gap-2 text-xs"
                >
                  <span className="w-32 sm:w-40 shrink-0 flex items-center gap-1.5 text-[var(--undp-gray)]">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: getDocColor(countryConfig, pair.docA) }}
                    />
                    <span>{getDocLabel(countryConfig, pair.docA)}</span>
                    <span className="text-[10px] text-[var(--undp-gray)]/50">&ndash;</span>
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: getDocColor(countryConfig, pair.docB) }}
                    />
                    <span>{getDocLabel(countryConfig, pair.docB)}</span>
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-100 max-w-48">
                    <div
                      className="h-full rounded-full bg-red-300/70"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                  <span className="text-[11px] tabular-nums text-[var(--undp-gray)] w-6 text-right shrink-0">
                    {pair.count}
                  </span>
                </div>
              );
            })}
          </div>
        )}

      </div>

      {/* ── Layer 2: Conflict drivers ────────────────────────────────── */}
      {drivers.length > 0 && (
        <div className="mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--undp-gray)] mb-2">
            Key conflict drivers
          </p>
          <div className="space-y-1">
            {drivers.map((d) => {
              const isOpen = expandedDriver === d.target.id;
              const barPct = (d.tensionCount / maxDriverCount) * 100;
              return (
                <div
                  key={d.target.id}
                  className="border border-gray-100 rounded-lg overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedDriver(isOpen ? null : d.target.id)
                    }
                    className="w-full text-left px-3 py-2 hover:bg-gray-50/50 transition-colors cursor-pointer relative"
                  >
                    {/* Proportional background bar */}
                    <div
                      className="absolute inset-y-0 left-0 bg-red-50/60 rounded-l-lg transition-all"
                      style={{ width: `${barPct}%` }}
                    />
                    <div className="flex items-center gap-2 relative">
                      <span
                        className="shrink-0 inline-block min-w-[3rem] text-center px-1.5 py-0.5 rounded text-[11px] font-medium text-white"
                        style={{
                          backgroundColor: getDocColor(countryConfig, d.target.sourceDocument),
                        }}
                      >
                        {getDocLabel(countryConfig, d.target.sourceDocument)}
                      </span>
                      <ActionTypeBadge actionType={d.target.actionType} />
                      <OriginalLanguageChip target={d.target} />
                      <span className="text-xs font-medium text-[var(--undp-black)] truncate">
                        {d.target.sourceLabel}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--undp-gray)] tabular-nums font-medium">
                        {d.tensionCount} tension
                        {d.tensionCount !== 1 ? "s" : ""}
                      </span>
                      {onFocusTarget && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFocusTarget(d.target.id);
                            document.getElementById("coherence-explorer")?.scrollIntoView({ behavior: "smooth" });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.stopPropagation();
                              onFocusTarget(d.target.id);
                              document.getElementById("coherence-explorer")?.scrollIntoView({ behavior: "smooth" });
                            }
                          }}
                          className="shrink-0 text-[10px] text-[var(--undp-blue)] hover:underline px-1"
                        >
                          Explore &#8599;
                        </span>
                      )}
                      <span className="text-xs text-[var(--undp-gray)] shrink-0">
                        {isOpen ? "\u25BE" : "\u25B8"}
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <DriverExpanded
                      key={d.target.id}
                      driver={d}
                      targetMap={targetMap}
                      countryConfig={countryConfig}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Layer 3: Browse all tensions ─────────────────────────────── */}
      <div>
        <button
          type="button"
          onClick={() => setShowBrowse((v) => !v)}
          className="text-xs text-[var(--undp-gray)] hover:text-[var(--undp-black)] flex items-center gap-1"
        >
          <span
            className="inline-block transition-transform text-[10px]"
            style={{
              transform: showBrowse ? "rotate(90deg)" : "rotate(0deg)",
            }}
          >
            &#9654;
          </span>
          Browse all {visibleTensions.length} tensions
        </button>

        {showBrowse && (
          <div className="mt-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-3">
              <select
                value={filterType}
                onChange={(e) =>
                  setFilterType(e.target.value as ContradictionType | "all")
                }
                className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-[var(--undp-black)]"
              >
                <option value="all">All types</option>
                {contradictionTypes.map((type) => (
                  <option key={type} value={type}>
                    {CONTRADICTION_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <select
                value={filterDoc}
                onChange={(e) =>
                  setFilterDoc(e.target.value as PolicyDocumentType | "all")
                }
                className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-[var(--undp-black)]"
              >
                <option value="all">All documents</option>
                {documentTypes.map((dt) => (
                  <option key={dt} value={dt}>
                    {getDocLabel(countryConfig, dt)}
                  </option>
                ))}
              </select>
              {filterableCategories.length > 0 && (
                <select
                  value={filterCat}
                  onChange={(e) => setFilterCat(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-[var(--undp-black)]"
                >
                  <option value="all">
                    All {taxonomyLabel || "categories"}
                  </option>
                  {filterableCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
              {(filterType !== "all" ||
                filterDoc !== "all" ||
                filterCat !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterType("all");
                    setFilterDoc("all");
                    setFilterCat("all");
                  }}
                  className="text-xs text-[var(--undp-blue)] hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Tension pairs */}
            <div className="space-y-2">
              {filteredTensions.map((pair) => {
                const tA = targetMap.get(pair.targetAId);
                const tB = targetMap.get(pair.targetBId);
                if (!tA || !tB) return null;

                return (
                  <div
                    key={`${pair.targetAId}__${pair.targetBId}`}
                    className="bg-white border border-gray-100 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span
                        className="inline-block w-2 h-2 rounded-sm shrink-0"
                        style={{
                          backgroundColor: ALIGNMENT_COLORS[pair.alignment],
                        }}
                      />
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          color: ALIGNMENT_COLORS[pair.alignment],
                        }}
                      >
                        {ALIGNMENT_LABELS[pair.alignment]}
                      </span>
                      {pair.contradictionType && (
                        <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                          {CONTRADICTION_TYPE_LABELS[pair.contradictionType]}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[tA, tB].map((t) => (
                        <div key={t.id} className="flex gap-2 items-start">
                          <span
                            className="shrink-0 inline-block px-1.5 py-0.5 rounded text-[11px] font-medium text-white mt-0.5"
                            style={{
                              backgroundColor: getDocColor(countryConfig, t.sourceDocument),
                            }}
                          >
                            {getDocLabel(countryConfig, t.sourceDocument)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <p className="text-xs font-medium text-[var(--undp-black)]">
                                {t.sourceLabel}
                              </p>
                              <ActionTypeBadge actionType={t.actionType} />
                            </div>
                            <p className="text-xs text-[var(--undp-gray)] leading-relaxed mt-0.5">
                              <TargetTextWithHighlights target={t} />
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {pair.description && (
                      <p className="text-xs text-[var(--undp-gray)] leading-relaxed border-t border-gray-50 pt-2 mt-2">
                        {pair.description}
                      </p>
                    )}
                  </div>
                );
              })}
              {filteredTensions.length === 0 && (
                <p className="text-xs text-[var(--undp-gray)] text-center py-4">
                  No tensions match the current filters.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
