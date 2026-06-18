/**
 * Prototype page — single view: every policy target ranked by aligned
 * programme spend. Outliers at the top (unusually well-funded) and bottom
 * (unfunded / unusually under-funded) are visually highlighted so the eye
 * lands on them first. Server-rendered, Panama only, EN-only, no production
 * styling.
 *
 * "Aligned spend" = total executed expenditure of all programmes the LLM
 * judged high- or medium-aligned with this target. Semantic coherence, not
 * traced material flow (per the project guardrail).
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
// Compute
// ---------------------------------------------------------------------------

type Row = {
  targetId: string;
  docId: string;
  text: string;
  alignedSpend: number;
  alignedProgrammeCount: number;
  topProgramme: { code: string; name: string; spend: number; level: AlignmentLevel } | null;
};

function berIdOf(p: AlignmentResult): string | null {
  if (p.targetAId.startsWith("BER_")) return p.targetAId;
  if (p.targetBId.startsWith("BER_")) return p.targetBId;
  return null;
}
function policyIdOf(p: AlignmentResult): string | null {
  if (p.targetAId.startsWith("BER_")) return p.targetBId;
  if (p.targetBId.startsWith("BER_")) return p.targetAId;
  return null;
}

function fmtMoney(mPab: number): string {
  if (mPab >= 1000) return `${(mPab / 1000).toFixed(1)}B PAB`;
  if (mPab >= 1) return `${mPab.toFixed(0)}M PAB`;
  if (mPab > 0) return `< 1M PAB`;
  return "0";
}

function buildRows(
  targets: Target[],
  alignment: AlignmentResult[],
  berData: BerData,
): Row[] {
  // Programme code → total spend (sum of yearly values).
  const spendByCode = new Map<string, number>();
  for (const e of berData.expenditure) {
    const total = Object.values(e.values).reduce<number>(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0,
    );
    spendByCode.set(e.code, total);
  }
  const nameByCode = new Map<string, string>();
  for (const p of berData.programs) {
    nameByCode.set(p.code, (p as { nameEn?: string }).nameEn ?? p.name);
  }
  // Policy target id → list of (programme, level) pairs.
  const byPolicy = new Map<string, { code: string; level: AlignmentLevel }[]>();
  for (const pair of alignment) {
    const berId = berIdOf(pair);
    const policyId = policyIdOf(pair);
    if (!berId || !policyId) continue;
    const lvl = pair.alignment as AlignmentLevel;
    if (lvl !== "high" && lvl !== "medium") continue;
    const code = berId.replace(/^BER_/, "");
    const list = byPolicy.get(policyId) ?? [];
    list.push({ code, level: lvl });
    byPolicy.set(policyId, list);
  }

  const rows: Row[] = [];
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    const aligned = byPolicy.get(t.id) ?? [];
    const enriched = aligned
      .map((a) => ({
        code: a.code,
        name: nameByCode.get(a.code) ?? a.code,
        spend: spendByCode.get(a.code) ?? 0,
        level: a.level,
      }))
      .sort((a, b) => b.spend - a.spend);
    const total = enriched.reduce((s, c) => s + c.spend, 0);
    rows.push({
      targetId: t.id,
      docId: t.sourceDocument,
      text: t.text,
      alignedSpend: total,
      alignedProgrammeCount: enriched.length,
      topProgramme: enriched[0] ?? null,
    });
  }
  rows.sort((a, b) => b.alignedSpend - a.alignedSpend);
  return rows;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

type RowKind = "well-funded" | "normal" | "under-funded" | "unfunded";

function classifyRow(rows: Row[]): Map<string, RowKind> {
  const out = new Map<string, RowKind>();
  // Top 10 → well-funded (unusually large). Zero → unfunded. Bottom 10 of the
  // non-zero set → under-funded. Rest → normal.
  const nonZero = rows.filter((r) => r.alignedSpend > 0);
  const topThreshold = nonZero.length >= 10 ? nonZero[9].alignedSpend : 0;
  const sortedAsc = [...nonZero].sort((a, b) => a.alignedSpend - b.alignedSpend);
  const bottomSet = new Set(sortedAsc.slice(0, Math.min(10, sortedAsc.length)).map((r) => r.targetId));
  for (const r of rows) {
    if (r.alignedSpend === 0) {
      out.set(r.targetId, "unfunded");
    } else if (r.alignedSpend >= topThreshold) {
      out.set(r.targetId, "well-funded");
    } else if (bottomSet.has(r.targetId)) {
      out.set(r.targetId, "under-funded");
    } else {
      out.set(r.targetId, "normal");
    }
  }
  return out;
}

const KIND_STYLE: Record<RowKind, { row: string; bar: string; badge: string | null }> = {
  "well-funded": {
    row: "bg-emerald-50 border-l-4 border-emerald-500",
    bar: "bg-emerald-500",
    badge: "Unusually well-funded",
  },
  "normal": {
    row: "bg-white border-l-4 border-transparent",
    bar: "bg-blue-300",
    badge: null,
  },
  "under-funded": {
    row: "bg-amber-50 border-l-4 border-amber-500",
    bar: "bg-amber-400",
    badge: "Unusually under-funded",
  },
  "unfunded": {
    row: "bg-red-50 border-l-4 border-red-400",
    bar: "bg-red-200",
    badge: "No aligned spend",
  },
};

function RowItem({ row, kind, maxSpend }: { row: Row; kind: RowKind; maxSpend: number }) {
  const style = KIND_STYLE[kind];
  const widthPct = maxSpend > 0 ? Math.max(0, (row.alignedSpend / maxSpend) * 100) : 0;
  return (
    <div className={`px-3 py-2 ${style.row}`}>
      <div className="flex items-baseline gap-3 text-sm">
        <span className="font-mono text-[11px] text-gray-500 shrink-0 w-20 truncate">
          {row.targetId.replace(/^panama_/, "")}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500 shrink-0 w-16">
          {row.docId}
        </span>
        <span className="flex-1 truncate text-gray-800">{row.text}</span>
        <span className="tabular-nums font-medium text-gray-800 w-24 text-right shrink-0">
          {fmtMoney(row.alignedSpend)}
        </span>
        <span className="text-xs text-gray-500 w-20 text-right tabular-nums shrink-0">
          {row.alignedProgrammeCount} prog.
        </span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
          {row.alignedSpend > 0 && (
            <div className={`h-full ${style.bar}`} style={{ width: `${widthPct}%` }} />
          )}
        </div>
        {style.badge && (
          <span className="text-[10px] uppercase tracking-wide font-medium text-gray-700 shrink-0">
            {style.badge}
          </span>
        )}
      </div>
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

  const rows = buildRows(targets, alignment, berData);
  const kinds = classifyRow(rows);
  const maxSpend = Math.max(...rows.map((r) => r.alignedSpend), 1);

  const wellFundedCount = [...kinds.values()].filter((k) => k === "well-funded").length;
  const unfundedCount = [...kinds.values()].filter((k) => k === "unfunded").length;
  const underFundedCount = [...kinds.values()].filter((k) => k === "under-funded").length;
  const totalAligned = rows.reduce((s, r) => s + r.alignedSpend, 0);
  const medianSpend = (() => {
    const nonZero = rows.filter((r) => r.alignedSpend > 0).map((r) => r.alignedSpend).sort((a, b) => a - b);
    if (nonZero.length === 0) return 0;
    const mid = Math.floor(nonZero.length / 2);
    return nonZero.length % 2 === 0 ? (nonZero[mid - 1] + nonZero[mid]) / 2 : nonZero[mid];
  })();

  return (
    <main className="max-w-5xl mx-auto p-8 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Prototype · not production · Panama only · EN labels
        </p>
        <h1 className="text-3xl font-semibold">Which policy targets have money behind them?</h1>
        <p className="text-gray-700 mt-2 max-w-3xl">
          Every Panama biodiversity-policy target, ranked by total spend across
          programmes the LLM judges high- or medium-aligned. Outliers are highlighted:
          unusually well-funded (top 10) in green, unusually under-funded (lowest
          10 with non-zero spend) in amber, and targets with no aligned spend at
          all in red. AI-judged semantic coherence — not traced material flow.
        </p>
        <p className="text-sm mt-3">
          <Link href="/dashboard?country=panama" className="text-blue-700 underline">
            ← back to dashboard
          </Link>
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-gray-200 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Targets reviewed</p>
          <p className="text-2xl font-semibold tabular-nums">{rows.length}</p>
        </div>
        <div className="border border-emerald-200 bg-emerald-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Well-funded</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">{wellFundedCount}</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Under-funded</p>
          <p className="text-2xl font-semibold tabular-nums text-amber-700">{underFundedCount}</p>
        </div>
        <div className="border border-red-200 bg-red-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-red-700">No aligned spend</p>
          <p className="text-2xl font-semibold tabular-nums text-red-700">{unfundedCount}</p>
        </div>
      </section>

      <section className="border border-gray-200 rounded text-xs text-gray-600 px-3 py-2">
        Median aligned spend per funded target:{" "}
        <strong className="text-gray-800">{fmtMoney(medianSpend)}</strong> · Sum of
        all aligned spend across all targets:{" "}
        <strong className="text-gray-800">{fmtMoney(totalAligned)}</strong> (note:
        the same programme can be aligned to many targets, so this sum is much
        larger than the 815M PAB BER total).
      </section>

      <section className="border border-gray-200 rounded overflow-hidden divide-y divide-gray-100">
        {rows.map((r) => (
          <RowItem
            key={r.targetId}
            row={r}
            kind={kinds.get(r.targetId)!}
            maxSpend={maxSpend}
          />
        ))}
      </section>
    </main>
  );
}
