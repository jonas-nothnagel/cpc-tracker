/**
 * Financing coherence (Level 2) — the hard facts behind the "Where does money
 * meet ambition?" slide.
 *
 * The slide runs on the Biodiversity Expenditure Review ALONE: how much is
 * tracked, how concentrated it is across programs, and how much of the plan
 * went unspent. It deliberately does NOT use the AI budget↔policy alignment
 * (too soft a signal to headline) or any taxonomy (the BER's own program
 * line-items are clearer than GLOBE abstractions). The coherence question —
 * "is the money where the ambition is?" — is posed as a hedged prompt against
 * these facts, not computed.
 *
 * Money is reported at true magnitude (real MNT). `programsToHalf` is the
 * honest concentration measure: the fewest programs whose spend covers half
 * the total. A small number means a few programs dominate; a large one means
 * spend is spread (reported honestly either way).
 */

import type { BerData } from "@/types";

export interface FinancingProgramStat {
  berId: string;
  code: string;
  name: string;
  type: "environmental" | "non_environmental";
  /** Summed recorded expenditure across the BER reporting period. */
  totalSpend: number;
  hasSpend: boolean;
}

export interface FinancingCoherenceSummary {
  currency: string;
  unit: string;
  periodLabel: string;
  /**
   * The BER's own planned-vs-actual headline (a hard budget fact), over its
   * full program period. Null when the BER reports no keyFindings. Often a
   * wider period than `periodLabel`.
   */
  execution: {
    planned: number;
    actual: number;
    gap: number;
    period: string;
  } | null;
  /** Summed program expenditure — the honest grand total. */
  totalTrackedExpenditure: number;
  totalProgramCount: number;
  fundedProgramCount: number;
  /** All programs, ranked by total spend descending. */
  programs: FinancingProgramStat[];
  /** Fewest programs whose spend covers half the total (concentration). */
  programsToHalf: number;
}

/**
 * Format a BER expenditure figure as "{value} {unit} {currency}", e.g.
 * "890 billion MNT". Large values (>= 100) round to a whole number; smaller
 * ones keep one decimal (trailing .0 stripped). Reports true magnitude — the
 * figure is real money, not a corpus-size artifact.
 */
export function formatBerMoney(
  value: number,
  unit: string,
  currency: string,
): string {
  const n = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${n.toLocaleString("en-US")} ${unit} ${currency}`;
}

export function computeFinancingCoherence(
  berData: BerData,
): FinancingCoherenceSummary {
  const valuesByCode = new Map<string, Record<string, number | null>>();
  for (const e of berData.expenditure) valuesByCode.set(e.code, e.values);

  const programs: FinancingProgramStat[] = berData.programs.map((p) => {
    const values = valuesByCode.get(p.code) ?? {};
    const totalSpend = Object.values(values).reduce<number>(
      (sum, v) => sum + (typeof v === "number" ? v : 0),
      0,
    );
    return {
      berId: `BER_${p.code}`,
      code: p.code,
      name: p.name,
      type: p.type,
      totalSpend,
      hasSpend: totalSpend > 0,
    };
  });
  programs.sort(
    (a, b) => b.totalSpend - a.totalSpend || a.code.localeCompare(b.code),
  );

  const totalTrackedExpenditure = programs.reduce(
    (sum, p) => sum + p.totalSpend,
    0,
  );

  // Fewest programs whose cumulative spend reaches half the total.
  const half = totalTrackedExpenditure / 2;
  let cumulative = 0;
  let programsToHalf = 0;
  for (const p of programs) {
    if (cumulative >= half) break;
    cumulative += p.totalSpend;
    programsToHalf += 1;
  }

  return {
    currency: berData.currency,
    unit: berData.unit,
    periodLabel: `${berData.period.start}-${berData.period.end}`,
    execution: berData.keyFindings
      ? {
          planned: berData.keyFindings.plannedBudget,
          actual: berData.keyFindings.actualExpenditure,
          gap: berData.keyFindings.gap,
          period: berData.keyFindings.programPeriod,
        }
      : null,
    totalTrackedExpenditure,
    totalProgramCount: programs.length,
    fundedProgramCount: programs.filter((p) => p.hasSpend).length,
    programs,
    programsToHalf,
  };
}
