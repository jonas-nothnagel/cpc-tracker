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
  text: string;
  alignedSpend: number;
  alignedProgrammeCount: number;
  kind: FundingKind;
  contributors: Contributor[];
};

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
const LEVEL_COLOR: Record<AlignmentLevel, string> = {
  high: "#0d8a4a", medium: "#7cb342", low: "#fdd835", none: "#bdbdbd", flagged: "#c62828",
};

function fmtMoney(mPab: number): string {
  if (mPab >= 1000) return `${(mPab / 1000).toFixed(1)}B PAB`;
  if (mPab >= 1) return `${mPab.toFixed(0)}M PAB`;
  if (mPab > 0) return `< 1M PAB`;
  return "0";
}

function DocBlock({
  docId,
  rows,
  onHover,
}: {
  docId: string;
  rows: Row[];
  onHover: (r: Row | null) => void;
}) {
  const docSpend = rows.reduce((s, r) => s + r.alignedSpend, 0);
  const counts: Record<FundingKind, number> = {
    "well-funded": 0, "normal": 0, "under-funded": 0, "unfunded": 0,
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
      <div className="flex flex-wrap gap-1" onMouseLeave={() => onHover(null)}>
        {rows.map((r) => (
          <span
            key={r.targetId}
            onMouseEnter={() => onHover(r)}
            onFocus={() => onHover(r)}
            tabIndex={0}
            aria-label={`${r.targetId}: ${KIND_LABEL[r.kind]}, ${fmtMoney(r.alignedSpend)}`}
            className={
              "inline-block w-3 h-3 rounded-full cursor-pointer transition-transform hover:scale-150 focus:scale-150 focus:outline-none " +
              (r.kind === "unfunded" ? "border-2" : "")
            }
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

function HoverPanel({ row }: { row: Row | null }) {
  if (!row) {
    return (
      <div className="border border-gray-200 rounded p-4 bg-gray-50 text-xs text-gray-500">
        Hover or focus any dot to see the target, the funding tier, and the
        programmes the LLM judged aligned with it.
      </div>
    );
  }
  const top = row.contributors.slice(0, 5);
  const rest = row.contributors.length - top.length;
  return (
    <div className="border border-gray-200 rounded p-4 bg-white">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <span className="font-mono text-[11px] text-gray-500">
          {row.targetId.replace(/^panama_/, "")}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-gray-500">
          {row.docId}
        </span>
      </div>
      <span
        className="inline-block text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded mb-2"
        style={{ backgroundColor: KIND_COLOR[row.kind] + "22", color: KIND_COLOR[row.kind] }}
      >
        {KIND_LABEL[row.kind]}
      </span>
      <p className="text-xs text-gray-800 leading-snug">{row.text}</p>
      <div className="mt-3 border-t border-gray-100 pt-2 text-xs">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-gray-600">Aligned spend</span>
          <span className="tabular-nums font-medium text-gray-900">
            {fmtMoney(row.alignedSpend)}
          </span>
        </div>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-gray-600">Aligned programmes</span>
          <span className="tabular-nums font-medium text-gray-900">
            {row.alignedProgrammeCount}
          </span>
        </div>
        {top.length > 0 ? (
          <>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">
              Top contributing programmes
            </p>
            <ul className="space-y-1">
              {top.map((c) => (
                <li key={c.code} className="flex items-start gap-2 text-[11px]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: LEVEL_COLOR[c.level] }}
                    title={c.level}
                  />
                  <span className="flex-1 text-gray-800 leading-snug">{c.name}</span>
                  <span className="tabular-nums text-gray-600 shrink-0">{fmtMoney(c.spend)}</span>
                </li>
              ))}
            </ul>
            {rest > 0 && (
              <p className="mt-1 text-[10px] text-gray-500">
                + {rest} more aligned programme{rest === 1 ? "" : "s"}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-gray-500 italic">
            No high or medium-aligned programmes for this target.
          </p>
        )}
      </div>
    </div>
  );
}

export function FundingDotGrid({ docs }: { docs: { docId: string; rows: Row[] }[] }) {
  const [hovered, setHovered] = useState<Row | null>(null);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="space-y-3">
        {docs.map((d) => (
          <DocBlock key={d.docId} docId={d.docId} rows={d.rows} onHover={setHovered} />
        ))}
      </div>
      <aside className="lg:sticky lg:top-4">
        <HoverPanel row={hovered} />
      </aside>
    </div>
  );
}
