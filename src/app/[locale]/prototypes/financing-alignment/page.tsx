/**
 * Prototype page — outlier-aware target funding view, BTR-style compact.
 * Every policy target rendered as one dot, color-coded by funding tier
 * (well-funded green / normal blue / under-funded amber / unfunded red),
 * grouped by document. Hover any dot for a rich detail panel on the right
 * (target text, funding tier, contributing programmes).
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
import { FundingDotGrid, type Row } from "./dot-grid";

export const metadata = { title: "Prototype: financing alignment | CPC Tracker" };

// ---------------------------------------------------------------------------
// Compute
// ---------------------------------------------------------------------------

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
  // Per policy target: collect the (programme, level) pairs from any
  // high/medium alignment, sorted by spend descending. Each contributor
  // surfaces in the hover panel.
  const contribByPolicy = new Map<string, Row["contributors"]>();
  for (const pair of alignment) {
    const berId = berIdOf(pair);
    const policyId = policyIdOf(pair);
    if (!berId || !policyId) continue;
    const lvl = pair.alignment as AlignmentLevel;
    if (lvl !== "high" && lvl !== "medium") continue;
    const code = berId.replace(/^BER_/, "");
    const list = contribByPolicy.get(policyId) ?? [];
    list.push({
      code,
      name: nameByCode.get(code) ?? code,
      spend: spendByCode.get(code) ?? 0,
      level: lvl,
    });
    contribByPolicy.set(policyId, list);
  }

  type Partial = Omit<Row, "kind">;
  const partial: Partial[] = [];
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    const contribs = (contribByPolicy.get(t.id) ?? []).sort((a, b) => b.spend - a.spend);
    partial.push({
      targetId: t.id,
      docId: t.sourceDocument,
      text: t.text,
      alignedSpend: contribs.reduce((s, c) => s + c.spend, 0),
      alignedProgrammeCount: contribs.length,
      contributors: contribs,
    });
  }
  const nonZero = partial.filter((r) => r.alignedSpend > 0).sort((a, b) => b.alignedSpend - a.alignedSpend);
  const TOP_N = 10;
  const BOTTOM_N = 10;
  const wellSet = new Set(nonZero.slice(0, TOP_N).map((r) => r.targetId));
  const underSet = new Set(
    [...nonZero].sort((a, b) => a.alignedSpend - b.alignedSpend).slice(0, BOTTOM_N).map((r) => r.targetId),
  );
  return partial
    .map<Row>((r) => ({
      ...r,
      kind:
        r.alignedSpend === 0
          ? "unfunded"
          : wellSet.has(r.targetId)
            ? "well-funded"
            : underSet.has(r.targetId)
              ? "under-funded"
              : "normal",
    }))
    .sort((a, b) => b.alignedSpend - a.alignedSpend);
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
  const byDoc = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byDoc.has(r.docId)) byDoc.set(r.docId, []);
    byDoc.get(r.docId)!.push(r);
  }
  const docs = [...byDoc.entries()]
    .map(([docId, docRows]) => ({ docId, rows: docRows }))
    .sort((a, b) =>
      b.rows.reduce((s, r) => s + r.alignedSpend, 0) -
      a.rows.reduce((s, r) => s + r.alignedSpend, 0),
    );

  const wellCount = rows.filter((r) => r.kind === "well-funded").length;
  const underCount = rows.filter((r) => r.kind === "under-funded").length;
  const unfundedCount = rows.filter((r) => r.kind === "unfunded").length;
  const totalAligned = rows.reduce((s, r) => s + r.alignedSpend, 0);

  return (
    <main className="max-w-6xl mx-auto p-8 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Prototype · not production · Panama only · EN labels
        </p>
        <h1 className="text-3xl font-semibold">Which policy targets have money behind them?</h1>
        <p className="text-gray-700 mt-2 max-w-3xl">
          Every Panama biodiversity-policy target as one dot, grouped by document.
          Color marks its funding tier. Hover any dot for the target text, funding
          tier, and the programmes the LLM judged aligned with it. AI-judged
          semantic coherence — not traced material flow.
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
          <p className="text-xs text-gray-500 mt-1">
            {fmtMoney(totalAligned)} aligned spend (sum across targets)
          </p>
        </div>
        <div className="border border-emerald-200 bg-emerald-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-emerald-700">Well-funded</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">{wellCount}</p>
          <p className="text-xs text-emerald-700/80 mt-1">top 10 by aligned spend</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Under-funded</p>
          <p className="text-2xl font-semibold tabular-nums text-amber-700">{underCount}</p>
          <p className="text-xs text-amber-700/80 mt-1">lowest 10 with non-zero spend</p>
        </div>
        <div className="border border-red-200 bg-red-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-red-700">No aligned spend</p>
          <p className="text-2xl font-semibold tabular-nums text-red-700">{unfundedCount}</p>
          <p className="text-xs text-red-700/80 mt-1">no programme judged aligned</p>
        </div>
      </section>

      <FundingDotGrid docs={docs} />
    </main>
  );
}
