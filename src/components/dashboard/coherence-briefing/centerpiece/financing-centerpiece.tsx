"use client";

/**
 * FinancingCenterpiece — the right-column visual for the Financing slide. This
 * is the BUDGET OBJECT: the thing the left column measures ambition reach
 * against, and the thing a user could swap for another budget dataset.
 *
 * Three hard budget facts, no AI, no taxonomy:
 *   0. What the spending review is — source (BER), country, period, and the
 *      budget lines it contains (expandable to the full list, so "28 budget
 *      lines" is no longer an unexplained number).
 *   1. Where the money concentrates — the largest BER programs' share of
 *      spend, by the BER's OWN program names (air-pollution, waste, ...).
 *   2. Not all of it is spent — the BER's planned vs actual (a supporting
 *      line, labelled with its own wider period).
 */

import { useTranslations } from "next-intl";

import { formatBerMoney } from "@/lib/financing-coherence";
import type {
  FinancingCoherenceSummary,
  FinancingProgramStat,
} from "@/lib/financing-coherence";

const COLORS = ["var(--undp-blue)", "#0ea5e9"];
const REST = "#e5e7eb";

export function FinancingCenterpiece({
  summary,
  countryName,
}: {
  summary: FinancingCoherenceSummary;
  countryName: string;
}) {
  return (
    <div className="px-1 space-y-6">
      <BudgetObjectHeader summary={summary} countryName={countryName} />
      <Concentration summary={summary} />
      {summary.execution && (
        <ExecutionBar
          execution={summary.execution}
          unit={summary.unit}
          currency={summary.currency}
        />
      )}
    </div>
  );
}

// What the spending review IS. Names the dataset (the BER, a snapshot review,
// not the whole budget) and expands the budget-line count to the full ranked
// list, so "28 budget lines" is something the user can actually inspect.
function BudgetObjectHeader({
  summary,
  countryName,
}: {
  summary: FinancingCoherenceSummary;
  countryName: string;
}) {
  const t = useTranslations("briefing.financingCenter");
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)]">
        {t("header.eyebrow")}
      </p>
      <p className="text-[15px] font-semibold text-[var(--undp-black)] leading-tight mt-0.5">
        {t("header.title")}
      </p>
      <p className="text-[11.5px] text-[var(--undp-gray)] mt-0.5">
        {countryName} · {summary.periodLabel}
      </p>
      <details className="group mt-1.5">
        <summary className="cursor-pointer list-none text-[11.5px] text-[var(--undp-black)]">
          <span className="font-medium">
            {t("header.budgetLines", { count: summary.totalProgramCount })}
          </span>
          <span className="text-[var(--undp-gray)]">
            {" "}
            {t("header.withRecordedSpend", {
              count: summary.fundedProgramCount,
            })}
          </span>
          <span
            aria-hidden="true"
            className="text-[var(--undp-gray)]/50 text-[10px]"
          >
            {" "}
            +
          </span>
        </summary>
        <ul className="mt-1.5 space-y-1 max-h-56 overflow-y-auto pr-1">
          {summary.programs.map((p) => (
            <li
              key={p.berId}
              className="flex items-center justify-between gap-3 text-[11px]"
            >
              <span
                className={`truncate ${p.hasSpend ? "text-[var(--undp-black)]" : "text-[var(--undp-gray)]/60"}`}
                title={p.name}
              >
                {p.name}
              </span>
              <span className="tabular-nums shrink-0 text-[var(--undp-gray)]">
                {p.hasSpend
                  ? formatBerMoney(p.totalSpend, summary.unit, summary.currency)
                  : t("header.noRecordedSpend")}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

// Hero — where the money concentrates, by the BER's own program names.
function Concentration({
  summary,
}: {
  summary: FinancingCoherenceSummary;
}) {
  const t = useTranslations("briefing.financingCenter");
  const total = summary.totalTrackedExpenditure;
  if (total <= 0) return null;
  const funded = summary.programs.filter((p) => p.totalSpend > 0);
  const top = funded.slice(0, COLORS.length);
  const rest = funded.slice(COLORS.length);
  const topSpend = top.reduce((s, p) => s + p.totalSpend, 0);
  const restSpend = Math.max(0, total - topSpend);
  const pct = (v: number) => Math.round((v / total) * 100);
  // "Everything else" absorbs the rounding remainder so the legend's named
  // shares always sum to 100 (bar widths stay exact fractions).
  const restPct = Math.max(
    0,
    100 - top.reduce((s, p) => s + pct(p.totalSpend), 0),
  );

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">
        {t("concentration.eyebrow", {
          amount: formatBerMoney(total, summary.unit, summary.currency),
          period: summary.periodLabel,
        })}
      </p>
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-gray-100">
        {top.map((p, i) => (
          <span
            key={p.berId}
            className="h-full"
            style={{
              width: `${(p.totalSpend / total) * 100}%`,
              backgroundColor: COLORS[i],
            }}
            title={`${p.name}: ${pct(p.totalSpend)}%`}
          />
        ))}
        {restSpend > 0 && (
          <span
            className="h-full flex-1"
            style={{ backgroundColor: REST }}
            title={t("concentration.everythingElseTitle", { pct: restPct })}
          />
        )}
      </div>
      <ul className="mt-3 space-y-1.5">
        {top.map((p, i) => (
          <ProgramLegendRow
            key={p.berId}
            program={p}
            color={COLORS[i]}
            pct={pct(p.totalSpend)}
          />
        ))}
        {restSpend > 0 && (
          <li>
            <details className="group" open>
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-[12px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: REST }}
                  />
                  <span className="text-[var(--undp-gray)]">
                    {t("concentration.everythingElse")}
                  </span>
                  {rest.length > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-[var(--undp-gray)]/60 text-[10px]"
                    >
                      ({rest.length}) +
                    </span>
                  )}
                </span>
                <span className="tabular-nums text-[var(--undp-gray)] shrink-0">
                  {restPct}%
                </span>
              </summary>
              {rest.length > 0 && (
                <ul className="mt-1.5 ml-4 space-y-1 max-h-48 overflow-y-auto">
                  {rest.map((p) => (
                    <li
                      key={p.berId}
                      className="flex items-center justify-between gap-3 text-[11px]"
                    >
                      <span
                        className="text-[var(--undp-gray)] truncate"
                        title={p.name}
                      >
                        {p.name}
                      </span>
                      <span className="tabular-nums text-[var(--undp-gray)] shrink-0">
                        {pct(p.totalSpend)}%
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        )}
      </ul>
    </div>
  );
}

function ProgramLegendRow({
  program,
  color,
  pct,
}: {
  program: FinancingProgramStat;
  color: string;
  pct: number;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-[12px]">
      <span className="flex items-center gap-2 min-w-0">
        <span
          aria-hidden="true"
          className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />
        <span
          className="text-[var(--undp-black)] truncate"
          title={program.name}
        >
          {program.name}
        </span>
      </span>
      <span className="tabular-nums text-[var(--undp-black)] font-medium shrink-0">
        {pct}%
      </span>
    </li>
  );
}

// Supporting fact — not all of the planned budget is spent.
function ExecutionBar({
  execution,
  unit,
  currency,
}: {
  execution: NonNullable<FinancingCoherenceSummary["execution"]>;
  unit: string;
  currency: string;
}) {
  const t = useTranslations("briefing.financingCenter");
  const spentShare =
    execution.planned > 0 ? execution.actual / execution.planned : 0;
  const gapPct = Math.round((1 - spentShare) * 100);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1.5">
        {t("execution.eyebrow", { period: execution.period })}
      </p>
      <div
        className="h-2.5 w-full rounded-full overflow-hidden"
        style={{ backgroundColor: REST }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.min(100, spentShare * 100)}%`,
            backgroundColor: COLORS[0],
          }}
        />
      </div>
      <p className="text-[11px] text-[var(--undp-black)] mt-1.5 tabular-nums">
        {t.rich("execution.spent", {
          actual: execution.actual.toLocaleString("en-US"),
          planned: execution.planned.toLocaleString("en-US"),
          unit,
          currency,
          strong: (chunks) => <span className="font-medium">{chunks}</span>,
        })}
        {execution.gap > 0 && (
          <span className="text-[var(--undp-gray)]">
            {" "}
            {t("execution.unspent", {
              amount: formatBerMoney(execution.gap, unit, currency),
              pct: Math.max(0, gapPct),
            })}
          </span>
        )}
      </p>
    </div>
  );
}
