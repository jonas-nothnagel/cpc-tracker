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
 *
 * `computeBudgetCoverage` is a SEPARATE, softer read: how far the funded budget
 * reaches into each policy document via the AI-estimated budget↔policy
 * alignment. It is shown as a clearly-labelled per-document breakdown that also
 * explains what the policy commitments are (their composition by document) —
 * never as the headline.
 */

import type {
  AlignmentResult,
  BerBudgetProgram,
  BerData,
  BerExpenditureSeries,
  Target,
} from "@/types";

/** Pick the locale-appropriate display name for a BER programme or
 *  expenditure series. Prefers `nameEn` on the English locale; falls back to
 *  the Spanish/canonical `name` everywhere else and when `nameEn` is absent
 *  (older BER files, Mongolia data which only ships `name`). */
export function pickBerName(
  item: { name: string; nameEn?: string },
  locale: string,
): string {
  if (locale === "en" && item.nameEn) return item.nameEn;
  return item.name;
}

/** Pick the locale-appropriate display description for a BER programme.
 *  Falls back to the legacy `description` (LLM-input narrative) when no
 *  locale-specific UI description is provided. */
export function pickBerDescription(
  program: BerBudgetProgram,
  locale: string,
): string {
  if (locale === "en" && program.descriptionEn) return program.descriptionEn;
  if (locale === "es" && program.descriptionEs) return program.descriptionEs;
  return program.description;
}

/** A strong (high-confidence) budget↔commitment link, with the AI's reasoning. */
export interface BudgetCoverageLink {
  targetId: string;
  /** Short commitment label, e.g. "NDC 3". */
  targetLabel: string;
  /** Full commitment text (for tooltip / detail). */
  targetText: string;
  /** Funded budget line strongly aligned with it. */
  programName: string;
  /** The AI's reasoning for the link (the evidence behind the number). */
  rationale: string;
}

/** An ambition no funded programme reaches: outside this budget's reach. */
export interface BudgetUncoveredAmbition {
  targetId: string;
  /** Short ambition label, e.g. "FSS 3". */
  targetLabel: string;
  /** Full ambition text (for the inline gap list). */
  targetText: string;
}

export interface BudgetCoverageDoc {
  /** Source document type (e.g. "NBSAP"). */
  doc: string;
  /** Ambitions in this document a funded program strongly (high) reaches. */
  reached: number;
  /** Ambitions in this document. */
  total: number;
  /** One strong link per reached ambition (the evidence), by label. */
  links: BudgetCoverageLink[];
  /**
   * Ambitions in this document NO funded programme reaches, i.e. outside this
   * budget's reach. Pure complement of `links`: links.length +
   * uncovered.length === total.
   */
  uncovered: BudgetUncoveredAmbition[];
}

export interface BudgetCoverage {
  /** Visible ambitions a FUNDED program strongly (high) reaches. */
  reached: number;
  /** Visible ambitions total. */
  total: number;
  /** Visible ambitions outside this budget's reach (= total - reached). */
  outsideReach: number;
  /** Per-document breakdown, largest document first. */
  byDocument: BudgetCoverageDoc[];
}

/**
 * How far the funded biodiversity budget REACHES into the policy ambitions, via
 * the pipeline's budget↔ambition judgement (`python/src/budget_align.py`, which
 * reuses the coherence advisor with a budget rubric: HIGH = "the programme's
 * mandate and expenditure clearly connect to the target's goals"). We count
 * only HIGH links — medium ("same sector but doesn't meaningfully connect") is
 * too generous and links nearly every ambition, washing out the signal. So an
 * ambition is "reached" when a FUNDED program (spend > 0) judges HIGH against
 * it. This is a thematic reach judgement, not a traced allocation, and is
 * distinct from the policy-to-policy coherence. Each document carries the
 * actual links — ambition, budget line, and the AI's reasoning — plus the
 * ambitions left outside the budget's reach, so both sides are substantiated.
 * AI-derived and indicative; never an audited allocation.
 */
export function computeBudgetCoverage(
  budgetAlignment: AlignmentResult[],
  fundedPrograms: { berId: string; name: string }[],
  visibleTargets: Target[],
): BudgetCoverage {
  const targetById = new Map(visibleTargets.map((t) => [t.id, t]));
  const nameByBerId = new Map(fundedPrograms.map((p) => [p.berId, p.name]));

  // First high-confidence link per strongly-aligned commitment (the evidence).
  const linkByTarget = new Map<string, BudgetCoverageLink>();
  for (const pair of budgetAlignment) {
    if (pair.alignment !== "high") continue;
    const berId = pair.targetAId.startsWith("BER_")
      ? pair.targetAId
      : pair.targetBId.startsWith("BER_")
        ? pair.targetBId
        : null;
    if (!berId || !nameByBerId.has(berId)) continue;
    const otherId = pair.targetAId === berId ? pair.targetBId : pair.targetAId;
    const target = targetById.get(otherId);
    if (!target || linkByTarget.has(otherId)) continue;
    linkByTarget.set(otherId, {
      targetId: otherId,
      targetLabel: target.sourceLabel ?? "",
      targetText: target.text,
      programName: nameByBerId.get(berId) ?? berId,
      rationale: pair.description ?? "",
    });
  }

  const docs = new Map<
    string,
    {
      total: number;
      links: BudgetCoverageLink[];
      uncovered: BudgetUncoveredAmbition[];
    }
  >();
  for (const t of visibleTargets) {
    const entry = docs.get(t.sourceDocument) ?? {
      total: 0,
      links: [],
      uncovered: [],
    };
    entry.total += 1;
    const link = linkByTarget.get(t.id);
    if (link) {
      entry.links.push(link);
    } else {
      // No funded programme reaches this ambition: it sits outside the
      // budget's reach. Pure complement of `links`.
      entry.uncovered.push({
        targetId: t.id,
        targetLabel: t.sourceLabel ?? "",
        targetText: t.text,
      });
    }
    docs.set(t.sourceDocument, entry);
  }

  const byLabel = (a: { targetLabel: string }, b: { targetLabel: string }) =>
    a.targetLabel.localeCompare(b.targetLabel, undefined, { numeric: true });

  const byDocument: BudgetCoverageDoc[] = [...docs.entries()]
    .map(([doc, v]) => ({
      doc,
      reached: v.links.length,
      total: v.total,
      links: v.links.sort(byLabel),
      uncovered: v.uncovered.sort(byLabel),
    }))
    .sort((a, b) => b.total - a.total || a.doc.localeCompare(b.doc));

  return {
    reached: linkByTarget.size,
    total: visibleTargets.length,
    outsideReach: visibleTargets.length - linkByTarget.size,
    byDocument,
  };
}

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
    /** Named program the headline refers to (e.g. "National Biodiversity
     *  Program"). Null when the BER reports no named program. */
    programName: string | null;
    /** Localised program names keyed by locale; the UI prefers the active
     *  locale and falls back to `programName`. Null when none provided. */
    programNameByLocale: Record<string, string> | null;
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
  locale: string = "en",
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
      name: pickBerName(p, locale),
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
          programName: berData.keyFindings.programName ?? null,
          programNameByLocale: berData.keyFindings.programNameByLocale ?? null,
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
