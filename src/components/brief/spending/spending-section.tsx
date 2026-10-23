"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
  type SpendingSetup,
} from "@/lib/brief/spending";
import "./spending.css";

/** Squares in the record's field: one per unit of every hundred. */
const FIELD = 100;
/** Budget lines listed under an opened area, and review lines before "show all". */
const LINES_MAX = 8;
const ITEMS_MAX = 8;
/** Above this many bars, only the last year's carry their figure in place. */
const LABELLED_BARS = 12;

/**
 * Reviewed public biodiversity spending in the brief, as the country's
 * expenditure review records it: the record out of all public spending, by
 * year and by the parts the review keeps apart; the review's own lines; and
 * what the money is for, each area's share of the spending beside its share
 * of the targets. Money is UNDP blue; green and red stay with alignment.
 */
export function SpendingSection({
  setup,
  source,
  docs,
  onExploreArea,
}: {
  setup: SpendingSetup;
  source: BriefSource;
  /** The brief's documents: the targets are read from these. */
  docs: string[];
  /** Puts a biodiversity area in the centre of the ring, budget lines on. */
  onExploreArea?: (areaId: string) => void;
}) {
  const t = useTranslations("brief.spending");
  const money = useMoney(setup);
  const record = useMemo(() => spendingRecord(setup), [setup]);
  const reading = useMemo(() => spendingAreas(setup, source, docs), [setup, source, docs]);

  const span = (years: string[]) => (years.length > 1 ? `${years[0]}–${years[years.length - 1]}` : (years[0] ?? ""));
  const shown = span(setup.years.map((y) => y.year));
  const complete = span(setup.complete);
  const scope = t(`scope.${setup.scope}`);
  const every = per100(record.share);

  return (
    <div className="sp-brief" data-testid="brief-spending">
      <header className="sp-head">
        <h2 id="brief-spending-title" className="sp-title" tabIndex={-1}>
          {t("title")}
        </h2>
        <p className="sp-source">
          {t("source", { years: shown })}
          {setup.notes.includes("atPar") && <span className="sp-note-inline">{t("atPar")}</span>}
          {setup.illustrative && <span className="sp-note-inline">{t("illustrative")}</span>}
        </p>
      </header>

      <section className="sp-step" aria-labelledby="sp-record-headline">
        <Field filled={every} label={t("fieldLabel", { sign: money.sign, every: money.n(every), scope })} />
        <div className="sp-side">
          <p className="brief-hub-kicker">{t("record.kicker")}</p>
          <h3 id="sp-record-headline" className="brief-hub-headline">
            {t("record.headline", { sign: money.sign, every: money.n(every), scope, years: complete })}
          </h3>
          <dl className="sp-figures">
            <div>
              <dt>{t("record.reviewed", { years: complete })}</dt>
              <dd className="sp-figure" data-ink="blue">
                {money.amount(record.reviewed)}
              </dd>
              {record.reviewedUsd !== null && <dd className="sp-figure-usd">{money.usd(record.reviewedUsd)}</dd>}
            </div>
            <div>
              <dt>{t("record.public", { scope, years: complete })}</dt>
              <dd className="sp-figure">{money.amount(record.public)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <YearChart setup={setup} record={record} money={money} scope={scope} />

      <ItemsStep setup={setup} money={money} years={complete} />

      <AreasStep setup={setup} reading={reading} money={money} years={complete} onExploreArea={onExploreArea} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money in the review's currency, with US$ beside it
// ---------------------------------------------------------------------------

type Money = ReturnType<typeof useMoney>;

function useMoney(setup: SpendingSetup) {
  const t = useTranslations("brief.spending");
  const format = useFormatter();
  const base = setup.unit === "billion" ? 1e9 : 1e6;
  const sign = setup.currency === "MNT" ? "₮" : setup.currency === "LKR" ? "LKR " : "US$";
  const say = (value: number, currencySign: string) => {
    const { amount, unit } = moneyParts(value);
    // A small amount keeps a figure rather than rounding to nothing.
    const digits = Math.abs(amount) > 0 && Math.abs(amount) < 1 ? 2 : Math.abs(amount) >= 100 ? 0 : 1;
    return t("money", {
      sign: currencySign,
      amount: format.number(amount, { maximumFractionDigits: digits }),
      unit,
    });
  };
  return {
    sign,
    /** An amount in the record's unit, in the review's currency. */
    amount: (value: number) => say(value * base, sign),
    /** A sum already in whole US$. */
    usd: (dollars: number) => say(dollars, "US$"),
    n: (value: number) => format.number(value, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    pct: (share: number) =>
      share > 0 && share < 0.001
        ? `<${format.number(0.001, { style: "percent", maximumFractionDigits: 1 })}`
        : format.number(share, { style: "percent", maximumFractionDigits: share < 0.1 ? 1 : 0 }),
    /** The chart's unit and the scale of its figures: the larger of
     *  billion or million that keeps the largest bar at 1 or more. */
    chartScale: (largest: number) => {
      const abs = largest * base;
      return abs >= 1e9 ? { div: 1e9 / base, unit: "billion" as const } : { div: 1e6 / base, unit: "million" as const };
    },
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

function YearChart({
  setup,
  record,
  money,
  scope,
}: {
  setup: SpendingSetup;
  record: ReturnType<typeof spendingRecord>;
  money: Money;
  scope: string;
}) {
  const t = useTranslations("brief.spending.chart");
  const [mode, setMode] = useState<"amount" | "share">("amount");
  const [hover, setHover] = useState<{ year: string; series: SeriesId } | null>(null);
  const parts = setup.series.length > 1 ? (setup.series.includes("central") ? "levels" : "groups") : null;
  const largest = Math.max(...record.byYear.flatMap((y) => y.parts.map((p) => p.reviewed ?? 0)), 0);
  const scale = money.chartScale(largest);
  const value = (p: { reviewed: number | null; share: number | null }) => (mode === "amount" ? p.reviewed : p.share);
  const top = Math.max(...record.byYear.flatMap((y) => y.parts.map((p) => value(p) ?? 0)), 0) || 1;
  const bars = record.byYear.reduce((n, y) => n + y.parts.filter((p) => p.reviewed !== null).length, 0);
  const lastYear = record.byYear[record.byYear.length - 1]?.year;
  const unitLabel = t("unit", { sign: money.sign.trim(), unit: scale.unit });

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
      <div className="sp-plot" style={{ ["--sp-years" as string]: record.byYear.length }} aria-hidden="true">
        {record.byYear.map((y) => (
          <div key={y.year} className="sp-year">
            <div className="sp-bars">
              {y.parts.map((p) => {
                const v = value(p);
                if (p.reviewed === null) {
                  return (
                    <span key={p.series} className="sp-missing" data-series={p.series} title={t("notInDataLong", { year: y.year, held: t(`held.${heldBy(y.parts)}`) })}>
                      {t("notInData")}
                    </span>
                  );
                }
                const lit = hover?.year === y.year && hover.series === p.series;
                const labelled = bars <= LABELLED_BARS || y.year === lastYear;
                return (
                  <span
                    key={p.series}
                    className="sp-bar-slot"
                    onMouseEnter={() => setHover({ year: y.year, series: p.series })}
                    onMouseLeave={() => setHover(null)}
                  >
                    {labelled && v !== null && (
                      <span className="sp-bar-value">{mode === "amount" ? money.figure(v / scale.div) : money.pct(v)}</span>
                    )}
                    <span
                      className="sp-bar"
                      data-series={p.series}
                      data-lit={lit ? "true" : undefined}
                      style={{ height: `${Math.max(1.5, ((v ?? 0) / top) * 100)}%` }}
                    />
                    {lit && (
                      <span className="sp-card" role="presentation">
                        <strong>{t("bar", { series: t(`series.${p.series}`), year: y.year })}</strong>
                        <span>{money.amount(p.reviewed)}</span>
                        {p.usd !== null && <span className="sp-card-muted">{money.usd(p.usd)}</span>}
                        {p.share !== null && (
                          <span className="sp-card-muted">
                            {t("barShare", { share: money.pct(p.share), scope: parts === "levels" ? t(`scopeOf.${p.series}`) : scope })}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
            <span className="sp-year-label">{y.year}</span>
            {y.total !== null && setup.series.length > 1 && mode === "amount" && (
              <span className="sp-year-total">{t("inAll", { amount: money.amount(y.total) })}</span>
            )}
          </div>
        ))}
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
                    : `${money.amount(p.reviewed)}${p.share !== null ? `, ${money.pct(p.share)}` : ""}`}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {setup.notes.includes("panama2015") && <p className="sp-footnote">{t("panama2015")}</p>}
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
  const total = setup.items.reduce((s, i) => s + i.total, 0);
  const lead = setup.items[0];
  if (!lead || total <= 0) return null;
  const shown = all ? setup.items : setup.items.slice(0, ITEMS_MAX);
  const max = lead.total;
  return (
    <section className="sp-step sp-step-list" aria-labelledby="sp-items-headline">
      <div>
        <p className="brief-hub-kicker">{t("kicker")}</p>
        <h3 id="sp-items-headline" className="brief-hub-headline">
          {t("headline", { name: lead.name, share: percentLabel(lead.total / total), years })}
        </h3>
        <ol className="sp-items" aria-label={t("listLabel")}>
          {shown.map((item) => {
            const isOpen = open === item.code;
            const panel = `sp-item-${item.code}`;
            return (
              <li key={item.code} className="sp-item" data-open={isOpen ? "true" : undefined}>
                <button type="button" className="sp-item-row" aria-expanded={isOpen} aria-controls={panel} onClick={() => setOpen(isOpen ? null : item.code)}>
                  <span className="sp-item-name">
                    {item.name}
                    <Translated shown={item} />
                    {itemSub(item, t) && <span className="sp-item-sub">{itemSub(item, t)}</span>}
                  </span>
                  <span className="sp-cell" aria-hidden="true">
                    <span className="sp-bar-line" data-ink="spend">
                      <span style={{ width: `${Math.min(100, (item.total / max) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="sp-item-amount">{money.amount(item.total)}</span>
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
        {setup.items.length > ITEMS_MAX && (
          <button type="button" className="brief-av-link" onClick={() => setAll((a) => !a)}>
            {all ? t("showFewer") : t("showAll", { count: setup.items.length })}
          </button>
        )}
      </div>
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
      {item.totalUsd !== null && <p className="sp-open-line">{t("inUsd", { usd: money.usd(item.totalUsd) })}</p>}
      {item.rates && item.rates.length > 0 && (
        <div className="sp-detail">
          <p className="sp-detail-title">
            {t("counted", {
              counted: money.amount(item.rates.reduce((s, r) => s + r.counted, 0)),
              spent: money.amount(item.rates.reduce((s, r) => s + r.spent, 0)),
            })}
          </p>
          <ul className="sp-detail-list">
            {item.rates.map((r) => (
              <li key={r.rate}>
                <span>{t("rate", { rate: money.pct(r.rate), name: r.name })}</span>
                <span className="sp-detail-amount">{money.amount(r.spent)}</span>
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
                <span className="sp-detail-amount">{money.amount(b.amount)}</span>
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
          <p className="sp-detail-title">{t("parts", { count: item.partsCount ?? item.parts.length })}</p>
          <ul className="sp-detail-list">
            {item.parts.map((p) => (
              <li key={p.name}>
                <span>
                  {p.name}
                  <Translated shown={p} />
                </span>
                <span className="sp-detail-amount">{money.amount(p.amount)}</span>
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
  years,
  onExploreArea,
}: {
  setup: SpendingSetup;
  reading: ReturnType<typeof spendingAreas>;
  money: Money;
  years: string;
  onExploreArea?: (areaId: string) => void;
}) {
  const t = useTranslations("brief.spending.areas");
  const [open, setOpen] = useState<string | null>(null);
  const { areas, apart } = reading;
  const lead = [...areas].sort((a, b) => b.spendShare - a.spendShare)[0];
  const maxShare = Math.max(...areas.flatMap((a) => [a.targetShare, a.spendShare]), apart.spendShare, 0.01);
  const linesTotal = setup.lines.reduce((s, l) => s + l.total, 0);
  return (
    <section className="sp-step sp-step-areas" aria-labelledby="sp-areas-headline">
      <div className="sp-areas-intro">
        <p className="brief-hub-kicker">
          {t("kicker")} <span className="sp-ai">{t("ai")}</span>
        </p>
        {lead && lead.spend > 0 && (
          <h3 id="sp-areas-headline" className="brief-hub-headline">
            {t("headline", { area: lead.name, spend: percentLabel(lead.spendShare), targets: percentLabel(lead.targetShare) })}
          </h3>
        )}
        {setup.notes.includes("projects") && (
          <p className="sp-lede">{t("projects", { count: setup.lines.length, amount: money.amount(linesTotal), years })}</p>
        )}
      </div>
      <div className="sp-row sp-row-head" aria-hidden="true">
        <span>{t("colArea")}</span>
        <span>{t("colTargets")}</span>
        <span>{t("colSpend")}</span>
      </div>
      <ol className="sp-areas" aria-label={t("listLabel")}>
        {areas.map((a) => (
          <AreaRow
            key={a.id}
            area={a}
            maxShare={maxShare}
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
              <Bar share={apart.spendShare} max={maxShare} ink="apart" label={percentLabel(apart.spendShare)} />
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
      <p className="sp-footnote">{t("checkedCount", { checked: reading.checked, total: setup.lines.length })}</p>
    </section>
  );
}

function AreaRow({
  area,
  maxShare,
  open,
  onToggle,
  money,
  showMatches,
  onExplore,
}: {
  area: SpendingArea;
  maxShare: number;
  open: boolean;
  onToggle: () => void;
  money: Money;
  showMatches: boolean;
  onExplore?: () => void;
}) {
  const t = useTranslations("brief.spending.areas");
  const panel = `sp-area-${area.id}`;
  return (
    <li className="sp-area" data-open={open ? "true" : undefined}>
      <button type="button" className="sp-row" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className="sp-area-name">{area.name}</span>
        <Bar share={area.targetShare} max={maxShare} ink="targets" label={percentLabel(area.targetShare)} />
        <Bar
          share={area.spendShare}
          max={maxShare}
          ink="spend"
          label={area.spend > 0 ? percentLabel(area.spendShare) : t("noSpend")}
        />
        <span className="brief-sr-only">
          {t("rowLabel", { targets: percentLabel(area.targetShare), spend: percentLabel(area.spendShare) })}
        </span>
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
              {l.name}
              <Translated shown={l} />
              <span className="sp-line-status" data-status={l.areaStatus}>
                {l.areaStatus === "checked" ? t("checked") : l.areaStatus === "ai" ? t("aiSuggested") : t("apartWhy")}
              </span>
            </span>
            <span className="sp-line-amount">{money.amount(l.total)}</span>
          </li>
        ))}
      </ul>
      {lines.length > LINES_MAX && <p className="sp-open-line">{t("linesMore", { count: lines.length - LINES_MAX })}</p>}
    </>
  );
}

/** A machine-translated name says so, with the review's own name on hover. */
function Translated({ shown }: { shown: { translated?: true; original?: string } }) {
  const t = useTranslations("brief.spending");
  if (!shown.translated) return null;
  return (
    <span className="sp-ai" title={shown.original}>
      {t("translated")}
    </span>
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
