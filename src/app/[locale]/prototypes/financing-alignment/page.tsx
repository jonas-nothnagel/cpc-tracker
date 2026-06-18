/**
 * Prototype page — outlier-aware target funding view, BTR-style compact.
 * Every policy target rendered as one dot, color-coded by funding tier
 * (well-funded green / normal blue / under-funded amber / unfunded red).
 * Grouped by document. Hover any dot for target + amount.
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

type FundingKind = "well-funded" | "normal" | "under-funded" | "unfunded";

type Row = {
  targetId: string;
  docId: string;
  text: string;
  alignedSpend: number;
  alignedProgrammeCount: number;
  kind: FundingKind;
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
  const spendByCode = new Map<string, number>();
  for (const e of berData.expenditure) {
    const total = Object.values(e.values).reduce<number>(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0,
    );
    spendByCode.set(e.code, total);
  }
  const byPolicy = new Map<string, number>();
  for (const pair of alignment) {
    const berId = berIdOf(pair);
    const policyId = policyIdOf(pair);
    if (!berId || !policyId) continue;
    const lvl = pair.alignment as AlignmentLevel;
    if (lvl !== "high" && lvl !== "medium") continue;
    const code = berId.replace(/^BER_/, "");
    const spend = spendByCode.get(code) ?? 0;
    byPolicy.set(policyId, (byPolicy.get(policyId) ?? 0) + spend);
  }
  const countByPolicy = new Map<string, number>();
  for (const pair of alignment) {
    const policyId = policyIdOf(pair);
    if (!policyId) continue;
    const lvl = pair.alignment as AlignmentLevel;
    if (lvl !== "high" && lvl !== "medium") continue;
    countByPolicy.set(policyId, (countByPolicy.get(policyId) ?? 0) + 1);
  }

  const partial: Omit<Row, "kind">[] = [];
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    partial.push({
      targetId: t.id,
      docId: t.sourceDocument,
      text: t.text,
      alignedSpend: byPolicy.get(t.id) ?? 0,
      alignedProgrammeCount: countByPolicy.get(t.id) ?? 0,
    });
  }
  // Classify outliers across the full target set (not per-doc).
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

const KIND_COLOR: Record<FundingKind, string> = {
  "well-funded": "#0d8a4a",
  "normal": "#7aa9e0",
  "under-funded": "#e0a020",
  "unfunded": "#c62828",
};
const KIND_LABEL: Record<FundingKind, string> = {
  "well-funded": "Well-funded (top 10)",
  "normal": "Funded",
  "under-funded": "Under-funded (bottom 10)",
  "unfunded": "No aligned spend",
};

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function DocBlock({ docId, rows }: { docId: string; rows: Row[] }) {
  const docSpend = rows.reduce((s, r) => s + r.alignedSpend, 0);
  const counts: Record<FundingKind, number> = {
    "well-funded": 0,
    "normal": 0,
    "under-funded": 0,
    "unfunded": 0,
  };
  for (const r of rows) counts[r.kind] += 1;
  return (
    <div className="border border-gray-200 rounded p-3">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-sm font-medium text-gray-900">{docId}</span>
        <span className="text-xs tabular-nums text-gray-600">
          {rows.length} targets · {fmtMoney(docSpend)} aligned spend
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <span
            key={r.targetId}
            title={`${r.targetId} · ${KIND_LABEL[r.kind]}\n${fmtMoney(r.alignedSpend)} across ${r.alignedProgrammeCount} programme${r.alignedProgrammeCount === 1 ? "" : "s"}\n${r.text.slice(0, 200)}${r.text.length > 200 ? "…" : ""}`}
            aria-label={`${r.targetId}: ${KIND_LABEL[r.kind]}, ${fmtMoney(r.alignedSpend)}`}
            className={r.kind === "unfunded" ? "inline-block w-3 h-3 rounded-full border-2" : "inline-block w-3 h-3 rounded-full"}
            style={r.kind === "unfunded"
              ? { borderColor: KIND_COLOR[r.kind] }
              : { backgroundColor: KIND_COLOR[r.kind] }
            }
          />
        ))}
      </div>
      <div className="mt-2 flex gap-3 text-[11px] text-gray-600 tabular-nums">
        {counts["well-funded"] > 0 && (
          <span style={{ color: KIND_COLOR["well-funded"] }}>● {counts["well-funded"]} well</span>
        )}
        <span style={{ color: KIND_COLOR["normal"] }}>● {counts["normal"]} funded</span>
        {counts["under-funded"] > 0 && (
          <span style={{ color: KIND_COLOR["under-funded"] }}>● {counts["under-funded"]} under</span>
        )}
        {counts["unfunded"] > 0 && (
          <span style={{ color: KIND_COLOR["unfunded"] }}>○ {counts["unfunded"]} unfunded</span>
        )}
      </div>
    </div>
  );
}

function OutlierList({
  title,
  rows,
  emptyNote,
  color,
}: {
  title: string;
  rows: Row[];
  emptyNote: string;
  color: string;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide mb-2" style={{ color }}>
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">{emptyNote}</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.targetId} className="text-xs">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] text-gray-500 shrink-0">
                  {r.targetId.replace(/^panama_/, "")}
                </span>
                <span className="tabular-nums text-gray-700 shrink-0">{fmtMoney(r.alignedSpend)}</span>
              </div>
              <p className="text-gray-700 line-clamp-2">{r.text}</p>
            </li>
          ))}
        </ul>
      )}
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
  const byDoc = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byDoc.has(r.docId)) byDoc.set(r.docId, []);
    byDoc.get(r.docId)!.push(r);
  }
  const docs = [...byDoc.entries()].sort((a, b) =>
    b[1].reduce((s, r) => s + r.alignedSpend, 0) -
    a[1].reduce((s, r) => s + r.alignedSpend, 0),
  );

  const wellFunded = rows.filter((r) => r.kind === "well-funded");
  const underFunded = rows.filter((r) => r.kind === "under-funded");
  const unfunded = rows.filter((r) => r.kind === "unfunded");

  return (
    <main className="max-w-5xl mx-auto p-8 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-gray-500 mb-1">
          Prototype · not production · Panama only · EN labels
        </p>
        <h1 className="text-3xl font-semibold">Which policy targets have money behind them?</h1>
        <p className="text-gray-700 mt-2 max-w-3xl">
          Every Panama biodiversity-policy target as one dot, grouped by document.
          Color marks its funding tier. Hover any dot for the target and the amount.
          AI-judged semantic coherence — not traced material flow.
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
          <p className="text-2xl font-semibold tabular-nums text-emerald-700">{wellFunded.length}</p>
        </div>
        <div className="border border-amber-200 bg-amber-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-amber-700">Under-funded</p>
          <p className="text-2xl font-semibold tabular-nums text-amber-700">{underFunded.length}</p>
        </div>
        <div className="border border-red-200 bg-red-50 rounded p-3">
          <p className="text-xs uppercase tracking-wide text-red-700">No aligned spend</p>
          <p className="text-2xl font-semibold tabular-nums text-red-700">{unfunded.length}</p>
        </div>
      </section>

      <section className="space-y-3">
        {docs.map(([docId, docRows]) => (
          <DocBlock key={docId} docId={docId} rows={docRows} />
        ))}
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-200">
        <OutlierList
          title="Well-funded (top 10)"
          rows={wellFunded}
          emptyNote="None."
          color={KIND_COLOR["well-funded"]}
        />
        <OutlierList
          title="Under-funded (bottom 10)"
          rows={underFunded}
          emptyNote="None."
          color={KIND_COLOR["under-funded"]}
        />
        <OutlierList
          title={`No aligned spend (${unfunded.length})`}
          rows={unfunded}
          emptyNote="Every target has at least one aligned programme."
          color={KIND_COLOR["unfunded"]}
        />
      </section>
    </main>
  );
}
