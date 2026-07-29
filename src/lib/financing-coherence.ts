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
  AlignmentLevel,
  AlignmentResult,
  BerBudgetProgram,
  BerData,
  CountryConfig,
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

/** Pick the locale-appropriate owning institution for a BER programme.
 *  Empty string when the programme carries no institution (Mongolia). */
export function pickBerInstitution(
  item: { institution?: string; institutionEn?: string },
  locale: string,
): string {
  if (locale === "en" && item.institutionEn) return item.institutionEn;
  return item.institution ?? "";
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
  /** Pseudo-target id of the funded budget line ("BER_71401"), so the UI can
   *  re-find the pair and open the shared drawer with the full rationale. */
  programBerId: string;
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
      programBerId: berId,
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

// ---------------------------------------------------------------------------
// Per-target funding view: aligned spend per policy target, with outlier
// classification. Powers the Financing section's dot-grid evidence panel.
// ---------------------------------------------------------------------------

/** Aligned-spend tier for a single policy target. Outlier-aware: the top/bottom
 *  10 targets by aligned spend stand out on the dot grid. Tiers describe the
 *  relative VOLUME of AI-aligned expenditure around a target — never financing
 *  adequacy, which would require needs/gap data the module does not have.
 *  Values collide lexically with AlignmentLevel but are a distinct type; keep
 *  tier and level lookups separate (TIER_COLOR vs LEVEL_COLOR). */
export type FundingTier = "high" | "medium" | "low" | "none";

/** One programme contributing to a target's aligned spend. */
export interface FundingTargetContributor {
  code: string;
  name: string;
  spend: number;
  level: AlignmentLevel;
  /** Locale-picked owning institution. Empty when the programme's BER data
   *  carries no institution (Mongolia). Panama populates this for every
   *  contributor via parse_panama_ber.py. */
  institution?: string;
  /** Locale-picked UI description of the programme, for the click-to-expand
   *  detail row in the drawer. Distinct from the LLM-input `description`
   *  narrative. Empty when the programme carries no locale-specific description. */
  description?: string;
  /** Per-year executed spend for THIS programme (not the target's aligned
   *  sum). Years ascending, matches the BER expenditure years. */
  yearlySpend?: { year: string; value: number }[];
}

/** One row in the funding-target grid: a policy target with its aligned-spend
 *  total, contributing programmes, and per-year aligned spend trend. */
export interface FundingTargetRow {
  targetId: string;
  docId: string;
  docLabel: string;
  text: string;
  /** Sum of contributing programmes' total executed spend (M PAB for Panama).
   *  Each programme contributes its FULL spend even if its description aligns
   *  with many targets — the LLM links a programme to many targets, so this
   *  overcounts in aggregate. The cross-target ranking still works because all
   *  targets share the same overcount basis. Surfaces how much reviewed
   *  spending has descriptions aligned with the target, not traced allocation.
   *  Any document-level or whole-review money figure must instead count each
   *  programme once — use dedupeContributorSpend, never sum alignedSpend. */
  alignedSpend: number;
  alignedProgrammeCount: number;
  tier: FundingTier;
  contributors: FundingTargetContributor[];
  /** Year-by-year aligned spend, summed across this target's contributing
   *  programmes. Same overcount caveat as `alignedSpend`. Years ascending. */
  yearlySpend: { year: string; value: number }[];
}

/** Compute one FundingTargetRow per policy target visible to the financing
 *  section. Visibility = countryConfig.documentTypes minus defaultHidden and
 *  excluded. Tiers are tie-aware (rounding to 1M PAB before ranking) so two
 *  targets that read as the same amount in the UI always get the same colour. */
export function computeFundingTargetRows(args: {
  targets: Target[];
  alignment: AlignmentResult[];
  berData: BerData;
  countryConfig: CountryConfig | null;
  locale: string;
  visibleDocIds: ReadonlySet<string>;
}): FundingTargetRow[] {
  const { targets, alignment, berData, countryConfig, locale, visibleDocIds } = args;

  const spendByCode = new Map<string, number>();
  const yearlyByCode = new Map<string, Record<string, number>>();
  for (const e of berData.expenditure) {
    const total = Object.values(e.values).reduce<number>(
      (s, v) => s + (typeof v === "number" ? v : 0),
      0,
    );
    spendByCode.set(e.code, total);
    const yearly: Record<string, number> = {};
    for (const [y, v] of Object.entries(e.values)) {
      yearly[y] = typeof v === "number" ? v : 0;
    }
    yearlyByCode.set(e.code, yearly);
  }
  const allYears = berData.expenditure.length > 0
    ? Object.keys(berData.expenditure[0].values).sort()
    : [];

  const programByCode = new Map<string, BerBudgetProgram>();
  for (const p of berData.programs) {
    programByCode.set(p.code, p);
  }

  // Per policy target: collect (programme, level) pairs from any high/medium
  // alignment, sorted by spend descending. Each contributor surfaces in the
  // detail panel.
  const contribByPolicy = new Map<string, FundingTargetContributor[]>();
  for (const pair of alignment) {
    const berId = pair.targetAId.startsWith("BER_")
      ? pair.targetAId
      : pair.targetBId.startsWith("BER_")
        ? pair.targetBId
        : null;
    const policyId = berId === pair.targetAId ? pair.targetBId : pair.targetAId;
    if (!berId || !policyId) continue;
    const lvl = pair.alignment as AlignmentLevel;
    if (lvl !== "high" && lvl !== "medium") continue;
    const code = berId.replace(/^BER_/, "");
    const programmeSpend = spendByCode.get(code) ?? 0;
    // Drop zero-spend programmes from the contributor list. They're aligned
    // by the LLM (their mandate connects), but they had no executed budget
    // over the period — so they shouldn't inflate `alignedProgrammeCount`
    // or clutter the top-contributing list with 0M lines. A target whose
    // only "matches" are all zero-spend programmes correctly stays in the
    // "no aligned spend" tier.
    if (programmeSpend <= 0) continue;
    const program = programByCode.get(code);
    const programmeYearly = yearlyByCode.get(code) ?? {};
    const list = contribByPolicy.get(policyId) ?? [];
    list.push({
      code,
      name: program ? pickBerName(program, locale) : code,
      spend: programmeSpend,
      level: lvl,
      institution: program ? pickBerInstitution(program, locale) : "",
      description: program ? pickBerDescription(program, locale) : "",
      yearlySpend: allYears.map((y) => ({ year: y, value: programmeYearly[y] ?? 0 })),
    });
    contribByPolicy.set(policyId, list);
  }

  type Partial = Omit<FundingTargetRow, "tier">;
  const partial: Partial[] = [];
  for (const t of targets) {
    if (t.id.startsWith("BER_") || t.id.startsWith("BTR_")) continue;
    if (!visibleDocIds.has(t.sourceDocument)) continue;
    const contribs = (contribByPolicy.get(t.id) ?? []).sort((a, b) => b.spend - a.spend);
    const yearlySpend = allYears.map((y) => {
      let v = 0;
      for (const c of contribs) {
        v += yearlyByCode.get(c.code)?.[y] ?? 0;
      }
      return { year: y, value: v };
    });
    partial.push({
      targetId: t.id,
      docId: t.sourceDocument,
      docLabel: docMediumLabel(countryConfig, t.sourceDocument),
      text: t.text,
      alignedSpend: contribs.reduce((s, c) => s + c.spend, 0),
      alignedProgrammeCount: contribs.length,
      contributors: contribs,
      yearlySpend,
    });
  }

  // Tie-aware outlier classification — round to 1M PAB (the displayed
  // precision) before comparing so two targets that read as identical never
  // get split across colour buckets by a 5th-decimal float difference.
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
    .map<FundingTargetRow>((r) => {
      const rounded = round1M(r.alignedSpend);
      let tier: FundingTier;
      if (r.alignedSpend === 0) tier = "none";
      else if (rounded >= topCutoff) tier = "high";
      else if (rounded <= bottomCutoff) tier = "low";
      else tier = "medium";
      return { ...r, tier };
    })
    .sort((a, b) => b.alignedSpend - a.alignedSpend);
}

/** Sum each contributing programme ONCE across the given rows (union by
 *  programme code). Per-target alignedSpend values intentionally overlap (the
 *  same programme backs every target its description aligns with), so any
 *  document-level or whole-review money figure must come from here, never
 *  from summing alignedSpend. */
export function dedupeContributorSpend(
  rows: FundingTargetRow[],
): { spend: number; programmeCount: number } {
  const byCode = new Map<string, number>();
  for (const r of rows) {
    for (const c of r.contributors) byCode.set(c.code, c.spend);
  }
  let spend = 0;
  for (const v of byCode.values()) spend += v;
  return { spend, programmeCount: byCode.size };
}

/** Group rows by source document, in the order declared in countryConfig.
 *  Same visibility filter as computeFundingTargetRows. docSpend and
 *  docProgrammeCount count each programme once within the document (see
 *  dedupeContributorSpend). */
export function groupFundingRowsByDoc(
  rows: FundingTargetRow[],
  countryConfig: CountryConfig | null,
): {
  docId: string;
  docLabel: string;
  rows: FundingTargetRow[];
  docSpend: number;
  docProgrammeCount: number;
}[] {
  const byDoc = new Map<string, FundingTargetRow[]>();
  for (const r of rows) {
    if (!byDoc.has(r.docId)) byDoc.set(r.docId, []);
    byDoc.get(r.docId)!.push(r);
  }
  const declared = (countryConfig?.documentTypes ?? []).map((d) => d.id);
  // Preserve declared order; append any unexpected doc ids at the end so
  // we never silently drop rows.
  const ordered: string[] = [
    ...declared.filter((id) => byDoc.has(id)),
    ...[...byDoc.keys()].filter((id) => !declared.includes(id)),
  ];
  return ordered.map((docId) => {
    const docRows = byDoc.get(docId)!;
    const { spend, programmeCount } = dedupeContributorSpend(docRows);
    return {
      docId,
      docLabel: docMediumLabel(countryConfig, docId),
      rows: docRows,
      docSpend: spend,
      docProgrammeCount: programmeCount,
    };
  });
}

/** Document set the financing section is allowed to surface: countryConfig
 *  declared docs minus defaultHidden minus excluded. */
export function visibleFinancingDocIds(countryConfig: CountryConfig | null): Set<string> {
  const declared = (countryConfig?.documentTypes ?? []).map((d) => d.id);
  const hidden = new Set([
    ...(countryConfig?.defaultHiddenDocTypes ?? []),
    ...(countryConfig?.excludedDocTypes ?? []),
  ]);
  return new Set(declared.filter((id) => !hidden.has(id)));
}

// Local mirror of getDocMediumLabel to avoid a circular import with @/lib/utils
// (financing-coherence is already imported there by coherence-budget). Keeps
// the same fallback semantics: shortLabel from countryConfig.documentTypes,
// otherwise the raw docId.
function docMediumLabel(
  countryConfig: CountryConfig | null,
  docId: string,
): string {
  const entry = countryConfig?.documentTypes?.find((d) => d.id === docId);
  return entry?.mediumLabel ?? entry?.shortLabel ?? docId;
}
