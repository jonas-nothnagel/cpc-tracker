"use client";

/**
 * CoherenceBriefing — 10-slide click-through deck (Prev/Next + arrow keys).
 *
 * Returns to the A3-era deck shape, but the two slots that used to walk
 * the user through individual sector tours are now occupied by the
 * sectoral-grid and top-gaps (fault-lines) panels that A1/A2 carried as
 * scrollable sections. The user explicitly asked for those panels back.
 *
 * Slide map:
 *   1  Hero                — both questions, wheel idle
 *   2  Primer aligned      — one real aligned pair, wheel pair-highlight
 *   3  Primer tension      — one real tension pair, wheel pair-highlight
 *   4  Build-up            — "now all targets", wheel aggregate
 *   5  Pattern             — the full picture, wheel aggregate
 *   6  Q1 verdict          — wheel alignments-only
 *   7  Q2 intro            — wheel tensions-only
 *   8  Sectoral grid       — clickable sector tiles, wheel focused on top
 *   9  Top gaps list       — clickable fault-line rows, wheel tensions
 *  10  Explore             — chips + sector chips + chat + interactive wheel
 *
 * Drill-downs (sector tile click, fault-line row click, primer card,
 * wheel chord click on slide 10) open side drawers, never advance the
 * deck.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { SlideDeckShell, type SlideDef } from "./slide-deck-shell";
import { Centerpiece } from "./centerpiece";
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

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const FAULT_LINES_TO_SHOW = 6;

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

type ExploreFilter = "aggregate" | "alignments" | "tensions";

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
  // ── Derived data ────────────────────────────────────────────────
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
  const docCount = useMemo(() => {
    const docs = new Set<string>();
    for (const t of targets) docs.add(t.sourceDocument);
    return docs.size;
  }, [targets]);
  const pairCount = useMemo(
    () => alignment.filter((a) => a.alignment !== "none").length,
    [alignment],
  );
  const availableDocs = useMemo<PolicyDocumentType[]>(() => {
    const docs = new Set<PolicyDocumentType>();
    for (const t of targets) docs.add(t.sourceDocument);
    return Array.from(docs);
  }, [targets]);

  // Sector lens — country-defined first, then IPCC, then GLOBE.
  const { lens, sectorRows } = useMemo(() => {
    const countryCats = countryConfig?.countrySectors ?? [];
    const chosen =
      countryCats.length > 0
        ? {
            label: "Country sectors",
            taxonomyType: "sector",
            categories: countryCats.map((c) => ({ id: c.id, name: c.name })),
          }
        : sectors.length > 0
          ? {
              label: "IPCC sectors",
              taxonomyType: "sector",
              categories: sectors.map((s) => ({ id: s.id, name: s.name })),
            }
          : globeCategories.length > 0
            ? {
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
  const lensTaxonomyType = lens?.taxonomyType ?? "sector";
  const topTensionSector = useMemo(
    () => sectorRows.find((s) => s.tensionCount > 0) ?? sectorRows[0] ?? null,
    [sectorRows],
  );

  // ── Drawer state ────────────────────────────────────────────────
  const [pairData, setPairData] = useState<PairDrawerData | null>(null);
  const [sectorFocusForDrawer, setSectorFocusForDrawer] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);

  const openPairFromFaultLine = useCallback((line: FaultLine) => {
    setPairData({
      pair: line.pair,
      targetA: line.targetA,
      targetB: line.targetB,
    });
  }, []);

  const openPairById = useCallback(
    (aId: string, bId: string) => {
      const tA = targetMap.get(aId);
      const tB = targetMap.get(bId);
      if (!tA || !tB) return;
      const conn = alignment.find(
        (p) =>
          (p.targetAId === aId && p.targetBId === bId) ||
          (p.targetAId === bId && p.targetBId === aId),
      );
      if (!conn) return;
      setPairData({ pair: conn, targetA: tA, targetB: tB });
    },
    [alignment, targetMap],
  );

  const openSectorDrawer = useCallback(
    (s: { categoryId: string; categoryName: string; taxonomyType: string }) =>
      setSectorFocusForDrawer(s),
    [],
  );

  const drawerBriefing = useMemo<SectorBriefing | null>(() => {
    if (!sectorFocusForDrawer) return null;
    return buildSectorBriefing({
      categoryId: sectorFocusForDrawer.categoryId,
      categoryName: sectorFocusForDrawer.categoryName,
      taxonomyType: sectorFocusForDrawer.taxonomyType,
      targets,
      alignment,
      classifications,
      cap: 6,
    });
  }, [sectorFocusForDrawer, targets, alignment, classifications]);

  // ── Slide 10 explore state ──────────────────────────────────────
  const [exploreFilter, setExploreFilter] = useState<ExploreFilter>("aggregate");
  const [exploreSector, setExploreSector] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);

  // ── Slide content ──────────────────────────────────────────────
  const slides: SlideDef[] = useMemo(() => {
    return [
      // 1 — Hero
      {
        eyebrow: `Policy coherence briefing · ${countryName}`,
        headline: <>A briefing in two questions.</>,
        body: (
          <p>
            {docCount} {docCount === 1 ? "document" : "documents"},{" "}
            {targets.length.toLocaleString()} targets,{" "}
            {pairCount.toLocaleString()} pairwise comparisons.
          </p>
        ),
        extra: (
          <ol className="space-y-3 mt-2">
            <li className="flex items-baseline gap-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--undp-gray)] tabular-nums">
                Q1
              </span>
              <span
                className="text-lg text-[var(--undp-black)]"
                style={{ fontFamily: HEADLINE_SERIF }}
              >
                Are these policies pulling the same direction?
              </span>
            </li>
            <li className="flex items-baseline gap-4">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--undp-gray)] tabular-nums">
                Q2
              </span>
              <span
                className="text-lg text-[var(--undp-black)]"
                style={{ fontFamily: HEADLINE_SERIF }}
              >
                And where are the biggest gaps, sector by sector?
              </span>
            </li>
          </ol>
        ),
      },
      // 2 — Primer aligned
      {
        eyebrow: "What you're looking at",
        headline: <>Each line is a pair of targets.</>,
        body: (
          <p>
            Two targets, drawn from two different policy documents, with a
            verdict on whether they pull the same way.
          </p>
        ),
        extra: primer.aligned ? (
          <PairCard
            kind="aligned"
            line={primer.aligned}
            countryConfig={countryConfig}
            onSelect={() => openPairFromFaultLine(primer.aligned!)}
          />
        ) : undefined,
      },
      // 3 — Primer tension
      {
        eyebrow: "What you're looking at",
        headline: <>Or pulling against each other.</>,
        body: (
          <p>
            The pipeline flags these for human review. It does not declare
            a final verdict.
          </p>
        ),
        extra: primer.tension ? (
          <PairCard
            kind="tension"
            line={primer.tension}
            countryConfig={countryConfig}
            onSelect={() => openPairFromFaultLine(primer.tension!)}
          />
        ) : undefined,
      },
      // 4 — Build-up
      {
        eyebrow: "All at once",
        headline: (
          <>
            Now all {targets.length.toLocaleString()} targets, in one frame.
          </>
        ),
        body: (
          <>
            <p>
              Each ribbon shows the relationship between a pair of documents.
              Green where most pairs align; red where most are flagged.
            </p>
            <p className="text-xs italic text-[var(--undp-gray)]/80">
              Hover a ribbon to see the counts.
            </p>
          </>
        ),
      },
      // 5 — Pattern
      {
        eyebrow: "The pattern",
        headline: <>What stands out?</>,
        body: (
          <>
            <p>
              Two document pairs typically carry most of the signal, both
              positive and negative. The thickest ribbon is the pair with
              the most pairwise comparisons in total.
            </p>
            <p className="text-xs italic text-[var(--undp-gray)]/80">
              Next: the verdict on Q1.
            </p>
          </>
        ),
      },
      // 6 — Q1 verdict
      {
        eyebrow: "Answer to question 1",
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
            ({Math.round(verdict.tensionShare * 100)}%) are flagged for review.
          </p>
        ),
        extra: <VerdictBadge bucket={verdict.bucket} />,
      },
      // 7 — Q2 intro
      {
        eyebrow: "On to question 2",
        headline: (
          <>
            Where do those{" "}
            {verdict.tensionPairs.toLocaleString()} tensions concentrate?
          </>
        ),
        body: (
          <p>
            The visual now shows only the red side. The next slide breaks
            the tensions down by sector. The one after lists the single
            pairs most worth a closer look.
          </p>
        ),
      },
      // 8 — Sectoral grid (NEW)
      {
        eyebrow: `Question 2 · ${lens?.label ?? "sectors"}`,
        headline: <>Where the gaps concentrate.</>,
        body: (
          <p>
            Each tile counts how many flagged pairs touch a target primary-
            classified to that sector. Click any to open the pairs behind
            the number.
          </p>
        ),
        extra: (
          <SectorGridPanel
            rows={sectorRows}
            onSelect={(r) =>
              openSectorDrawer({
                categoryId: r.categoryId,
                categoryName: r.categoryName,
                taxonomyType: lensTaxonomyType,
              })
            }
          />
        ),
      },
      // 9 — Top gaps / fault lines (NEW)
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
          <FaultLinesPanel
            faultLines={faultLines}
            countryConfig={countryConfig}
            onSelect={openPairFromFaultLine}
          />
        ),
      },
      // 10 — Explore
      {
        eyebrow: "Take it further",
        headline: <>Make the briefing your own.</>,
        exploreLayout: true,
      },
    ];
  }, [
    countryName,
    docCount,
    targets.length,
    pairCount,
    primer.aligned,
    primer.tension,
    countryConfig,
    openPairFromFaultLine,
    verdict,
    lens,
    sectorRows,
    lensTaxonomyType,
    openSectorDrawer,
    faultLines,
  ]);

  // ── Per-slide wheel state ───────────────────────────────────────
  const slideStates: WheelState[] = useMemo(() => {
    return [
      // 1 — Hero: rim only
      { mode: "idle" },
      // 2 — Primer aligned: highlight the aligned pair
      primer.aligned
        ? {
            mode: "pair",
            pair: {
              aId: primer.aligned.pair.targetAId,
              bId: primer.aligned.pair.targetBId,
            },
          }
        : { mode: "idle" },
      // 3 — Primer tension: highlight the tension pair
      primer.tension
        ? {
            mode: "pair",
            pair: {
              aId: primer.tension.pair.targetAId,
              bId: primer.tension.pair.targetBId,
            },
          }
        : { mode: "idle" },
      // 4 — Build-up: aggregate ribbons
      { mode: "aggregate" },
      // 5 — Pattern: aggregate ribbons
      { mode: "aggregate" },
      // 6 — Q1 verdict: alignments only
      { mode: "alignments" },
      // 7 — Q2 intro: tensions only
      { mode: "tensions" },
      // 8 — Sectoral grid: focus on top sector
      topTensionSector
        ? {
            mode: "sector",
            sectorCategoryId: topTensionSector.categoryId,
            sectorTaxonomyType: lensTaxonomyType,
          }
        : { mode: "tensions" },
      // 9 — Top gaps: tensions only (mirrors the list shown)
      { mode: "tensions" },
      // 10 — Explore (chips drive this)
      exploreSector
        ? {
            mode: "sector",
            sectorCategoryId: exploreSector.categoryId,
            sectorTaxonomyType: exploreSector.taxonomyType,
          }
        : { mode: exploreFilter },
    ];
  }, [
    primer.aligned,
    primer.tension,
    topTensionSector,
    lensTaxonomyType,
    exploreFilter,
    exploreSector,
  ]);

  // ── Render ──────────────────────────────────────────────────────
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
          showPicker={false}
          onPairClick={idx === 9 ? openPairById : undefined}
        />
      );
    },
    [
      slideStates,
      targets,
      alignment,
      classifications,
      countryConfig,
      openPairById,
    ],
  );

  const renderExplore = useCallback(
    () => (
      <ExploreLeftPanel
        targets={targets}
        alignment={alignment}
        classifications={classifications}
        sectors={sectors}
        globeCategories={globeCategories}
        countryConfig={countryConfig}
        availableDocs={availableDocs}
        sectorRows={sectorRows}
        lensTaxonomyType={lensTaxonomyType}
        filter={exploreFilter}
        onFilter={(f) => {
          setExploreFilter(f);
          setExploreSector(null);
        }}
        activeSector={exploreSector}
        onSector={setExploreSector}
        onOpenSectorDrawer={openSectorDrawer}
      />
    ),
    [
      targets,
      alignment,
      classifications,
      sectors,
      globeCategories,
      countryConfig,
      availableDocs,
      sectorRows,
      lensTaxonomyType,
      exploreFilter,
      exploreSector,
      openSectorDrawer,
    ],
  );

  return (
    <main className="flex-1 w-full">
      <SlideDeckShell
        slides={slides}
        renderVisual={renderVisual}
        renderExplore={renderExplore}
      />
      <SectorDrawer
        briefing={drawerBriefing}
        countryConfig={countryConfig}
        onClose={() => setSectorFocusForDrawer(null)}
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

// ─── Primer pair card ───────────────────────────────────────────────

function PairCard({
  kind,
  line,
  countryConfig,
  onSelect,
}: {
  kind: "aligned" | "tension";
  line: FaultLine;
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
        <span className="text-[var(--undp-gray)]">
          {labelA} {line.targetA.sourceLabel}:
        </span>{" "}
        {line.targetA.text}
      </p>
      <p className="text-[11px] my-1.5 text-[var(--undp-gray)]">
        {kind === "aligned" ? "supports" : "in tension with"}
      </p>
      <p className="text-[12px] text-[var(--undp-black)] leading-snug line-clamp-2">
        <span className="text-[var(--undp-gray)]">
          {labelB} {line.targetB.sourceLabel}:
        </span>{" "}
        {line.targetB.text}
      </p>
      <p className="mt-2 text-[10px] text-[var(--undp-gray)]">
        Click for full text + AI rationale  →
      </p>
    </button>
  );
}

// ─── Slide 8: sector grid ───────────────────────────────────────────

function SectorGridPanel({
  rows,
  onSelect,
}: {
  rows: SectorTension[];
  onSelect: (row: SectorTension) => void;
}) {
  const peak = rows.reduce((m, r) => Math.max(m, r.tensionCount), 0);
  if (rows.length === 0) {
    return (
      <p className="text-xs text-[var(--undp-gray)] italic">
        No sector taxonomy available for this country.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5 max-h-[440px] overflow-y-auto pr-1">
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

// ─── Slide 9: fault lines list ──────────────────────────────────────

function FaultLinesPanel({
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
    <ol className="divide-y divide-gray-200 border-y border-gray-200 max-h-[440px] overflow-y-auto">
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

// ─── Slide 10: explore left panel ───────────────────────────────────

function ExploreLeftPanel({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
  sectorRows,
  lensTaxonomyType,
  filter,
  onFilter,
  activeSector,
  onSector,
  onOpenSectorDrawer,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
  sectorRows: SectorTension[];
  lensTaxonomyType: string;
  filter: ExploreFilter;
  onFilter: (f: ExploreFilter) => void;
  activeSector: { categoryId: string; categoryName: string; taxonomyType: string } | null;
  onSector: (s: { categoryId: string; categoryName: string; taxonomyType: string } | null) => void;
  onOpenSectorDrawer: (s: { categoryId: string; categoryName: string; taxonomyType: string }) => void;
}) {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden">
      <div className="shrink-0">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
          Take it further  <span className="opacity-50 ml-1 tabular-nums">· 10 / 10</span>
        </p>
        <h2
          className="text-2xl text-[var(--undp-black)] font-medium leading-tight mb-1"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          Make the briefing your own.
        </h2>
        <p className="text-xs text-[var(--undp-gray)]">
          Switch lens, focus a sector, or ask the briefing a question.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(["aggregate", "alignments", "tensions"] as const).map((f) => {
          const isActive = !activeSector && filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFilter(f)}
              aria-pressed={isActive}
              className={chip(isActive)}
            >
              {f === "aggregate"
                ? "Both"
                : f === "alignments"
                  ? "Alignments"
                  : "Tensions"}
            </button>
          );
        })}
        {activeSector && (
          <button
            type="button"
            onClick={() => onSector(null)}
            className={chip(true)}
          >
            {activeSector.categoryName}  ×
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
              const isActive = activeSector?.categoryId === s.categoryId;
              return (
                <button
                  key={s.categoryId}
                  type="button"
                  onClick={() =>
                    onSector({
                      categoryId: s.categoryId,
                      categoryName: s.categoryName,
                      taxonomyType: lensTaxonomyType,
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
            <button
              type="button"
              onClick={() => {
                const target = activeSector ?? (sectorRows[0]
                  ? {
                      categoryId: sectorRows[0].categoryId,
                      categoryName: sectorRows[0].categoryName,
                      taxonomyType: lensTaxonomyType,
                    }
                  : null);
                if (target) onOpenSectorDrawer(target);
              }}
              className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)] transition-colors"
              title="Open the full sector briefing drawer"
            >
              + Full briefing
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 pt-3 flex flex-col min-h-0 overflow-hidden">
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
