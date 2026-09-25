"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
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
import { LAYER_ORDER, type ExploreLayers, type LayerId } from "@/lib/brief/explore/layers";
import type { EdgeSpec } from "@/lib/brief/explore/lines";
import {
  buildExploreModel,
  groupByDocument,
  groupByLayer,
  groupByLens,
  layerDoc,
  levelBetween,
  mechanismBetween,
  relationBetween,
  OTHER_GROUP,
  type ExploreItem,
  type Relation,
  type RelationCounts,
} from "@/lib/brief/explore/model";
import type { Reading } from "@/lib/brief/pair";
import { searchTargets } from "@/lib/brief/explore/search";
import {
  exploreQuery,
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
import { lineOf, ToneKey } from "./rows";
import {
  GroupColumn,
  ItemColumn,
  LayerColumn,
  RestColumn,
  SearchColumn,
  TargetColumn,
  type ArcRow,
  type BrowseRow,
  type CoverageRow,
  type PartnerRow,
  type RankedRow,
  type SeatPairs,
} from "./side";
import "./explore.css";

/** Labels shorter than this are clause numbers ("7 b)"), not titles. */
const TITLE_LABEL = 12;
/** Gap before the first layer arc, in ordinary gaps between arcs. */
const LAYER_GAP = 3.5;

/** The stored level each kind of line stands for, for its label. */
const LINE_LEVEL: Record<LineKind, "high" | "medium" | "low" | "flagged"> = {
  strong: "high",
  aligned: "medium",
  partial: "low",
  apart: "flagged",
};

const EMPTY_COUNTS: ToneCounts = { reinforce: 0, partial: 0, apart: 0, none: 0, total: 0 };

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

/** The mark that stands for "in the centre", on the ring and in the middle. */
function OriginDot() {
  return <span className="ex-origin-dot" aria-hidden="true" />;
}

type ActiveKind = "target" | "item" | "doc" | "area" | "layer";

/**
 * Explore the targets: every target of the selected documents as a seat on a
 * ring, by document or policy area, and where the country has them its
 * reported actions and budget lines. A target, an action, a budget line, a
 * document, a policy area or a whole layer can take the centre; every other
 * seat then takes the ink of how it reads against it and sorts within its
 * arc, and lines run from the centre to what it relates to. The column
 * beside the ring names what the ring shows and leads to the evidence.
 */
export function Explore({
  source,
  data,
  state,
  dispatch,
  groups,
  layers = null,
  initialPair = null,
}: {
  source: BriefSource;
  data: BriefData;
  state: ExploreState;
  dispatch: Dispatch<ExploreAction>;
  /** Groupings on offer: documents and the policy-area lenses. */
  groups: ExploreGroup[];
  /** Reported actions and budget lines, where the country has them. */
  layers?: ExploreLayers | null;
  /** A comparison to open with the centre, from a shared link. */
  initialPair?: { a: string; b: string } | null;
}) {
  const t = useTranslations("brief.explore");
  const tl = useTranslations("briefing.lens");
  const tc = useTranslations("brief.commitments");
  const tr = useTranslations("brief.panel.rating");
  const tm = useTranslations("labels.contradictionType");
  const tf = useTranslations("brief.sheet.figures");
  const tn = useTranslations("labels.nr7");
  const ti = useTranslations("briefing.implementation.nr7");
  const locale = useLocale();
  const { n, pct } = useNumbers();

  const model = useMemo(() => buildExploreModel(data.scope, layers), [data.scope, layers]);
  const available = useMemo(
    () => LAYER_ORDER.filter((l) => model.items.some((c) => c.layer === l)),
    [model],
  );
  const ref = useMemo<FocusRef | null>(() => (state.focus ? parseFocusKey(state.focus) : null), [state.focus]);
  const members = useMemo(() => (ref ? focusMembers(model, ref, source.lenses) : []), [model, ref, source.lenses]);
  const group = useMemo(() => (members.length > 0 ? groupProfile(model, members) : null), [model, members]);
  const active = group ? ref : null;
  const single = active?.kind === "target" ? members[0] : null;
  const singleItem = single === null ? null : model.items[single];
  const focusLayer: LayerId | null =
    active?.kind === "doc" && active.id.startsWith("layer:")
      ? (active.id.slice(6) as LayerId)
      : singleItem?.layer ?? null;
  const activeKind: ActiveKind | null = !active
    ? null
    : active.kind === "target"
      ? singleItem?.kind === "target"
        ? "target"
        : "item"
      : active.kind === "area"
        ? "area"
        : focusLayer
          ? "layer"
          : "doc";

  // Layers on the ring: those switched on, and the one the centre belongs to.
  const shownLayers = useMemo(
    () => available.filter((l) => state.layers.includes(l) || l === focusLayer),
    [available, state.layers, focusLayer],
  );
  const lens = state.group === "docs" ? null : (source.lenses.find((l) => l.id === state.group) ?? null);
  const seatGroups = useMemo(
    () => [
      ...(lens ? groupByLens(model, lens) : groupByDocument(model, data.scope.docs)),
      ...groupByLayer(model, shownLayers).map((g, k) => ({ ...g, gapBefore: k === 0 ? LAYER_GAP : 1.6 })),
    ],
    [model, lens, data.scope.docs, shownLayers],
  );
  const arcs = useMemo(
    () => seatGroups.map((g) => ({ ...g, ids: group ? groupSeatOrder(g.ids, group) : g.ids })),
    [seatGroups, group],
  );
  const placed = useMemo(() => new Set(arcs.flatMap((a) => a.ids)), [arcs]);
  const matches = useMemo(
    () => new Set(searchTargets(model.items, state.query).filter((i) => placed.has(i))),
    [model, state.query, placed],
  );
  const searching = state.query.trim().length >= 2;

  // What is open beside the ring: a comparison of two seats, or (with a
  // group in the centre) one seat's pairs with it.
  const [pair, setPair] = useState<{ a: string; b: string } | null>(initialPair);
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

  // The AI's first sentence for every reading of the seat in the centre, so
  // the pointer shows the verdict and its reason without opening the pair.
  const [readings, setReadings] = useState<{ id: string; map: Record<string, Reading> } | null>(null);
  const singleId = singleItem?.id ?? null;
  useEffect(() => {
    if (!singleId || typeof fetch === "undefined") return;
    let alive = true;
    const query = new URLSearchParams({ country: source.countryId, id: singleId, locale });
    fetch(`/api/brief/readings?${query}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((body: { readings: Record<string, Reading> }) => alive && setReadings({ id: singleId, map: body.readings }))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [singleId, source.countryId, locale]);
  const readingOf = (partner: string): Reading | undefined =>
    readings && readings.id === singleId ? readings.map[partner] : undefined;

  const layerName = useCallback((layer: LayerId) => t(`layer.${layer}`), [t]);
  const docName = useCallback(
    (id: string) =>
      id.startsWith("layer:") ? layerName(id.slice(6) as LayerId) : (data.scope.docs.find((d) => d.id === id)?.name ?? id),
    [data.scope.docs, layerName],
  );
  const byId = useMemo(() => new Map(model.items.map((c) => [c.id, c])), [model]);
  const groupName = useCallback(
    (key: string) => {
      if (key === OTHER_GROUP) return t("other");
      if (key.startsWith("layer:")) return layerName(key.slice(6) as LayerId);
      if (!lens) return docName(key);
      return lens.categories.find((c) => c.id === key)?.name ?? key;
    },
    [lens, docName, layerName, t],
  );
  const arcFocusKey = useCallback(
    (key: string) =>
      key.startsWith("layer:") || state.group === "docs"
        ? focusKey({ kind: "doc", id: key })
        : focusKey({ kind: "area", lens: state.group, id: key }),
    [state.group],
  );

  // Each target's readings with every target in the other documents (no
  // actions or budget lines): the rankings at rest and each target's own bar.
  const restCounts = useMemo(() => {
    const size = model.items.length;
    const targets = model.targets;
    // Level codes: 1 high, 2 medium, 3 low, 4 none, 5 flagged (0: not compared).
    const byLevel = Array.from({ length: 6 }, () => new Uint16Array(size));
    for (let a = 0; a < targets; a++) {
      for (let b = a + 1; b < targets; b++) {
        const level = model.levels[a * size + b];
        if (level === 0) continue;
        byLevel[level][a] += 1;
        byLevel[level][b] += 1;
      }
    }
    return { apart: byLevel[5], strong: byLevel[1], byLevel };
  }, [model]);
  const countsOf = useCallback(
    (id: string): ToneCounts => {
      const i = model.index.get(id);
      const { byLevel } = restCounts;
      if (i === undefined) return EMPTY_COUNTS;
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
      .slice(0, model.targets)
      .map((commitment, i) => ({ commitment, value: counts[i], i }))
      .filter((r) => r.value > 0)
      .sort((x, y) => y.value - x.value || x.i - y.i)
      .map(({ commitment, value }) => ({ commitment, value }));

  // How many targets each action or budget line is strongly aligned with (or
  // may pull against), for their tooltips and rankings.
  const itemCounts = useMemo(() => {
    const strong = new Uint16Array(model.items.length);
    const apart = new Uint16Array(model.items.length);
    for (let j = model.targets; j < model.items.length; j++) {
      for (let i = 0; i < model.targets; i++) {
        const relation = relationBetween(model, i, j);
        if (relation === "strong") strong[j] += 1;
        else if (relation === "apart") apart[j] += 1;
      }
    }
    return { strong, apart };
  }, [model]);

  const styles = useMemo<SeatStyle[]>(
    () =>
      model.items.map((c, i) => {
        let style: SeatStyle = !group
          ? { color: searching ? RING_INK.ink : RING_INK.rest }
          : group.isMember[i]
            ? { color: RING_INK.ink }
            : toneStyle(group.tone[i]);
        if (searching && !matches.has(i)) style = { ...style, color: RING_INK.drained, texture: false };
        return c.kind === "target" ? style : { ...style, square: true };
      }),
    [model, group, searching, matches],
  );

  const lines = state.lines;
  // A line to every seat with at least one pair of a drawn reading with the
  // centre (for one seat, exactly its reading), as wide as its pairs.
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
        const relation = relationBetween(model, id, j);
        if (relation !== null && (lines as Relation[]).includes(relation)) out.push({ id: j, relation });
      });
      return out;
    },
    [model, lines],
  );

  /** Seats of an arc by how they read against the centre (not pairs). */
  const seatTally = (ids: number[]) => {
    const c = { reinforce: 0, apart: 0, total: 0 };
    for (const id of ids) {
      if (!group || group.isMember[id] || group.tone[id] === "unrelated") continue;
      c.total += 1;
      if (group.tone[id] === "reinforce") c.reinforce += 1;
      else if (group.tone[id] === "apart") c.apart += 1;
    }
    return c;
  };
  const labels = useMemo<ArcLabel[]>(
    () =>
      arcs.map((arc) => {
        const name = groupName(arc.key);
        const selectable = arc.key !== OTHER_GROUP;
        if (!group) return { name, selectable };
        const others = arc.ids.filter((id) => !group.isMember[id]);
        if (others.length === 0) return { name, sub: t("inCentre"), dim: true, selectable };
        const layerArc = arc.key.startsWith("layer:") ? (arc.key.slice(6) as LayerId) : null;
        // Across a layer and the targets, count seats (coverage), not pairs.
        const crossing = (layerArc !== null) !== (focusLayer !== null);
        if (crossing) {
          const c = seatTally(others);
          if (c.total === 0) return { name, sub: t("sameDocument"), dim: true, selectable };
          const budget = layerArc === "budget" || focusLayer === "budget";
          const sub = budget
            ? t("arcMatching", { count: c.reinforce, total: c.total })
            : c.apart > 0
              ? t("arcActions", { strong: c.reinforce, apart: c.apart, total: c.total })
              : t("arcActionsStrong", { strong: c.reinforce, total: c.total });
          return { name, sub, selectable };
        }
        const c = tones(sumPairs(group, others));
        if (c.total === 0) return { name, sub: t("sameDocument"), dim: true, selectable };
        const sub =
          c.apart > 0
            ? t("arcCounts", { aligned: c.reinforce, apart: c.apart })
            : t("arcCountsAligned", { aligned: c.reinforce });
        return { name, sub, selectable };
      }),
    // seatTally reads group, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [arcs, group, groupName, focusLayer, t],
  );

  const centreName = (): string => {
    if (!active) return "";
    if (active.kind === "doc") return docName(active.id);
    if (active.kind === "area") {
      const areaLens = source.lenses.find((l) => l.id === active.lens);
      return areaLens?.categories.find((c) => c.id === active.id)?.name ?? active.id;
    }
    return lineOf(model.items[members[0]], 80);
  };
  const kindLabel = (): string =>
    activeKind === "doc"
      ? t("kindDoc")
      : active?.kind === "area"
        ? t("kindArea", { lens: tl(active.lens) })
        : focusLayer
          ? t(focusLayer === "budget" ? "sourceBer" : "sourceBtr")
          : "";

  /** How a seat reads against the seat in the centre, in words. */
  const relationText = (i: number): string => {
    if (single === null || i === single) return "";
    const level = levelBetween(model, single, i);
    if (level === null) return t("sameDocument");
    const layerKind = [model.items[single].kind, model.items[i].kind].find((k) => k !== "target");
    if (layerKind === "budget") return t(level === "high" ? "tipBudgetMatch" : "tipBudgetNone");
    if (layerKind === "action") {
      if (level === "high") return t("tipActionStrong");
      if (level === "flagged") return t("tipActionPull");
      return tr(level);
    }
    const mechanism = level === "flagged" ? mechanismBetween(model, single, i) : null;
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
  const factsOf = (c: ExploreItem): string | null => {
    if (c.kind === "action" && c.status) return t("status", { status: c.status });
    if (c.kind === "budget" && c.spend && layers?.budget) {
      return t("spend", {
        total: n(c.spend.total),
        currency: layers.budget.currency,
        unit: layers.budget.unit,
        start: layers.budget.start,
        end: layers.budget.end,
      });
    }
    return null;
  };
  const tipFor = (i: number): ReactNode => {
    const c = model.items[i];
    const relation = !group
      ? c.kind === "target"
        ? t("restTip", { apart: restCounts.apart[i], strong: restCounts.strong[i] })
        : c.kind === "budget"
          ? t("restTipBudget", { count: itemCounts.strong[i] })
          : t("restTipAction", { strong: itemCounts.strong[i], apart: itemCounts.apart[i] })
      : single !== null
        ? relationText(i)
        : groupText(i);
    const reading = single !== null && i !== single ? readingOf(c.id) : undefined;
    const facts = factsOf(c);
    return (
      <>
        <span className="ex-tip-doc">{docName(c.doc)}</span>
        <span className="ex-tip-line">{lineOf(c, 110)}</span>
        {facts && <span className="ex-tip-doc">{facts}</span>}
        {relation && <span className="ex-tip-rel">{relation}</span>}
        {reading?.first && (
          <span className="ex-tip-ai">
            <span className="ex-tip-ai-label">{t("aiLabel")}</span> {clip(reading.first, 220)}
          </span>
        )}
      </>
    );
  };
  const lineTipFor = (i: number): ReactNode => {
    const c = model.items[i];
    const reading = single !== null ? readingOf(c.id) : undefined;
    return (
      <>
        <span className="ex-tip-rel ex-tip-rating">{single !== null ? relationText(i) : groupText(i)}</span>
        <span className="ex-tip-doc">{docName(c.doc)}</span>
        <span className="ex-tip-line">{lineOf(c, 110)}</span>
        {reading?.first && (
          <span className="ex-tip-ai">
            <span className="ex-tip-ai-label">{t("aiLabel")}</span> {clip(reading.first, 220)}
          </span>
        )}
      </>
    );
  };
  const describe = (i: number) => {
    const c = model.items[i];
    const rel = single !== null ? relationText(i) : groupText(i);
    return `${docName(c.doc)}: ${lineOf(c, 110)}${rel ? `. ${rel}` : ""}`;
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
    if (single !== null) {
      if (levelBetween(model, single, i) === null) return;
      const a = model.items[single].id;
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

  // A link that opens this view: the centre, the grouping, the layers and an
  // open comparison, next to the page's own parameters.
  const share = async (): Promise<boolean> => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);
    for (const key of ["focus", "group", "layers", "pair"]) params.delete(key);
    for (const [key, value] of new URLSearchParams(exploreQuery(state))) params.set(key, value);
    if (pair) params.set("pair", `${pair.a}~${pair.b}`);
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      return false;
    }
  };

  const counts = group ? tones(group.totals) : data.counts;
  const coverage = useMemo(() => {
    if (!group || activeKind !== "layer") return null;
    let covered = 0;
    let pulled = 0;
    for (let i = 0; i < model.targets; i++) {
      if (group.tone[i] === "reinforce") covered += 1;
      if (group.pairs[i].apart > 0) pulled += 1;
    }
    return { covered, pulled, total: model.targets };
  }, [group, activeKind, model]);

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
        {t("restCentre", { targets: model.targets, documents: data.scope.docs.length })}
      </p>
    </div>
  ) : activeKind === "target" && singleItem ? (
    (() => {
      const titled = singleItem.label.length >= TITLE_LABEL;
      return (
        <div className="ex-centre-card">
          <p className="ex-centre-doc">
            <OriginDot />
            {docName(singleItem.doc)}
          </p>
          {titled && <p className="ex-centre-label">{clip(singleItem.label, 90)}</p>}
          <p className="ex-centre-text">{titled ? clip(singleItem.text, 200) : commitmentLine(singleItem, 200)}</p>
          {counts.total > 0 && (
            <div className="ex-centre-bar">
              <ResultBar counts={counts} />
            </div>
          )}
        </div>
      );
    })()
  ) : activeKind === "item" && singleItem ? (
    <div className="ex-centre-card">
      <p className="ex-centre-doc">
        <OriginDot />
        {docName(singleItem.doc)}
      </p>
      <p className="ex-centre-group">{singleItem.name ?? singleItem.label}</p>
      {factsOf(singleItem) && <p className="ex-centre-count">{factsOf(singleItem)}</p>}
      <p className="ex-centre-count">
        {singleItem.kind === "budget"
          ? t("itemFindingBudget", { strong: itemCounts.strong[single!] })
          : t("itemFindingAction", { strong: itemCounts.strong[single!], apart: itemCounts.apart[single!] })}
      </p>
    </div>
  ) : (
    <div className="ex-centre-card">
      <p className="ex-centre-doc">
        <OriginDot />
        {kindLabel()}
      </p>
      <p className="ex-centre-group">{centreName()}</p>
      {coverage ? (
        <p className="ex-centre-count">
          {t(focusLayer === "budget" ? "coverageBudget" : "coverageActions", coverage)}
        </p>
      ) : (
        <>
          <p className="ex-centre-count">{t("groupFigures", { targets: members.length, pairs: group!.total })}</p>
          {counts.total > 0 && (
            <div className="ex-centre-bar">
              <ResultBar counts={counts} />
            </div>
          )}
        </>
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
        counts: data.docs.find((s) => s.doc.id === d.id)?.counts ?? EMPTY_COUNTS,
        targets: model.items.filter((c) => c.doc === d.id),
      }));
    }
    return groupByLens(model, lens)
      .filter((g) => g.key !== OTHER_GROUP)
      .map((g) => ({
        key: focusKey({ kind: "area", lens: lens.id, id: g.key }),
        name: groupName(g.key),
        meta: t("targetsCount", { count: g.ids.length }),
        counts: tones(groupProfile(model, g.ids).totals),
        targets: g.ids.map((i) => model.items[i]),
      }));
  }, [lens, data.scope.docs, data.docs, groupName, model, t]);
  const layerBrowse = useMemo<BrowseRow[]>(
    () =>
      available.map((layer) => {
        const items = model.items.filter((c) => c.layer === layer);
        return {
          key: focusKey({ kind: "doc", id: layerDoc(layer) }),
          name: layerName(layer),
          meta: t(layer === "budget" ? "linesCount" : "actionsCount", { count: items.length }),
          counts: EMPTY_COUNTS,
          targets: items,
        };
      }),
    [available, model, layerName, t],
  );

  const groupLabel = (g: ExploreGroup) => (g === "docs" ? t("groupDocs") : tl(g));
  // How many lines of each kind the ring draws: one per seat with such a
  // reading of the centre.
  const lineCount = (kind: LineKind) =>
    group
      ? model.items.reduce((sum, _, j) => sum + (placed.has(j) && !group.isMember[j] && group.pairs[j][kind] > 0 ? 1 : 0), 0)
      : null;

  const pairView = pair ? (
    <div ref={pairRef}>
      <PairView
        key={`${pair.a}~${pair.b}`}
        countryId={source.countryId}
        countryName={source.countryName}
        a={pair.a}
        b={pair.b}
        partner={pair.b}
        commitments={byId}
        docName={docName}
        onCentre={focusOn}
        onClose={() => setPair(null)}
      />
    </div>
  ) : null;
  const nav = {
    canGoBack: state.trail.length > 0,
    onBack: () => dispatch({ type: "back" }),
    onClear: () => dispatch({ type: "clear" }),
    onShare: share,
  };
  const typeOf = (a: number, b: number) => {
    const m = mechanismBetween(model, a, b);
    return m ? tm(m) : undefined;
  };
  /** Partners of the single seat in the centre, of one reading and kind. */
  const partnersOf = (relation: "apart" | "strong", kinds: ExploreItem["kind"][]): PartnerRow[] =>
    single === null
      ? []
      : model.items.flatMap((c, j) =>
          j !== single && kinds.includes(c.kind) && relationBetween(model, single, j) === relation
            ? [{ id: c.id, commitment: c, type: relation === "apart" && c.kind === "target" ? typeOf(single, j) : undefined }]
            : [],
        );
  const stepper = (siblings: ExploreItem[], current: string) => {
    const place = siblings.findIndex((c) => c.id === current);
    const to = (k: number) => (siblings[k] ? () => focusOn(siblings[k].id) : undefined);
    return { previous: to(place - 1), next: to(place + 1) };
  };

  let side: ReactNode;
  if (searching) {
    side = (
      <SearchColumn items={[...matches].map((i) => model.items[i])} docName={docName} onFocus={focusOn} onHover={setHot} />
    );
  } else if (!active || !group || !activeKind) {
    side = (
      <RestColumn
        headline={restHeadline}
        review={ranked(restCounts.apart)}
        strongest={ranked(restCounts.strong)}
        browseTitle={lens ? tl(lens.id) : t("browseDocs")}
        browse={browse}
        layerBrowse={layerBrowse}
        countsOf={countsOf}
        docName={docName}
        onFocus={focusOn}
        onHover={setHot}
        onHoverGroup={(key) => setHotArc(key ? parseFocusKey(key).id : null)}
      />
    );
  } else if (activeKind === "target" && singleItem) {
    const steps = stepper(
      model.items.filter((c) => c.doc === singleItem.doc),
      singleItem.id,
    );
    const nr7 = layers?.nr7?.[singleItem.id];
    const actionsStrong = partnersOf("strong", ["action"]);
    const actionsApart = partnersOf("apart", ["action"]);
    const budget = partnersOf("strong", ["budget"]);
    const openPartner = (id: string) => setPair((cur) => (cur?.b === id ? null : { a: singleItem.id, b: id }));
    const extra = (
      <>
        {nr7 && (
          <p className="ex-nr7">
            {ti("selfAssessment")} <strong>{tn(nr7 === "on_track" ? "onTrack" : nr7 === "no_progress" ? "noProgress" : nr7)}</strong>
          </p>
        )}
        {(available.includes("mitigation") || available.includes("adaptation")) && (
          <LayerSection
            title={t("sectionActions")}
            finding={
              <>
                {t("targetActions", { strong: actionsStrong.length })}
                {actionsApart.length > 0 && <> {t("targetActionsPull", { apart: actionsApart.length })}</>}
              </>
            }
            caveat={t("caveatBtr", { country: source.countryName })}
            lists={[
              { tone: "reinforce", rows: actionsStrong, testId: "explore-action-strong" },
              { tone: "apart", rows: actionsApart, testId: "explore-action-pull" },
            ]}
            docName={docName}
            factsOf={(c) => factsOf(c as ExploreItem)}
            selected={pair?.b ?? null}
            onOpen={openPartner}
            onHover={setHot}
          />
        )}
        {available.includes("budget") && (
          <LayerSection
            title={t("sectionBudget")}
            finding={t("targetBudget", { strong: budget.length })}
            caveat={t("caveatBer")}
            lists={[{ tone: "reinforce", rows: budget, testId: "explore-budget-match" }]}
            docName={docName}
            factsOf={(c) => factsOf(c as ExploreItem)}
            selected={pair?.b ?? null}
            onOpen={openPartner}
            onHover={setHot}
          />
        )}
      </>
    );
    side = (
      <TargetColumn
        item={singleItem}
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
        apart={partnersOf("apart", ["target"])}
        strong={partnersOf("strong", ["target"])}
        selected={pair?.b ?? null}
        onSelect={openPartner}
        onHover={setHot}
        {...nav}
        {...steps}
        extra={extra}
        pair={pairView}
      />
    );
  } else if (activeKind === "item" && singleItem && single !== null) {
    const steps = stepper(
      model.items.filter((c) => c.layer === singleItem.layer),
      singleItem.id,
    );
    const budget = singleItem.kind === "budget";
    const strongTargets = partnersOf("strong", ["target"]);
    const pullTargets = budget ? [] : partnersOf("apart", ["target"]);
    side = (
      <ItemColumn
        kind={t(`kind.${singleItem.layer}`)}
        source={t(budget ? "sourceBer" : "sourceBtr")}
        item={singleItem}
        facts={factsOf(singleItem) ?? undefined}
        finding={
          budget
            ? t("itemFindingBudget", { strong: strongTargets.length })
            : t("itemFindingAction", { strong: strongTargets.length, apart: pullTargets.length })
        }
        caveat={budget ? t("caveatBer") : t("caveatBtr", { country: source.countryName })}
        lists={[
          {
            title: t(budget ? "listMatchingTargets" : "listStrongTargets", { count: strongTargets.length }),
            tone: "reinforce",
            rows: strongTargets,
            testId: "explore-item-strong",
          },
          {
            title: t("listPullTargets", { count: pullTargets.length }),
            tone: "apart",
            rows: pullTargets,
            testId: "explore-item-pull",
          },
        ]}
        docName={docName}
        selected={pair?.b ?? null}
        onSelect={(id) => setPair((cur) => (cur?.b === id ? null : { a: singleItem.id, b: id }))}
        onHover={setHot}
        {...nav}
        {...steps}
        pair={pairView}
      />
    );
  } else if (activeKind === "layer" && focusLayer && coverage) {
    const budget = focusLayer === "budget";
    const itemsOfLayer = members.map((m) => model.items[m]);
    const rows: CoverageRow[] = seatGroups
      .filter((g) => !g.key.startsWith("layer:"))
      .map((g) => {
        let covered = 0;
        let pulled = 0;
        const gaps: ExploreItem[] = [];
        for (const id of g.ids) {
          const tone = group.tone[id];
          if (tone === "reinforce") covered += 1;
          else {
            if (tone === "apart") pulled += 1;
            gaps.push(model.items[id]);
          }
        }
        const total = g.ids.length;
        return {
          key: g.key,
          name: groupName(g.key),
          counts: { reinforce: covered, apart: pulled, partial: 0, none: total - covered - pulled, total },
          gaps,
        };
      });
    side = (
      <LayerColumn
        kind={kindLabel()}
        name={layerName(focusLayer)}
        figures={
          budget && layers?.budget
            ? t("layerFiguresBudget", {
                count: itemsOfLayer.length,
                total: n(itemsOfLayer.reduce((s, c) => s + (c.spend?.total ?? 0), 0)),
                currency: layers.budget.currency,
                unit: layers.budget.unit,
                start: layers.budget.start,
                end: layers.budget.end,
              })
            : t(budget ? "linesCount" : "actionsCount", { count: itemsOfLayer.length })
        }
        finding={
          <>
            {t(budget ? "coverageBudget" : "coverageActions", coverage)}
            {!budget && coverage.pulled > 0 && <> {t("coveragePull", { pulled: coverage.pulled })}</>}
          </>
        }
        caveat={budget ? t("caveatBer") : t("caveatBtr", { country: source.countryName })}
        rowsTitle={lens ? t("withAreasCoverage") : t("withDocsCoverage")}
        rows={rows}
        gapTitle={(count) => t(budget ? "gapBudget" : "gapActions", { count })}
        ranked={itemsOfLayer
          .map((c) => ({ commitment: c, value: itemCounts.strong[model.index.get(c.id)!] }))
          .filter((r) => r.value > 0)
          .sort((x, y) => y.value - x.value)}
        rankedTitle={t(budget ? "rankedBudget" : "rankedActions")}
        countsOf={countsOf}
        docName={docName}
        onFocus={focusOn}
        onHover={setHot}
        onHoverArc={setHotArc}
        {...nav}
      />
    );
  } else {
    const toPairs = (list: [number, number][]) =>
      list.map(([a, b]) => ({ a: model.items[a], b: model.items[b], type: typeOf(a, b) }));
    const rows: ArcRow[] = arcs
      .filter((arc) => !arc.key.startsWith("layer:") && arc.ids.some((id) => !group.isMember[id]))
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
    // The group's reported actions and budget lines: seats with at least one
    // strong reading with any of its targets.
    const layerRows = (kinds: ExploreItem["kind"][], relation: "strong" | "apart"): PartnerRow[] =>
      model.items.flatMap((c, j) =>
        kinds.includes(c.kind) && group.pairs[j][relation] > 0 ? [{ id: c.id, commitment: c }] : [],
      );
    const extra =
      available.length > 0 ? (
        <>
          {(available.includes("mitigation") || available.includes("adaptation")) && (
            <LayerSection
              title={t("sectionActions")}
              finding={t("groupActions", { strong: layerRows(["action"], "strong").length })}
              caveat={t("caveatBtr", { country: source.countryName })}
              lists={[
                { tone: "reinforce", rows: layerRows(["action"], "strong"), testId: "explore-group-action" },
                { tone: "apart", rows: layerRows(["action"], "apart"), testId: "explore-group-action-pull" },
              ]}
              docName={docName}
              factsOf={(c) => factsOf(c as ExploreItem)}
              selected={null}
              onOpen={focusOn}
              onHover={setHot}
            />
          )}
          {available.includes("budget") && (
            <LayerSection
              title={t("sectionBudget")}
              finding={t("groupBudget", { strong: layerRows(["budget"], "strong").length })}
              caveat={t("caveatBer")}
              lists={[{ tone: "reinforce", rows: layerRows(["budget"], "strong"), testId: "explore-group-budget" }]}
              docName={docName}
              factsOf={(c) => factsOf(c as ExploreItem)}
              selected={null}
              onOpen={focusOn}
              onHover={setHot}
            />
          )}
        </>
      ) : null;
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
        {...nav}
        extra={extra}
        pair={pairView}
      />
    );
  }

  // The seats that just took the centre pulse once on the ring.
  const pulse = useMemo(
    () => (state.focus && members.length > 0 ? { key: state.focus, ids: members } : null),
    [state.focus, members],
  );
  const actionLayers = available.filter((l) => l !== "budget");

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
        {available.length > 0 && (
          <div className="ex-lines ex-layers" role="group" aria-label={t("layers")}>
            <span className="ex-group-label">{t("layers")}</span>
            {actionLayers.length > 0 && (
              <button
                type="button"
                aria-pressed={actionLayers.every((l) => state.layers.includes(l))}
                onClick={() => {
                  const on = !actionLayers.every((l) => state.layers.includes(l));
                  for (const layer of actionLayers) dispatch({ type: "layer", layer, on });
                }}
              >
                <span className="ex-square" aria-hidden="true" />
                {t("toggleActions")}
              </button>
            )}
            {available.includes("budget") && (
              <button
                type="button"
                aria-pressed={state.layers.includes("budget")}
                onClick={() => dispatch({ type: "layer", layer: "budget", on: !state.layers.includes("budget") })}
              >
                <span className="ex-square" aria-hidden="true" />
                {t("toggleBudget")}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="ex-body">
        <div className="ex-stage">
          <RingCanvas
            arcs={arcs}
            n={model.items.length}
            styles={styles}
            edges={edges}
            pulse={pulse}
            neighbours={neighbours}
            focus={single}
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
            ariaLabel={t("ringLabel", { targets: model.targets, group: groupLabel(state.group) })}
          />
        </div>
        <aside className="ex-side">{side}</aside>
      </div>
    </div>
  );
}

/** A section of a column on a layer (reported actions or budget lines): a
 *  plain finding, its caveat, and the actions or lines themselves. */
function LayerSection({
  title,
  finding,
  caveat,
  lists,
  docName,
  factsOf,
  selected,
  onOpen,
  onHover,
}: {
  title: string;
  finding: ReactNode;
  caveat: string;
  lists: { tone: "reinforce" | "apart"; rows: PartnerRow[]; testId: string }[];
  docName: (id: string) => string;
  factsOf: (c: PartnerRow["commitment"]) => string | null;
  selected: string | null;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <section className="ex-section ex-layer-section">
      <h3 className="ex-sub">{title}</h3>
      <p className="ex-layer-finding">{finding}</p>
      {lists
        .filter((list) => list.rows.length > 0)
        .map((list) => (
          <ol key={list.testId} className="brief-panel-rows ex-rows">
            {list.rows.map((row) => (
              <li
                key={row.id}
                className="brief-panel-row"
                data-testid={list.testId}
                data-selected={selected === row.id ? "true" : undefined}
                onPointerEnter={() => onHover(row.id)}
                onPointerLeave={() => onHover(null)}
              >
                <button type="button" onClick={() => onOpen(row.id)}>
                  <span className={`brief-panel-mark brief-panel-mark-${list.tone}`} aria-hidden="true" />
                  <span className="brief-panel-row-main">
                    <span className="brief-panel-row-line">
                      <span className="brief-panel-row-doc">{docName(row.commitment.doc)} · </span>
                      {lineOf(row.commitment)}
                    </span>
                    {factsOf(row.commitment) && <span className="brief-panel-row-type">{factsOf(row.commitment)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ))}
      <p className="brief-panel-caveat ex-caveat">{caveat}</p>
    </section>
  );
}
