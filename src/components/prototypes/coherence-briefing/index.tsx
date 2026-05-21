"use client";

/**
 * CoherenceBriefing — A4 single-page cockpit.
 *
 * No more slide deck. Everything is on the landing page:
 *   - Hero strip with the Q1 verdict + Q1 / Q2 framing
 *   - Two-column main grid:
 *       Left:  Wheel with filter chips (Aggregate / Alignments / Tensions /
 *              By sector / Idle). Top fault lines below the wheel.
 *       Right: Q2 sector grid (clickable to drawer) + chat panel.
 *
 * Click affordances open drawers, not new slides:
 *   - Fault-line row    → PairDrawer
 *   - Sector tile       → SectorDrawer + wheel switches to that sector
 *   - Wheel chord (when in sector / pair mode) → PairDrawer
 *
 * Primer ("what's a pair") is kept as a small inline expand-toggle so
 * first-time readers can still see the slide-2/3 example, without forcing
 * everyone through a 10-step navigation.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
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
import type { WheelState, WheelStateMode } from "./centerpiece/wheel";
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

type FilterChip = "aggregate" | "alignments" | "tensions" | "all";

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
  // ── Derived insights, computed once per dataset ─────────────────
  const verdict = useMemo(() => pickHeadlineVerdict(alignment), [alignment]);
  const faultLines = useMemo(
    () => pickFaultLines(alignment, targets, FAULT_LINES_TO_SHOW),
    [alignment, targets],
  );
  const primer = useMemo(
    () => pickPrimerExamples(alignment, targets),
    [alignment, targets],
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
  const targetMap = useMemo(
    () => new Map(targets.map((t) => [t.id, t])),
    [targets],
  );

  // ── Sector grid lens + density ─────────────────────────────────
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
    if (!chosen) {
      return { lens: null, sectorRows: [] as SectorTension[] };
    }
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

  // ── Wheel state + filter chips ─────────────────────────────────
  const [filter, setFilter] = useState<FilterChip>("aggregate");
  const [variant, setVariant] = useState<CenterpieceVariant>("wheel");
  const [sectorFocus, setSectorFocus] = useState<{
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null>(null);

  const wheelState: WheelState = useMemo(() => {
    if (sectorFocus) {
      return {
        mode: "sector",
        sectorCategoryId: sectorFocus.categoryId,
        sectorTaxonomyType: sectorFocus.taxonomyType,
      };
    }
    const map: Record<FilterChip, WheelStateMode> = {
      aggregate: "aggregate",
      alignments: "alignments",
      tensions: "tensions",
      all: "aggregate",
    };
    return { mode: map[filter] };
  }, [filter, sectorFocus]);

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

  return (
    <main className="flex-1 w-full px-6 md:px-10 py-6 max-w-[1400px] mx-auto">
      <HeroStrip
        countryName={countryName}
        verdict={verdict}
        docCount={docCount}
        targetCount={targets.length}
        pairCount={pairCount}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)] xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="space-y-6">
          <WheelPanel
            targets={targets}
            alignment={alignment}
            classifications={classifications}
            countryConfig={countryConfig}
            wheelState={wheelState}
            variant={variant}
            onVariantChange={setVariant}
            filter={filter}
            onFilterChange={(f) => {
              setFilter(f);
              setSectorFocus(null);
            }}
            sectorFocus={sectorFocus}
            onClearSector={() => setSectorFocus(null)}
            primer={primer}
            countryName={countryName}
            onPairClick={openPair}
          />
          <FaultLinesPanel
            faultLines={faultLines}
            countryConfig={countryConfig}
            onSelect={(line) =>
              setPairData({
                pair: line.pair,
                targetA: line.targetA,
                targetB: line.targetB,
              })
            }
          />
        </div>

        <div className="space-y-6">
          <SectorPanel
            lens={lens}
            rows={sectorRows}
            sectorFocus={sectorFocus}
            onSelect={(r) =>
              setSectorFocus({
                categoryId: r.categoryId,
                categoryName: r.categoryName,
                taxonomyType: lens?.taxonomyType ?? "sector",
              })
            }
          />
          <ChatStrip
            targets={targets}
            alignment={alignment}
            classifications={classifications}
            sectors={sectors}
            globeCategories={globeCategories}
            countryConfig={countryConfig}
            availableDocs={availableDocs}
          />
        </div>
      </div>

      <ExploreFooter countryId={countryId} countryName={countryName} />

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
    </main>
  );
}

// ─── Hero strip ─────────────────────────────────────────────────────

function HeroStrip({
  countryName,
  verdict,
  docCount,
  targetCount,
  pairCount,
}: {
  countryName: string;
  verdict: ReturnType<typeof pickHeadlineVerdict>;
  docCount: number;
  targetCount: number;
  pairCount: number;
}) {
  const tensionPct = Math.round(verdict.tensionShare * 100);
  return (
    <header>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
        Policy coherence briefing  ·  {countryName}
      </p>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <h1
            className="text-[var(--undp-black)] font-medium leading-[1.1] mb-3"
            style={{
              fontFamily: HEADLINE_SERIF,
              fontSize: "clamp(1.875rem, 4vw, 2.875rem)",
              letterSpacing: "-0.012em",
            }}
          >
            {verdict.headline}
          </h1>
          <p className="text-sm md:text-base text-[var(--undp-gray)] leading-relaxed max-w-2xl">
            Of {(verdict.alignmentPairs + verdict.tensionPairs).toLocaleString()}{" "}
            scored pairs across {docCount}{" "}
            {docCount === 1 ? "document" : "documents"} and{" "}
            {targetCount.toLocaleString()} targets,{" "}
            <strong className="text-[var(--undp-black)] font-medium">
              {verdict.alignmentPairs.toLocaleString()}
            </strong>{" "}
            show medium or strong alignment.{" "}
            <strong className="text-[var(--undp-black)] font-medium">
              {verdict.tensionPairs.toLocaleString()}
            </strong>{" "}
            ({tensionPct}%) are flagged for review.
          </p>
        </div>
        <VerdictBadge bucket={verdict.bucket} />
      </div>
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-[12px] text-[var(--undp-gray)]">
        <span className="flex gap-2 items-baseline">
          <span className="font-medium tracking-wider text-[10px] uppercase">
            Q1
          </span>
          Are these policies pulling the same direction?
          <span className="text-[var(--undp-black)] font-medium ml-1">
            Answered above.
          </span>
        </span>
        <span className="flex gap-2 items-baseline">
          <span className="font-medium tracking-wider text-[10px] uppercase">
            Q2
          </span>
          Where are the biggest gaps?
          <span className="text-[var(--undp-black)] font-medium ml-1">
            See sector panel  →
          </span>
        </span>
      </div>
      <p className="mt-5 text-[10px] text-[var(--undp-gray)] tracking-wide">
        {pairCount.toLocaleString()} pairwise comparisons analysed.
      </p>
    </header>
  );
}

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
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider self-start"
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

// ─── Wheel panel ────────────────────────────────────────────────────

function WheelPanel({
  targets,
  alignment,
  classifications,
  countryConfig,
  wheelState,
  variant,
  onVariantChange,
  filter,
  onFilterChange,
  sectorFocus,
  onClearSector,
  primer,
  countryName,
  onPairClick,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig: CountryConfig | null;
  wheelState: WheelState;
  variant: CenterpieceVariant;
  onVariantChange: (v: CenterpieceVariant) => void;
  filter: FilterChip;
  onFilterChange: (f: FilterChip) => void;
  sectorFocus: {
    categoryId: string;
    categoryName: string;
    taxonomyType: string;
  } | null;
  onClearSector: () => void;
  primer: ReturnType<typeof pickPrimerExamples>;
  countryName: string;
  onPairClick: (a: string, b: string) => void;
}) {
  const [showPrimer, setShowPrimer] = useState(false);
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["aggregate", "alignments", "tensions"] as const).map((f) => (
            <Chip
              key={f}
              active={filter === f && !sectorFocus}
              onClick={() => onFilterChange(f)}
            >
              {f === "aggregate"
                ? "Both"
                : f === "alignments"
                  ? "Alignments"
                  : "Tensions"}
            </Chip>
          ))}
          {sectorFocus && (
            <Chip active onClick={onClearSector}>
              {sectorFocus.categoryName}  ×
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPrimer((p) => !p)}
            className="text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] underline-offset-2 hover:underline"
          >
            {showPrimer ? "Hide primer" : "What is a pair?"}
          </button>
          <span className="text-gray-300">·</span>
          <VariantSwitcher active={variant} onChange={onVariantChange} />
        </div>
      </div>

      {showPrimer && (
        <PrimerInline
          primer={primer}
          countryConfig={countryConfig}
          countryName={countryName}
        />
      )}

      <div className="mt-2">
        <Centerpiece
          targets={targets}
          alignments={alignment}
          classifications={classifications}
          countryConfig={countryConfig}
          state={wheelState}
          variant={variant}
          onVariantChange={onVariantChange}
          onPairClick={onPairClick}
          showPicker={false}
        />
      </div>

      <WheelLegend />
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
          : "bg-white border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
      }`}
    >
      {children}
    </button>
  );
}

function VariantSwitcher({
  active,
  onChange,
}: {
  active: CenterpieceVariant;
  onChange: (v: CenterpieceVariant) => void;
}) {
  return (
    <div className="inline-flex border border-gray-300 rounded-full overflow-hidden">
      {(["wheel", "constellation"] as const).map((v) => {
        const isActive = active === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={isActive}
            className={`px-2.5 py-1 text-[10px] uppercase tracking-wider font-medium transition-colors ${
              isActive
                ? "bg-[var(--undp-black)] text-white"
                : "bg-white text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
            }`}
          >
            {v === "wheel" ? "Wheel" : "Constellation"}
          </button>
        );
      })}
    </div>
  );
}

function WheelLegend() {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[10.5px] text-[var(--undp-gray)]">
      <LegendDot color="#196127" label="Alignment" />
      <LegendDot color="#dc2626" label="Flagged tension" dashed />
      <span className="text-[10px] text-[var(--undp-gray)]/70">
        ribbon width = number of pairs · hover for breakdown
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

// ─── Primer (inline expand) ─────────────────────────────────────────

function PrimerInline({
  primer,
  countryConfig,
  countryName,
}: {
  primer: ReturnType<typeof pickPrimerExamples>;
  countryConfig: CountryConfig | null;
  countryName: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-[#fdfcf8] p-3 mb-3 text-xs text-[var(--undp-gray)]">
      <p className="mb-2 leading-relaxed">
        A pair is two targets, one from each of two policy documents in{" "}
        {countryName}. The pipeline scores how the two relate.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <PrimerCard
          kind="aligned"
          line={primer.aligned}
          countryConfig={countryConfig}
        />
        <PrimerCard
          kind="tension"
          line={primer.tension}
          countryConfig={countryConfig}
        />
      </div>
    </div>
  );
}

function PrimerCard({
  kind,
  line,
  countryConfig,
}: {
  kind: "aligned" | "tension";
  line: FaultLine | null;
  countryConfig: CountryConfig | null;
}) {
  const color =
    kind === "aligned"
      ? ALIGNMENT_COLORS.high
      : ALIGNMENT_COLORS.possible_conflict;
  if (!line) {
    return (
      <div className="rounded border border-gray-200 bg-white/60 p-2.5 text-[11px]">
        No {kind === "aligned" ? "aligned" : "tension"} example available.
      </div>
    );
  }
  const labelA = getDocMediumLabel(
    countryConfig,
    line.targetA.sourceDocument,
  );
  const labelB = getDocMediumLabel(
    countryConfig,
    line.targetB.sourceDocument,
  );
  return (
    <div className="rounded border border-gray-200 bg-white p-2.5 text-[11px] leading-snug">
      <p
        className="text-[9px] uppercase tracking-wider font-medium mb-1"
        style={{ color }}
      >
        {kind === "aligned" ? "Aligned" : "Tension"}
      </p>
      <p className="text-[var(--undp-black)] line-clamp-2">
        {labelA} {line.targetA.sourceLabel}: {line.targetA.text}
      </p>
      <p className="my-1 text-[var(--undp-gray)]">
        {kind === "aligned" ? "supports" : "in tension with"}
      </p>
      <p className="text-[var(--undp-black)] line-clamp-2">
        {labelB} {line.targetB.sourceLabel}: {line.targetB.text}
      </p>
    </div>
  );
}

// ─── Fault lines panel (under the wheel) ────────────────────────────

function FaultLinesPanel({
  faultLines,
  countryConfig,
  onSelect,
}: {
  faultLines: FaultLine[];
  countryConfig: CountryConfig | null;
  onSelect: (line: FaultLine) => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
            The pairs most worth a closer look
          </p>
          <h2
            className="text-lg text-[var(--undp-black)] font-medium leading-tight"
            style={{ fontFamily: HEADLINE_SERIF }}
          >
            Top {faultLines.length} fault lines
          </h2>
        </div>
        <p className="text-[10px] text-[var(--undp-gray)]">
          Click any row to open the pair detail.
        </p>
      </div>
      {faultLines.length === 0 ? (
        <p className="text-xs text-[var(--undp-gray)] italic">
          No flagged pairs in this dataset.
        </p>
      ) : (
        <ol className="divide-y divide-gray-200 border-y border-gray-200">
          {faultLines.map((line, i) => (
            <FaultLineRow
              key={`${line.pair.targetAId}__${line.pair.targetBId}`}
              line={line}
              countryConfig={countryConfig}
              index={i}
              onSelect={() => onSelect(line)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function FaultLineRow({
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
        className="w-full text-left py-3 grid grid-cols-[2rem_1fr] gap-3 items-start hover:bg-gray-50 transition-colors rounded-md px-1"
      >
        <span
          className="text-xs text-[var(--undp-gray)] tabular-nums pt-0.5"
          aria-hidden="true"
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        <div>
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: `${color}20`,
                color: color,
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
          <div className="grid md:grid-cols-2 gap-2">
            <p
              className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {targetA.text}
            </p>
            <p
              className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
              style={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
              }}
            >
              {targetB.text}
            </p>
          </div>
        </div>
      </button>
    </li>
  );
}

// ─── Sector panel (right column) ────────────────────────────────────

function SectorPanel({
  lens,
  rows,
  sectorFocus,
  onSelect,
}: {
  lens: { id: string; label: string; taxonomyType: string } | null;
  rows: SectorTension[];
  sectorFocus: { categoryId: string } | null;
  onSelect: (row: SectorTension) => void;
}) {
  const peak = rows.reduce((m, r) => Math.max(m, r.tensionCount), 0);
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
        Question 2  ·  {lens?.label ?? "sector"}
      </p>
      <h2
        className="text-lg text-[var(--undp-black)] font-medium leading-tight mb-1"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        Where the gaps concentrate.
      </h2>
      <p className="text-[10px] text-[var(--undp-gray)] mb-3">
        Click a sector to open the pairs and refocus the wheel.
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const isActive = sectorFocus?.categoryId === row.categoryId;
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
                className={`w-full grid grid-cols-[1fr_auto_auto] gap-3 items-center px-2.5 py-2 rounded-md text-left transition-colors ${
                  isActive
                    ? "bg-[var(--undp-black)] text-white"
                    : row.targetCount === 0
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-gray-50"
                }`}
              >
                <span
                  className={`text-sm font-medium leading-snug truncate ${
                    isActive ? "text-white" : "text-[var(--undp-black)]"
                  }`}
                >
                  {row.categoryName}
                </span>
                <div className="flex items-center gap-1" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className="block h-1.5 w-3 rounded-sm"
                      style={{
                        backgroundColor:
                          i < filled
                            ? isActive
                              ? "white"
                              : color
                            : isActive
                              ? "rgba(255,255,255,0.25)"
                              : "#f1f1ed",
                      }}
                    />
                  ))}
                </div>
                <span
                  className={`text-xs tabular-nums w-12 text-right ${
                    isActive ? "text-white" : "text-[var(--undp-gray)]"
                  }`}
                >
                  {row.tensionCount}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ─── Chat strip ─────────────────────────────────────────────────────

function ChatStrip({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 md:p-5">
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
    </section>
  );
}

// ─── Explore footer ─────────────────────────────────────────────────

function ExploreFooter({
  countryId,
  countryName,
}: {
  countryId?: string;
  countryName: string;
}) {
  const dashboardHref = countryId
    ? `/dashboard?country=${encodeURIComponent(countryId)}`
    : "/";
  return (
    <div className="mt-10 border-t border-gray-200 pt-6 flex flex-wrap items-baseline justify-between gap-4 text-xs text-[var(--undp-gray)]">
      <div className="max-w-xl leading-relaxed">
        Pipeline outputs are LLM-derived verdicts on pairwise comparisons,
        not settled findings. Treat each as a prompt to review. Sectoral
        view defaults to {countryName}&rsquo;s most relevant taxonomy.
      </div>
      <Link
        href={dashboardHref}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-[11px] font-medium border border-[var(--undp-black)]/40 text-[var(--undp-black)] hover:border-[var(--undp-black)] hover:bg-white transition-colors"
      >
        Open the full coherence explorer  →
      </Link>
    </div>
  );
}
