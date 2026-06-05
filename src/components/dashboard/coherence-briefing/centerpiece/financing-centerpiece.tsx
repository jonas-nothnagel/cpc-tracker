"use client";

/**
 * FinancingCenterpiece — the right-column visual for the Financing slide.
 *
 * Two hard budget facts, no AI, no taxonomy:
 *   1. Where the money concentrates — the largest BER programs' share of
 *      spend, by the BER's OWN program names (air-pollution, waste, ...). The
 *      hero of the slide.
 *   2. Not all of it is spent — the BER's planned vs actual (a supporting
 *      line below the hero).
 */

import { formatBerMoney } from "@/lib/financing-coherence";
import type {
  FinancingCoherenceSummary,
  FinancingProgramStat,
} from "@/lib/financing-coherence";

const COLORS = ["var(--undp-blue)", "#0ea5e9"];
const REST = "#e5e7eb";

export function FinancingCenterpiece({
  summary,
}: {
  summary: FinancingCoherenceSummary;
}) {
  return (
    <div className="px-1 space-y-7">
      <Concentration summary={summary} />
      {summary.execution && (
        <ExecutionBar
          execution={summary.execution}
          unit={summary.unit}
          currency={summary.currency}
        />
      )}
      <p className="text-center text-[10px] text-[var(--undp-gray)]/80">
        Source: Biodiversity Expenditure Review (BER).
      </p>
    </div>
  );
}

// Hero — where the money concentrates, by the BER's own program names.
function Concentration({
  summary,
}: {
  summary: FinancingCoherenceSummary;
}) {
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
        Where the {formatBerMoney(total, summary.unit, summary.currency)} goes ·{" "}
        {summary.periodLabel}
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
            title={`Everything else: ${restPct}%`}
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
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-[12px]">
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ backgroundColor: REST }}
                  />
                  <span className="text-[var(--undp-gray)]">
                    everything else
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
  const spentShare =
    execution.planned > 0 ? execution.actual / execution.planned : 0;
  const gapPct = Math.round((1 - spentShare) * 100);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1.5">
        Not all of it is spent · {execution.period}
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
        <span className="font-medium">
          {execution.actual.toLocaleString("en-US")}
        </span>{" "}
        of {execution.planned.toLocaleString("en-US")} {unit} {currency} spent
        {execution.gap > 0 && (
          <span className="text-[var(--undp-gray)]">
            {" "}
            · {formatBerMoney(execution.gap, unit, currency)} (
            {Math.max(0, gapPct)}%) unspent
          </span>
        )}
      </p>
    </div>
  );
}
