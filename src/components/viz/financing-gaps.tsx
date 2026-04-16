"use client";

/**
 * Policy vs Budget vs Reported Action — a radar (spider) chart across
 * a chosen set of axes.
 *
 *   Lens = taxonomy (GLOBE / IPCC / NBS): axes are the primary categories
 *          of that classification.
 *   Lens = BER programmes: axes are the 28 named budget lines themselves,
 *          with an Environmental / Non-environmental / All filter.
 *
 * Three overlaid polygons per lens, one per dimension:
 *
 *   blue  (policy) — share of policy targets
 *   amber (budget) — share of BER spend (programme count as fallback)
 *   teal  (action) — share of reported BTR actions
 *
 * Each polygon is normalised within itself (shares sum to 1 across axes).
 * Polygons plot against the shared maximum across dimensions so magnitude
 * comparability is preserved: a 66% peak dominates a 5% peak visually.
 *
 * For the BER-programmes lens, "policy share" comes from the LLM policy-
 * to-programme alignment pass (count of policy targets that medium/high
 * align with each programme). BTR actions have no direct alignment with
 * BER programmes, so the action polygon is not drawn on that lens.
 */

import { useMemo, useRef, useState } from "react";
import { InfoBox } from "@/components/ui/info-box";
import type { AtlasTaxonomy } from "@/lib/target-atlas-signals";
import type {
  ThematicClassification,
  AlignmentResult,
  NbsCategory,
  IpccSector,
  GlobeCategory,
  BerData,
} from "@/types";

interface Props {
  classifications: ThematicClassification[];
  budgetAlignments: AlignmentResult[] | null;
  nbsCategories: NbsCategory[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  berData: BerData | null;
}

type Lens = AtlasTaxonomy | "ber_programme";

type LensChoice = {
  id: Lens;
  label: string;
};

type EnvFilter = "all" | "environmental" | "non_environmental";

type Dim = "policy" | "budget" | "action";

const DIM_COLOR: Record<Dim, string> = {
  policy: "#2f6fab",
  budget: "#d97706",
  action: "#0d9488",
};

const DIM_LABEL: Record<Dim, string> = {
  policy: "Policy targets",
  budget: "BER spend",
  action: "BTR actions",
};

// Radar geometry. Viewbox is square and larger than needed so labels have
// room on every side without clipping, even when the axis count is high.
const VB = 720;
const CENTER = VB / 2;
const RADIUS = 200;
// Tick length on each spoke end, plus the label distance from centre.
const TICK = 6;
const LABEL_R_HORIZONTAL = RADIUS + TICK + 14;
const LABEL_R_ROTATED = RADIUS + TICK + 8;
// Switching point — above this axis count, labels rotate along the spoke
// because horizontal labels collide at 12+ axes around the ring.
const ROTATE_LABELS_ABOVE = 12;
const RING_PCTS = [0.25, 0.5, 0.75, 1];

export function FinancingGaps({
  classifications,
  budgetAlignments,
  nbsCategories,
  sectors,
  globeCategories,
  berData,
}: Props) {
  const hasBer = !!berData && (berData.expenditure?.length ?? 0) > 0;

  const lensChoices: LensChoice[] = useMemo(() => {
    const out: LensChoice[] = [];
    if (globeCategories.length > 0)
      out.push({ id: "globe", label: "Biodiversity (GLOBE)" });
    if (sectors.length > 0)
      out.push({ id: "sector", label: "Climate mitigation (IPCC)" });
    if (nbsCategories.length > 0)
      out.push({ id: "nbs", label: "Nature-based solutions (NBS)" });
    if (hasBer) out.push({ id: "ber_programme", label: "BER programmes (28)" });
    return out;
  }, [globeCategories, sectors, nbsCategories, hasBer]);

  const [lens, setLens] = useState<Lens>(lensChoices[0]?.id ?? "globe");
  const [envFilter, setEnvFilter] = useState<EnvFilter>("all");
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);

  const isBerLens = lens === "ber_programme";

  // Expenditure total per BER programme code.
  const expByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of berData?.expenditure ?? []) {
      let total = 0;
      for (const v of Object.values(row.values ?? {})) {
        if (typeof v === "number") total += v;
      }
      m.set(row.code, total);
    }
    return m;
  }, [berData]);

  // Axes = the categories on which the radar is drawn. Depends on lens.
  const axes = useMemo((): { id: string; name: string; type?: "environmental" | "non_environmental" }[] => {
    if (lens === "globe") return globeCategories.map((c) => ({ id: c.id, name: c.name }));
    if (lens === "sector") return sectors.map((c) => ({ id: c.id, name: c.name }));
    if (lens === "nbs") return nbsCategories.map((c) => ({ id: c.id, name: c.name }));
    if (lens === "ber_programme" && berData) {
      const base = berData.programs.map((p) => ({
        id: `BER_${p.code}`,
        name: `${p.code} ${p.name}`,
        type: p.type,
      }));
      if (envFilter === "all") return base;
      return base.filter((p) => p.type === envFilter);
    }
    return [];
  }, [lens, globeCategories, sectors, nbsCategories, berData, envFilter]);

  // Build the three per-axis share arrays and the raw counts/amounts
  // used for tooltips and the side panel.
  const data = useMemo(() => {
    const n = axes.length;
    if (n === 0) {
      return emptyData(axes);
    }

    const policyRaw = new Array(n).fill(0);
    const budgetRaw = new Array(n).fill(0);
    const actionRaw = new Array(n).fill(0);
    const berCount = new Array(n).fill(0);
    const btrCount = new Array(n).fill(0);
    const spendAmount = new Array(n).fill(0);
    const axisIndexById = new Map(axes.map((a, i) => [a.id, i] as const));

    if (isBerLens && berData) {
      // Axes are BER programmes themselves.
      // Budget = each programme's spend / total.
      for (let i = 0; i < n; i++) {
        const code = axes[i].id.startsWith("BER_") ? axes[i].id.slice(4) : axes[i].id;
        const amt = expByCode.get(code) ?? 0;
        budgetRaw[i] = amt;
        spendAmount[i] = amt;
        berCount[i] = 1; // each axis IS one programme
      }
      // Policy = count of policy targets that medium/high align with each programme.
      for (const a of budgetAlignments ?? []) {
        if (a.alignment !== "medium" && a.alignment !== "high") continue;
        const berId = a.targetAId.startsWith("BER_")
          ? a.targetAId
          : a.targetBId.startsWith("BER_")
            ? a.targetBId
            : null;
        if (!berId) continue;
        const idx = axisIndexById.get(berId);
        if (idx == null) continue;
        policyRaw[idx] += 1;
      }
      // No direct BTR ↔ BER alignment in the pipeline; leave actionRaw zero.
    } else {
      // Axes are classification categories (GLOBE / IPCC / NBS).
      const kindOf = (id: string) =>
        id.startsWith("BER_") ? "BER" : id.startsWith("BTR_") ? "BTR" : "POLICY";

      for (const c of classifications) {
        if (!c.isPrimary) continue;
        if (c.taxonomyType !== lens) continue;
        const idx = axisIndexById.get(c.categoryId);
        if (idx == null) continue;
        const k = kindOf(c.targetId);
        if (k === "POLICY") {
          policyRaw[idx] += 1;
        } else if (k === "BER") {
          berCount[idx] += 1;
          const code = c.targetId.slice(4);
          const amt = expByCode.get(code) ?? 0;
          budgetRaw[idx] += hasBer ? amt : 1; // spend or programme count
          spendAmount[idx] += amt;
        } else {
          btrCount[idx] += 1;
          actionRaw[idx] += 1;
        }
      }
    }

    const policy = normalise(policyRaw);
    const budget = normalise(budgetRaw);
    const action = normalise(actionRaw);

    return {
      axes,
      policy,
      budget,
      action,
      policyCount: policyRaw,
      berCount,
      btrCount,
      spendAmount,
      totalPolicy: sum(policyRaw),
      totalSpend: sum(budgetRaw),
      totalBtr: sum(actionRaw),
    };
  }, [axes, isBerLens, berData, classifications, lens, budgetAlignments, expByCode, hasBer]);

  const globalMax = useMemo(() => {
    const all = [...data.policy, ...data.budget, ...data.action];
    return Math.max(...all, 0.05);
  }, [data]);

  const activeDims: Dim[] = useMemo(() => {
    const out: Dim[] = [];
    if (data.totalPolicy > 0) out.push("policy");
    if (data.totalSpend > 0) out.push("budget");
    // No BTR↔BER alignments in the pipeline, so skip the action polygon on
    // the BER-programmes lens.
    if (!isBerLens && data.totalBtr > 0) out.push("action");
    return out;
  }, [data, isBerLens]);

  const unitLabel = [berData?.unit, berData?.currency].filter(Boolean).join(" ");
  const period =
    berData?.period?.start && berData.period.end
      ? `${berData.period.start}\u2013${berData.period.end}`
      : null;

  return (
    <section className="mb-10 pt-8 border-t-2 border-[var(--undp-blue)]/20">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--undp-black)]">
            Policy, budget and action across the taxonomy
            <InfoBox>
              Three overlaid shapes on a radar across the axes of the
              selected lens. Each polygon shows one dimension&apos;s share
              per axis:{" "}
              <span style={{ color: DIM_COLOR.policy }}>policy targets</span>
              ,{" "}
              <span style={{ color: DIM_COLOR.budget }}>BER spend</span>,
              and{" "}
              <span style={{ color: DIM_COLOR.action }}>
                reported BTR actions
              </span>
              . Each polygon is normalised to its own total, then plotted
              against the shared maximum across dimensions so magnitudes
              stay comparable. Overlapping shapes = aligned; divergent
              shapes = mismatch.
              <br />
              <br />
              On the <strong>BER programmes</strong> lens, the axes become
              the 28 named budget lines themselves. Policy share on each
              axis is the number of policy targets medium/high LLM-aligned
              with that programme. BTR actions aren&apos;t directly aligned
              to BER programmes in the pipeline, so the action polygon is
              hidden in that lens.
              {period ? ` BER period: ${period}.` : ""}
            </InfoBox>
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mt-1 max-w-3xl">
            Do policy, money and reported action all concentrate on the
            same categories? Where the shapes match, they agree. Where
            they diverge, it&apos;s a finding. Hover an axis for the exact
            numbers.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs flex-wrap justify-end">
          <label htmlFor="fingap-lens" className="text-[var(--undp-gray)]">
            Lens
          </label>
          <select
            id="fingap-lens"
            value={lens}
            onChange={(e) => {
              setLens(e.target.value as Lens);
              setHoveredAxis(null);
            }}
            className="border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
          >
            {lensChoices.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          {isBerLens && (
            <div
              role="tablist"
              className="flex items-center text-[11px] border border-gray-200 rounded-md overflow-hidden"
            >
              {(
                [
                  { id: "all", label: "All" },
                  { id: "environmental", label: "Env." },
                  { id: "non_environmental", label: "Non-env." },
                ] as { id: EnvFilter; label: string }[]
              ).map((o) => {
                const active = envFilter === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setEnvFilter(o.id);
                      setHoveredAxis(null);
                    }}
                    className={`px-2.5 py-1 transition-colors border-l first:border-l-0 border-gray-200 ${
                      active
                        ? "bg-[var(--undp-blue)] text-white"
                        : "bg-white text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="border border-gray-100 rounded-lg p-4 bg-white">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <Radar
            data={data}
            activeDims={activeDims}
            globalMax={globalMax}
            hoveredAxis={hoveredAxis}
            onHoverAxis={setHoveredAxis}
            isBerLens={isBerLens}
          />
          <DetailPanel
            data={data}
            activeDims={activeDims}
            hoveredAxis={hoveredAxis}
            hasBer={hasBer}
            unitLabel={unitLabel}
            isBerLens={isBerLens}
          />
        </div>
      </div>
    </section>
  );
}

// ── Radar SVG ─────────────────────────────────────────────────────────

type RadarData = {
  axes: { id: string; name: string; type?: "environmental" | "non_environmental" }[];
  policy: number[];
  budget: number[];
  action: number[];
  policyCount: number[];
  berCount: number[];
  btrCount: number[];
  spendAmount: number[];
  totalPolicy: number;
  totalSpend: number;
  totalBtr: number;
};

function emptyData(axes: RadarData["axes"]): RadarData {
  return {
    axes,
    policy: [],
    budget: [],
    action: [],
    policyCount: [],
    berCount: [],
    btrCount: [],
    spendAmount: [],
    totalPolicy: 0,
    totalSpend: 0,
    totalBtr: 0,
  };
}

function Radar({
  data,
  activeDims,
  globalMax,
  hoveredAxis,
  onHoverAxis,
  isBerLens,
}: {
  data: RadarData;
  activeDims: Dim[];
  globalMax: number;
  hoveredAxis: number | null;
  onHoverAxis: (i: number | null) => void;
  isBerLens: boolean;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const n = data.axes.length;
  if (n === 0) {
    return (
      <div className="text-xs text-[var(--undp-gray)] italic p-6 text-center">
        No axes in this selection.
      </div>
    );
  }

  const rotateLabels = n > ROTATE_LABELS_ABOVE;
  const labelFontSize = rotateLabels ? 10 : 11;
  const maxLabelLen = rotateLabels ? 22 : 26;

  const angleFor = (i: number) => (i / n) * 2 * Math.PI - Math.PI / 2;
  const pointFor = (share: number, i: number) => {
    const a = angleFor(i);
    const r = (share / globalMax) * RADIUS;
    return {
      x: CENTER + r * Math.cos(a),
      y: CENTER + r * Math.sin(a),
    };
  };

  const polygonPath = (shares: number[]) => {
    const pts = shares.map((s, i) => pointFor(s, i));
    return (
      pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join(" ") + " Z"
    );
  };

  const sharesFor = (dim: Dim): number[] =>
    dim === "policy" ? data.policy : dim === "budget" ? data.budget : data.action;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB} ${VB}`}
      className="w-full h-auto select-none"
      onMouseLeave={() => onHoverAxis(null)}
    >
      {/* Alternating ring fills for scale reference */}
      {RING_PCTS.map((p, idx) => {
        const inner = idx > 0 ? RADIUS * RING_PCTS[idx - 1] : 0;
        const outer = RADIUS * p;
        return (
          <circle
            key={`ringfill-${p}`}
            cx={CENTER}
            cy={CENTER}
            r={outer}
            fill={idx % 2 === 0 ? "#f8fafc" : "#ffffff"}
            stroke="none"
            // Only the first (outermost) ring gets a fill; each inner ring
            // sits on top and overwrites. Use masking via stacking order.
            data-inner={inner}
          />
        );
      }).reverse()}

      {/* Concentric ring outlines */}
      {RING_PCTS.map((p) => (
        <circle
          key={`ring-${p}`}
          cx={CENTER}
          cy={CENTER}
          r={RADIUS * p}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      ))}

      {/* Ring scale labels: one tidy column along the NE diagonal, so they
          don't cross any spoke or polygon. */}
      {RING_PCTS.map((p) => {
        const a = -Math.PI / 2 + Math.PI / 12; // slight clockwise tilt from top
        const lx = CENTER + RADIUS * p * Math.cos(a);
        const ly = CENTER + RADIUS * p * Math.sin(a) - 3;
        return (
          <text
            key={`rl-${p}`}
            x={lx}
            y={ly}
            fontSize={9}
            fill="#94a3b8"
            textAnchor="middle"
            className="select-none pointer-events-none"
          >
            {Math.round(globalMax * p * 100)}%
          </text>
        );
      })}

      {/* Axis spokes with a small outer tick so the endpoint is crisp */}
      {data.axes.map((_, i) => {
        const ang = angleFor(i);
        const end = {
          x: CENTER + RADIUS * Math.cos(ang),
          y: CENTER + RADIUS * Math.sin(ang),
        };
        const tickEnd = {
          x: CENTER + (RADIUS + TICK) * Math.cos(ang),
          y: CENTER + (RADIUS + TICK) * Math.sin(ang),
        };
        const highlighted = hoveredAxis === i;
        return (
          <g key={`spoke-${i}`}>
            <line
              x1={CENTER}
              y1={CENTER}
              x2={end.x}
              y2={end.y}
              stroke={highlighted ? "#94a3b8" : "#e5e7eb"}
              strokeWidth={highlighted ? 1.5 : 1}
            />
            <line
              x1={end.x}
              y1={end.y}
              x2={tickEnd.x}
              y2={tickEnd.y}
              stroke={highlighted ? "#64748b" : "#cbd5e1"}
              strokeWidth={1.25}
            />
          </g>
        );
      })}

      {/* Dimension polygons (fill first, stroke above so it reads cleanly) */}
      {activeDims.map((dim) => (
        <path
          key={`poly-${dim}`}
          d={polygonPath(sharesFor(dim))}
          fill={DIM_COLOR[dim]}
          fillOpacity={0.14}
          stroke="none"
        />
      ))}
      {activeDims.map((dim) => (
        <path
          key={`poly-stroke-${dim}`}
          d={polygonPath(sharesFor(dim))}
          fill="none"
          stroke={DIM_COLOR[dim]}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.95}
        />
      ))}

      {/* Vertex dots */}
      {activeDims.map((dim) => {
        const shares = sharesFor(dim);
        return (
          <g key={`dots-${dim}`}>
            {shares.map((s, i) => {
              if (s <= 0) return null;
              const p = pointFor(s, i);
              const isPeak = hoveredAxis === i;
              return (
                <circle
                  key={`d-${dim}-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={isPeak ? 4 : 2.75}
                  fill={DIM_COLOR[dim]}
                  stroke="#fff"
                  strokeWidth={isPeak ? 1.5 : 1}
                />
              );
            })}
          </g>
        );
      })}

      {/* Invisible hit-wedges for hover */}
      {data.axes.map((_, i) => {
        const a0 = angleFor(i) - Math.PI / n;
        const a1 = angleFor(i) + Math.PI / n;
        const rOuter = RADIUS + TICK + 40;
        const p0 = {
          x: CENTER + rOuter * Math.cos(a0),
          y: CENTER + rOuter * Math.sin(a0),
        };
        const p1 = {
          x: CENTER + rOuter * Math.cos(a1),
          y: CENTER + rOuter * Math.sin(a1),
        };
        const path = `M ${CENTER} ${CENTER} L ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${rOuter} ${rOuter} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} Z`;
        return (
          <path
            key={`hit-${i}`}
            d={path}
            fill="transparent"
            onMouseEnter={() => onHoverAxis(i)}
          />
        );
      })}

      {/* Axis labels — rotation / anchor scheme picked by axis count */}
      {data.axes.map((a, i) => {
        const ang = angleFor(i);
        const isHovered = hoveredAxis === i;

        const rawName =
          isBerLens && a.name.match(/^\d+\s/) ? a.name.replace(/^\d+\s/, "") : a.name;
        const name =
          rawName.length > maxLabelLen ? `${rawName.slice(0, maxLabelLen - 1)}…` : rawName;

        const envTint =
          isBerLens && !isHovered
            ? a.type === "non_environmental"
              ? "#94a3b8"
              : "#334155"
            : isHovered
              ? "#0f172a"
              : "#475569";

        if (rotateLabels) {
          // Dense axes: read labels along the spoke direction. Flip 180°
          // for the bottom half so text stays upright.
          const labelR = LABEL_R_ROTATED;
          const lx = CENTER + labelR * Math.cos(ang);
          const ly = CENTER + labelR * Math.sin(ang);
          const deg = (ang * 180) / Math.PI;
          const flip = deg > 90 || deg < -90;
          const rotation = flip ? deg + 180 : deg;
          const anchor = flip ? "end" : "start";
          return (
            <text
              key={`lbl-${i}`}
              x={lx}
              y={ly}
              transform={`rotate(${rotation.toFixed(2)} ${lx.toFixed(2)} ${ly.toFixed(2)})`}
              fontSize={labelFontSize}
              fontWeight={isHovered ? 600 : 400}
              fill={envTint}
              textAnchor={anchor}
              dominantBaseline="middle"
              className="select-none pointer-events-none"
            >
              <title>{a.name}</title>
              {name}
            </text>
          );
        }

        // Sparse axes: horizontal text with anchor picked by angle so
        // labels on the left are right-anchored etc. Same pattern as
        // the chord diagram.
        const labelR = LABEL_R_HORIZONTAL;
        const lx = CENTER + labelR * Math.cos(ang);
        const ly = CENTER + labelR * Math.sin(ang);
        const cos = Math.cos(ang);
        const anchor: "start" | "middle" | "end" =
          cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text
            key={`lbl-${i}`}
            x={lx}
            y={ly}
            fontSize={labelFontSize}
            fontWeight={isHovered ? 600 : 500}
            fill={envTint}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="select-none pointer-events-none"
            style={{ letterSpacing: "0.01em" }}
          >
            <title>{a.name}</title>
            {name}
          </text>
        );
      })}
    </svg>
  );
}

// ── Side detail panel ────────────────────────────────────────────────

function DetailPanel({
  data,
  activeDims,
  hoveredAxis,
  hasBer,
  unitLabel,
  isBerLens,
}: {
  data: RadarData;
  activeDims: Dim[];
  hoveredAxis: number | null;
  hasBer: boolean;
  unitLabel: string;
  isBerLens: boolean;
}) {
  const hovered = hoveredAxis != null ? data.axes[hoveredAxis] : null;

  if (!hovered) {
    return (
      <div className="text-[12px] space-y-3">
        <p className="text-[var(--undp-gray)]">
          Hover an axis to see that axis&apos;s shares. The list below
          shows where each dimension peaks.
        </p>
        {activeDims.map((dim) => {
          const shares =
            dim === "policy"
              ? data.policy
              : dim === "budget"
                ? data.budget
                : data.action;
          const top = shares
            .map((v, i) => ({ v, i }))
            .filter((x) => x.v > 0)
            .sort((a, b) => b.v - a.v)
            .slice(0, 3);
          return (
            <div key={dim}>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide font-semibold text-[var(--undp-gray)] mb-1">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: DIM_COLOR[dim] }}
                />
                {DIM_LABEL[dim]}
              </div>
              {top.length === 0 ? (
                <p className="text-[11px] text-gray-400 italic">No data.</p>
              ) : (
                <ul className="space-y-0.5">
                  {top.map((x) => (
                    <li
                      key={`${dim}-${x.i}`}
                      className="flex items-center justify-between text-[11px]"
                    >
                      <span
                        className="truncate pr-2 text-[var(--undp-black)]"
                        title={data.axes[x.i].name}
                      >
                        {data.axes[x.i].name}
                      </span>
                      <span
                        className="tabular-nums shrink-0"
                        style={{ color: DIM_COLOR[dim] }}
                      >
                        {formatPct(x.v)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {isBerLens && (
          <p className="text-[10px] text-[var(--undp-gray)] italic pt-2 border-t border-gray-100">
            Darker label = environmental programme; lighter = non-environmental.
            BTR actions have no direct alignment to BER programmes in the
            pipeline, so the action polygon is hidden on this lens.
          </p>
        )}
      </div>
    );
  }

  const i = hoveredAxis!;
  const rows: { dim: Dim; share: number; ctx: string }[] = [];
  for (const dim of activeDims) {
    if (dim === "policy") {
      rows.push({
        dim,
        share: data.policy[i],
        ctx: isBerLens
          ? `${data.policyCount[i]} policy target${data.policyCount[i] === 1 ? "" : "s"} med/high-aligned`
          : `${data.policyCount[i]} policy target${data.policyCount[i] === 1 ? "" : "s"} primarily classified here`,
      });
    } else if (dim === "budget") {
      rows.push({
        dim,
        share: data.budget[i],
        ctx: isBerLens
          ? data.spendAmount[i] > 0 && unitLabel
            ? `${formatAmount(data.spendAmount[i])} ${unitLabel}`
            : "No expenditure recorded"
          : hasBer
            ? `${data.berCount[i]} programme${data.berCount[i] === 1 ? "" : "s"}${
                data.spendAmount[i] > 0 && unitLabel
                  ? ` \u00b7 ${formatAmount(data.spendAmount[i])} ${unitLabel}`
                  : ""
              }`
            : `${data.berCount[i]} programme${data.berCount[i] === 1 ? "" : "s"}`,
      });
    } else {
      rows.push({
        dim,
        share: data.action[i],
        ctx: `${data.btrCount[i]} BTR action${data.btrCount[i] === 1 ? "" : "s"}`,
      });
    }
  }

  return (
    <div className="text-[12px] space-y-3">
      <div>
        <p className="text-[11px] uppercase tracking-wide font-semibold text-[var(--undp-gray)]">
          {isBerLens ? "Programme" : "Category"}
        </p>
        <p className="text-[14px] font-semibold text-[var(--undp-black)] mt-0.5">
          {hovered.name}
        </p>
        {hovered.type && (
          <p className="text-[11px] text-[var(--undp-gray)] mt-0.5 italic">
            {hovered.type === "environmental"
              ? "Environmental programme"
              : "Non-environmental programme"}
          </p>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.dim} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 uppercase tracking-wide font-semibold text-[var(--undp-gray)]">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm"
                  style={{ backgroundColor: DIM_COLOR[r.dim] }}
                />
                {DIM_LABEL[r.dim]}
              </span>
              <span
                className="tabular-nums font-semibold"
                style={{ color: DIM_COLOR[r.dim] }}
              >
                {formatPct(r.share)}
              </span>
            </div>
            <p className="text-[11px] text-[var(--undp-gray)]">{r.ctx}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function sum(values: Iterable<number>): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}

function normalise(raw: number[]): number[] {
  const total = sum(raw);
  return total > 0 ? raw.map((v) => v / total) : raw.map(() => 0);
}

function formatAmount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1) return n.toFixed(1);
  return n.toFixed(2);
}

function formatPct(share: number): string {
  if (share <= 0) return "\u2014";
  const pct = share * 100;
  return `${pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}
