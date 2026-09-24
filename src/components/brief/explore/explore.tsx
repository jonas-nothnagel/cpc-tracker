"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import {
  arcTally,
  buildExploreModel,
  focusProfile,
  groupByDocument,
  groupByLens,
  levelBetween,
  mechanismBetween,
  seatOrder,
  seatRelation,
  toneCountsOf,
  OTHER_GROUP,
  type ExploreModel,
} from "@/lib/brief/explore/model";
import { searchTargets } from "@/lib/brief/explore/search";
import type { ExploreAction, ExploreGroup, ExploreState } from "@/lib/brief/explore/state";
import type { BriefCommitment, BriefSource } from "@/lib/brief/source";
import { clip, commitmentLine, useNumbers } from "../ink";
import { ResultBar } from "../sections/documents";
import { PairView } from "./pair-view";
import { RING_INK, RingCanvas, type ArcLabel, type SeatStyle, type Spoke } from "./ring-canvas";
import "./explore.css";

/** Targets each ranked list shows at rest, and marks on the ring. */
const RANKED = 6;
/** Search results shown before "Show all". */
const RESULTS = 24;

type Tally = ReturnType<typeof arcTally>;

/** The ring's inks in words, with their counts: the legend is the tally. */
const KEY: { tone: "reinforce" | "partial" | "none" | "apart"; count: (p: ReturnType<typeof focusProfile>) => number }[] = [
  { tone: "reinforce", count: (p) => p.counts.strong + p.counts.aligned },
  { tone: "partial", count: (p) => p.counts.partial },
  { tone: "none", count: (p) => p.counts.none },
  { tone: "apart", count: (p) => p.counts.apart },
];

/** A seat's ink when a target is in the centre. */
function relationStyle(relation: ReturnType<typeof seatRelation>): SeatStyle {
  switch (relation) {
    case "strong":
    case "aligned":
      return { color: RING_INK.green };
    case "partial":
      return { color: RING_INK.partial };
    case "none":
      return { color: RING_INK.none };
    case "apart":
      return { color: RING_INK.red, texture: true };
    default:
      return { color: RING_INK.rest, hollow: true };
  }
}

/** Ranked rows at rest: a target, its document, its count as a halftone bar. */
function RankRows({
  rows,
  tone,
  docName,
  onFocus,
  onHover,
  testId,
}: {
  rows: { commitment: BriefCommitment; value: number }[];
  tone: "reinforce" | "apart";
  docName: (id: string) => string;
  onFocus: (id: string) => void;
  onHover: (id: string | null) => void;
  testId: string;
}) {
  const { n } = useNumbers();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="ex-rank">
      {rows.map((row, i) => (
        <li
          key={row.commitment.id}
          className="ex-rank-row"
          data-testid={testId}
          onPointerEnter={() => onHover(row.commitment.id)}
          onPointerLeave={() => onHover(null)}
        >
          <span className="ex-rank-n">{i + 1}</span>
          <button
            type="button"
            className="ex-rank-main"
            onClick={() => onFocus(row.commitment.id)}
            onFocus={() => onHover(row.commitment.id)}
            onBlur={() => onHover(null)}
          >
            <span className="ex-rank-title">{commitmentLine(row.commitment)}</span>
            <span className="ex-rank-meta">{docName(row.commitment.doc)}</span>
          </button>
          <span className={`ex-rank-bar ex-rank-bar-${tone}`} aria-hidden="true">
            <span style={{ width: `${((row.value / max) * 100).toFixed(1)}%` }} />
          </span>
          <span className="ex-rank-value">{n(row.value)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Partners of the target in the centre, one row each, marked with the
 *  rating's ink. */
function PartnerRows({
  ids,
  model,
  focus,
  tone,
  docName,
  selected,
  onSelect,
  onHover,
  mechanismLabel,
  testId,
}: {
  ids: number[];
  model: ExploreModel;
  focus: number;
  tone: "reinforce" | "apart";
  docName: (id: string) => string;
  selected: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  mechanismLabel: (m: string) => string;
  testId: string;
}) {
  const t = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const shown = all ? ids : ids.slice(0, 8);
  return (
    <>
      <ol className="brief-panel-rows ex-rows">
        {shown.map((i) => {
          const c = model.items[i];
          const mechanism = tone === "apart" ? mechanismBetween(model, focus, i) : null;
          return (
            <li
              key={c.id}
              className="brief-panel-row"
              data-testid={testId}
              data-selected={selected === c.id ? "true" : undefined}
              onPointerEnter={() => onHover(c.id)}
              onPointerLeave={() => onHover(null)}
            >
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                onFocus={() => onHover(c.id)}
                onBlur={() => onHover(null)}
              >
                <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
                <span className="brief-panel-row-main">
                  <span className="brief-panel-row-line">
                    <span className="brief-panel-row-doc">{docName(c.doc)} · </span>
                    {commitmentLine(c)}
                  </span>
                  {mechanism && <span className="brief-panel-row-type">{mechanismLabel(mechanism)}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {!all && ids.length > shown.length && (
        <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
          {t("showAll", { count: ids.length })}
        </button>
      )}
    </>
  );
}

/**
 * Explore the targets: every target of the selected documents as a seat on a
 * ring, by document or policy area. Any target can take the centre; every
 * other seat then takes the ink of how it reads against it and sorts within
 * its arc, potential misalignment from one end and strong alignment at the
 * other, with lines from the centre to both. The column beside the ring
 * names what the ring shows and leads to the evidence.
 */
export function Explore({
  source,
  data,
  state,
  dispatch,
  groups,
}: {
  source: BriefSource;
  data: BriefData;
  state: ExploreState;
  dispatch: Dispatch<ExploreAction>;
  /** Groupings on offer: documents and the policy-area lenses. */
  groups: ExploreGroup[];
}) {
  const t = useTranslations("brief.explore");
  const tl = useTranslations("briefing.lens");
  const tc = useTranslations("brief.commitments");
  const tr = useTranslations("brief.panel.rating");
  const tm = useTranslations("labels.contradictionType");
  const { pct } = useNumbers();

  const model = useMemo(() => buildExploreModel(data.scope), [data.scope]);
  const focus = state.focus ? (model.index.get(state.focus) ?? null) : null;
  const lens = state.group === "docs" ? null : (source.lenses.find((l) => l.id === state.group) ?? null);
  const seatGroups = useMemo(
    () => (lens ? groupByLens(model, lens) : groupByDocument(model, data.scope.docs)),
    [model, lens, data.scope.docs],
  );
  const arcs = useMemo(
    () => seatGroups.map((g) => ({ key: g.key, ids: seatOrder(model, g.ids, focus) })),
    [seatGroups, model, focus],
  );
  const profile = useMemo(() => (focus === null ? null : focusProfile(model, focus)), [model, focus]);
  const matches = useMemo(() => new Set(searchTargets(model.items, state.query)), [model, state.query]);
  const searching = state.query.trim().length >= 2;

  // A partner shown beside the ring, and a seat pointed at from the column.
  const [selected, setSelected] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const lastFocus = useRef(state.focus);
  useEffect(() => {
    if (lastFocus.current !== state.focus) {
      lastFocus.current = state.focus;
      setSelected(null);
      setHot(null);
    }
  }, [state.focus]);
  const pairRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selected) pairRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  const byId = useMemo(() => new Map(model.items.map((c) => [c.id, c])), [model]);
  const review = data.commitments.slice(0, RANKED);
  const strongest = data.strongest.slice(0, RANKED);

  const styles = useMemo<SeatStyle[]>(() => {
    const marks = new Map<string, string>();
    for (const row of strongest) marks.set(row.commitment.id, RING_INK.green);
    for (const row of review) marks.set(row.commitment.id, RING_INK.red);
    return model.items.map((c, i) => {
      let style: SeatStyle =
        focus === null
          ? { color: searching ? RING_INK.ink : (marks.get(c.id) ?? RING_INK.rest) }
          : i === focus
            ? { color: RING_INK.ink, hollow: true }
            : relationStyle(seatRelation(model, focus, i));
      if (searching && !matches.has(i)) style = { ...style, color: RING_INK.drained };
      return style;
    });
  }, [model, focus, searching, matches, review, strongest]);

  const spokes = useMemo<Spoke[]>(() => {
    if (focus === null || !profile) return [];
    return [
      ...profile.partners.strong.map((id) => ({ id, tone: "strong" as const })),
      ...profile.partners.apart.map((id) => ({ id, tone: "apart" as const })),
    ];
  }, [focus, profile]);

  const groupName = (key: string) => {
    if (key === OTHER_GROUP) return t("other");
    if (!lens) return docName(key);
    return lens.categories.find((c) => c.id === key)?.name ?? key;
  };
  const labels = useMemo<ArcLabel[]>(
    () =>
      arcs.map((arc) => {
        const name = groupName(arc.key);
        const title = lens ? undefined : data.scope.docs.find((d) => d.id === arc.key)?.full;
        if (focus === null) return { name, title };
        const tally: Tally = arcTally(model, arc.ids, focus);
        const compared = arc.ids.length - tally.unrelated - (arc.ids.includes(focus) ? 1 : 0);
        if (compared <= 0) return { name, title, sub: t("sameDocument"), dim: true };
        const aligned = tally.strong + tally.aligned;
        const sub =
          tally.apart > 0 ? t("arcCounts", { aligned, apart: tally.apart }) : t("arcCountsAligned", { aligned });
        return { name, title, sub };
      }),
    // groupName reads lens and docs, both in the deps through arcs and lens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arcs, focus, model, lens, data.scope.docs, t],
  );

  const relationText = (i: number): string => {
    if (focus === null) return "";
    if (i === focus) return "";
    const level = levelBetween(model, focus, i);
    if (level === null) return t("sameDocument");
    const mechanism = level === "flagged" ? mechanismBetween(model, focus, i) : null;
    return mechanism ? `${tr(level)} · ${tm(mechanism)}` : tr(level);
  };
  const restCounts = useMemo(() => {
    const counts = new Map<number, { apart: number; strong: number }>();
    model.items.forEach((_, i) => counts.set(i, { apart: 0, strong: 0 }));
    const size = model.items.length;
    for (let a = 0; a < size; a++) {
      for (let b = a + 1; b < size; b++) {
        const level = model.levels[a * size + b];
        if (level === 5) {
          counts.get(a)!.apart += 1;
          counts.get(b)!.apart += 1;
        } else if (level === 1) {
          counts.get(a)!.strong += 1;
          counts.get(b)!.strong += 1;
        }
      }
    }
    return counts;
  }, [model]);
  const tipFor = (i: number): ReactNode => {
    const c = model.items[i];
    const rest = restCounts.get(i);
    return (
      <>
        <span className="ex-tip-doc">{docName(c.doc)}</span>
        <span className="ex-tip-line">{commitmentLine(c, 110)}</span>
        {focus !== null && i !== focus && <span className="ex-tip-rel">{relationText(i)}</span>}
        {focus === null && rest && (
          <span className="ex-tip-rel">{t("restTip", { apart: rest.apart, strong: rest.strong })}</span>
        )}
      </>
    );
  };
  const describe = (i: number) => {
    const c = model.items[i];
    const rel = relationText(i);
    return `${docName(c.doc)}: ${commitmentLine(c, 110)}${rel ? `. ${rel}` : ""}`;
  };

  const select = (i: number) => {
    const id = model.items[i].id;
    if (focus === null) dispatch({ type: "focus", id });
    else if (i === focus) return;
    else if (levelBetween(model, focus, i) === null) dispatch({ type: "focus", id });
    else setSelected((cur) => (cur === id ? null : id));
  };
  const centreOn = (i: number) => dispatch({ type: "focus", id: model.items[i].id });
  const escape = () => {
    if (selected) setSelected(null);
    else if (state.query) dispatch({ type: "query", text: "" });
    else if (state.focus) dispatch({ type: "back" });
  };

  const focusItem = focus === null ? null : model.items[focus];
  const centre =
    focusItem === null ? (
      <>
        <p className="ex-centre-country">{data.countryName}</p>
        <p className="ex-centre-count">
          {t("restCentre", { targets: model.items.length, documents: data.scope.docs.length })}
        </p>
      </>
    ) : (
      <>
        <p className="ex-centre-doc">{docName(focusItem.doc)}</p>
        <p className="ex-centre-text">{clip(focusItem.text, 260)}</p>
      </>
    );

  const highlight = (() => {
    const id = hot ?? selected;
    return id ? (model.index.get(id) ?? null) : null;
  })();

  const concentration = data.concentration;
  const restHeadline =
    concentration.total === 0
      ? tc("headlineEmpty")
      : concentration.concentrated
        ? tc("headlineConcentrated", {
            pct: pct(concentration.share),
            total: concentration.total,
            top: concentration.top.length,
          })
        : tc("headlineSpread", { contested: concentration.contested });

  const groupLabel = (g: ExploreGroup) => (g === "docs" ? t("groupDocs") : tl(g));

  return (
    <div className="ex" data-testid="explore">
      <div className="ex-controls">
        <div className="ex-search">
          <input
            type="search"
            value={state.query}
            placeholder={t("search")}
            aria-label={t("search")}
            onChange={(e) => dispatch({ type: "query", text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") dispatch({ type: "query", text: "" });
            }}
          />
        </div>
        {groups.length > 1 && (
          <div className="ex-group" role="group" aria-label={t("group")}>
            <span className="ex-group-label">{t("group")}</span>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={state.group === g}
                onClick={() => dispatch({ type: "group", group: g })}
                title={g === "gga" ? tl("ggaTooltip") : undefined}
              >
                {groupLabel(g)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ex-body">
        <div className="ex-stage">
          <RingCanvas
            arcs={arcs}
            n={model.items.length}
            styles={styles}
            spokes={spokes}
            focus={focus}
            highlight={highlight}
            labels={labels}
            centre={centre}
            tipFor={tipFor}
            describe={describe}
            onSelect={select}
            onCentre={centreOn}
            onEscape={escape}
            ariaLabel={t("ringLabel", { targets: model.items.length, group: groupLabel(state.group) })}
          />
        </div>

        <aside className="ex-side">
          {searching ? (
            <SearchResults
              ids={[...matches]}
              model={model}
              docName={docName}
              onFocus={(id) => dispatch({ type: "focus", id })}
              onHover={setHot}
            />
          ) : focusItem === null || !profile ? (
            <>
              <h2 className="ex-headline">{restHeadline}</h2>
              {review.length > 0 && (
                <>
                  <h3 className="ex-sub">{t("reviewFirst")}</h3>
                  <RankRows
                    rows={review.map((r) => ({ commitment: r.commitment, value: r.apart }))}
                    tone="apart"
                    docName={docName}
                    onFocus={(id) => dispatch({ type: "focus", id })}
                    onHover={setHot}
                    testId="explore-review-row"
                  />
                </>
              )}
              {strongest.length > 0 && (
                <>
                  <h3 className="ex-sub">{t("strongest")}</h3>
                  <RankRows
                    rows={strongest.map((r) => ({ commitment: r.commitment, value: r.strong }))}
                    tone="reinforce"
                    docName={docName}
                    onFocus={(id) => dispatch({ type: "focus", id })}
                    onHover={setHot}
                    testId="explore-strong-row"
                  />
                </>
              )}
            </>
          ) : (
            <FocusColumn
              item={focusItem}
              profile={profile}
              model={model}
              focus={focus!}
              docName={docName}
              canGoBack={state.trail.length > 0}
              onBack={() => dispatch({ type: "back" })}
              onClear={() => dispatch({ type: "clear" })}
              selected={selected}
              onSelect={(id) => setSelected((cur) => (cur === id ? null : id))}
              onHover={setHot}
              mechanismLabel={(m) => tm(m)}
              pair={
                selected ? (
                  <div ref={pairRef}>
                    <PairView
                      key={`${focusItem.id}~${selected}`}
                      countryId={source.countryId}
                      a={focusItem.id}
                      b={selected}
                      partner={selected}
                      commitments={byId}
                      docs={data.scope.docs}
                      onCentre={(id) => dispatch({ type: "focus", id })}
                      onClose={() => setSelected(null)}
                    />
                  </div>
                ) : null
              }
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function SearchResults({
  ids,
  model,
  docName,
  onFocus,
  onHover,
}: {
  ids: number[];
  model: ExploreModel;
  docName: (id: string) => string;
  onFocus: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const t = useTranslations("brief.explore");
  const tp = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const shown = all ? ids : ids.slice(0, RESULTS);
  return (
    <>
      <p className="ex-count" role="status">
        {t("searchCount", { count: ids.length })}
      </p>
      <ol className="brief-panel-rows ex-rows">
        {shown.map((i) => {
          const c = model.items[i];
          return (
            <li
              key={c.id}
              className="brief-panel-row"
              data-testid="explore-result-row"
              onPointerEnter={() => onHover(c.id)}
              onPointerLeave={() => onHover(null)}
            >
              <button type="button" onClick={() => onFocus(c.id)}>
                <span className="brief-panel-mark ex-mark-ink" aria-hidden="true" />
                <span className="brief-panel-row-main">
                  <span className="brief-panel-row-line">
                    <span className="brief-panel-row-doc">{docName(c.doc)} · </span>
                    {commitmentLine(c)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {!all && ids.length > shown.length && (
        <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
          {tp("showAll", { count: ids.length })}
        </button>
      )}
    </>
  );
}

function FocusColumn({
  item,
  profile,
  model,
  focus,
  docName,
  canGoBack,
  onBack,
  onClear,
  selected,
  onSelect,
  onHover,
  mechanismLabel,
  pair,
}: {
  item: BriefCommitment;
  profile: NonNullable<ReturnType<typeof focusProfile>>;
  model: ExploreModel;
  focus: number;
  docName: (id: string) => string;
  canGoBack: boolean;
  onBack: () => void;
  onClear: () => void;
  selected: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  mechanismLabel: (m: string) => string;
  pair: ReactNode;
}) {
  const t = useTranslations("brief.explore");
  const tt = useTranslations("brief.tone");
  const { n } = useNumbers();
  const [open, setOpen] = useState(false);
  const aligned = profile.counts.strong + profile.counts.aligned;
  const long = item.text.length > 240;
  return (
    <>
      <nav className="ex-nav">
        {canGoBack && (
          <button type="button" className="ex-link" onClick={onBack}>
            {t("back")}
          </button>
        )}
        <button type="button" className="ex-link" onClick={onClear}>
          {t("clear")}
        </button>
      </nav>
      <p className="ex-focus-doc">{docName(item.doc)}</p>
      <h2 className="ex-focus-title">{commitmentLine(item, 140)}</h2>
      <p className="ex-focus-text" data-clamped={long && !open ? "true" : undefined}>
        {item.text}
      </p>
      {long && (
        <button type="button" className="brief-panel-more" onClick={() => setOpen((v) => !v)}>
          {open ? t("less") : t("more")}
        </button>
      )}
      <p className="ex-focus-finding">
        {profile.total === 0 ? (
          t("findingNone")
        ) : (
          <>
            {t("finding", { aligned, total: profile.total })}
            {profile.counts.apart > 0 && <> {t("findingApart", { apart: profile.counts.apart })}</>}
          </>
        )}
      </p>
      {profile.total > 0 && (
        <>
          <div className="brief-panel-result ex-result" aria-hidden="true">
            <ResultBar counts={toneCountsOf(profile)} />
          </div>
          <ul className="ex-key">
            {KEY.filter((k) => k.count(profile) > 0).map((k) => (
              <li key={k.tone}>
                <span className={`ex-key-mark ex-key-${k.tone}`} aria-hidden="true" />
                <span className="ex-key-n">{n(k.count(profile))}</span> {tt(k.tone)}
              </li>
            ))}
            {profile.counts.strong > 0 && (
              <li>
                <span className="ex-key-line" aria-hidden="true" />
                {t("keyStrong", { count: profile.counts.strong })}
              </li>
            )}
          </ul>
        </>
      )}
      {pair}
      {profile.partners.apart.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("apartList", { count: profile.partners.apart.length })}</h3>
          <PartnerRows
            ids={profile.partners.apart}
            model={model}
            focus={focus}
            tone="apart"
            docName={docName}
            selected={selected}
            onSelect={onSelect}
            onHover={onHover}
            mechanismLabel={mechanismLabel}
            testId="explore-apart-row"
          />
        </section>
      )}
      {profile.partners.strong.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("strongList", { count: profile.partners.strong.length })}</h3>
          <PartnerRows
            ids={profile.partners.strong}
            model={model}
            focus={focus}
            tone="reinforce"
            docName={docName}
            selected={selected}
            onSelect={onSelect}
            onHover={onHover}
            mechanismLabel={mechanismLabel}
            testId="explore-strong-partner-row"
          />
        </section>
      )}
    </>
  );
}
