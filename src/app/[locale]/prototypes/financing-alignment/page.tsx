/**
 * Prototype page — outlier-aware target funding view, BTR-style compact.
 * Every policy target rendered as one dot, color-coded by funding tier
 * (well-funded / normal / under-funded / unfunded), grouped by document.
 * Filters to the same document set the financing visualization uses (drops
 * defaultHiddenDocTypes + excludedDocTypes from countryConfig).
 *
 * "Aligned spend" = total executed expenditure of all programmes the LLM
 * judged high- or medium-aligned with this target. Semantic coherence, not
 * traced material flow (per the project guardrail).
 */
import Link from "next/link";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";
import { getDocMediumLabel } from "@/lib/utils";
import type {
  AlignmentLevel,
  AlignmentResult,
  BerData,
  CountryConfig,
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
  countryConfig: CountryConfig | null,
  visibleDocIds: Set<string>,
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
    if (!visibleDocIds.has(t.sourceDocument)) continue;
    const contribs = (contribByPolicy.get(t.id) ?? []).sort((a, b) => b.spend - a.spend);
    partial.push({
      targetId: t.id,
      docId: t.sourceDocument,
      docLabel: getDocMediumLabel(countryConfig, t.sourceDocument),
      text: t.text,
      alignedSpend: contribs.reduce((s, c) => s + c.spend, 0),
      alignedProgrammeCount: contribs.length,
      contributors: contribs,
    });
  }
  // Tie-aware classification: round each spend to the displayed precision
  // (1M PAB) before ranking, so two targets that read as "713M" in the UI
  // always get the same colour even if the raw float differs at the 5th
  // decimal. Pick the cutoff spend at rank TOP_N (or BOTTOM_N), then tag
  // every target at or beyond that rounded value.
  const round1M = (v: number) => Math.round(v);
  const desc = [...partial]
    .filter((r) => r.alignedSpend > 0)
    .sort((a, b) => b.alignedSpend - a.alignedSpend);
  const TOP_N = 10;
  const BOTTOM_N = 10;
  const topCutoff = desc.length >= TOP_N ? round1M(desc[TOP_N - 1].alignedSpend) : 0;
  const bottomCutoff = desc.length >= BOTTOM_N
    ? round1M([...desc].reverse()[BOTTOM_N - 1].alignedSpend)
    : Infinity;
  return partial
    .map<Row>((r) => {
      const rounded = round1M(r.alignedSpend);
      let kind: Row["kind"];
      if (r.alignedSpend === 0) kind = "unfunded";
      else if (rounded >= topCutoff) kind = "well-funded";
      else if (rounded <= bottomCutoff) kind = "under-funded";
      else kind = "normal";
      return { ...r, kind };
    })
    .sort((a, b) => b.alignedSpend - a.alignedSpend);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function FinancingAlignmentPrototypePage() {
  const result = getCountryDashboardPayload("panama", "en");
  if (result.kind !== "ok") {
    return (
      <main className="p-8 bg-[var(--undp-paper)] min-h-screen">
        <h1 className="text-2xl mb-2 text-[var(--undp-black)]">Prototype unavailable</h1>
        <p className="text-sm text-[var(--undp-gray)]">{result.error}</p>
      </main>
    );
  }
  const data = result.payload.data;
  const targets = data.targets as Target[];
  const alignment = (data.budgetAlignment ?? []) as AlignmentResult[];
  const berData = data.berData as BerData;
  const countryConfig = (data.countryConfig as CountryConfig | null) ?? null;

  // Match the financing-coherence document set: drop defaultHiddenDocTypes
  // (ENR for Panama — 206-target REDD+ corpus that skews everything) and
  // excludedDocTypes (CNR for Panama). Same filter applied in the dashboard's
  // financing surfaces.
  const hidden = new Set([
    ...(countryConfig?.defaultHiddenDocTypes ?? []),
    ...(countryConfig?.excludedDocTypes ?? []),
  ]);
  const declaredDocs = (countryConfig?.documentTypes ?? []).map((d) => d.id);
  const visibleDocIds = new Set(declaredDocs.filter((id) => !hidden.has(id)));

  const rows = buildRows(targets, alignment, berData, countryConfig, visibleDocIds);
  const byDoc = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byDoc.has(r.docId)) byDoc.set(r.docId, []);
    byDoc.get(r.docId)!.push(r);
  }
  // Preserve countryConfig's declared doc order rather than sorting by spend
  // — matches the financing viz's stable per-doc order.
  const docs = declaredDocs
    .filter((id) => byDoc.has(id))
    .map((docId) => ({
      docId,
      docLabel: getDocMediumLabel(countryConfig, docId),
      rows: byDoc.get(docId)!,
    }));

  const wellCount = rows.filter((r) => r.kind === "well-funded").length;
  const underCount = rows.filter((r) => r.kind === "under-funded").length;
  const unfundedCount = rows.filter((r) => r.kind === "unfunded").length;
  const totalAligned = rows.reduce((s, r) => s + r.alignedSpend, 0);

  return (
    <main className="bg-[var(--undp-paper)] min-h-screen">
      <div className="max-w-6xl mx-auto p-8 space-y-6">
        <header>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1.5">
            Prototype · not production · Panama only · EN labels
          </p>
          <h1 className="text-3xl font-semibold text-[var(--undp-black)]">
            Which policy targets have money behind them?
          </h1>
          <p className="text-[13px] leading-relaxed text-[var(--undp-gray)] mt-2 max-w-prose">
            Every Panama biodiversity-policy target as one dot, grouped by document.
            Color marks its funding tier. Click any dot to open the detail panel
            with the target text and the programmes the LLM judged aligned with
            it. AI-judged semantic coherence — not traced material flow.
          </p>
          <p className="text-[12px] mt-3">
            <Link
              href="/dashboard?country=panama"
              className="text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline"
            >
              ← back to dashboard
            </Link>
          </p>
        </header>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)]">
              Targets reviewed
            </p>
            <p className="text-2xl font-semibold tabular-nums text-[var(--undp-black)]">
              {rows.length}
            </p>
            <p className="text-[11px] text-[var(--undp-gray)] mt-1">
              {fmtMoney(totalAligned)} aligned spend
            </p>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--undp-green)" }}>
              Well-funded
            </p>
            <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--undp-green)" }}>
              {wellCount}
            </p>
            <p className="text-[11px] text-[var(--undp-gray)] mt-1">≥ top-10 spend threshold</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--undp-yellow)" }}>
              Under-funded
            </p>
            <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--undp-yellow)" }}>
              {underCount}
            </p>
            <p className="text-[11px] text-[var(--undp-gray)] mt-1">≤ bottom-10 spend threshold</p>
          </div>
          <div className="bg-white border border-gray-100 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--undp-red)" }}>
              No aligned spend
            </p>
            <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--undp-red)" }}>
              {unfundedCount}
            </p>
            <p className="text-[11px] text-[var(--undp-gray)] mt-1">no programme judged aligned</p>
          </div>
        </section>

        <FundingDotGrid docs={docs} />
      </div>
    </main>
  );
}
