"use client";

import { useState } from "react";

export type AlignmentLevel = "high" | "medium" | "low" | "none" | "flagged";
export type FundingKind = "well-funded" | "normal" | "under-funded" | "unfunded";

export type Contributor = {
  code: string;
  name: string;
  spend: number;
  level: AlignmentLevel;
};

export type Row = {
  targetId: string;
  docId: string;
  docLabel: string;
  text: string;
  alignedSpend: number;
  alignedProgrammeCount: number;
  kind: FundingKind;
  contributors: Contributor[];
  /** Year-by-year aligned spend (M PAB), summed across this target's
   *  contributing programmes. Years ascending. */
  yearlySpend: { year: string; value: number }[];
};

const KIND_COLOR: Record<FundingKind, string> = {
  "well-funded": "var(--undp-green)",
  "normal": "var(--undp-blue)",
  "under-funded": "var(--undp-yellow)",
  "unfunded": "var(--undp-red)",
};
const KIND_LABEL: Record<FundingKind, string> = {
  "well-funded": "Well-funded",
  "normal": "Funded",
  "under-funded": "Under-funded",
  "unfunded": "No aligned spend",
};
const LEVEL_COLOR: Record<AlignmentLevel, string> = {
  high: "var(--undp-green)",
  medium: "var(--undp-blue-light)",
  low: "var(--undp-yellow)",
  none: "var(--undp-gray)",
  flagged: "var(--undp-red)",
};

const TEXT_PREVIEW_LEN = 160;

function fmtMoney(mPab: number): string {
  if (mPab >= 1000) return `${(mPab / 1000).toFixed(1)}B PAB`;
  if (mPab >= 1) return `${mPab.toFixed(0)}M PAB`;
  if (mPab > 0) return `< 1M PAB`;
  return "0";
}

function DocRow({
  docId,
  docLabel,
  rows,
  selectedId,
  onSelect,
}: {
  docId: string;
  docLabel: string;
  rows: Row[];
  selectedId: string | null;
  onSelect: (r: Row) => void;
}) {
  const docSpend = rows.reduce((s, r) => s + r.alignedSpend, 0);
  return (
    <div className="grid grid-cols-[200px_1fr] gap-3 items-center py-2 border-b border-gray-100 last:border-b-0">
      <div>
        <p className="text-[12px] text-[var(--undp-black)] font-medium truncate" title={docLabel}>
          {docLabel}
        </p>
        <p className="text-[10px] tabular-nums text-[var(--undp-gray)]">
          {rows.length} · {fmtMoney(docSpend)}
        </p>
      </div>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => {
          const selected = r.targetId === selectedId;
          return (
            <button
              key={r.targetId}
              type="button"
              onClick={() => onSelect(r)}
              aria-label={`${r.targetId}: ${KIND_LABEL[r.kind]}, ${fmtMoney(r.alignedSpend)}`}
              aria-pressed={selected}
              className={
                "inline-block w-2.5 h-2.5 rounded-full cursor-pointer transition-transform hover:scale-150 focus:scale-150 focus:outline-none " +
                (r.kind === "unfunded" ? "border " : "") +
                (selected ? "ring-2 ring-offset-1 ring-[var(--undp-black)] scale-150" : "")
              }
              style={r.kind === "unfunded"
                ? { borderColor: KIND_COLOR[r.kind] }
                : { backgroundColor: KIND_COLOR[r.kind] }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function trendDirection(series: { year: string; value: number }[]): "up" | "down" | "flat" {
  // Compare the average of the first 3 years to the last 3 years. Robust to
  // year-to-year noise and to "programme came online mid-period" cases that
  // a 2015-vs-2024 single-point comparison gets wrong. Threshold ±30% so a
  // small wiggle reads as flat.
  if (series.length < 4) return "flat";
  const n = Math.min(3, Math.floor(series.length / 2));
  const head = series.slice(0, n).reduce((s, p) => s + p.value, 0) / n;
  const tail = series.slice(-n).reduce((s, p) => s + p.value, 0) / n;
  // Both near-zero: nothing's happening either side. Calling it "rising"
  // because one of three early years had a stray 0.1M is the bug we are
  // fixing.
  if (head < 0.5 && tail < 0.5) return "flat";
  if (head <= 0) return tail > 0.5 ? "up" : "flat";
  const ratio = tail / head;
  if (ratio > 1.3) return "up";
  if (ratio < 0.7) return "down";
  return "flat";
}

function YearlySpark({ series }: { series: { year: string; value: number }[] }) {
  if (series.length === 0) return null;
  const total = series.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const max = Math.max(...series.map((p) => p.value), 0.01);
  const W = 280;
  const H = 50;
  const PAD_L = 0;
  const PAD_R = 0;
  const PAD_T = 4;
  const PAD_B = 14;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const barGap = 2;
  const barW = (plotW - barGap * (series.length - 1)) / series.length;
  const dir = trendDirection(series);
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)]">
          Spend per year
        </p>
        <p className="text-[10px] text-[var(--undp-gray)]">
          {series[0].year}–{series[series.length - 1].year}
          {" · "}
          <span
            style={{
              color: dir === "up"
                ? "var(--undp-green)"
                : dir === "down"
                  ? "var(--undp-red)"
                  : "var(--undp-gray)",
            }}
          >
            {dir === "up" ? "↑ rising" : dir === "down" ? "↓ falling" : "→ flat"}
          </span>
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {series.map((p, i) => {
          const x = PAD_L + i * (barW + barGap);
          const h = (p.value / max) * plotH;
          const y = PAD_T + plotH - h;
          return (
            <g key={p.year}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                fill="var(--undp-blue)"
                opacity={0.85}
              >
                <title>{`${p.year}: ${p.value < 1 ? "< 1" : Math.round(p.value)}M PAB`}</title>
              </rect>
            </g>
          );
        })}
        {/* Year labels on the first / middle / last bar to keep the chart
            readable without crowding. */}
        {[0, Math.floor(series.length / 2), series.length - 1].map((i) => {
          const x = PAD_L + i * (barW + barGap) + barW / 2;
          return (
            <text
              key={i}
              x={x}
              y={H - 2}
              textAnchor="middle"
              fontSize="9"
              fill="var(--undp-gray)"
            >
              {series[i].year.slice(2)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function HoverPanel({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);

  if (!row) {
    return (
      <div className="bg-[var(--undp-paper)] border border-gray-100 rounded-lg p-4 text-[12px] leading-relaxed text-[var(--undp-gray)]">
        Click any dot to see the target, the funding tier, and the programmes
        the LLM judged aligned with it.
      </div>
    );
  }

  const top = row.contributors.slice(0, 5);
  const rest = row.contributors.length - top.length;
  const needsTruncation = row.text.length > TEXT_PREVIEW_LEN;
  const displayedText = expanded || !needsTruncation
    ? row.text
    : row.text.slice(0, TEXT_PREVIEW_LEN).trimEnd() + "…";

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-[10px] text-[var(--undp-gray)] truncate">
            {row.targetId.replace(/^panama_/, "")}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] truncate">
            {row.docLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close target details"
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-sm leading-none px-1 shrink-0"
        >
          ✕
        </button>
      </div>
      <span
        className="inline-block text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded mb-2.5"
        style={{ backgroundColor: KIND_COLOR[row.kind] + "1f", color: KIND_COLOR[row.kind] }}
      >
        {KIND_LABEL[row.kind]}
      </span>
      <p className="text-[12px] leading-relaxed text-[var(--undp-black)]">{displayedText}</p>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
      <div className="mt-3 border-t border-gray-100 pt-2.5 text-[12px]">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[var(--undp-gray)]">Aligned spend</span>
          <span className="tabular-nums font-medium text-[var(--undp-black)]">
            {fmtMoney(row.alignedSpend)}
          </span>
        </div>
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-[var(--undp-gray)]">Aligned programmes</span>
          <span className="tabular-nums font-medium text-[var(--undp-black)]">
            {row.alignedProgrammeCount}
          </span>
        </div>
        <YearlySpark series={row.yearlySpend} />
        {top.length > 0 ? (
          <>
            <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
              Top contributing programmes
            </p>
            <ul className="space-y-1.5">
              {top.map((c) => (
                <li key={c.code} className="flex items-start gap-2 text-[11px]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: LEVEL_COLOR[c.level] }}
                    title={c.level}
                  />
                  <span className="flex-1 text-[var(--undp-black)] leading-snug">{c.name}</span>
                  <span className="tabular-nums text-[var(--undp-gray)] shrink-0">{fmtMoney(c.spend)}</span>
                </li>
              ))}
            </ul>
            {rest > 0 && (
              <p className="mt-1.5 text-[10px] text-[var(--undp-gray)]">
                + {rest} more aligned programme{rest === 1 ? "" : "s"}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] italic text-[var(--undp-gray)]">
            No high or medium-aligned programmes for this target.
          </p>
        )}
      </div>
    </div>
  );
}

function ColorLegend() {
  const items: { kind: FundingKind; label: string }[] = [
    { kind: "well-funded", label: "Well-funded (at or above the top-10 threshold)" },
    { kind: "normal", label: "Funded" },
    { kind: "under-funded", label: "Under-funded (at or below the bottom-10 threshold)" },
    { kind: "unfunded", label: "No aligned spend" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 px-1 text-[11px] text-[var(--undp-gray)]">
      {items.map(({ kind, label }) => (
        <span key={kind} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={
              "inline-block w-2.5 h-2.5 rounded-full " +
              (kind === "unfunded" ? "border" : "")
            }
            style={kind === "unfunded"
              ? { borderColor: KIND_COLOR[kind] }
              : { backgroundColor: KIND_COLOR[kind] }
            }
          />
          {label}
        </span>
      ))}
    </div>
  );
}

export function FundingDotGrid({
  docs,
}: {
  docs: { docId: string; docLabel: string; rows: Row[] }[];
}) {
  const [selected, setSelected] = useState<Row | null>(null);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div>
        <div className="px-1">
          {docs.map((d) => (
            <DocRow
              key={d.docId}
              docId={d.docId}
              docLabel={d.docLabel}
              rows={d.rows}
              selectedId={selected?.targetId ?? null}
              onSelect={setSelected}
            />
          ))}
        </div>
        <ColorLegend />
      </div>
      <aside className="lg:sticky lg:top-4">
        <HoverPanel row={selected} onClose={() => setSelected(null)} />
      </aside>
    </div>
  );
}
