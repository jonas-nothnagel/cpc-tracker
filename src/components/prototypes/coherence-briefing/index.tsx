"use client";

/**
 * CoherenceBriefing — insight-first slide deck.
 *
 * Each slide IS a finding, not buildup. ~4 steps total:
 *
 *   1. Q1 verdict       — "Mostly aligned" with the wheel showing the
 *                          aggregate pattern. Side panel: verdict badge,
 *                          counts, the strongest aligned doc pair.
 *   2. Q2 sectors       — "Tensions concentrate in these sectors" with
 *                          the wheel switched to tensions. Side panel:
 *                          top 5 sector tiles, clickable to drawer.
 *   3. Fault lines      — "Top N pairs worth a closer look" with the
 *                          wheel idle (story is the list). Side panel:
 *                          fault-line rows, clickable to pair drawer.
 *   4. Explore          — Wheel goes interactive with filter chips,
 *                          chat panel + sector chips on the side.
 *
 * The wheel is persistent on the right; only its state changes between
 * slides. Drill-downs (sector tile, fault-line row, pair) open side
 * drawers rather than advancing slides.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { SlideDeckShell, type SlideDef } from "./slide-deck-shell";
import { Centerpiece, type CenterpieceVariant } from "./centerpiece";
import { ChatPanel } from "./chat-panel";
import { SectorDrawer } from "./sector-drawer";
import { PairDrawer, type PairDrawerData } from "./pair-drawer";
import {
  buildSectorBriefing,
  buildSectorTensionDensity,
  pickFaultLines,
  pickHeadlineVerdict,
  pickPrimerExamples,
  type FaultLine,
  type SectorBriefing,
  type SectorTension,
  type VerdictBucket,
} from "@/lib/coherence-briefing";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type { WheelState } from "./centerpiece/wheel";
import type {
  AlignmentResult,
  CountryConfig,
  GlobeCategory,
  IpccSector,
  NbsCategory,
  PolicyDocumentType,
  Target,
  ThematicClassification,
} from "@/types";

const FAULT_LINES_TO_SHOW = 5;

interface CoherenceBriefingProps {
  countryName: string;
  countryId?: string;
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  nbsCategories: NbsCategory[];
  countryConfig: CountryConfig | null;
}

export function CoherenceBriefing({
  countryName,
  countryId,
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
}: CoherenceBriefingProps) {
  // ── Derived insights ───────────────────────────────────────────
  const verdict = useMemo(() => pickHeadlineVerdict(alignment), [alignment]);
  const faultLines = useMemo(
    () => pickFaultLines(alignment, targets, FAULT_LINES_TO_SHOW),
    [alignment, targets],
  );
  const primer = useMemo(
    () => pickPrimerExamples(alignment, targets),
    [alignment, targets],
  );
  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets],
  );
  const availableDocs = useMemo<PolicyDocumentType[]>(() => {
    const docs = new Set<PolicyDocumentType>();
    for (const t of targets) docs.add(t.sourceDocument);
    return Array.from(docs);
  }, [targets]);

  const { lens, sectorRows } = useMemo(() => {
    const countryCats = countryConfig?.countrySectors ?? [];
    const chosen =
      countryCats.length > 0
        ? {
            id: "country" as const,
            label: "Country sectors",
            taxonomyType: "sector",
            categories: countryCats.map((c) => ({ id: c.id, name: c.name })),
          }
        : sectors.length > 0
          ? {
              id: "sector" as const,
              label: "IPCC sectors",
              taxonomyType: "sector",
              categories: sectors.map((s) => ({ id: s.id, name: s.name })),
            }
          : globeCategories.length > 0
            ? {
                id: "globe" as const,
                label: "GLOBE",
                taxonomyType: "globe",
                categories: globeCategories.map((g) => ({
                  id: g.id,
                  name: g.name,
                })),
              }
            : null;
    if (!chosen) return { lens: null, sectorRows: [] as SectorTension[] };
    const density = buildSectorTensionDensity({
      targets,
      alignment,
      classifications,
      categories: chosen.categories,
      taxonomyType: chosen.taxonomyType,
    });
    const sorted = [...density].sort((a, b) => {
      if (b.tensionCount !== a.tensionCount) {
        return b.tensionCount - a.tensionCount;
      }
      return b.targetCount - a.targetCount;
    });
    return { lens: chosen, sectorRows: sorted };
  }, [
    targets,
    alignment,
    classifications,
    sectors,
    globeCategories,
    countryConfig,
  ]);

  // ── Variant + explore-mode state ────────────────────────────────
  const [variant, setVariant] = useState<CenterpieceVariant>("wheel");
  const [exploreFilter, setExploreFilter] = useState<
    "aggregate" | "alignments" | "tensions"
  >("aggregate");
  const [sectorFocus, setSectorFocus] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);

  // ── Drawers ─────────────────────────────────────────────────────
  const [pairData, setPairData] = useState<PairDrawerData | null>(null);
  const openPair = useCallback(
    (a: string, b: string) => {
      const tA = targetMap.get(a);
      const tB = targetMap.get(b);
      if (!tA || !tB) return;
      const conn = alignment.find(
        (p) =>
          (p.targetAId === a && p.targetBId === b) ||
          (p.targetAId === b && p.targetBId === a),
      );
      if (!conn) return;
      setPairData({ pair: conn, targetA: tA, targetB: tB });
    },
    [alignment, targetMap],
  );
  const drawerBriefing = useMemo<SectorBriefing | null>(() => {
    if (!sectorFocus) return null;
    return buildSectorBriefing({
      categoryId: sectorFocus.categoryId,
      categoryName: sectorFocus.categoryName,
      taxonomyType: sectorFocus.taxonomyType,
      targets,
      alignment,
      classifications,
      cap: 6,
    });
  }, [sectorFocus, targets, alignment, classifications]);

  // ── Slide content (insight-first, 4 steps) ──────────────────────
  const slides: SlideDef[] = useMemo(
    () =>
      buildSlides({
        countryName,
        verdict,
        sectorRows: sectorRows.slice(0, 5),
        faultLines,
        countryConfig,
        onSectorSelect: (s) =>
          setSectorFocus({
            categoryId: s.categoryId,
            categoryName: s.categoryName,
            taxonomyType: lens?.taxonomyType ?? s.taxonomyType,
          }),
        onPairSelect: (line) =>
          setPairData({
            pair: line.pair,
            targetA: line.targetA,
            targetB: line.targetB,
          }),
        availableDocs,
        targets,
        alignment,
        classifications,
        sectorsForChat: sectors,
        globesForChat: globeCategories,
        exploreFilter,
        onExploreFilter: setExploreFilter,
        sectorFocus,
        onClearSectorFocus: () => setSectorFocus(null),
        primerAvailable: !!primer.aligned || !!primer.tension,
        primer,
      }),
    [
      countryName,
      verdict,
      sectorRows,
      faultLines,
      countryConfig,
      lens,
      availableDocs,
      targets,
      alignment,
      classifications,
      sectors,
      globeCategories,
      exploreFilter,
      sectorFocus,
      primer,
    ],
  );

  // ── Per-slide wheel state ───────────────────────────────────────
  const slideStates: WheelState[] = useMemo(() => {
    const exploreState: WheelState = sectorFocus
      ? {
          mode: "sector",
          sectorCategoryId: sectorFocus.categoryId,
          sectorTaxonomyType: sectorFocus.taxonomyType,
        }
      : { mode: exploreFilter };
    const topSector = sectorRows[0];
    return [
      // 1 — Q1 verdict: aggregate ribbons (both green + red)
      { mode: "aggregate" },
      // 2 — Q2 sectors: tensions only, optionally focus the top sector
      topSector
        ? {
            mode: "sector",
            sectorCategoryId: topSector.categoryId,
            sectorTaxonomyType: lens?.taxonomyType ?? "sector",
          }
        : { mode: "tensions" },
      // 3 — Fault lines: tensions only so the wheel mirrors the list
      { mode: "tensions" },
      // 4 — Explore: chip-driven
      exploreState,
    ];
  }, [exploreFilter, sectorFocus, sectorRows, lens]);

  const renderVisual = useCallback(
    (idx: number) => {
      const state = slideStates[idx] ?? { mode: "aggregate" };
      return (
        <Centerpiece
          targets={targets}
          alignments={alignment}
          classifications={classifications}
          countryConfig={countryConfig}
          state={state}
          variant={variant}
          onVariantChange={setVariant}
          showPicker={false}
          onPairClick={idx === 3 ? openPair : undefined}
        />
      );
    },
    [
      slideStates,
      targets,
      alignment,
      classifications,
      countryConfig,
      variant,
      openPair,
    ],
  );

  return (
    <main className="flex-1 w-full">
      <SlideDeckShell slides={slides} renderVisual={renderVisual} />
      <SectorDrawer
        briefing={drawerBriefing}
        countryConfig={countryConfig}
        onClose={() => setSectorFocus(null)}
      />
      <PairDrawer
        data={pairData}
        countryConfig={countryConfig}
        onClose={() => setPairData(null)}
      />
      <FooterLink countryId={countryId} />
    </main>
  );
}

// ─── Slide content builder ─────────────────────────────────────────

function buildSlides({
  countryName,
  verdict,
  sectorRows,
  faultLines,
  countryConfig,
  onSectorSelect,
  onPairSelect,
  availableDocs,
  targets,
  alignment,
  classifications,
  sectorsForChat,
  globesForChat,
  exploreFilter,
  onExploreFilter,
  sectorFocus,
  onClearSectorFocus,
  primer,
}: {
  countryName: string;
  verdict: ReturnType<typeof pickHeadlineVerdict>;
  sectorRows: SectorTension[];
  faultLines: FaultLine[];
  countryConfig: CountryConfig | null;
  onSectorSelect: (s: { categoryId: string; categoryName: string; taxonomyType: string }) => void;
  onPairSelect: (l: FaultLine) => void;
  availableDocs: PolicyDocumentType[];
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectorsForChat: IpccSector[];
  globesForChat: GlobeCategory[];
  exploreFilter: "aggregate" | "alignments" | "tensions";
  onExploreFilter: (f: "aggregate" | "alignments" | "tensions") => void;
  sectorFocus: { categoryId: string; categoryName: string; taxonomyType: string } | null;
  onClearSectorFocus: () => void;
  primerAvailable: boolean;
  primer: ReturnType<typeof pickPrimerExamples>;
}): SlideDef[] {
  const tensionPct = Math.round(verdict.tensionShare * 100);
  return [
    // 1 — Q1 verdict
    {
      eyebrow: `Question 1 · ${countryName}`,
      headline: <>{verdict.headline}</>,
      body: (
        <p>
          Of {(verdict.alignmentPairs + verdict.tensionPairs).toLocaleString()}{" "}
          scored pairs,{" "}
          <strong className="text-[var(--undp-black)] font-medium">
            {verdict.alignmentPairs.toLocaleString()}
          </strong>{" "}
          show medium or strong alignment.{" "}
          <strong className="text-[var(--undp-black)] font-medium">
            {verdict.tensionPairs.toLocaleString()}
          </strong>{" "}
          ({tensionPct}%) are flagged for review.
        </p>
      ),
      extra: (
        <div className="space-y-3">
          <VerdictBadge bucket={verdict.bucket} />
          {primer.aligned && (
            <PrimerCallout
              line={primer.aligned}
              kind="aligned"
              countryConfig={countryConfig}
              onSelect={() => onPairSelect(primer.aligned!)}
            />
          )}
        </div>
      ),
    },
    // 2 — Q2 sectors
    {
      eyebrow: "Question 2",
      headline: (
        <>
          Tensions concentrate in{" "}
          {sectorRows.slice(0, 3).map((s, i, arr) => (
            <span key={s.categoryId}>
              <span className="underline decoration-2 underline-offset-4 decoration-[var(--undp-red)]/40">
                {s.categoryName.toLowerCase()}
              </span>
              {i < arr.length - 1
                ? i === arr.length - 2
                  ? ", and "
                  : ", "
                : ""}
            </span>
          ))}
          .
        </>
      ),
      body: (
        <p>
          Each tile counts how many flagged pairs touch a target primary-
          classified to that sector. Click any to open the pairs behind
          the number.
        </p>
      ),
      extra: (
        <SectorTilesInline
          rows={sectorRows}
          onSelect={(r) =>
            onSectorSelect({
              categoryId: r.categoryId,
              categoryName: r.categoryName,
              taxonomyType: r.taxonomyType ?? "sector",
            })
          }
        />
      ),
    },
    // 3 — Fault lines
    {
      eyebrow: "The single pairs to read first",
      headline: <>Top {faultLines.length} fault lines.</>,
      body: (
        <p>
          Severity-sorted, cross-document pairs first. Each row is one
          verdict from the pipeline; open it for the AI rationale.
        </p>
      ),
      extra: (
        <FaultLineListInline
          faultLines={faultLines}
          countryConfig={countryConfig}
          onSelect={onPairSelect}
        />
      ),
    },
    // 4 — Explore
    {
      eyebrow: "Take it further",
      headline: <>Make the briefing your own.</>,
      body: (
        <ExploreModeInline
          targets={targets}
          alignment={alignment}
          classifications={classifications}
          sectors={sectorsForChat}
          globeCategories={globesForChat}
          countryConfig={countryConfig}
          availableDocs={availableDocs}
          sectorRows={sectorRows}
          exploreFilter={exploreFilter}
          onExploreFilter={onExploreFilter}
          sectorFocus={sectorFocus}
          onSectorSelect={onSectorSelect}
          onClearSectorFocus={onClearSectorFocus}
        />
      ),
    },
  ];
}

// ─── Verdict badge ──────────────────────────────────────────────────

function VerdictBadge({ bucket }: { bucket: VerdictBucket }) {
  const palette: Record<VerdictBucket, { color: string; label: string }> = {
    mostly_aligned: { color: ALIGNMENT_COLORS.high, label: "Mostly aligned" },
    mixed: { color: ALIGNMENT_COLORS.medium, label: "Mixed signals" },
    lots_of_tension: {
      color: ALIGNMENT_COLORS.possible_conflict,
      label: "Substantial tension",
    },
  };
  const p = palette[bucket];
  return (
    <span
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider"
      style={{
        backgroundColor: `${p.color}1a`,
        color: p.color,
        border: `1px solid ${p.color}55`,
      }}
    >
      <span
        className="block w-2 h-2 rounded-full"
        style={{ backgroundColor: p.color }}
        aria-hidden="true"
      />
      {p.label}
    </span>
  );
}

// ─── Primer callout (inline on slide 1) ─────────────────────────────

function PrimerCallout({
  line,
  kind,
  countryConfig,
  onSelect,
}: {
  line: FaultLine;
  kind: "aligned" | "tension";
  countryConfig: CountryConfig | null;
  onSelect: () => void;
}) {
  const color =
    kind === "aligned"
      ? ALIGNMENT_COLORS.high
      : ALIGNMENT_COLORS.possible_conflict;
  const labelA = getDocMediumLabel(countryConfig, line.targetA.sourceDocument);
  const labelB = getDocMediumLabel(countryConfig, line.targetB.sourceDocument);
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full text-left rounded-md border border-gray-200 bg-white p-3 hover:border-[var(--undp-black)] transition-colors"
    >
      <p
        className="text-[9px] uppercase tracking-wider font-semibold mb-1"
        style={{ color }}
      >
        Example {kind === "aligned" ? "alignment" : "tension"}
      </p>
      <p className="text-[12px] text-[var(--undp-black)] leading-snug line-clamp-2">
        <span className="text-[var(--undp-gray)]">{labelA} {line.targetA.sourceLabel}:</span>{" "}
        {line.targetA.text}
      </p>
      <p className="text-[11px] my-1.5 text-[var(--undp-gray)]">
        {kind === "aligned" ? "supports" : "in tension with"}
      </p>
      <p className="text-[12px] text-[var(--undp-black)] leading-snug line-clamp-2">
        <span className="text-[var(--undp-gray)]">{labelB} {line.targetB.sourceLabel}:</span>{" "}
        {line.targetB.text}
      </p>
      <p className="mt-2 text-[10px] text-[var(--undp-gray)]">
        Click for full text + AI rationale  →
      </p>
    </button>
  );
}

// ─── Sector tiles inline (slide 2) ──────────────────────────────────

function SectorTilesInline({
  rows,
  onSelect,
}: {
  rows: (SectorTension & { taxonomyType?: string })[];
  onSelect: (row: SectorTension & { taxonomyType?: string }) => void;
}) {
  const peak = rows.reduce((m, r) => Math.max(m, r.tensionCount), 0);
  return (
    <ul className="space-y-1.5">
      {rows.map((row) => {
        const color = row.peakSeverity
          ? ALIGNMENT_COLORS[row.peakSeverity]
          : "#d4d4d4";
        const filled =
          peak > 0
            ? Math.min(
                5,
                Math.max(
                  row.tensionCount > 0 ? 1 : 0,
                  Math.round((row.tensionCount / peak) * 5),
                ),
              )
            : 0;
        return (
          <li key={row.categoryId}>
            <button
              type="button"
              onClick={() => onSelect(row)}
              disabled={row.targetCount === 0}
              className={`w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-2.5 py-2 rounded-md text-left transition-colors border border-transparent ${
                row.targetCount === 0
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-white hover:border-gray-200"
              }`}
            >
              <span className="text-sm text-[var(--undp-black)] font-medium leading-snug truncate">
                {row.categoryName}
              </span>
              <div className="flex items-center gap-1" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span
                    key={i}
                    className="block h-1.5 w-3 rounded-sm"
                    style={{
                      backgroundColor: i < filled ? color : "#f1f1ed",
                    }}
                  />
                ))}
              </div>
              <span className="text-xs tabular-nums text-[var(--undp-gray)] w-10 text-right">
                {row.tensionCount}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Fault lines inline (slide 3) ───────────────────────────────────

function FaultLineListInline({
  faultLines,
  countryConfig,
  onSelect,
}: {
  faultLines: FaultLine[];
  countryConfig: CountryConfig | null;
  onSelect: (line: FaultLine) => void;
}) {
  if (faultLines.length === 0) {
    return (
      <p className="text-xs text-[var(--undp-gray)] italic">
        No flagged pairs in this dataset.
      </p>
    );
  }
  return (
    <ol className="divide-y divide-gray-200 border-y border-gray-200">
      {faultLines.map((line, i) => (
        <FaultRow
          key={`${line.pair.targetAId}__${line.pair.targetBId}`}
          line={line}
          countryConfig={countryConfig}
          index={i}
          onSelect={() => onSelect(line)}
        />
      ))}
    </ol>
  );
}

function FaultRow({
  line,
  countryConfig,
  index,
  onSelect,
}: {
  line: FaultLine;
  countryConfig: CountryConfig | null;
  index: number;
  onSelect: () => void;
}) {
  const { targetA, targetB, pair } = line;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const isContra = isContradiction(pair.alignment);
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="w-full text-left py-3 grid grid-cols-[1.75rem_1fr] gap-3 items-start hover:bg-gray-50 transition-colors px-1 rounded"
      >
        <span
          className="text-xs text-[var(--undp-gray)] tabular-nums pt-0.5"
          aria-hidden="true"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className="text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${color}20`,
                color,
                border: `1px solid ${color}40`,
              }}
            >
              {ALIGNMENT_LABELS[pair.alignment]}
            </span>
            <span className="text-[10px] text-[var(--undp-gray)]">
              {docA} {targetA.sourceLabel} {isContra ? "↮" : "↔"} {docB}{" "}
              {targetB.sourceLabel}
            </span>
          </div>
          <p
            className="text-[12px] text-[var(--undp-black)] leading-snug overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span className="text-[var(--undp-gray)]">A:</span> {targetA.text}
          </p>
          <p
            className="text-[12px] text-[var(--undp-black)] leading-snug overflow-hidden mt-0.5"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span className="text-[var(--undp-gray)]">B:</span> {targetB.text}
          </p>
        </div>
      </button>
    </li>
  );
}

// ─── Explore mode (slide 4) ─────────────────────────────────────────

function ExploreModeInline({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
  sectorRows,
  exploreFilter,
  onExploreFilter,
  sectorFocus,
  onSectorSelect,
  onClearSectorFocus,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
  sectorRows: SectorTension[];
  exploreFilter: "aggregate" | "alignments" | "tensions";
  onExploreFilter: (f: "aggregate" | "alignments" | "tensions") => void;
  sectorFocus: { categoryId: string; categoryName: string; taxonomyType: string } | null;
  onSectorSelect: (s: { categoryId: string; categoryName: string; taxonomyType: string }) => void;
  onClearSectorFocus: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {(["aggregate", "alignments", "tensions"] as const).map((f) => {
          const isActive = !sectorFocus && exploreFilter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => {
                onExploreFilter(f);
                onClearSectorFocus();
              }}
              aria-pressed={isActive}
              className={chip(isActive)}
            >
              {f === "aggregate" ? "Both" : f === "alignments" ? "Alignments" : "Tensions"}
            </button>
          );
        })}
        {sectorFocus && (
          <button
            type="button"
            onClick={onClearSectorFocus}
            className={chip(true)}
          >
            {sectorFocus.categoryName}  ×
          </button>
        )}
      </div>
      {sectorRows.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1.5">
            Focus a sector
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sectorRows.slice(0, 6).map((s) => {
              const isActive = sectorFocus?.categoryId === s.categoryId;
              return (
                <button
                  key={s.categoryId}
                  type="button"
                  onClick={() =>
                    onSectorSelect({
                      categoryId: s.categoryId,
                      categoryName: s.categoryName,
                      taxonomyType: "sector",
                    })
                  }
                  className={chip(isActive)}
                  title={`${s.categoryName} · ${s.tensionCount} flagged pairs`}
                >
                  {s.categoryName}{" "}
                  <span className="opacity-60 ml-1">{s.tensionCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div className="border-t border-gray-200 pt-3 flex flex-col">
        <ChatPanel
          targets={targets}
          alignment={alignment}
          classifications={classifications}
          sectors={sectors.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
          }))}
          globeCategories={globeCategories.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
          }))}
          countryConfig={countryConfig}
          availableDocs={availableDocs}
          starterPrompts={[
            "Which two documents disagree the most?",
            "Which target shows up in the most tensions?",
            "Which sector has the strongest cross-doc alignment?",
          ]}
        />
      </div>
    </div>
  );
}

function chip(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
      : "bg-white border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
  }`;
}

// ─── Footer link ────────────────────────────────────────────────────

function FooterLink({ countryId }: { countryId?: string }) {
  const dashboardHref = countryId
    ? `/dashboard?country=${encodeURIComponent(countryId)}`
    : "/";
  return (
    <div className="fixed bottom-3 left-6 z-10 text-[10px] text-[var(--undp-gray)]">
      <Link
        href={dashboardHref}
        className="hover:text-[var(--undp-black)] hover:underline"
      >
        ← Full coherence explorer
      </Link>
    </div>
  );
}

// Re-export for prototypes-client convenience
export type { WheelState };
