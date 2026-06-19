"use client";

/**
 * Funding target grid — the Financing section's evidence panel.
 *
 * Every visible policy target is one dot, grouped by document, color-coded by
 * funding tier (well-funded / normal / under-funded / unfunded). Click a dot
 * to open a sticky detail panel on the right with the target text, contributing
 * programmes, and a per-year aligned-spend bar chart.
 *
 * "Aligned spend" is the sum of executed expenditure across programmes the
 * pipeline judged high- or medium-aligned with this target. AI-judged
 * semantic coherence — not traced material flow.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  FundingTargetContributor,
  FundingTargetRow,
  FundingTier,
} from "@/lib/financing-coherence";
import type { AlignmentLevel } from "@/types";

const TIER_COLOR: Record<FundingTier, string> = {
  "well-funded": "var(--undp-green)",
  "normal": "var(--undp-blue)",
  "under-funded": "var(--undp-yellow)",
  "unfunded": "var(--undp-red)",
};
const LEVEL_COLOR: Record<AlignmentLevel, string> = {
  high: "var(--undp-green)",
  medium: "var(--undp-blue-light)",
  low: "var(--undp-yellow)",
  none: "var(--undp-gray)",
  flagged: "var(--undp-red)",
};

const TEXT_PREVIEW_LEN = 160;

function fmtMoney(value: number, unit: string, currency: string): string {
  // Same unit/currency rules formatBerMoney follows: data ships in `unit`
  // (e.g. "million") of `currency` (e.g. "PAB"). Display in compact form for
  // grid + panel rows.
  const v = value;
  const cur = currency.trim();
  const suffix = cur ? ` ${cur}` : "";
  if (unit === "million") {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}B${suffix}`;
    if (v >= 1) return `${v.toFixed(0)}M${suffix}`;
    if (v > 0) return `< 1M${suffix}`;
    return `0${suffix}`;
  }
  // billion-unit data (e.g. Mongolia MNT): values are already in billions.
  if (v >= 1000) return `${(v / 1000).toFixed(1)}T${suffix}`;
  if (v >= 1) return `${v.toFixed(1)}B${suffix}`;
  if (v >= 0.001) return `${(v * 1000).toFixed(0)}M${suffix}`;
  if (v > 0) return `< 1M${suffix}`;
  return `0${suffix}`;
}

function DocRow({
  docLabel,
  rows,
  selectedId,
  onSelect,
  fmt,
  tierLabel,
}: {
  docLabel: string;
  rows: FundingTargetRow[];
  selectedId: string | null;
  onSelect: (r: FundingTargetRow) => void;
  fmt: (v: number) => string;
  tierLabel: (t: FundingTier) => string;
}) {
  const docSpend = rows.reduce((s, r) => s + r.alignedSpend, 0);
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3 items-center py-2 border-b border-gray-100 last:border-b-0">
      <div>
        <p className="text-[12px] text-[var(--undp-black)] font-medium truncate" title={docLabel}>
          {docLabel}
        </p>
        <p className="text-[10px] tabular-nums text-[var(--undp-gray)]">
          {rows.length} · {fmt(docSpend)}
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
              aria-label={`${r.targetId}: ${tierLabel(r.tier)}, ${fmt(r.alignedSpend)}`}
              aria-pressed={selected}
              className={
                "inline-block w-2.5 h-2.5 rounded-full cursor-pointer transition-transform hover:scale-150 focus:scale-150 focus:outline-none " +
                (r.tier === "unfunded" ? "border " : "") +
                (selected ? "ring-2 ring-offset-1 ring-[var(--undp-black)] scale-150" : "")
              }
              style={r.tier === "unfunded"
                ? { borderColor: TIER_COLOR[r.tier] }
                : { backgroundColor: TIER_COLOR[r.tier] }
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function YearlySpark({
  series,
  fmt,
  label,
}: {
  series: { year: string; value: number }[];
  fmt: (v: number) => string;
  label: string;
}) {
  if (series.length === 0) return null;
  const total = series.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return null;
  const max = Math.max(...series.map((p) => p.value), 0.01);
  const W = 280;
  const H = 50;
  const PAD_T = 4;
  const PAD_B = 14;
  const plotH = H - PAD_T - PAD_B;
  const barGap = 2;
  const barW = (W - barGap * (series.length - 1)) / series.length;
  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)]">{label}</p>
        <p className="text-[10px] text-[var(--undp-gray)]">
          {series[0].year}–{series[series.length - 1].year}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {series.map((p, i) => {
          const x = i * (barW + barGap);
          const h = (p.value / max) * plotH;
          const y = PAD_T + plotH - h;
          return (
            <rect
              key={p.year}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, 1)}
              fill="var(--undp-blue)"
              opacity={0.85}
            >
              <title>{`${p.year}: ${fmt(p.value)}`}</title>
            </rect>
          );
        })}
        {[0, Math.floor(series.length / 2), series.length - 1].map((i) => (
          <text
            key={i}
            x={i * (barW + barGap) + barW / 2}
            y={H - 2}
            textAnchor="middle"
            fontSize="9"
            fill="var(--undp-gray)"
          >
            {series[i].year.slice(2)}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DetailPanel({
  row,
  onClose,
  fmt,
  tierLabel,
  t,
}: {
  row: FundingTargetRow | null;
  onClose: () => void;
  fmt: (v: number) => string;
  tierLabel: (t: FundingTier) => string;
  t: ReturnType<typeof useTranslations<"briefing.financing.targetGrid">>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!row) {
    return (
      <div className="bg-[var(--undp-paper)] border border-gray-100 rounded-lg p-4 text-[12px] leading-relaxed text-[var(--undp-gray)]">
        {t("detail.placeholder")}
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
            {row.targetId.replace(/^panama_|^mongolia_/, "")}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] truncate">
            {row.docLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("detail.close")}
          className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-sm leading-none px-1 shrink-0"
        >
          ✕
        </button>
      </div>
      <span
        className="inline-block text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded mb-2.5"
        style={{ backgroundColor: TIER_COLOR[row.tier] + "1f", color: TIER_COLOR[row.tier] }}
      >
        {tierLabel(row.tier)}
      </span>
      <p className="text-[12px] leading-relaxed text-[var(--undp-black)]">{displayedText}</p>
      {needsTruncation && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 text-[11px] text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline"
        >
          {expanded ? t("detail.showLess") : t("detail.readMore")}
        </button>
      )}
      <div className="mt-3 border-t border-gray-100 pt-2.5 text-[12px]">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-[var(--undp-gray)]">{t("detail.alignedSpend")}</span>
          <span className="tabular-nums font-medium text-[var(--undp-black)]">
            {fmt(row.alignedSpend)}
          </span>
        </div>
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-[var(--undp-gray)]">{t("detail.alignedProgrammes")}</span>
          <span className="tabular-nums font-medium text-[var(--undp-black)]">
            {row.alignedProgrammeCount}
          </span>
        </div>
        <YearlySpark series={row.yearlySpend} fmt={fmt} label={t("detail.spendPerYear")} />
        {top.length > 0 ? (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
              {t("detail.topContributing")}
            </p>
            <ul className="space-y-1.5">
              {top.map((c: FundingTargetContributor) => (
                <li key={c.code} className="flex items-start gap-2 text-[11px]">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ backgroundColor: LEVEL_COLOR[c.level] }}
                    title={c.level}
                  />
                  <span className="flex-1 text-[var(--undp-black)] leading-snug">{c.name}</span>
                  <span className="tabular-nums text-[var(--undp-gray)] shrink-0">{fmt(c.spend)}</span>
                </li>
              ))}
            </ul>
            {rest > 0 && (
              <p className="mt-1.5 text-[10px] text-[var(--undp-gray)]">
                {t("detail.moreProgrammes", { count: rest })}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-[11px] italic text-[var(--undp-gray)]">
            {t("detail.noContributors")}
          </p>
        )}
      </div>
    </div>
  );
}

function ColorLegend({
  tierLabel,
}: {
  tierLabel: (t: FundingTier) => string;
}) {
  const tiers: FundingTier[] = ["well-funded", "normal", "under-funded", "unfunded"];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 px-1 text-[11px] text-[var(--undp-gray)]">
      {tiers.map((tier) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={
              "inline-block w-2.5 h-2.5 rounded-full " +
              (tier === "unfunded" ? "border" : "")
            }
            style={tier === "unfunded"
              ? { borderColor: TIER_COLOR[tier] }
              : { backgroundColor: TIER_COLOR[tier] }
            }
          />
          {tierLabel(tier)}
        </span>
      ))}
    </div>
  );
}

export function FundingTargetGrid({
  docs,
  unit,
  currency,
  totals,
}: {
  docs: { docId: string; docLabel: string; rows: FundingTargetRow[] }[];
  unit: string;
  currency: string;
  totals: {
    reviewed: number;
    wellFunded: number;
    underFunded: number;
    unfunded: number;
  };
}) {
  const t = useTranslations("briefing.financing.targetGrid");
  const [selected, setSelected] = useState<FundingTargetRow | null>(null);
  const fmt = (v: number) => fmtMoney(v, unit, currency);
  const tierLabel = (tier: FundingTier) => t(`tier.${tier}`);

  return (
    <div>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-gray-100 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)]">
            {t("kpi.reviewed")}
          </p>
          <p className="text-2xl font-semibold tabular-nums text-[var(--undp-black)]">
            {totals.reviewed}
          </p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--undp-green)" }}>
            {t("kpi.wellFunded")}
          </p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--undp-green)" }}>
            {totals.wellFunded}
          </p>
          <p className="text-[10px] text-[var(--undp-gray)] mt-1">{t("kpi.wellFundedCaption")}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--undp-yellow)" }}>
            {t("kpi.underFunded")}
          </p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--undp-yellow)" }}>
            {totals.underFunded}
          </p>
          <p className="text-[10px] text-[var(--undp-gray)] mt-1">{t("kpi.underFundedCaption")}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--undp-red)" }}>
            {t("kpi.unfunded")}
          </p>
          <p className="text-2xl font-semibold tabular-nums" style={{ color: "var(--undp-red)" }}>
            {totals.unfunded}
          </p>
          <p className="text-[10px] text-[var(--undp-gray)] mt-1">{t("kpi.unfundedCaption")}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 items-start">
        <div>
          <div className="px-1">
            {docs.map((d) => (
              <DocRow
                key={d.docId}
                docLabel={d.docLabel}
                rows={d.rows}
                selectedId={selected?.targetId ?? null}
                onSelect={setSelected}
                fmt={fmt}
                tierLabel={tierLabel}
              />
            ))}
          </div>
          <ColorLegend tierLabel={tierLabel} />
        </div>
        <aside className="lg:sticky lg:top-4">
          <DetailPanel
            row={selected}
            onClose={() => setSelected(null)}
            fmt={fmt}
            tierLabel={tierLabel}
            t={t}
          />
        </aside>
      </div>
    </div>
  );
}
