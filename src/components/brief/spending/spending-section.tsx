"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { keepCurrencyInLink } from "@/components/brief/contracts/currency-switch";
import type { Currency } from "@/components/brief/contracts/money";
import { moneyParts, per100 } from "@/lib/brief/contracts/money";
import type { BriefSource } from "@/lib/brief/source";
import {
  percentLabel,
  spendingAreas,
  spendingRecord,
  type SeriesId,
  type SpendingArea,
  type SpendingItem,
  type SpendingLine,
  type SpendingRecord,
  type SpendingSetup,
} from "@/lib/brief/spending";
import "./spending.css";

/** Squares in the record's field: one per unit of every hundred. */
const FIELD = 100;
/** Budget lines listed under an opened area, and review lines before "show all". */
const LINES_MAX = 8;
const ITEMS_MAX = 8;

/**
 * Reviewed public biodiversity spending in the brief, as the country's
 * expenditure review records it, in three steps that read as one: how much of
 * all public spending it is, year by year (each year's total first, the parts
 * the review keeps apart within it); the review's own lines; and what the
 * money is for, each area's share of the spending beside its share of the
 * targets. Amounts are in US$ (each year at its own rate) or in the review's
 * own currency, as the page's currency says. Money is UNDP blue; green and red
 * stay with alignment. What the section knows but does not say on its face is
 * kept in ./DISCLAIMERS.md.
 */
export function SpendingSection({
  setup,
  source,
  docs,
  currency = "usd",
  onCurrency,
  onExploreArea,
}: {
  setup: SpendingSetup;
  source: BriefSource;
  /** The brief's documents: the targets are read from these. */
  docs: string[];
  /** The page's currency: US$, or the review's own ("mnt" names it). */
  currency?: Currency;
  onCurrency?: (next: Currency) => void;
  /** Puts a biodiversity area in the centre of the ring, budget lines on. */
  onExploreArea?: (areaId: string) => void;
}) {
  const t = useTranslations("brief.spending");
  const money = useMoney(setup, currency);
  const record = useMemo(() => spendingRecord(setup), [setup]);
  const reading = useMemo(() => spendingAreas(setup, source, docs), [setup, source, docs]);

  const span = (years: string[]) => (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] ?? ""));
  const shown = span(setup.years.map((y) => y.year));
  const complete = span(setup.complete);
  const scope = t(`scope.${setup.scope}`);
  const every = per100(record.share);
  const choose = (next: Currency) => {
    onCurrency?.(next);
    keepCurrencyInLink(next);
  };

  return (
    <div className="sp-brief" data-testid="brief-spending">
      <header className="sp-head">
        <h2 id="brief-spending-title" className="sp-title" tabIndex={-1}>
          {t("title")}
        </h2>
        <p className="sp-source">
          {t("source", { years: shown })}
          {setup.illustrative && <span className="sp-note-inline">{t("illustrative")}</span>}
        </p>
        {money.local && onCurrency && (
          <div className="sp-switch" role="group" aria-label={t("currency")}>
            <span className="sp-switch-label">{t("currency")}</span>
            {(["usd", "mnt"] as const).map((c) => (
              <button key={c} type="button" className="sp-option" aria-pressed={currency === c} onClick={() => choose(c)}>
                {c === "usd" ? "US$" : money.localSign.trim()}
              </button>
            ))}
          </div>
        )}
      </header>

      <section className="sp-step" aria-labelledby="sp-record-headline">
        <div className="sp-step-head">
          <h3 id="sp-record-headline" className="brief-hub-headline">
            {t("record.headline", { sign: money.sign, every: money.n(every), scope, years: complete })}
          </h3>
        </div>
        <div className="sp-record">
          <div className="sp-record-side">
            <Field filled={every} label={t("fieldLabel", { sign: money.sign, every: money.n(every), scope })} />
            <dl className="sp-figures">
              <div>
                <dt>{t("record.reviewed", { years: complete })}</dt>
                <dd className="sp-figure" data-ink="blue">
                  {money.amount(record.reviewed, record.reviewedUsd)}
                </dd>
              </div>
              <div>
                <dt>{t("record.public", { scope, years: complete })}</dt>
                <dd className="sp-figure">{money.amount(record.public, record.publicUsd)}</dd>
              </div>
            </dl>
          </div>
          <YearChart setup={setup} record={record} money={money} scope={scope} />
        </div>
      </section>

      <AreasStep setup={setup} reading={reading} money={money} onExploreArea={onExploreArea} />

      <ItemsStep setup={setup} money={money} years={complete} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money in the page's currency
// ---------------------------------------------------------------------------

type Money = ReturnType<typeof useMoney>;

/** Amounts as the section states them: in US$, each year at its own rate, or
 *  in the review's own currency. A review in US$ (Panama's balboa, at par)
 *  has the one currency. */
function useMoney(setup: SpendingSetup, currency: Currency) {
  const t = useTranslations("brief.spending");
  const format = useFormatter();
  const base = setup.unit === "billion" ? 1e9 : 1e6;
  const local = setup.currency !== "US$";
  const usd = local && currency === "usd";
  const localSign = setup.currency === "MNT" ? "₮" : setup.currency === "LKR" ? "LKR " : "US$";
  const sign = usd ? "US$" : localSign;
  const say = (value: number, currencySign: string) => {
    const { amount, unit } = moneyParts(value);
    // A small amount keeps a figure rather than rounding to nothing.
    const digits = Math.abs(amount) > 0 && Math.abs(amount) < 1 ? 2 : Math.abs(amount) >= 100 ? 0 : 1;
    return t("money", { sign: currencySign, amount: format.number(amount, { maximumFractionDigits: digits }), unit });
  };
  /** An amount in whole units of the shown currency: the US$ twin, or the
   *  review's own amount scaled from its unit. */
  const whole = (value: number, twin: number | null) => (usd && twin !== null ? twin : value * base);
  return {
    /** The review has a currency of its own besides US$. */
    local,
    sign,
    localSign,
    /** An amount in the review's unit, with its US$ twin. */
    amount: (value: number, twin: number | null) => (usd && twin !== null ? say(twin, "US$") : say(value * base, localSign)),
    whole,
    n: (value: number) => format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    pct: (share: number) =>
      share > 0 && share < 0.001
        ? `<${format.number(0.001, { style: "percent", maximumFractionDigits: 1 })}`
        : format.number(share, { style: "percent", maximumFractionDigits: share < 0.1 ? 1 : 0 }),
    /** The chart's unit for its largest value in whole units: billion or
     *  million, whichever keeps that value at 1 or more. */
    scale: (largest: number) => (largest >= 1e9 ? { div: 1e9, unit: "billion" as const } : { div: 1e6, unit: "million" as const }),
    figure: (value: number) => format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  };
}

/** The record as a hundred squares, the reviewed share in blue: whole
 *  squares, then the part of one. */
function Field({ filled, label }: { filled: number; label: string }) {
  return (
    <div className="sp-field" role="img" aria-label={label}>
      {Array.from({ length: FIELD }, (_, i) => {
        const part = Math.max(0, Math.min(1, filled - i));
        return (
          <span key={i} className="sp-square">
            {part > 0 && <span className="sp-square-fill" style={{ width: `${part * 100}%` }} />}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The record by year
// ---------------------------------------------------------------------------

type YearRow = SpendingRecord["byYear"][number];
type YearPart = YearRow["parts"][number];

/**
 * Each year's reviewed spending. As amounts, the parts the review keeps apart
 * stand stacked into the year's total, the total said above the bar where the
 * year holds every part; a part the year's data do not hold is named under
 * the year, never drawn as zero. As shares, each part beside the other, as a
 * share of its own budget.
 */
function YearChart({ setup, record, money, scope }: { setup: SpendingSetup; record: SpendingRecord; money: Money; scope: string }) {
  const t = useTranslations("brief.spending.chart");
  const [mode, setMode] = useState<"amount" | "share">("amount");
  const [hover, setHover] = useState<{ year: string; series: SeriesId } | null>(null);
  const parts = setup.series.length > 1 ? (setup.series.includes("central") ? "levels" : "groups") : null;
  const known = (y: YearRow) => y.parts.filter((p) => p.reviewed !== null);
  const partWhole = (p: YearPart) => (p.reviewed === null ? 0 : money.whole(p.reviewed, p.usd));
  const stackWhole = (y: YearRow) => known(y).reduce((s, p) => s + partWhole(p), 0);
  const largest = Math.max(...record.byYear.map(stackWhole), 0);
  const scale = money.scale(largest);
  const topShare = Math.max(...record.byYear.flatMap((y) => y.parts.map((p) => p.share ?? 0)), 0) || 1;
  const unitLabel = t("unit", { sign: money.sign.trim(), unit: scale.unit });
  const shareOf = (p: YearPart) =>
    t("barShare", { share: money.pct(p.share ?? 0), scope: parts === "levels" ? t(`scopeOf.${p.series}`) : scope });

  const card = (y: YearRow, p: YearPart) => (
    <span className="sp-card" role="presentation">
      <strong>{t("bar", { series: t(`series.${p.series}`), year: y.year })}</strong>
      <span>{money.amount(p.reviewed ?? 0, p.usd)}</span>
      {p.share !== null && <span className="sp-card-muted">{shareOf(p)}</span>}
    </span>
  );

  return (
    <section className="sp-chart" aria-labelledby="sp-chart-title">
      <div className="sp-chart-head">
        <p id="sp-chart-title" className="sp-chart-title">
          {parts ? t("titleParts", { parts: t(`parts.${parts}`) }) : t("title")}
          <span className="sp-chart-unit">{mode === "amount" ? unitLabel : "%"}</span>
        </p>
        <div className="sp-switch" role="group" aria-label={t("switch")}>
          <button type="button" className="sp-option" aria-pressed={mode === "amount"} onClick={() => setMode("amount")}>
            {t("amounts")}
          </button>
          <button type="button" className="sp-option" aria-pressed={mode === "share"} onClick={() => setMode("share")}>
            {parts === "levels" ? t("sharesLevels") : t("shares", { scope })}
          </button>
        </div>
        {setup.series.length > 1 && (
          <ul className="sp-legend" aria-hidden="true">
            {setup.series.map((s) => (
              <li key={s}>
                <span className="sp-key" data-series={s} />
                {t(`series.${s}`)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="sp-plot" data-mode={mode} style={{ ["--sp-years" as string]: record.byYear.length }} aria-hidden="true">
        {record.byYear.map((y, i) => {
          const missing = y.parts.filter((p) => p.reviewed === null);
          const stack = stackWhole(y);
          // On a narrow screen the first and last years keep their figure.
          const edge = i === 0 || i === record.byYear.length - 1;
          return (
            <div key={y.year} className="sp-year">
              {mode === "amount" ? (
                <div className="sp-stack-slot">
                  {/* The year's total where it holds every part; else its one part. */}
                  <span className="sp-stack-value" data-total={y.complete ? "true" : undefined} data-edge={edge ? "true" : undefined}>
                    {stack > 0 ? money.figure(stack / scale.div) : ""}
                  </span>
                  <span className="sp-stack" style={{ height: `${largest > 0 ? (stack / largest) * 100 : 0}%` }}>
                    {[...known(y)].reverse().map((p) => {
                      const lit = hover?.year === y.year && hover.series === p.series;
                      return (
                        <span
                          key={p.series}
                          className="sp-seg"
                          data-series={p.series}
                          data-lit={lit ? "true" : undefined}
                          style={{ flexGrow: partWhole(p) }}
                          onMouseEnter={() => setHover({ year: y.year, series: p.series })}
                          onMouseLeave={() => setHover(null)}
                        >
                          {lit && card(y, p)}
                        </span>
                      );
                    })}
                  </span>
                </div>
              ) : (
                <div className="sp-bars">
                  {y.parts.map((p) => {
                    if (p.reviewed === null || p.share === null) return <span key={p.series} className="sp-bar-slot" />;
                    const lit = hover?.year === y.year && hover.series === p.series;
                    return (
                      <span
                        key={p.series}
                        className="sp-bar-slot"
                        onMouseEnter={() => setHover({ year: y.year, series: p.series })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <span className="sp-bar-value" data-edge={edge ? "true" : undefined}>
                          {money.pct(p.share)}
                        </span>
                        <span
                          className="sp-bar"
                          data-series={p.series}
                          data-lit={lit ? "true" : undefined}
                          style={{ height: `${Math.max(1.5, (p.share / topShare) * 100)}%` }}
                        />
                        {lit && card(y, p)}
                      </span>
                    );
                  })}
                </div>
              )}
              <span className="sp-year-label">{y.year}</span>
              {missing.length > 0 && (
                <span className="sp-year-missing" title={t("notInDataLong", { year: y.year, held: t(`held.${heldBy(y.parts)}`) })}>
                  {t("partNotInData", { part: t(`series.${missing[0].series}`) })}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <table className="brief-sr-only">
        <caption>{t("tableCaption", { unit: unitLabel })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("year")}</th>
            {setup.series.map((s) => (
              <th key={s} scope="col">
                {t(`series.${s}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {record.byYear.map((y) => (
            <tr key={y.year}>
              <th scope="row">{y.year}</th>
              {y.parts.map((p) => (
                <td key={p.series}>
                  {p.reviewed === null
                    ? t("notInData")
                    : `${money.amount(p.reviewed, p.usd)}${p.share !== null ? `, ${money.pct(p.share)}` : ""}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The part a year's data hold, where only one is in them. */
function heldBy(parts: { series: SeriesId; reviewed: number | null }[]): SeriesId {
  return parts.find((p) => p.reviewed !== null)?.series ?? "all";
}

// ---------------------------------------------------------------------------
// The review's own lines
// ---------------------------------------------------------------------------

function ItemsStep({ setup, money, years }: { setup: SpendingSetup; money: Money; years: string }) {
  const t = useTranslations("brief.spending.items");
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  // Where the review's data say who runs or holds each line (Panama,
  // Mongolia): by institution first, by programme on request. The title
  // names both and stays put.
  const institutions = setup.institutions?.length ? setup.institutions : null;
  const [by, setBy] = useState<"institution" | "programme">("institution");
  const list = institutions && by === "institution" ? institutions : setup.items;
  const total = list.reduce((s, i) => s + i.total, 0);
  const lead = list[0];
  if (!lead || total <= 0) return null;
  const shown = all ? list : list.slice(0, ITEMS_MAX);
  const max = lead.total;
  // What a row is, in the review's own terms: an institution (Sri Lanka), a
  // budget line (Country X), else a programme (Mongolia's programmes and
  // purpose codes, Panama's programmes).
  const unit = institutions
    ? by
    : setup.items.every((i) => i.kind === "institution")
      ? "institution"
      : setup.items.every((i) => i.kind === "line")
        ? "line"
        : "programme";
  const choose = (next: "institution" | "programme") => {
    setBy(next);
    setOpen(null);
    setAll(false);
  };
  return (
    <section className="sp-step" aria-labelledby="sp-items-title">
      <div className="sp-step-head">
        <h3 id="sp-items-title" className="brief-hub-headline">
          {t("title", { unit: institutions ? "both" : unit, years })}
        </h3>
        {institutions && (
          <div className="sp-switch" role="group" aria-label={t("switch")}>
            {(["institution", "programme"] as const).map((u) => (
              <button key={u} type="button" className="sp-option" aria-pressed={by === u} onClick={() => choose(u)}>
                {t(u === "institution" ? "byInstitution" : "byProgramme")}
              </button>
            ))}
          </div>
        )}
      </div>
      <ol className="sp-items" aria-label={t("listLabel", { unit })}>
        {shown.map((item) => {
          const isOpen = open === item.code;
          const panel = `sp-item-${item.code}`;
          return (
            <li key={item.code} className="sp-item" data-open={isOpen ? "true" : undefined}>
              <button type="button" className="sp-row sp-item-row" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? null : item.code)}>
                <span className="sp-item-name" title={item.original}>
                  {item.name}
                  {itemSub(item, t) && <span className="sp-item-sub">{itemSub(item, t)}</span>}
                </span>
                <span className="sp-cell" aria-hidden="true">
                  <span className="sp-bar-line" data-ink="spend">
                    <span style={{ width: `${Math.min(100, (item.total / max) * 100)}%` }} />
                  </span>
                  <span className="sp-pct" data-ink="spend">
                    {money.amount(item.total, item.totalUsd)}
                  </span>
                </span>
              </button>
              {isOpen && (
                <div className="sp-open" id={panel}>
                  <ItemDetail item={item} money={money} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {list.length > ITEMS_MAX && (
        <button type="button" className="brief-av-link sp-more" onClick={() => setAll((a) => !a)}>
          {all ? t("showFewer") : t("showAll", { count: list.length, unit })}
        </button>
      )}
    </section>
  );
}

function itemSub(item: SpendingItem, t: ReturnType<typeof useTranslations>): string {
  switch (item.kind) {
    case "programme":
      return t("kind.programme", { code: item.code });
    case "purpose":
      return t("kind.purpose", { code: item.code });
    case "programmeGroup":
      return item.sub ?? "";
    case "institutionGroup":
      return t("kind.programmes", { count: item.partsCount ?? 0 });
    case "institution":
      return item.sub === "core" ? t("kind.core") : t("kind.other");
    default:
      return "";
  }
}

function ItemDetail({ item, money }: { item: SpendingItem; money: Money }) {
  const t = useTranslations("brief.spending.items");
  return (
    <>
      {item.rates && item.rates.length > 0 && (
        <div className="sp-detail">
          <p className="sp-detail-title">
            {t("counted", {
              counted: money.amount(
                item.rates.reduce((s, r) => s + r.counted, 0),
                item.rates.some((r) => r.countedUsd === null) ? null : item.rates.reduce((s, r) => s + (r.countedUsd ?? 0), 0),
              ),
              spent: money.amount(
                item.rates.reduce((s, r) => s + r.spent, 0),
                item.rates.some((r) => r.spentUsd === null) ? null : item.rates.reduce((s, r) => s + (r.spentUsd ?? 0), 0),
              ),
            })}
          </p>
          <ul className="sp-detail-list">
            {item.rates.map((r) => (
              <li key={r.rate}>
                <span>{t("rate", { rate: money.pct(r.rate), name: r.name })}</span>
                <span className="sp-detail-amount">{money.amount(r.spent, r.spentUsd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.rate !== undefined && <p className="sp-open-line">{t("institutionRate", { rate: money.pct(item.rate) })}</p>}
      {item.rationale && <p className="sp-open-line sp-quote">{t("rationale", { text: item.rationale })}</p>}
      {item.bodies && item.bodies.names.length > 0 && (
        <div className="sp-detail">
          <p className="sp-detail-title">{t("bodies", { count: item.bodies.count, year: item.bodies.year })}</p>
          <ul className="sp-detail-list">
            {item.bodies.names.map((b) => (
              <li key={b.name}>
                <span>{b.name}</span>
                <span className="sp-detail-amount">{money.amount(b.amount, b.amountUsd)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.pays && item.pays.length > 0 && (
        <p className="sp-open-line">
          {t("pays", { list: item.pays.map((p) => `${p.name.toLowerCase()} ${percentLabel(p.share)}`).join(", ") })}
        </p>
      )}
      {item.parts && item.parts.length > 0 && (
        <div className="sp-detail">
          <p className="sp-detail-title">
            {item.kind === "institutionGroup" ? t("programmes") : t("parts", { count: item.partsCount ?? item.parts.length })}
          </p>
          <ul className="sp-detail-list">
            {item.parts.map((p) => (
              <li key={p.name}>
                <span title={p.original}>{p.name}</span>
                <span className="sp-detail-amount">{money.amount(p.amount, p.amountUsd ?? null)}</span>
              </li>
            ))}
          </ul>
          {(item.partsCount ?? 0) > item.parts.length && (
            <p className="sp-open-line">{t("partsMore", { count: (item.partsCount ?? 0) - item.parts.length })}</p>
          )}
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// What it is for
// ---------------------------------------------------------------------------

function AreasStep({
  setup,
  reading,
  money,
  onExploreArea,
}: {
  setup: SpendingSetup;
  reading: ReturnType<typeof spendingAreas>;
  money: Money;
  onExploreArea?: (areaId: string) => void;
}) {
  const t = useTranslations("brief.spending.areas");
  const [open, setOpen] = useState<string | null>(null);
  // Shares by default; amounts on request, the bars still drawn by share so
  // both columns stay on one scale.
  const [mode, setMode] = useState<"share" | "amount">("share");
  const { areas, apart } = reading;
  const maxShare = Math.max(...areas.flatMap((a) => [a.targetShare, a.spendShare]), apart.spendShare, 0.01);
  return (
    <section className="sp-step sp-step-areas" aria-labelledby="sp-areas-title">
      <div className="sp-step-head">
        <h3 id="sp-areas-title" className="brief-hub-headline">
          {t("title")}
        </h3>
        <div className="sp-switch" role="group" aria-label={t("switch")}>
          <button type="button" className="sp-option" aria-pressed={mode === "share"} onClick={() => setMode("share")}>
            {t("shares")}
          </button>
          <button type="button" className="sp-option" aria-pressed={mode === "amount"} onClick={() => setMode("amount")}>
            {t("amounts")}
          </button>
        </div>
      </div>
      <div className="sp-row sp-row-head" aria-hidden="true">
        <span>{t("colArea")}</span>
        <span>{mode === "amount" ? t("colTargetsCount") : t("colTargets")}</span>
        <span>{mode === "amount" ? t("colSpendAmount") : t("colSpend")}</span>
      </div>
      <ol className="sp-areas" data-mode={mode} aria-label={t("listLabel")}>
        {areas.map((a) => (
          <AreaRow
            key={a.id}
            area={a}
            maxShare={maxShare}
            mode={mode}
            open={open === a.id}
            onToggle={() => setOpen((cur) => (cur === a.id ? null : a.id))}
            money={money}
            showMatches={setup.showMatches}
            // The ring centres an area on its targets: none here, nothing to centre.
            onExplore={onExploreArea && a.targets.length > 0 ? () => onExploreArea(a.id) : undefined}
          />
        ))}
        {apart.lines.length > 0 && (
          <li className="sp-area sp-area-apart" data-open={open === "apart" ? "true" : undefined}>
            <button
              type="button"
              className="sp-row"
              aria-expanded={open === "apart"}
              aria-controls="sp-area-apart"
              onClick={() => setOpen((cur) => (cur === "apart" ? null : "apart"))}
            >
              <span className="sp-area-name">{t("apartRow")}</span>
              <span className="sp-cell" aria-hidden="true" />
              <Bar
                share={apart.spendShare}
                max={maxShare}
                ink="apart"
                label={mode === "amount" ? money.amount(apart.spend, apart.spendUsd) : percentLabel(apart.spendShare)}
              />
              <span className="brief-sr-only">{t("apartLabel", { spend: percentLabel(apart.spendShare) })}</span>
            </button>
            {open === "apart" && (
              <div className="sp-open" id="sp-area-apart">
                <LineList lines={apart.lines} money={money} label={t("linesLabel")} />
              </div>
            )}
          </li>
        )}
      </ol>
    </section>
  );
}

function AreaRow({
  area,
  maxShare,
  mode,
  open,
  onToggle,
  money,
  showMatches,
  onExplore,
}: {
  area: SpendingArea;
  maxShare: number;
  mode: "share" | "amount";
  open: boolean;
  onToggle: () => void;
  money: Money;
  showMatches: boolean;
  onExplore?: () => void;
}) {
  const t = useTranslations("brief.spending.areas");
  const panel = `sp-area-${area.id}`;
  const targetsLabel = mode === "amount" ? t("targetsCount", { count: area.targets.length }) : percentLabel(area.targetShare);
  const spendLabel = area.spend > 0 ? (mode === "amount" ? money.amount(area.spend, area.spendUsd) : percentLabel(area.spendShare)) : t("noSpend");
  return (
    <li className="sp-area" data-open={open ? "true" : undefined}>
      <button type="button" className="sp-row" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className="sp-area-name">{area.name}</span>
        <Bar share={area.targetShare} max={maxShare} ink="targets" label={targetsLabel} />
        <Bar share={area.spendShare} max={maxShare} ink="spend" label={spendLabel} />
        <span className="brief-sr-only">{t("rowLabel", { targets: targetsLabel, spend: spendLabel })}</span>
      </button>
      {open && (
        <div className="sp-open" id={panel}>
          <p className="sp-open-line">
            {t("targetsLine", { count: area.targets.length })}
            {showMatches && area.targets.length > 0 && (
              <>
                {" "}
                {t("matched", { matched: area.matched.length, total: area.targets.length })}{" "}
                <span className="sp-ai">{t("aiEstimated")}</span>
              </>
            )}
          </p>
          {area.coherence.total > 0 && (
            <p className="sp-open-line">
              {area.coherence.rated
                ? t("coherence", {
                    aligned: percentLabel(area.coherence.reinforce / area.coherence.total),
                    apart: percentLabel(area.coherence.apart / area.coherence.total),
                    total: area.coherence.total,
                  })
                : t("coherenceFew", { total: area.coherence.total })}
            </p>
          )}
          {area.lines.length > 0 ? (
            <LineList lines={area.lines} money={money} label={t("linesLabel")} />
          ) : (
            <p className="sp-open-line">{t("noLines")}</p>
          )}
          {onExplore && (
            <button type="button" className="brief-av-link" onClick={onExplore}>
              {t("explore")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function LineList({ lines, money, label }: { lines: SpendingLine[]; money: Money; label: string }) {
  const t = useTranslations("brief.spending.areas");
  return (
    <>
      <ul className="sp-lines" aria-label={label}>
        {lines.slice(0, LINES_MAX).map((l) => (
          <li key={l.id} className="sp-line">
            <span className="sp-line-name">
              <span title={l.original}>{l.name}</span>
              <span className="sp-line-status" data-status={l.areaStatus}>
                {l.areaStatus === "checked" ? t("checked") : l.areaStatus === "ai" ? t("aiSuggested") : t("apartWhy")}
              </span>
            </span>
            <span className="sp-line-amount">{money.amount(l.total, l.totalUsd)}</span>
          </li>
        ))}
      </ul>
      {lines.length > LINES_MAX && <p className="sp-open-line">{t("linesMore", { count: lines.length - LINES_MAX })}</p>}
    </>
  );
}

function Bar({ share, max, ink, label }: { share: number; max: number; ink: "targets" | "spend" | "apart"; label: string }) {
  return (
    <span className="sp-cell" aria-hidden="true">
      <span className="sp-bar-line" data-ink={ink}>
        <span style={{ width: `${Math.min(100, (share / max) * 100)}%` }} />
      </span>
      <span className="sp-pct" data-ink={ink}>
        {label}
      </span>
    </span>
  );
}
