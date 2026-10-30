"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Sparkline } from "@/components/ui/sparkline";
import {
  DEFAULT_NR7_SORT,
  NR7_STATUS_ORDER,
  nextNr7Sort,
  nr7Pairs,
  nr7Reading,
  sortNr7,
  type Nr7ReadRow,
  type Nr7RowStatus,
  type Nr7Setup,
  type Nr7Sort,
  type Nr7SortKey,
} from "@/lib/brief/nr7";
import type { Scope } from "@/lib/brief/compute";
import type { Nr7Detail, Nr7DetailIndicator, Nr7DetailSeries } from "@/lib/brief/nr7-detail";
import type { BriefCommitment, BriefSource } from "@/lib/brief/source";
import type { SpendingSetup } from "@/lib/brief/spending";
import { commitmentLine } from "../ink";
import { useMoney, type Money } from "../spending/spending-section";
import type { Currency } from "../contracts/money";
import "./nr7.css";

/** The national targets as the country's own 7th National Report rates them:
 *  how many it rates behind schedule, then one sortable row per target. A row
 *  opens on the report's indicators and answers beside what the AI reads against
 *  the target, with the targets behind its two shares collapsed, then the report's
 *  words. The shares and a link take the target to the ring's centre. What the
 *  section knows but does not say is in DISCLAIMERS.md. */

const STATUS_LABEL: Record<Nr7RowStatus, "onTrack" | "limited" | "noProgress" | "unknown"> = {
  on_track: "onTrack",
  limited: "limited",
  no_progress: "noProgress",
  unknown: "unknown",
};

/** Amounts need a review to name their currency; a country without one shows none. */
const NO_REVIEW = { unit: "million", currency: "US$" } as SpendingSetup;

export function Nr7Section({
  setup,
  spending,
  source,
  scope,
  currency = "usd",
  onExplore,
  onOpenPair,
}: {
  setup: Nr7Setup;
  spending?: SpendingSetup;
  source: BriefSource;
  /** The brief's documents and their comparisons: a target's pairs are read within these. */
  scope: Scope;
  currency?: Currency;
  onExplore?: (targetId: string) => void;
  onOpenPair: (a: string, b: string) => void;
}) {
  const t = useTranslations("brief.nr7");
  const format = useFormatter();
  const locale = useLocale();
  const money = useMoney(spending ?? NO_REVIEW, currency);
  const reading = useMemo(() => nr7Reading(setup, source, scope), [setup, source, scope]);
  const [sort, setSort] = useState<Nr7Sort>(DEFAULT_NR7_SORT);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));
  const rows = useMemo(
    () => sortNr7(reading.rows, sort, (r) => money.whole(r.spend, r.spendUsd)),
    [reading.rows, sort, money],
  );
  const total = reading.rows.length;
  const showActions = setup.rows.some((r) => r.actions !== null);
  const showLines = setup.rows.some((r) => r.lines !== null);
  const columns = 5 + (showLines ? 2 : 0) + (showActions ? 1 : 0);
  // Chrome has no Mongolian calendar: the page states the date as it is filed.
  const published = setup.publishedOn
    ? locale === "mn"
      ? setup.publishedOn
      : format.dateTime(new Date(`${setup.publishedOn}T00:00:00Z`), {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: "UTC",
        })
    : null;

  // A share goes straight to the target in the ring's centre.
  const share = (row: Nr7ReadRow, value: number | null) => {
    if (value === null) return "–";
    const target = row.targetId;
    if (!onExplore || !target) return money.pct(value);
    return (
      <button
        type="button"
        className="n7-share"
        title={t("explore")}
        onClick={(event) => {
          event.stopPropagation();
          onExplore(target);
        }}
      >
        {money.pct(value)}
      </button>
    );
  };

  const column = (key: Nr7SortKey, label: string, numeric = true) => {
    const active = sort.key === key;
    return (
      <th
        scope="col"
        data-numeric={numeric ? "true" : undefined}
        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          type="button"
          className="n7-sort"
          aria-label={t("sortBy", { column: label })}
          data-active={active ? "true" : undefined}
          onClick={() => setSort((cur) => nextNr7Sort(cur, key))}
        >
          {label}
          <span className="n7-sort-mark" aria-hidden="true">
            {active ? (sort.dir === "asc" ? "↑" : "↓") : ""}
          </span>
        </button>
      </th>
    );
  };

  return (
    <div className="n7-brief">
      <header className="n7-head">
        <h2 className="n7-title">{t("title")}</h2>
        {published && <p className="n7-source">{t("source", { date: published })}</p>}
      </header>

      <div className="n7-lead">
        <h3 className="brief-hub-headline">
          {reading.behind > 0
            ? t("headline", { country: source.countryName, behind: reading.behind, total })
            : t("headlineNone", { country: source.countryName, total })}
        </h3>
        <ul className="n7-strip">
          {NR7_STATUS_ORDER.filter((s) => reading.byStatus[s] > 0).map((status) => (
            <StatusGroup key={status} status={status} count={reading.byStatus[status]} />
          ))}
        </ul>
      </div>

      <div className="n7-table-wrap">
        <table className="n7-table" aria-label={t("listLabel")}>
          <thead>
            <tr>
              {column("number", t("col.target"), false)}
              {column("status", t("col.status"), false)}
              {column("indicators", t("col.indicators"))}
              {column("aligned", t("col.aligned"))}
              {column("apart", t("col.apart"))}
              {showLines && column("lines", t("col.lines"))}
              {showLines && column("spend", t("col.spend"))}
              {showActions && column("actions", t("col.actions"))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isOpen = open === row.id;
              return (
                <Fragment key={row.id}>
                  <tr
                    className="n7-row"
                    data-open={isOpen ? "true" : undefined}
                    onClick={() => toggle(row.id)}
                  >
                    <td className="n7-target">
                      <button
                        type="button"
                        className="n7-target-button"
                        aria-expanded={isOpen}
                        aria-controls={`n7-open-${row.id}`}
                        title={isOpen ? undefined : row.text}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(row.id);
                        }}
                      >
                        <span className="n7-number">{row.number}</span>
                        <span className="n7-label">{row.label}</span>
                      </button>
                    </td>
                    <td className="n7-status">
                      <StatusWord status={row.status} />
                    </td>
                    <td data-numeric="true">{row.indicators > 0 ? row.indicators : t("none")}</td>
                    <td data-numeric="true" data-tone="aligned">
                      {share(row, row.aligned)}
                    </td>
                    <td data-numeric="true" data-tone="apart">
                      {share(row, row.apart)}
                    </td>
                    {showLines && <td data-numeric="true">{row.lines === null || row.lines === 0 ? t("none") : row.lines}</td>}
                    {showLines && (
                      <td data-numeric="true" data-ink="blue">
                        {row.lines ? money.amount(row.spend, row.spendUsd) : "–"}
                      </td>
                    )}
                    {showActions && <td data-numeric="true">{row.actions ? row.actions : t("none")}</td>}
                  </tr>
                  {isOpen && (
                    <tr className="n7-open-row">
                      <td colSpan={columns} id={`n7-open-${row.id}`}>
                        <RowDetail
                          row={row}
                          country={source.countryId}
                          scope={scope}
                          spending={spending}
                          money={money}
                          onExplore={onExplore}
                          onOpenPair={onOpenPair}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusWord({ status }: { status: Nr7RowStatus }) {
  const tl = useTranslations("labels.nr7");
  return (
    <span className="n7-word">
      <span className="n7-mark" data-status={status} aria-hidden="true" />
      {tl(STATUS_LABEL[status])}
    </span>
  );
}

function StatusGroup({ status, count }: { status: Nr7RowStatus; count: number }) {
  const t = useTranslations("brief.nr7");
  const tl = useTranslations("labels.nr7");
  return (
    <li className="n7-group" aria-label={t("statusCount", { count, status: tl(STATUS_LABEL[status]) })}>
      <span className="n7-group-name" aria-hidden="true">
        <strong>{count}</strong> {tl(STATUS_LABEL[status])}
      </span>
      <span className="n7-group-marks" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="n7-mark" data-status={status} />
        ))}
      </span>
    </li>
  );
}

// ---------------------------------------------------------------------------
// An open row: the report's entry, read when the row opens
// ---------------------------------------------------------------------------

function useDetail(country: string, id: string, locale: string) {
  const [state, setState] = useState<{ detail?: Nr7Detail; failed?: boolean }>({});
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ country, id, locale });
    fetch(`/api/brief/nr7?${query}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((detail: Nr7Detail) => setState({ detail }))
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") setState({ failed: true });
      });
    return () => controller.abort();
  }, [country, id, locale]);
  return state;
}

function RowDetail({
  row,
  country,
  scope,
  spending,
  money,
  onExplore,
  onOpenPair,
}: {
  row: Nr7ReadRow;
  country: string;
  scope: Scope;
  spending?: SpendingSetup;
  money: Money;
  onExplore?: (targetId: string) => void;
  onOpenPair: (a: string, b: string) => void;
}) {
  const t = useTranslations("brief.nr7");
  const format = useFormatter();
  const locale = useLocale();
  const { detail, failed } = useDetail(country, row.id, locale);
  const target = row.targetId;
  const lines = useMemo(
    () =>
      target && spending
        ? spending.lines
            .filter((l) => l.matches.includes(target))
            .sort((a, b) => money.whole(b.total, b.totalUsd) - money.whole(a.total, a.totalUsd))
        : [],
    [target, spending, money],
  );
  const pairs = useMemo(() => (target ? nr7Pairs(scope, target) : { apart: [], aligned: [] }), [scope, target]);
  const partners = (list: BriefCommitment[]) =>
    list.map((c) => ({
      id: c.id,
      doc: scope.docs.find((d) => d.id === c.doc)?.name ?? c.doc,
      name: commitmentLine(c),
    }));
  const openPair = (other: string) => onOpenPair(target as string, other);
  const actions = detail?.actions ?? [];
  return (
    <div className="n7-open">
      <div className="n7-open-head">
        {row.label !== row.text && <p className="n7-open-text">{row.text}</p>}
        {onExplore && target && row.pairs > 0 && (
          <button type="button" className="brief-av-link" onClick={() => onExplore(target)}>
            {t("explore")}
          </button>
        )}
      </div>
      <div className="n7-open-grid">
        <section className="n7-part">
          <h4 className="n7-part-title">{t("reportPart")}</h4>
          {!detail && !failed && <p className="n7-open-line">{t("loading")}</p>}
          {failed && <p className="n7-open-line">{t("failed")}</p>}
          {detail && (
            <>
              <p className="n7-open-line">
                {detail.level && <span>{t("level", { level: detail.level })}</span>}
                {detail.gbf.length > 0 && (
                  <span>
                    {t("gbf")}:{" "}
                    {detail.gbf.map((g, i) => (
                      <Fragment key={g.code}>
                        {i > 0 && ", "}
                        <abbr title={g.title}>{g.code.replace("GBF-T0", "").replace("GBF-T", "")}</abbr>
                      </Fragment>
                    ))}
                  </span>
                )}
              </p>
              <Indicators indicators={detail.indicators} />
              <Answers answers={detail.answers} />
            </>
          )}
        </section>
        {(row.pairs > 0 || lines.length > 0 || actions.length > 0) && (
          <section className="n7-part">
            <h4 className="n7-part-title">{t("matching")}</h4>
            {lines.length > 0 && (
              <Listed
                title={t("linesTitle")}
                items={lines.map((l) => ({ id: l.id, name: l.name, side: money.amount(l.total, l.totalUsd) }))}
              />
            )}
            {actions.length > 0 && (
              <Listed title={t("actionsTitle")} items={actions.map((a) => ({ id: a.id, name: a.name, whole: a.text }))} />
            )}
            {row.pairs > 0 && (
              <div className="n7-pairs">
                <Pairs
                  title={`${t("col.apart")} (${format.number(pairs.apart.length)})`}
                  tone="apart"
                  items={partners(pairs.apart)}
                  onOpen={openPair}
                />
                <Pairs
                  title={`${t("col.aligned")} (${format.number(pairs.aligned.length)})`}
                  tone="aligned"
                  items={partners(pairs.aligned)}
                  onOpen={openPair}
                />
              </div>
            )}
          </section>
        )}
      </div>
      {detail && <Words words={detail.words} original={detail.original} />}
    </div>
  );
}

const WORD_PARTS = ["challenges", "progress", "actions", "effectiveness"] as const;

/** Past this a passage is clipped to four lines. */
const LONG_PASSAGE = 420;

/** The report's four passages, one at a time: together they run to pages. */
function Words({ words, original }: { words: Nr7Detail["words"]; original: Nr7Detail["original"] }) {
  const t = useTranslations("brief.nr7");
  const parts = WORD_PARTS.filter((p) => words[p]);
  const [picked, setPicked] = useState<(typeof WORD_PARTS)[number] | null>(null);
  const [more, setMore] = useState(false);
  const [own, setOwn] = useState(false);
  const part = picked ?? parts[0];
  if (!part) return null;
  const report = original?.[part] ?? null;
  const text = own && report ? report : (words[part] as string);
  const long = text.length > LONG_PASSAGE;
  return (
    <section className="n7-words">
      <h4 className="n7-part-title">{t("wordsTitle")}</h4>
      <p className="brief-av-choice" role="group" aria-label={t("wordsTitle")}>
        {parts.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === part}
            onClick={() => {
              setPicked(p);
              setMore(false);
            }}
          >
            {t(`words.${p}`)}
          </button>
        ))}
      </p>
      <p className="n7-words-text" data-clamped={long && !more ? "true" : undefined}>
        {text}
      </p>
      <p className="n7-words-links">
        {long && (
          <button type="button" className="brief-av-link" onClick={() => setMore((m) => !m)}>
            {more ? t("readLess") : t("readMore")}
          </button>
        )}
        {report && (
          <button type="button" className="brief-av-link" aria-pressed={own} onClick={() => setOwn((o) => !o)}>
            {t("original")}
          </button>
        )}
      </p>
    </section>
  );
}

const INDICATORS_SHOWN = 3;

function Indicators({ indicators }: { indicators: Nr7DetailIndicator[] }) {
  const t = useTranslations("brief.nr7");
  const [all, setAll] = useState(false);
  // A target's own indicators lead; those the report files across its targets
  // wait for a click, unless the target has no other.
  const own = indicators.filter((i) => !i.shared);
  const lead = (own.length > 0 ? own : indicators).slice(0, INDICATORS_SHOWN);
  const shown = all ? indicators : lead;
  return (
    <section className="n7-block">
      <h5 className="n7-subtitle">{t("indicatorsTitle")}</h5>
      {indicators.length === 0 ? (
        <p className="n7-open-line">{t("noIndicators")}</p>
      ) : (
        <ul className="n7-indicators">
          {shown.map((i) => (
            <IndicatorItem key={i.id} indicator={i} />
          ))}
        </ul>
      )}
      {indicators.length > lead.length && !all && (
        <button type="button" className="brief-av-link" onClick={() => setAll(true)}>
          {t("showAllIndicators", { count: indicators.length })}
        </button>
      )}
    </section>
  );
}

const SERIES_SHOWN = 2;

function IndicatorItem({ indicator }: { indicator: Nr7DetailIndicator }) {
  const t = useTranslations("brief.nr7");
  const [all, setAll] = useState(false);
  // The longest breakdowns speak for the indicator; the rest wait for a click.
  const series = [...indicator.series].sort((a, b) => b.points.length - a.points.length);
  const shown = all ? series : series.slice(0, SERIES_SHOWN);
  return (
    <li className="n7-indicator">
      <span className="n7-indicator-name">
        {indicator.label}
        {indicator.shared && <span className="n7-tag">{t("shared")}</span>}
      </span>
      {shown.map((s, i) => (
        <SeriesLine key={i} series={s} />
      ))}
      {series.length > shown.length && (
        <button type="button" className="brief-av-link" onClick={() => setAll(true)}>
          {t("moreSeries", { count: series.length - shown.length })}
        </button>
      )}
      {series.length === 0 && <span className="n7-indicator-note">{indicator.note ?? t("noValue")}</span>}
    </li>
  );
}

function SeriesLine({ series }: { series: Nr7DetailSeries }) {
  const t = useTranslations("brief.nr7");
  const format = useFormatter();
  const value = (v: number) => `${format.number(v, { maximumFractionDigits: 2 })}${series.unit ? ` ${series.unit}` : ""}`;
  const first = series.points[0];
  const last = series.points[series.points.length - 1];
  return (
    <span className="n7-indicator-value">
      {series.points.length > 1 && (
        <Sparkline
          data={series.points.map((p) => ({ year: String(p.year), value: p.value }))}
          color="var(--brief-ink)"
          width={56}
          height={16}
        />
      )}
      <span>
        {series.label ? `${series.label}: ` : ""}
        {series.points.length > 1
          ? t("change", { first: value(first.value), from: first.year, last: value(last.value), to: last.year })
          : t("latest", { value: value(last.value), year: last.year })}
      </span>
    </span>
  );
}

const ANSWER_ORDER = ["yes", "partially", "under_development", "no"] as const;

function Answers({ answers }: { answers: Nr7Detail["answers"] }) {
  const t = useTranslations("brief.nr7");
  const [open, setOpen] = useState(false);
  const { mix, items } = answers;
  if (items.length === 0) return null;
  const counts = { yes: mix.yes, partially: mix.partially, under_development: mix.underDevelopment, no: mix.no };
  const scale = ANSWER_ORDER.reduce((s, k) => s + counts[k], 0);
  return (
    <section className="n7-block">
      <h5 className="n7-subtitle">{t("answersTitle")}</h5>
      {scale > 0 && (
        <span className="n7-answer-bar" aria-hidden="true">
          {ANSWER_ORDER.filter((k) => counts[k] > 0).map((k) => (
            <span key={k} data-answer={k} style={{ flexGrow: counts[k] }} />
          ))}
        </span>
      )}
      <ul className="n7-answer-key">
        {ANSWER_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <li key={k}>
            <span className="n7-answer-swatch" data-answer={k} aria-hidden="true" />
            <strong>{counts[k]}</strong> {t(`answer.${k}`)}
          </li>
        ))}
        {mix.other > 0 && (
          <li>
            <strong>{mix.other}</strong> {t("answer.other")}
          </li>
        )}
      </ul>
      <button type="button" className="brief-av-link" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? t("hideAnswers") : t("showAnswers")}
      </button>
      {open && (
        <ul className="n7-questions">
          {items.map((a, i) => (
            <li key={i}>
              <span>{a.question}</span> <strong>{a.value ? t(`answer.${a.value}`) : a.response}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const LISTED_SHOWN = 4;

interface ListedItem {
  id: string;
  name: string;
  doc?: string;
  side?: string;
  whole?: string;
}

function ListedRows({ items, onOpen }: { items: ListedItem[]; onOpen?: (id: string) => void }) {
  const t = useTranslations("brief.nr7");
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LISTED_SHOWN);
  return (
    <>
      <ul className="n7-listed">
        {shown.map((item) => (
          <li key={item.id}>
            {onOpen ? (
              <button type="button" className="n7-listed-open" onClick={() => onOpen(item.id)}>
                {item.doc && <span className="n7-listed-doc">{item.doc} · </span>}
                {item.name}
              </button>
            ) : (
              <span title={item.whole}>{item.name}</span>
            )}
            {item.side && <span className="n7-listed-side">{item.side}</span>}
          </li>
        ))}
      </ul>
      {items.length > LISTED_SHOWN && !all && (
        <button type="button" className="brief-av-link" onClick={() => setAll(true)}>
          {t("showAllIndicators", { count: items.length })}
        </button>
      )}
    </>
  );
}

function Listed({ title, items }: { title: string; items: ListedItem[] }) {
  return (
    <section className="n7-block">
      <h5 className="n7-subtitle">{title}</h5>
      <ListedRows items={items} />
    </section>
  );
}

/** The targets behind one of a row's shares: collapsed, the count in view. */
function Pairs({
  title,
  tone,
  items,
  onOpen,
}: {
  title: string;
  tone: "aligned" | "apart";
  items: ListedItem[];
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) {
    return (
      <p className="n7-pairs-none" data-tone={tone}>
        {title}
      </p>
    );
  }
  return (
    <section className="n7-block">
      <button type="button" className="n7-disclose" data-tone={tone} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="ex-chevron" aria-hidden="true" />
        {title}
      </button>
      {open && <ListedRows items={items} onOpen={onOpen} />}
    </section>
  );
}
