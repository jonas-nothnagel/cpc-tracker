/**
 * Prototype page — three alternative visualizations for the policy-money
 * alignment question ("does Panama's biodiversity spending follow Panama's
 * biodiversity policy ambitions?"). Rough sketches for design comparison;
 * not production-quality, not translated, Panama-only.
 *
 * Each viz joins budget_alignment (LLM verdicts) with panama-ber spend on the
 * policy-target side, so you can read "this target has Y PAB behind it"
 * instead of just "this target has a matching budget line".
 */
import Link from "next/link";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import type {
  AlignmentLevel,
  AlignmentResult,
  BerData,
  Target,
} from "@/types";

export const metadata = { title: "Prototype: financing alignment | CPC Tracker" };

// ---------------------------------------------------------------------------
// Compute helpers — keep math separate from rendering for readability.
// ---------------------------------------------------------------------------

/** Pull the BER programme id out of an alignment pair (one side starts with BER_). */
function berIdOf(pair: AlignmentResult): string | null {
  if (pair.targetAId.startsWith("BER_")) return pair.targetAId;
  if (pair.targetBId.startsWith("BER_")) return pair.targetBId;
  return null;
}
function policyIdOf(pair: AlignmentResult): string | null {
  if (pair.targetAId.startsWith("BER_")) return pair.targetBId;
  if (pair.targetBId.startsWith("BER_")) return pair.targetAId;
  return null;
}

/** Sum yearly expenditure values for a programme (nulls → 0). */
function totalSpendByCode(berData: BerData): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of berData.expenditure) {
    const total = Object.values(e.values).reduce<number>(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0,
    );
    out.set(e.code, total);
  }
  return out;
}

const LEVEL_RANK: Record<AlignmentLevel, number> = {
  high: 4, medium: 3, low: 2, none: 1, flagged: 0,
};
const LEVEL_COLOR: Record<AlignmentLevel, string> = {
  high: "#0d8a4a", medium: "#7cb342", low: "#fdd835", none: "#e0e0e0", flagged: "#c62828",
};
const LEVEL_LABEL: Record<AlignmentLevel, string> = {
  high: "High", medium: "Medium", low: "Low", none: "None", flagged: "Flagged",
};

/** Format M PAB → human string. */
function fmtMoney(mPab: number): string {
  if (mPab >= 1000) return `${(mPab / 1000).toFixed(1)}B PAB`;
  if (mPab >= 1) return `${mPab.toFixed(0)}M PAB`;
  if (mPab > 0) return `< 1M PAB`;
  return `0`;
}

// ---------------------------------------------------------------------------
// Viz 1 — per-document money summary.
// For each document, sum spend of every programme that has any high/medium/low
// alignment with at least one target in the document. Programme counted at its
// BEST alignment with that doc (de-duped across targets).
// ---------------------------------------------------------------------------

type DocBucket = {
  docId: string;
  totalSpend: number;
  byLevel: Record<AlignmentLevel, number>;
  unalignedTargetCount: number;
  alignedTargetCount: number;
};

function perDocumentMoney(
  targets: Target[],
  alignment: AlignmentResult[],
  berData: BerData,
): DocBucket[] {
  const spendByCode = totalSpendByCode(berData);
  const targetsByDoc = new Map<string, Target[]>();
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    const docId = t.sourceDocument;
    if (!targetsByDoc.has(docId)) targetsByDoc.set(docId, []);
    targetsByDoc.get(docId)!.push(t);
  }

  // For each (programme, doc), pick the best alignment level across that doc's
  // targets. Then bucket the programme's full spend into that level for the doc.
  const result: DocBucket[] = [];
  for (const [docId, docTargets] of targetsByDoc) {
    const targetIds = new Set(docTargets.map((t) => t.id));
    const bestPerProgramme = new Map<string, AlignmentLevel>();
    for (const pair of alignment) {
      const berId = berIdOf(pair);
      const policyId = policyIdOf(pair);
      if (!berId || !policyId || !targetIds.has(policyId)) continue;
      const lvl = pair.alignment as AlignmentLevel;
      const cur = bestPerProgramme.get(berId);
      if (!cur || LEVEL_RANK[lvl] > LEVEL_RANK[cur]) {
        bestPerProgramme.set(berId, lvl);
      }
    }

    const byLevel: Record<AlignmentLevel, number> = {
      high: 0, medium: 0, low: 0, none: 0, flagged: 0,
    };
    for (const [berId, lvl] of bestPerProgramme) {
      const code = berId.replace(/^BER_/, "");
      byLevel[lvl] += spendByCode.get(code) ?? 0;
    }

    // Per-target coverage stat: targets with >=1 high/medium aligned programme.
    let aligned = 0;
    for (const t of docTargets) {
      const hasStrong = alignment.some((p) => {
        const lvl = p.alignment as AlignmentLevel;
        if (lvl !== "high" && lvl !== "medium") return false;
        return (p.targetAId === t.id && p.targetBId.startsWith("BER_")) ||
               (p.targetBId === t.id && p.targetAId.startsWith("BER_"));
      });
      if (hasStrong) aligned += 1;
    }

    result.push({
      docId,
      totalSpend: Object.values(byLevel).reduce((s, v) => s + v, 0),
      byLevel,
      alignedTargetCount: aligned,
      unalignedTargetCount: docTargets.length - aligned,
    });
  }
  result.sort((a, b) => (b.byLevel.high + b.byLevel.medium) - (a.byLevel.high + a.byLevel.medium));
  return result;
}

// ---------------------------------------------------------------------------
// Viz 2 — quadrant scatter: ambition strength vs aligned spend.
// Each policy target = one dot. x = ambition score (0–2: isQuantitative +
// isTimeBound). y = sum of programme spend for high/medium-aligned programmes.
// Jitter inside each x-tier so dots don't pile up.
// ---------------------------------------------------------------------------

type ScatterPoint = {
  targetId: string;
  docId: string;
  text: string;
  ambitionScore: number;  // 0..2
  alignedSpend: number;   // M PAB
  alignedProgrammeCount: number;
};

function quadrantScatter(
  targets: Target[],
  alignment: AlignmentResult[],
  berData: BerData,
): ScatterPoint[] {
  const spendByCode = totalSpendByCode(berData);
  const policyAlignments = new Map<string, AlignmentResult[]>();
  for (const pair of alignment) {
    const policyId = policyIdOf(pair);
    if (!policyId) continue;
    if (!policyAlignments.has(policyId)) policyAlignments.set(policyId, []);
    policyAlignments.get(policyId)!.push(pair);
  }

  const out: ScatterPoint[] = [];
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    const pairs = policyAlignments.get(t.id) ?? [];
    let spend = 0;
    let count = 0;
    for (const p of pairs) {
      const lvl = p.alignment as AlignmentLevel;
      if (lvl !== "high" && lvl !== "medium") continue;
      const berId = berIdOf(p);
      if (!berId) continue;
      const code = berId.replace(/^BER_/, "");
      spend += spendByCode.get(code) ?? 0;
      count += 1;
    }
    out.push({
      targetId: t.id,
      docId: t.sourceDocument,
      text: t.text.slice(0, 120),
      ambitionScore: (t.isQuantitative ? 1 : 0) + (t.isTimeBound ? 1 : 0),
      alignedSpend: spend,
      alignedProgrammeCount: count,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Viz 3 — per-target detail rows.
// Top N targets by aligned spend, with their contributing programmes listed.
// ---------------------------------------------------------------------------

type TargetRow = {
  targetId: string;
  docId: string;
  text: string;
  totalSpend: number;
  contributors: { code: string; name: string; spend: number; level: AlignmentLevel }[];
};

function perTargetRows(
  targets: Target[],
  alignment: AlignmentResult[],
  berData: BerData,
  limit = 30,
): TargetRow[] {
  const spendByCode = totalSpendByCode(berData);
  const nameByCode = new Map<string, string>();
  for (const p of berData.programs) {
    nameByCode.set(p.code, (p as { nameEn?: string }).nameEn ?? p.name);
  }
  const policyAlignments = new Map<string, AlignmentResult[]>();
  for (const pair of alignment) {
    const policyId = policyIdOf(pair);
    if (!policyId) continue;
    if (!policyAlignments.has(policyId)) policyAlignments.set(policyId, []);
    policyAlignments.get(policyId)!.push(pair);
  }

  const rows: TargetRow[] = [];
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    const pairs = policyAlignments.get(t.id) ?? [];
    const contributors: TargetRow["contributors"] = [];
    for (const p of pairs) {
      const lvl = p.alignment as AlignmentLevel;
      if (lvl !== "high" && lvl !== "medium") continue;
      const berId = berIdOf(p);
      if (!berId) continue;
      const code = berId.replace(/^BER_/, "");
      contributors.push({
        code,
        name: nameByCode.get(code) ?? code,
        spend: spendByCode.get(code) ?? 0,
        level: lvl,
      });
    }
    contributors.sort((a, b) => b.spend - a.spend);
    rows.push({
      targetId: t.id,
      docId: t.sourceDocument,
      text: t.text,
      totalSpend: contributors.reduce((s, c) => s + c.spend, 0),
      contributors,
    });
  }
  rows.sort((a, b) => b.totalSpend - a.totalSpend);
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function StackedBar({ bucket, maxSpend }: { bucket: DocBucket; maxSpend: number }) {
  const widthPct = maxSpend > 0 ? (bucket.totalSpend / maxSpend) * 100 : 0;
  const segments: { level: AlignmentLevel; spend: number }[] = (
    ["high", "medium", "low", "none"] as AlignmentLevel[]
  )
    .filter((l) => bucket.byLevel[l] > 0)
    .map((l) => ({ level: l, spend: bucket.byLevel[l] }));
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between text-sm mb-1">
        <span className="font-medium">{bucket.docId}</span>
        <span className="text-gray-600 tabular-nums">
          {fmtMoney(bucket.byLevel.high + bucket.byLevel.medium)} high+medium ·{" "}
          {fmtMoney(bucket.totalSpend)} total ·{" "}
          {bucket.alignedTargetCount}/{bucket.alignedTargetCount + bucket.unalignedTargetCount} targets aligned
        </span>
      </div>
      <div
        className="h-6 bg-gray-50 relative overflow-hidden rounded"
        style={{ width: `${widthPct}%`, minWidth: bucket.totalSpend > 0 ? 60 : 0 }}
      >
        <div className="flex h-full">
          {segments.map((s) => (
            <div
              key={s.level}
              title={`${LEVEL_LABEL[s.level]}: ${fmtMoney(s.spend)}`}
              style={{
                width: `${(s.spend / bucket.totalSpend) * 100}%`,
                backgroundColor: LEVEL_COLOR[s.level],
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Scatter({ points }: { points: ScatterPoint[] }) {
  const W = 800, H = 420, PAD_L = 60, PAD_R = 20, PAD_T = 20, PAD_B = 50;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const maxSpend = Math.max(1, ...points.map((p) => p.alignedSpend));
  // Log-ish y scale so a few big values don't squash the rest. y=0 reserved
  // for "zero aligned spend" — pin to baseline.
  const yScale = (v: number) => {
    if (v <= 0) return PAD_T + plotH;
    const log = Math.log10(v + 1);
    const max = Math.log10(maxSpend + 1);
    return PAD_T + plotH - (log / max) * plotH;
  };
  // x: ambition 0–2, jittered inside each bucket so dots don't stack.
  const bucketCounts = new Map<number, number>();
  const ptPositions = points.map((p) => {
    const bucket = p.ambitionScore;
    const i = bucketCounts.get(bucket) ?? 0;
    bucketCounts.set(bucket, i + 1);
    return { ...p, _bucketIdx: i };
  });
  const xBase = (score: number) => PAD_L + (plotW / 3) * (score + 0.5);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-3xl">
      <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#999" />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#999" />
      {[0, 1, 2].map((s) => (
        <text key={s} x={xBase(s)} y={H - PAD_B + 18} textAnchor="middle" fontSize="11" fill="#555">
          {s === 0 ? "vague" : s === 1 ? "qty or time-bound" : "qty + time-bound"}
        </text>
      ))}
      <text x={W / 2} y={H - 12} textAnchor="middle" fontSize="11" fill="#333">
        ambition strength
      </text>
      {[10, 100, 1000].filter((v) => v <= maxSpend * 1.1).map((v) => (
        <g key={v}>
          <text x={PAD_L - 6} y={yScale(v) + 3} textAnchor="end" fontSize="10" fill="#555">
            {fmtMoney(v)}
          </text>
          <line x1={PAD_L} y1={yScale(v)} x2={W - PAD_R} y2={yScale(v)} stroke="#eee" />
        </g>
      ))}
      <text
        x={14} y={H / 2} textAnchor="middle" fontSize="11" fill="#333"
        transform={`rotate(-90 14 ${H / 2})`}
      >
        aligned spend (log scale)
      </text>
      {ptPositions.map((p) => {
        const jitter = ((p._bucketIdx % 9) - 4) * 11;
        const cx = xBase(p.ambitionScore) + jitter;
        const cy = yScale(p.alignedSpend);
        const r = 4 + Math.min(3, Math.log10(p.alignedProgrammeCount + 1));
        const orphan = p.alignedSpend === 0;
        return (
          <circle
            key={p.targetId}
            cx={cx}
            cy={cy}
            r={r}
            fill={orphan ? "#ddd" : "#0b6bcb"}
            fillOpacity={orphan ? 0.6 : 0.55}
            stroke={orphan ? "#aaa" : "#08407a"}
            strokeWidth={0.7}
          >
            <title>
              {`${p.docId} · ${p.targetId}\n${p.text}…\nAligned spend: ${fmtMoney(p.alignedSpend)} across ${p.alignedProgrammeCount} programmes`}
            </title>
          </circle>
        );
      })}
    </svg>
  );
}

function TargetRowCard({ row }: { row: TargetRow }) {
  const top = row.contributors.slice(0, 4);
  const rest = row.contributors.length - top.length;
  return (
    <div className="border border-gray-200 rounded p-3">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          {row.docId} · {row.targetId}
        </span>
        <span className="tabular-nums text-gray-700">
          {fmtMoney(row.totalSpend)} · {row.contributors.length} aligned prog.
        </span>
      </div>
      <p className="text-xs text-gray-700 mt-1 line-clamp-2">{row.text}</p>
      <ul className="mt-2 space-y-1">
        {top.map((c) => (
          <li key={c.code} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span
                title={LEVEL_LABEL[c.level]}
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: LEVEL_COLOR[c.level] }}
              />
              <span className="truncate">{c.name}</span>
            </span>
            <span className="tabular-nums text-gray-600">{fmtMoney(c.spend)}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className="text-xs text-gray-500">+ {rest} more aligned programme{rest === 1 ? "" : "s"}</li>
        )}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FinancingAlignmentPrototypePage() {
  const result = getCountryDashboardPayload("panama", "en");
  if (result.kind !== "ok") {
    return (
      <main className="p-8">
        <h1 className="text-2xl mb-2">Prototype unavailable</h1>
        <p className="text-sm text-gray-700">{result.error}</p>
      </main>
    );
  }
  const data = result.payload.data;
  const targets = data.targets as Target[];
  const alignment = (data.budgetAlignment ?? []) as AlignmentResult[];
  const berData = data.berData as BerData;

  const docBuckets = perDocumentMoney(targets, alignment, berData);
  const scatterPoints = quadrantScatter(targets, alignment, berData);
  const topRows = perTargetRows(targets, alignment, berData, 30);

  const totalSpend = Object.values(totalSpendByCode(berData)).reduce<number>(
    (s, _) => s, 0,
  );
  // Simpler — use the same sum elsewhere; reduce the Map.
  const totalSpendSum = [...totalSpendByCode(berData).values()].reduce((s, v) => s + v, 0);
  const orphanCount = scatterPoints.filter((p) => p.alignedSpend === 0).length;

  return (
    <main className="max-w-5xl mx-auto p-8 space-y-12">
      <header>
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Prototype · not production · Panama only · EN labels
        </p>
        <h1 className="text-3xl font-semibold">
          Joining policy ambition with actual spending
        </h1>
        <p className="text-gray-700 mt-2 max-w-2xl">
          Three rough sketches for the same question:{" "}
          <em>does Panama's biodiversity spending follow its biodiversity policy ambitions?</em>
          {" "}Each viz joins the existing LLM alignment with programme spend so the money
          and the policy can be read together. Total tracked spend in this BER:{" "}
          <strong>{fmtMoney(totalSpendSum)}</strong> ·{" "}
          alignment confidence is AI-judged semantic coherence (not traced flow).
        </p>
        <p className="text-sm mt-3">
          <Link href="/dashboard?country=panama" className="text-blue-700 underline">
            ← back to dashboard
          </Link>
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold">1 · Per-document money summary</h2>
        <p className="text-sm text-gray-700 mt-1 max-w-2xl">
          For each policy document, total spend of every programme the AI judges
          aligned with at least one of its targets. Each bar is colored by the
          best alignment confidence reached. Direct policymaker readout — no
          flow framing, no implied causality.
        </p>
        <div className="mt-4 border border-gray-200 rounded p-4">
          {docBuckets.map((b) => (
            <StackedBar key={b.docId} bucket={b} maxSpend={Math.max(...docBuckets.map((d) => d.totalSpend), 1)} />
          ))}
          <div className="flex gap-4 mt-3 text-xs text-gray-700">
            {(["high", "medium", "low", "none"] as AlignmentLevel[]).map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: LEVEL_COLOR[l] }} />
                {LEVEL_LABEL[l]}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">2 · Quadrant scatter — ambition vs aligned spend</h2>
        <p className="text-sm text-gray-700 mt-1 max-w-2xl">
          Each dot is one policy target. x-axis: ambition strength (count of{" "}
          <code className="text-xs">isQuantitative</code> + <code className="text-xs">isTimeBound</code>{" "}
          flags). y-axis: total spend of high+medium-aligned programmes, log-scaled.
          Dot size scales with the number of aligned programmes. The headline finding
          is the bottom-right quadrant: high-ambition targets with low or zero aligned
          spend. Currently <strong>{orphanCount}</strong> targets have zero aligned spend.
        </p>
        <div className="mt-4 border border-gray-200 rounded p-4 bg-white">
          <Scatter points={scatterPoints} />
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">3 · Per-target detail rows</h2>
        <p className="text-sm text-gray-700 mt-1 max-w-2xl">
          Top 30 policy targets by aligned spend, with the contributing programmes
          listed underneath. Drill-down view — the unit is the policy ambition, not the
          programme. Use this when a policymaker wants "what's behind this target".
        </p>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {topRows.map((r) => (
            <TargetRowCard key={r.targetId} row={r} />
          ))}
        </div>
      </section>
    </main>
  );
}
