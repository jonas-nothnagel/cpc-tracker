"use client";

/**
 * FinancingCenterpiece — the right-column visual for the Financing slide. This
 * is the BUDGET OBJECT: the thing the left column measures ambition reach
 * against, and the thing a user could swap for another budget dataset.
 *
 * The budget facts:
 *   0. What the spending review is — source (BER), country, period, and the
 *      budget lines it contains (expandable to the full list, so "28 budget
 *      lines" is no longer an unexplained number).
 *   1. Where the money concentrates — by biodiversity OUTCOME (primary GLOBE)
 *      when the BER lines are classified: it leads with the dominant outcome
 *      and names the outcome areas that carry policy targets but no classified
 *      budget. This rollup leans on the LLM classification of each BER line to
 *      a GLOBE subcategory; with no such classification it falls back to the
 *      BER's OWN program names (a hard, AI-free split: air-pollution, waste...).
 *   2. Not all of it is spent — the BER's planned vs actual (a supporting
 *      line, labelled with its own wider period).
 */

import { useLocale, useTranslations } from "next-intl";

import { formatBerMoney } from "@/lib/financing-coherence";
import type {
  FinancingCoherenceSummary,
  FinancingProgramStat,
} from "@/lib/financing-coherence";
import type {
  CategoryBudgetEntry,
  CategoryBudgetSummary,
  OutcomeSubcategory,
} from "@/lib/coherence-budget";

const COLORS = ["var(--undp-blue)", "#0ea5e9"];
const REST = "#e5e7eb";

// Grid template shared by the outcome table's header, its outcome rows, and the
// indented subcategory rows — so the Share and Targets columns stay aligned
// across all three; only the name cell indents.
const OUTCOME_COLS = "grid grid-cols-[1fr_120px_46px] items-center gap-3";

export function FinancingCenterpiece({
  summary,
  outcomeBudget,
  outcomeSubcategories,
  countryName,
}: {
  summary: FinancingCoherenceSummary;
  /** Reviewed spend rolled up to primary GLOBE outcomes. When present, the
   *  hero block leads with the outcome concentration and the unfunded-outcome
   *  gap; when null (no GLOBE-classified BER) it falls back to the BER's own
   *  program-name concentration. */
  outcomeBudget?: CategoryBudgetSummary | null;
  /** Per-primary GLOBE subcategory distribution; a category row expands to
   *  show these. Keyed by primary id; empty/absent → that row is a leaf. */
  outcomeSubcategories?: Map<string, OutcomeSubcategory[]> | null;
  countryName: string;
}) {
  return (
    <div className="px-1 space-y-6">
      <BudgetObjectHeader summary={summary} countryName={countryName} />
      {outcomeBudget ? (
        <OutcomeConcentration
          outcomeBudget={outcomeBudget}
          subcategoriesByPrimary={outcomeSubcategories ?? null}
        />
      ) : (
        <Concentration summary={summary} />
      )}
      {summary.execution && (
        <ExecutionBar
          execution={summary.execution}
          unit={summary.unit}
          currency={summary.currency}
          reviewPeriod={summary.periodLabel}
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

// Hero (outcome variant) — where the money concentrates by biodiversity
// OUTCOME (primary GLOBE), and the gap the program-name view can't show:
// outcome areas that carry policy targets but no classified budget (an absent
// budget line never appears in a program list). Insight-first finding, then an
// ALWAYS-VISIBLE breakdown table — every outcome as a Share-of-BER bar with its
// policy-target count in a SEPARATE column, so a funded share and a target
// count never share a column. Money is the BER's classified subset, not the
// country's whole budget.
function OutcomeConcentration({
  outcomeBudget,
  subcategoriesByPrimary,
}: {
  outcomeBudget: CategoryBudgetSummary;
  subcategoriesByPrimary: Map<string, OutcomeSubcategory[]> | null;
}) {
  const t = useTranslations("briefing.financingCenter");
  const total = outcomeBudget.totalBudget;
  if (total <= 0) return null;

  // Funded outcomes ranked by spend; unfunded-but-targeted outcomes are the
  // gap (zero classified budget, yet policy targets land here), ranked by how
  // many targets sit unfunded. Both share the same table below, and each row
  // expands to its GLOBE subcategory distribution.
  const funded = outcomeBudget.entries
    .filter((e) => e.totalBudget > 0)
    .sort((a, b) => b.totalBudget - a.totalBudget);
  if (funded.length === 0) return null;
  const unfunded = outcomeBudget.entries
    .filter((e) => e.totalBudget === 0 && e.targetCount > 0)
    .sort((a, b) => b.targetCount - a.targetCount);

  const top = funded[0];
  const topPct = Math.round(top.shareOfTotalBudget * 100);
  // Scale every bar to the largest share so the dominant outcome fills the
  // track and the rest read relative to it (uniform-colour bar per row, like
  // the source table — not a categorical rainbow). Subcategory bars use the
  // same scale, so a subcategory reads as a fraction of the whole, not its
  // parent.
  const maxShare = outcomeBudget.maxShare || top.shareOfTotalBudget;
  const amount = formatBerMoney(
    total,
    outcomeBudget.unit,
    outcomeBudget.currency,
  );
  const subsFor = (id: string) => subcategoriesByPrimary?.get(id) ?? [];

  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-2">
        {t("outcome.eyebrow", { amount })}
      </p>

      {/* The finding, stated plainly — the concentration, then the gap. */}
      <p className="text-[13px] leading-relaxed text-[var(--undp-black)] mb-3">
        {topPct >= 50
          ? t("outcome.concentratesIn", {
              pct: topPct,
              category: top.categoryName,
            })
          : t("outcome.largestShare", {
              pct: topPct,
              category: top.categoryName,
            })}
        {unfunded.length > 0 && (
          <>
            {" "}
            <span className="text-[var(--undp-gray)]">
              {t("outcome.unfunded", { count: unfunded.length })}
            </span>
          </>
        )}
      </p>

      {/* Column headers — name the two number columns so a share and a target
          count are never read as the same quantity. */}
      <div
        className={`${OUTCOME_COLS} text-[9.5px] uppercase tracking-[0.1em] text-[var(--undp-gray)] mb-1`}
      >
        <span />
        <span className="text-right" title={t("outcome.shareCaveat")}>
          {t("outcome.colShare")}
        </span>
        <span className="text-right">{t("outcome.colTargets")}</span>
      </div>

      {/* Always-visible breakdown — every outcome, funded first. Each row
          expands to the subcategories that hold its spend or its targets. */}
      <ul>
        {funded.map((e) => (
          <OutcomeRow
            key={e.categoryId}
            entry={e}
            subs={subsFor(e.categoryId)}
            maxShare={maxShare}
          />
        ))}
        {unfunded.map((e, i) => (
          <OutcomeRow
            key={e.categoryId}
            entry={e}
            subs={subsFor(e.categoryId)}
            maxShare={maxShare}
            dividerTop={i === 0}
          />
        ))}
      </ul>
    </div>
  );
}

// One Share-of-BER cell: a bar scaled to the largest share + the % label. Used
// at both the outcome and subcategory level so they read on the same scale;
// `dim` is the lighter subcategory treatment.
function ShareCell({
  share,
  maxShare,
  dim,
}: {
  share: number;
  maxShare: number;
  dim?: boolean;
}) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={`relative flex-1 rounded-full bg-gray-100 overflow-hidden ${dim ? "h-1" : "h-1.5"}`}
      >
        <span
          className={`absolute inset-y-0 left-0 rounded-full ${dim ? "opacity-60" : ""}`}
          style={{
            width: `${maxShare > 0 ? (share / maxShare) * 100 : 0}%`,
            backgroundColor: "var(--undp-blue)",
          }}
        />
      </span>
      <span
        className={`tabular-nums w-8 text-right shrink-0 ${dim ? "text-[var(--undp-gray)]" : "text-[var(--undp-black)] font-medium"}`}
      >
        {/* "<1%" keeps a tiny-but-real share distinct from "no budget". */}
        {share > 0 && Math.round(share * 100) === 0
          ? "<1%"
          : `${Math.round(share * 100)}%`}
      </span>
    </span>
  );
}

// One outcome (primary GLOBE) row + its expandable subcategory distribution.
// Funded rows show a Share bar; unfunded rows show "no budget" — both still
// carry a target count, and both expand to the subcategories that hold the
// spend or the targets ("distribution within the category if given"). Rows with
// no subcategory data render as plain leaves.
function OutcomeRow({
  entry,
  subs,
  maxShare,
  dividerTop,
}: {
  entry: CategoryBudgetEntry;
  subs: OutcomeSubcategory[];
  maxShare: number;
  dividerTop?: boolean;
}) {
  const t = useTranslations("briefing.financingCenter");
  const funded = entry.totalBudget > 0;
  const hasSubs = subs.length > 0;
  const wrap = dividerTop ? "mt-1 border-t border-black/[0.06] pt-1.5" : "";

  const inner = (
    <>
      <span className="flex items-center gap-1 min-w-0">
        {hasSubs ? (
          <span
            aria-hidden="true"
            className="w-3 shrink-0 text-[9px] text-[var(--undp-gray)]/60 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
        ) : (
          <span aria-hidden="true" className="w-3 shrink-0" />
        )}
        <span
          className={`truncate ${funded ? "text-[var(--undp-black)]" : "text-[var(--undp-gray)]"}`}
          title={entry.categoryName}
        >
          {entry.categoryName}
        </span>
      </span>
      {funded ? (
        <ShareCell share={entry.shareOfTotalBudget} maxShare={maxShare} />
      ) : (
        <span className="text-right text-[11px] text-[var(--undp-gray)]/70">
          {t("outcome.noBudget")}
        </span>
      )}
      <span className="tabular-nums text-[var(--undp-black)] text-right shrink-0">
        {entry.targetCount}
      </span>
    </>
  );

  if (!hasSubs) {
    return (
      <li className={`${wrap} ${OUTCOME_COLS} py-[3px] text-[12px]`}>{inner}</li>
    );
  }

  return (
    <li className={wrap}>
      <details className="group">
        <summary
          className={`${OUTCOME_COLS} py-[3px] text-[12px] cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
        >
          {inner}
        </summary>
        <ul className="mb-1.5">
          {subs.map((s) => (
            <li key={s.id} className={`${OUTCOME_COLS} py-[2px] text-[11px]`}>
              <span className="flex items-center gap-1.5 min-w-0 pl-[18px]">
                <span className="font-mono text-[9.5px] text-[var(--undp-gray)]/70 shrink-0">
                  {s.id}
                </span>
                <span
                  className="truncate text-[var(--undp-gray)]"
                  title={s.name}
                >
                  {s.name}
                </span>
              </span>
              {s.hasBudget ? (
                <ShareCell share={s.shareOfTotalBudget} maxShare={maxShare} dim />
              ) : (
                <span className="text-right text-[10.5px] text-[var(--undp-gray)]/60">
                  {t("outcome.noBudget")}
                </span>
              )}
              <span className="tabular-nums text-[var(--undp-gray)] text-right shrink-0">
                {s.targetCount}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
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

// Supporting fact — a different, wider envelope than the year-by-year review
// above: a named multi-year program's planned-vs-actual, over its OWN period.
// The eyebrow names the program so this never reads as a continuation of the
// expenditure total above (the two figures don't reconcile — different scope).
function ExecutionBar({
  execution,
  unit,
  currency,
  reviewPeriod,
}: {
  execution: NonNullable<FinancingCoherenceSummary["execution"]>;
  unit: string;
  currency: string;
  reviewPeriod: string;
}) {
  const t = useTranslations("briefing.financingCenter");
  const locale = useLocale();
  // Prefer the active locale's program name (sourced from the BER), fall back
  // to the canonical name so non-localised data still renders.
  const programName =
    execution.programNameByLocale?.[locale] ?? execution.programName;
  const spentShare =
    execution.planned > 0 ? execution.actual / execution.planned : 0;
  const gapPct = Math.round((1 - spentShare) * 100);
  const widerThanReview = execution.period !== reviewPeriod;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1.5">
        {programName
          ? t("execution.eyebrowNamed", {
              program: programName,
              period: execution.period,
            })
          : t("execution.eyebrow", { period: execution.period })}
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
      {widerThanReview && (
        <p className="text-[10.5px] text-[var(--undp-gray)]/80 mt-1 leading-snug">
          {t("execution.scopeNote", {
            period: execution.period,
            reviewPeriod,
          })}
        </p>
      )}
    </div>
  );
}
