"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ToneCounts } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import {
  focusKey,
  focusMembers,
  groupProfile,
  groupSeatOrder,
  pairsBetween,
  parseFocusKey,
  rankMembers,
  type FocusRef,
  type GroupProfile,
  type SeatTone,
} from "@/lib/brief/explore/focus";
import type { EdgeSpec } from "@/lib/brief/explore/lines";
import {
  buildExploreModel,
  groupByDocument,
  groupByLens,
  levelBetween,
  mechanismBetween,
  relationOf,
  OTHER_GROUP,
  type Relation,
  type RelationCounts,
} from "@/lib/brief/explore/model";
import { searchTargets } from "@/lib/brief/explore/search";
import {
  LINE_KINDS,
  type ExploreAction,
  type ExploreGroup,
  type ExploreState,
  type LineKind,
} from "@/lib/brief/explore/state";
import type { BriefSource } from "@/lib/brief/source";
import { clip, commitmentLine, useNumbers } from "../ink";
import { ResultBar } from "../sections/documents";
import { PairView } from "./pair-view";
import { RING_INK, RingCanvas, type ArcLabel, type SeatStyle } from "./ring-canvas";
import { ToneKey } from "./rows";
import {
  GroupColumn,
  RestColumn,
  SearchColumn,
  TargetColumn,
  type ArcRow,
  type BrowseRow,
  type RankedRow,
  type SeatPairs,
} from "./side";
import "./explore.css";

/** Labels shorter than this are clause numbers ("7 b)"), not titles. */
const TITLE_LABEL = 12;

/** The stored level each kind of line stands for, for its label. */
const LINE_LEVEL: Record<LineKind, "high" | "medium" | "low" | "flagged"> = {
  strong: "high",
  aligned: "medium",
  partial: "low",
  apart: "flagged",
};

/** A seat's ink against the centre: the reading most of its pairs have. */
function toneStyle(tone: SeatTone): SeatStyle {
  switch (tone) {
    case "reinforce":
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

/** Target pairs by reading, as the brief's tone counts. */
function tones(c: RelationCounts): ToneCounts {
  const reinforce = c.strong + c.aligned;
  return { reinforce, partial: c.partial, apart: c.apart, none: c.none, total: reinforce + c.partial + c.apart + c.none };
}

function sumPairs(profile: GroupProfile, ids: number[]): RelationCounts {
  const sum: RelationCounts = { apart: 0, partial: 0, none: 0, unrelated: 0, aligned: 0, strong: 0 };
  for (const id of ids) {
    if (profile.isMember[id]) continue;
    const p = profile.pairs[id];
    sum.apart += p.apart;
    sum.partial += p.partial;
    sum.none += p.none;
    sum.aligned += p.aligned;
    sum.strong += p.strong;
  }
  return sum;
}

/** A short line glyph for each kind of line, as the ring draws it. */
function LineGlyph({ kind }: { kind: LineKind }) {
  const stroke = kind === "apart" ? RING_INK.red : kind === "partial" ? "#8f9a8a" : RING_INK.green;
  const dash = kind === "apart" ? "4 3" : kind === "partial" ? "1.5 3" : undefined;
  return (
    <svg className="ex-glyph" width="22" height="8" viewBox="0 0 22 8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="21"
        y2="4"
        stroke={stroke}
        strokeWidth={kind === "aligned" ? 1.4 : 2}
        strokeOpacity={kind === "aligned" ? 0.55 : 1}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Explore the targets: every target of the selected documents as a seat on a
 * ring, by document or policy area. A target, a document or a policy area can
 * take the centre; every other seat then takes the ink of how it reads
 * against it and sorts within its arc, potential misalignment from one end
 * and alignment at the other, and lines run from the centre to the targets
 * it relates to. The column beside the ring names what the ring shows and
 * leads to the evidence.
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
  const tf = useTranslations("brief.sheet.figures");
  const { n, pct } = useNumbers();

  const model = useMemo(() => buildExploreModel(data.scope), [data.scope]);
  const ref = useMemo<FocusRef | null>(() => (state.focus ? parseFocusKey(state.focus) : null), [state.focus]);
  const members = useMemo(() => (ref ? focusMembers(model, ref, source.lenses) : []), [model, ref, source.lenses]);
  const group = useMemo(() => (members.length > 0 ? groupProfile(model, members) : null), [model, members]);
  const active = group ? ref : null;
  const focusTarget = active?.kind === "target" ? members[0] : null;

  const lens = state.group === "docs" ? null : (source.lenses.find((l) => l.id === state.group) ?? null);
  const seatGroups = useMemo(
    () => (lens ? groupByLens(model, lens) : groupByDocument(model, data.scope.docs)),
    [model, lens, data.scope.docs],
  );
  const arcs = useMemo(
    () => seatGroups.map((g) => ({ key: g.key, ids: group ? groupSeatOrder(g.ids, group) : g.ids })),
    [seatGroups, group],
  );
  const matches = useMemo(() => new Set(searchTargets(model.items, state.query)), [model, state.query]);
  const searching = state.query.trim().length >= 2;

  // What is open beside the ring: a comparison of two targets, or (with a
  // document or area in the centre) one seat's pairs with it.
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const [seat, setSeat] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [hotArc, setHotArc] = useState<string | null>(null);
  const lastFocus = useRef(state.focus);
  useEffect(() => {
    if (lastFocus.current !== state.focus) {
      lastFocus.current = state.focus;
      setPair(null);
      setSeat(null);
      setHot(null);
      setHotArc(null);
    }
  }, [state.focus]);
  const pairRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pair) pairRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [pair]);

  const docName = useCallback(
    (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id,
    [data.scope.docs],
  );
  const byId = useMemo(() => new Map(model.items.map((c) => [c.id, c])), [model]);
  const groupName = useCallback(
    (key: string) => {
      if (key === OTHER_GROUP) return t("other");
      if (!lens) return docName(key);
      return lens.categories.find((c) => c.id === key)?.name ?? key;
    },
    [lens, docName, t],
  );
  const arcFocusKey = useCallback(
    (key: string) =>
      state.group === "docs" ? focusKey({ kind: "doc", id: key }) : focusKey({ kind: "area", lens: state.group, id: key }),
    [state.group],
  );

  // Each target's potential misalignments and strong alignments with every
  // target in the other documents: the rankings at rest.
  const restCounts = useMemo(() => {
    const size = model.items.length;
    // Level codes: 1 high, 2 medium, 3 low, 4 none, 5 flagged (0: not compared).
    const byLevel = Array.from({ length: 6 }, () => new Uint16Array(size));
    for (let a = 0; a < size; a++) {
      for (let b = a + 1; b < size; b++) {
        const level = model.levels[a * size + b];
        if (level === 0) continue;
        byLevel[level][a] += 1;
        byLevel[level][b] += 1;
      }
    }
    return { apart: byLevel[5], strong: byLevel[1], byLevel };
  }, [model]);
  // A target's own result bar: all its pairs with the other documents.
  const countsOf = useCallback(
    (id: string): ToneCounts => {
      const i = model.index.get(id);
      const { byLevel } = restCounts;
      if (i === undefined) return { reinforce: 0, partial: 0, apart: 0, none: 0, total: 0 };
      const reinforce = byLevel[1][i] + byLevel[2][i];
      const partial = byLevel[3][i];
      const none = byLevel[4][i];
      const apart = byLevel[5][i];
      return { reinforce, partial, none, apart, total: reinforce + partial + none + apart };
    },
    [model, restCounts],
  );
  const ranked = (counts: Uint16Array): RankedRow[] =>
    model.items
      .map((commitment, i) => ({ commitment, value: counts[i], i }))
      .filter((r) => r.value > 0)
      .sort((x, y) => y.value - x.value || x.i - y.i)
      .map(({ commitment, value }) => ({ commitment, value }));

  const styles = useMemo<SeatStyle[]>(
    () =>
      model.items.map((_, i) => {
        let style: SeatStyle = !group
          ? { color: searching ? RING_INK.ink : RING_INK.rest }
          : group.isMember[i]
            ? { color: RING_INK.ink, hollow: true }
            : toneStyle(group.tone[i]);
        if (searching && !matches.has(i)) style = { ...style, color: RING_INK.drained, texture: false };
        return style;
      }),
    [model, group, searching, matches],
  );

  const lines = state.lines;
  // A line to every seat with at least one pair of a drawn reading with the
  // centre (for one target, exactly its reading).
  const edges = useMemo<EdgeSpec[]>(() => {
    if (!group) return [];
    const out: EdgeSpec[] = [];
    model.items.forEach((_, j) => {
      if (group.isMember[j]) return;
      for (const kind of lines) {
        const weight = group.pairs[j][kind];
        if (weight > 0) out.push({ id: j, relation: kind, weight });
      }
    });
    return out;
  }, [group, lines, model]);
  const neighbours = useCallback(
    (id: number): EdgeSpec[] => {
      const out: EdgeSpec[] = [];
      model.items.forEach((_, j) => {
        if (j === id) return;
        const level = levelBetween(model, id, j);
        if (level === null) return;
        const relation = relationOf(level);
        if ((lines as Relation[]).includes(relation)) out.push({ id: j, relation });
      });
      return out;
    },
    [model, lines],
  );

  const labels = useMemo<ArcLabel[]>(
    () =>
      arcs.map((arc) => {
        const name = groupName(arc.key);
        const selectable = arc.key !== OTHER_GROUP;
        if (!group) return { name, selectable };
        const others = arc.ids.filter((id) => !group.isMember[id]);
        if (others.length === 0) return { name, sub: t("inCentre"), dim: true, selectable };
        const c = tones(sumPairs(group, others));
        if (c.total === 0) return { name, sub: t("sameDocument"), dim: true, selectable };
        const sub =
          c.apart > 0
            ? t("arcCounts", { aligned: c.reinforce, apart: c.apart })
            : t("arcCountsAligned", { aligned: c.reinforce });
        return { name, sub, selectable };
      }),
    [arcs, group, groupName, t],
  );

  const centreName = (): string => {
    if (!active) return "";
    if (active.kind === "doc") return docName(active.id);
    if (active.kind === "area") {
      const areaLens = source.lenses.find((l) => l.id === active.lens);
      return areaLens?.categories.find((c) => c.id === active.id)?.name ?? active.id;
    }
    return commitmentLine(model.items[members[0]], 80);
  };
  const kindLabel = (): string =>
    active?.kind === "doc" ? t("kindDoc") : active?.kind === "area" ? t("kindArea", { lens: tl(active.lens) }) : "";

  const relationText = (i: number): string => {
    if (focusTarget === null || i === focusTarget) return "";
    const level = levelBetween(model, focusTarget, i);
    if (level === null) return t("sameDocument");
    const mechanism = level === "flagged" ? mechanismBetween(model, focusTarget, i) : null;
    return mechanism ? `${tr(level)} · ${tm(mechanism)}` : tr(level);
  };
  const groupText = (i: number): string => {
    if (!group || group.isMember[i]) return "";
    const p = group.pairs[i];
    const parts = [
      p.apart > 0 ? t("tipApart", { count: p.apart }) : null,
      p.strong > 0 ? t("tipStrong", { count: p.strong }) : null,
      p.aligned > 0 ? t("tipAligned", { count: p.aligned }) : null,
      p.partial > 0 ? t("tipPartial", { count: p.partial }) : null,
    ].filter(Boolean);
    return parts.length > 0 ? `${t("tipWith", { name: centreName() })} ${parts.join(", ")}` : t("sameDocument");
  };
  const tipFor = (i: number): ReactNode => {
    const c = model.items[i];
    const relation = !group ? t("restTip", { apart: restCounts.apart[i], strong: restCounts.strong[i] }) : focusTarget !== null ? relationText(i) : groupText(i);
    return (
      <>
        <span className="ex-tip-doc">{docName(c.doc)}</span>
        <span className="ex-tip-line">{commitmentLine(c, 110)}</span>
        {relation && <span className="ex-tip-rel">{relation}</span>}
      </>
    );
  };
  const lineTipFor = (i: number): ReactNode => {
    const c = model.items[i];
    return (
      <>
        <span className="ex-tip-rel ex-tip-rating">{focusTarget !== null ? relationText(i) : groupText(i)}</span>
        <span className="ex-tip-doc">{docName(c.doc)}</span>
        <span className="ex-tip-line">{commitmentLine(c, 110)}</span>
      </>
    );
  };
  const describe = (i: number) => {
    const c = model.items[i];
    const rel = focusTarget !== null ? relationText(i) : groupText(i);
    return `${docName(c.doc)}: ${commitmentLine(c, 110)}${rel ? `. ${rel}` : ""}`;
  };

  const focusOn = (key: string) => dispatch({ type: "focus", id: key });
  const toCentre = (i: number) => {
    const key = model.items[i].id;
    if (key !== state.focus) focusOn(key);
  };
  // A line (or Space on a seat) opens what connects that seat to the centre.
  const openLine = (i: number) => {
    if (!group || group.isMember[i]) return;
    const id = model.items[i].id;
    if (focusTarget !== null) {
      if (levelBetween(model, focusTarget, i) === null) return;
      const a = model.items[focusTarget].id;
      setPair((cur) => (cur?.b === id ? null : { a, b: id }));
    } else if (group.relation[i] !== "unrelated") {
      setSeat((cur) => (cur === id ? null : id));
      setPair(null);
    }
  };
  // Empty space steps out: an open comparison first, then the centre.
  const background = () => {
    if (pair) setPair(null);
    else if (seat) setSeat(null);
    else if (state.focus) dispatch({ type: "clear" });
  };
  const escape = () => {
    if (pair) setPair(null);
    else if (seat) setSeat(null);
    else if (state.query) dispatch({ type: "query", text: "" });
    else if (state.focus) dispatch({ type: "back" });
  };

  const counts = group ? tones(group.totals) : data.counts;
  const centre = !active ? (
    <div className="ex-centre-rest">
      <p className="ex-centre-figure">{n(data.counts.total)}</p>
      <p className="ex-centre-caption">{tf("comparisons", { count: data.counts.total })}</p>
      {data.counts.total > 0 && (
        <div className="ex-centre-bar">
          <ResultBar counts={data.counts} />
        </div>
      )}
      <ToneKey counts={data.counts} share />
      <p className="ex-centre-count">
        {t("restCentre", { targets: model.items.length, documents: data.scope.docs.length })}
      </p>
    </div>
  ) : active.kind === "target" ? (
    (() => {
      const item = model.items[members[0]];
      const titled = item.label.length >= TITLE_LABEL;
      return (
        <div className="ex-centre-card">
          <p className="ex-centre-doc">{docName(item.doc)}</p>
          {titled && <p className="ex-centre-label">{clip(item.label, 90)}</p>}
          <p className="ex-centre-text">{titled ? clip(item.text, 200) : commitmentLine(item, 200)}</p>
          {counts.total > 0 && (
            <div className="ex-centre-bar">
              <ResultBar counts={counts} />
            </div>
          )}
        </div>
      );
    })()
  ) : (
    <div className="ex-centre-card">
      <p className="ex-centre-doc">{kindLabel()}</p>
      <p className="ex-centre-group">{centreName()}</p>
      <p className="ex-centre-count">{t("groupFigures", { targets: members.length, pairs: group!.total })}</p>
      {counts.total > 0 && (
        <div className="ex-centre-bar">
          <ResultBar counts={counts} />
        </div>
      )}
    </div>
  );

  const highlight = hot ? (model.index.get(hot) ?? null) : null;
  const selectedLine = pair ? (model.index.get(pair.b) ?? null) : seat ? (model.index.get(seat) ?? null) : null;

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

  // Documents or policy areas to open from the resting column: the ring's arcs.
  const browse = useMemo<BrowseRow[]>(() => {
    if (!lens) {
      return data.scope.docs.map((d) => ({
        key: focusKey({ kind: "doc", id: d.id }),
        name: d.name,
        meta: t("targetsCount", { count: d.count }),
        counts: data.docs.find((s) => s.doc.id === d.id)?.counts ?? { reinforce: 0, partial: 0, apart: 0, none: 0, total: 0 },
        targets: model.items.filter((c) => c.doc === d.id),
      }));
    }
    return seatGroups
      .filter((g) => g.key !== OTHER_GROUP)
      .map((g) => ({
        key: focusKey({ kind: "area", lens: lens.id, id: g.key }),
        name: groupName(g.key),
        meta: t("targetsCount", { count: g.ids.length }),
        counts: tones(groupProfile(model, g.ids).totals),
        targets: g.ids.map((i) => model.items[i]),
      }));
  }, [lens, data.scope.docs, data.docs, seatGroups, groupName, model, t]);

  const groupLabel = (g: ExploreGroup) => (g === "docs" ? t("groupDocs") : tl(g));
  // How many lines of each kind the ring draws: one per target with such a
  // reading of the centre.
  const lineCount = (kind: LineKind) =>
    group ? model.items.reduce((sum, _, j) => sum + (!group.isMember[j] && group.pairs[j][kind] > 0 ? 1 : 0), 0) : null;

  const pairView = pair ? (
    <div ref={pairRef}>
      <PairView
        key={`${pair.a}~${pair.b}`}
        countryId={source.countryId}
        a={pair.a}
        b={pair.b}
        partner={pair.b}
        commitments={byId}
        docs={data.scope.docs}
        onCentre={focusOn}
        onClose={() => setPair(null)}
      />
    </div>
  ) : null;

  let side: ReactNode;
  if (searching) {
    side = (
      <SearchColumn items={[...matches].map((i) => model.items[i])} docName={docName} onFocus={focusOn} onHover={setHot} />
    );
  } else if (!active || !group) {
    side = (
      <RestColumn
        headline={restHeadline}
        review={ranked(restCounts.apart)}
        strongest={ranked(restCounts.strong)}
        browseTitle={lens ? tl(lens.id) : t("browseDocs")}
        browse={browse}
        countsOf={countsOf}
        docName={docName}
        onFocus={focusOn}
        onHover={setHot}
        onHoverGroup={(key) => setHotArc(key ? parseFocusKey(key).id : null)}
      />
    );
  } else if (active.kind === "target") {
    const item = model.items[members[0]];
    const siblings = model.items.filter((c) => c.doc === item.doc);
    const place = siblings.findIndex((c) => c.id === item.id);
    const stepTo = (k: number) => (siblings[k] ? () => focusOn(siblings[k].id) : undefined);
    const partnerRows = (relation: "apart" | "strong") =>
      model.items.flatMap((c, j) =>
        !group.isMember[j] && group.relation[j] === relation
          ? [
              {
                id: c.id,
                commitment: c,
                type:
                  relation === "apart" && mechanismBetween(model, members[0], j)
                    ? tm(mechanismBetween(model, members[0], j)!)
                    : undefined,
              },
            ]
          : [],
      );
    side = (
      <TargetColumn
        item={item}
        docName={docName}
        finding={
          group.total === 0 ? (
            t("findingNone")
          ) : (
            <>
              {t("finding", { aligned: counts.reinforce, total: group.total })}
              {counts.apart > 0 && <> {t("findingApart", { apart: counts.apart })}</>}
            </>
          )
        }
        counts={counts}
        apart={partnerRows("apart")}
        strong={partnerRows("strong")}
        selected={pair?.b ?? null}
        onSelect={(id) => setPair((cur) => (cur?.b === id ? null : { a: item.id, b: id }))}
        onHover={setHot}
        canGoBack={state.trail.length > 0}
        onBack={() => dispatch({ type: "back" })}
        onClear={() => dispatch({ type: "clear" })}
        previous={stepTo(place - 1)}
        next={stepTo(place + 1)}
        pair={pairView}
      />
    );
  } else {
    const typeOf = (a: number, b: number) => {
      const m = mechanismBetween(model, a, b);
      return m ? tm(m) : undefined;
    };
    const toPairs = (list: [number, number][]) =>
      list.map(([a, b]) => ({ a: model.items[a], b: model.items[b], type: typeOf(a, b) }));
    const rows: ArcRow[] = arcs
      .filter((arc) => arc.ids.some((id) => !group.isMember[id]))
      .map((arc) => {
        const others = arc.ids.filter((id) => !group.isMember[id]);
        return {
          key: arc.key,
          name: groupName(arc.key),
          counts: tones(sumPairs(group, others)),
          apart: toPairs(pairsBetween(model, members, others, "apart")),
          strong: toPairs(pairsBetween(model, members, others, "strong")),
        };
      })
      .filter((row) => row.counts.total > 0);
    const memberRanks = rankMembers(model, group);
    const seatIndex = seat ? model.index.get(seat) : undefined;
    const seatPairs: SeatPairs | null =
      seatIndex === undefined
        ? null
        : {
            seat: model.items[seatIndex],
            pairs: members
              .flatMap((m) => {
                const level = levelBetween(model, m, seatIndex);
                return level === null ? [] : [{ m, level }];
              })
              .sort(
                (x, y) =>
                  ["flagged", "high", "medium", "low", "none"].indexOf(x.level) -
                  ["flagged", "high", "medium", "low", "none"].indexOf(y.level),
              )
              .map(({ m, level }) => ({
                a: model.items[m],
                b: model.items[seatIndex],
                rating: tr(level),
                type: level === "flagged" ? typeOf(m, seatIndex) : undefined,
                tone: level === "flagged" ? ("apart" as const) : level === "high" || level === "medium" ? ("reinforce" as const) : ("ink" as const),
              })),
          };
    const full = active.kind === "doc" ? data.scope.docs.find((d) => d.id === active.id)?.full : undefined;
    side = (
      <GroupColumn
        kind={kindLabel()}
        name={centreName()}
        full={full}
        figures={t("groupFigures", { targets: members.length, pairs: group.total })}
        counts={counts}
        rowsTitle={lens ? t("withAreas") : t("withDocs")}
        rows={rows}
        review={memberRanks.apart.map((r) => ({ commitment: model.items[r.id], value: r.count }))}
        strongest={memberRanks.strong.map((r) => ({ commitment: model.items[r.id], value: r.count }))}
        members={members.map((m) => model.items[m])}
        countsOf={countsOf}
        seatPairs={seatPairs}
        docName={docName}
        selectedPair={pair ? `${pair.a}~${pair.b}` : null}
        onPair={(a, b) => setPair((cur) => (cur && cur.a === a && cur.b === b ? null : { a, b }))}
        onFocus={focusOn}
        onHover={setHot}
        onHoverArc={setHotArc}
        onCloseSeat={() => setSeat(null)}
        canGoBack={state.trail.length > 0}
        onBack={() => dispatch({ type: "back" })}
        onClear={() => dispatch({ type: "clear" })}
        pair={pairView}
      />
    );
  }

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
        <div className="ex-lines" role="group" aria-label={t("lines")}>
          <span className="ex-group-label">{t("lines")}</span>
          {LINE_KINDS.map((kind) => {
            const on = lines.includes(kind);
            const count = lineCount(kind);
            return (
              <button key={kind} type="button" aria-pressed={on} onClick={() => dispatch({ type: "lines", kind, on: !on })}>
                <LineGlyph kind={kind} />
                {tr(LINE_LEVEL[kind])}
                {count !== null && <span className="ex-lines-n">{n(count)}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ex-body">
        <div className="ex-stage">
          <RingCanvas
            arcs={arcs}
            n={model.items.length}
            styles={styles}
            edges={edges}
            tethers={group ? members : undefined}
            neighbours={neighbours}
            focus={focusTarget}
            highlight={highlight}
            selectedLine={selectedLine}
            labels={labels}
            centre={centre}
            tipFor={tipFor}
            lineTipFor={lineTipFor}
            describe={describe}
            onSeat={toCentre}
            onLine={openLine}
            onBackground={background}
            onEscape={escape}
            onLabel={(key) => focusOn(arcFocusKey(key))}
            onReset={active ? () => dispatch({ type: "clear" }) : undefined}
            resetLabel={t("clear")}
            hotArc={hotArc}
            ariaLabel={t("ringLabel", { targets: model.items.length, group: groupLabel(state.group) })}
          />
        </div>
        <aside className="ex-side">{side}</aside>
      </div>
    </div>
  );
}

