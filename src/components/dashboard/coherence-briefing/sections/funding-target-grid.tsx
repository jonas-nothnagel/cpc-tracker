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

import { useEffect, useState } from "react";
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
  useEffect(() => {
    setExpanded(false);
  }, [row?.targetId]);
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

/** Group contributors by locale-picked institution; sort groups by
 *  aggregate spend descending, and programmes within each group by spend
 *  descending. Contributors with an empty institution collapse into a
 *  single fallback bucket. */
function groupContributorsByInstitution(
  contribs: FundingTargetContributor[],
  otherLabel: string,
): { institution: string; subtotal: number; programmes: FundingTargetContributor[] }[] {
  const byInst = new Map<string, FundingTargetContributor[]>();
  for (const c of contribs) {
    const key = c.institution && c.institution.length > 0 ? c.institution : otherLabel;
    const list = byInst.get(key) ?? [];
    list.push(c);
    byInst.set(key, list);
  }
  return [...byInst.entries()]
    .map(([institution, programmes]) => {
      const sorted = [...programmes].sort((a, b) => b.spend - a.spend);
      const subtotal = sorted.reduce((s, p) => s + p.spend, 0);
      return { institution, subtotal, programmes: sorted };
    })
    .sort((a, b) => b.subtotal - a.subtotal || a.institution.localeCompare(b.institution));
}

function ContributorRow({
  c,
  fmt,
  expanded,
  onToggle,
  t,
}: {
  c: FundingTargetContributor;
  fmt: (v: number) => string;
  expanded: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useTranslations<"briefing.financing.targetGrid">>;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`prog-${c.code}-detail`}
        className={
          "w-full flex items-start gap-2 text-left text-[11px] py-1 rounded transition-colors " +
          (expanded
            ? "bg-[var(--undp-paper)]"
            : "hover:bg-[var(--undp-paper)]/60 focus:bg-[var(--undp-paper)]/60")
        }
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
          style={{ backgroundColor: LEVEL_COLOR[c.level] }}
          title={c.level}
        />
        <span className="flex-1 text-[var(--undp-black)] leading-snug">{c.name}</span>
        <span className="tabular-nums text-[var(--undp-gray)] shrink-0">{fmt(c.spend)}</span>
        <span
          aria-hidden="true"
          className={
            "text-[var(--undp-gray)] shrink-0 transition-transform " +
            (expanded ? "rotate-90" : "")
          }
        >
          ›
        </span>
      </button>
      {expanded && (
        <div
          id={`prog-${c.code}-detail`}
          className="mt-1 mb-2 ml-3.5 pl-2 border-l-2 border-gray-100 text-[11px] leading-relaxed text-[var(--undp-black)] space-y-1.5"
        >
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
            <span className="text-[var(--undp-gray)]">
              {t("detail.programmeCode")}:{" "}
              <span className="font-mono text-[var(--undp-black)]">{c.code}</span>
            </span>
            <span className="text-[var(--undp-gray)]">
              {t("detail.programmeAlignment")}:{" "}
              <span
                className="inline-block px-1 rounded uppercase font-medium"
                style={{ backgroundColor: LEVEL_COLOR[c.level] + "1f", color: LEVEL_COLOR[c.level] }}
              >
                {c.level}
              </span>
            </span>
          </div>
          {c.institution && (
            <div className="text-[10px]">
              <span className="text-[var(--undp-gray)]">{t("detail.programmeInstitution")}: </span>
              <span className="text-[var(--undp-black)]">{c.institution}</span>
            </div>
          )}
          {c.description && (
            <p className="text-[11px] text-[var(--undp-black)]">{c.description}</p>
          )}
          {c.yearlySpend && c.yearlySpend.length > 0 && (
            <YearlySpark
              series={c.yearlySpend}
              fmt={fmt}
              label={t("detail.programmeYearlySpend")}
            />
          )}
        </div>
      )}
    </li>
  );
}

function DetailDrawer({
  row,
  onClose,
  fmt,
  tierLabel,
  t,
}: {
  row: FundingTargetRow;
  onClose: () => void;
  fmt: (v: number) => string;
  tierLabel: (t: FundingTier) => string;
  t: ReturnType<typeof useTranslations<"briefing.financing.targetGrid">>;
}) {
  // Per-row transient UI state (read-more, show-all, per-programme expanded).
  // Reset naturally by keying <DetailDrawer key={row.targetId} .../> at the
  // call site — cheaper than a syncing useEffect and lint-clean.
  const [expanded, setExpanded] = useState(false);
  const [showAllContribs, setShowAllContribs] = useState(false);
  const [expandedProgrammeCode, setExpandedProgrammeCode] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const top = row.contributors.slice(0, 5);
  const rest = row.contributors.length - top.length;
  const needsTruncation = row.text.length > TEXT_PREVIEW_LEN;
  const displayedText = expanded || !needsTruncation
    ? row.text
    : row.text.slice(0, TEXT_PREVIEW_LEN).trimEnd() + "…";

  const otherLabel = t("detail.otherInstitution");
  const groups = showAllContribs
    ? groupContributorsByInstitution(row.contributors, otherLabel)
    : [];

  const toggleProgramme = (code: string) =>
    setExpandedProgrammeCode((cur) => (cur === code ? null : code));

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label={t("detail.close")}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={row.targetId}
        className="relative h-full w-full sm:w-[420px] md:w-[480px] shadow-2xl overflow-y-auto bg-white"
      >
        <header className="sticky top-0 z-10 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3 bg-white/95 backdrop-blur">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="font-mono text-[10px] text-[var(--undp-gray)]">
                {row.targetId.replace(/^panama_|^mongolia_/, "")}
              </span>
              <span className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] truncate">
                {row.docLabel}
              </span>
            </div>
            <span
              className="inline-block text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: TIER_COLOR[row.tier] + "1f", color: TIER_COLOR[row.tier] }}
            >
              {tierLabel(row.tier)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("detail.close")}
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-lg leading-none px-1 shrink-0"
          >
            ✕
          </button>
        </header>
        <div className="px-5 py-4">
          <p className="text-[13px] leading-relaxed text-[var(--undp-black)]">{displayedText}</p>
          {needsTruncation && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-[11px] text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline"
            >
              {expanded ? t("detail.showLess") : t("detail.readMore")}
            </button>
          )}
          <div className="mt-4 border-t border-gray-100 pt-3 text-[12px]">
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
            {row.contributors.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
                  {t("detail.topContributing")}
                </p>
                {!showAllContribs ? (
                  <>
                    <ul className="space-y-0.5">
                      {top.map((c: FundingTargetContributor) => (
                        <ContributorRow
                          key={c.code}
                          c={c}
                          fmt={fmt}
                          expanded={expandedProgrammeCode === c.code}
                          onToggle={() => toggleProgramme(c.code)}
                          t={t}
                        />
                      ))}
                    </ul>
                    {rest > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAllContribs(true);
                          setExpandedProgrammeCode(null);
                        }}
                        className="mt-2 text-[11px] text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline text-left"
                      >
                        {t("detail.showAllProgrammes", { count: row.contributors.length })}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <div className="space-y-3">
                      {groups.map((g) => (
                        <div key={g.institution}>
                          <div className="flex items-baseline justify-between gap-2 border-b border-gray-100 pb-1 mb-1">
                            <p className="text-[11px] font-medium text-[var(--undp-black)] leading-snug">
                              {g.institution}
                            </p>
                            <p className="text-[10px] tabular-nums text-[var(--undp-gray)] shrink-0">
                              {t("detail.institutionSubtotal", {
                                count: g.programmes.length,
                                money: fmt(g.subtotal),
                              })}
                            </p>
                          </div>
                          <ul className="space-y-0.5">
                            {g.programmes.map((c) => (
                              <ContributorRow
                                key={c.code}
                                c={c}
                                fmt={fmt}
                                expanded={expandedProgrammeCode === c.code}
                                onToggle={() => toggleProgramme(c.code)}
                                t={t}
                              />
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAllContribs(false);
                        setExpandedProgrammeCode(null);
                      }}
                      className="mt-3 text-[11px] text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline text-left"
                    >
                      {t("detail.showTopProgrammes")}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] italic text-[var(--undp-gray)]">
                {t("detail.noContributors")}
              </p>
            )}
          </div>
        </div>
      </aside>
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
  mode = "docked",
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
  /**
   * "docked": always-visible detail panel in a right-side column (default).
   * "drawer": panel pops open as a fixed right-edge dialog on click. Used on
   * Panama where the widened financing block gives the dot grid full horizontal
   * room and the drawer overlays only when needed.
   */
  mode?: "docked" | "drawer";
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

      {mode === "drawer" ? (
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
          {selected && (
            <DetailDrawer
              key={selected.targetId}
              row={selected}
              onClose={() => setSelected(null)}
              fmt={fmt}
              tierLabel={tierLabel}
              t={t}
            />
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
