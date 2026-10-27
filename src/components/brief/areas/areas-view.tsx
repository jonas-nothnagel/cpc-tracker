"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  areaFocus,
  areaHeadline,
  areaInks,
  areaPairs,
  lensAreas,
  OTHER_AREA,
  partnersByArea,
  rowCounts,
  rowOrder,
  sideCounts,
  sideLinks,
  targetInks,
  type AreaFocus,
  type AreaPair,
  type AreaSide,
  type LensArea,
  type TargetInk,
} from "@/lib/brief/areas";
import {
  AREA_FEW_TARGETS,
  DEFAULT_AREA_SORT,
  areaShare,
  areaTones,
  nextAreaSort,
  orderRows,
  sortAreas,
  type AreaShareKey,
  type AreaSort,
  type AreaSortKey,
} from "@/lib/brief/area-shares";
import { emptyCounts, type ToneCounts } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { LONG_TEXT } from "../comparison";
import { commitmentLine, useNumbers } from "../ink";
import { lensName, lensNameOf, lensTooltip } from "../lens-tooltip";
import { ResultBar } from "../sections/documents";
import { AreaField } from "./area-field";

const SIDES: AreaSide[] = ["apart", "reinforce"];
/** What the list beside the picture shows: each area's targets, or one side's target pairs. */
type AreaView = "targets" | AreaSide;
const VIEWS: AreaView[] = ["targets", ...SIDES];
/** Targets an area's list shows before "Show all". */
const TARGETS_SHOWN = 12;

/** The shares a row's result bar draws, in the order its reading names them. */
const SHARE_COLUMNS: AreaShareKey[] = ["reinforce", "partial", "apart"];
/** Targets each area of an open pair lists. */
const INVOLVED_MAX = 3;

/** A pair of areas' target pairs, for the panel. */
export interface AreaPairRef {
  lens: LensId;
  key: string;
  side: AreaSide;
}

/** An area's name that points at its row: in the headline it opens its
 *  pair of areas, on the picture it picks the area. */
function AreaName({
  children,
  className = "brief-docname",
  title,
  pressed,
  onPoint,
  onOpen,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  /** On the picture: whether its area is the one picked. */
  pressed?: boolean;
  onPoint: (on: boolean) => void;
  /** `byKey`: opened from the keyboard or assistive technology, not the pointer. */
  onOpen: (byKey: boolean) => void;
}) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(true);
    }
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className={className}
      title={title}
      aria-pressed={pressed}
      onClick={(e) => {
        // The picture beneath a name never reads the click as a target picked.
        e.stopPropagation();
        onOpen(e.detail === 0);
      }}
      onKeyDown={onKey}
      onPointerEnter={() => onPoint(true)}
      onPointerLeave={() => onPoint(false)}
      onFocus={() => onPoint(true)}
      onBlur={() => onPoint(false)}
    >
      {children}
    </span>
  );
}

/**
 * Policy areas on screen: one row per area of the lens named top left, each
 * with a dot per target and the result bar of all its target pairs. Beside
 * it, by default, each area with the targets classified in it; on request,
 * the pairs of areas one side's target pairs fall between. The column names
 * sort the rows, most first and then least first. Pointing marks names;
 * sorting, picking an area by its name, opening a pair of areas or picking a
 * target re-shapes the picture.
 */
export function AreasView({
  source,
  data,
  lens,
  onLens,
  onExplore,
  onOpenCommitment,
  onOpenAreaPair,
}: {
  source: BriefSource;
  data: BriefData;
  lens: LensId | null;
  onLens: (id: LensId) => void;
  /** Puts a target in the ring's centre further down. */
  onExplore?: (id: string) => void;
  onOpenCommitment?: (id: string) => void;
  onOpenAreaPair?: (pair: AreaPairRef) => void;
}) {
  const t = useTranslations("brief.areaView");
  const tl = useTranslations("briefing.lens");
  const th = useTranslations("brief.hub");
  const tp = useTranslations("brief.panel");
  const td = useTranslations("brief.documents");
  const { n, pct } = useNumbers();
  const active = lens ?? source.lenses[0]?.id ?? null;
  // What the list shows: each area's targets by default, or one side's target pairs.
  const [view, setView] = useState<AreaView>("targets");
  const byTargets = view === "targets";
  // The side the pair views read (the targets view reads none).
  const side: AreaSide = view === "targets" ? "apart" : view;
  // Every target of an open area, not only its first ones.
  const [allTargets, setAllTargets] = useState(false);
  // The column the rows are sorted by: most aligned first, until the reader
  // picks another column or turns the order round.
  const [sort, setSort] = useState<AreaSort>(DEFAULT_AREA_SORT);
  // The area picked by its name on the picture.
  const [areaPick, setAreaPick] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pointedRows, setPointedRows] = useState<string[]>([]);
  const [pointedTarget, setPointedTarget] = useState<string | null>(null);
  const [fullText, setFullText] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cardTitle = useRef<HTMLParagraphElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  // Where keyboard focus goes once a pick or "Back" has re-drawn the list.
  const moveFocus = useRef<"card" | "headline" | "pair" | null>(null);
  // An opened pair of areas, or a picked target's card, to bring into view once it has drawn.
  const revealPair = useRef(false);
  const revealCard = useRef(false);
  // A new lens lets the picked area, the open pair and the picked target go, for good.
  const [seenLens, setSeenLens] = useState(active);
  if (seenLens !== active) {
    setSeenLens(active);
    setAreaPick(null);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
    setPointedRows([]);
    setAllTargets(false);
  }

  const areas = useMemo(() => (active ? lensAreas(source, data.scope, active) : null), [source, data.scope, active]);
  const links = useMemo(() => sideLinks(data.scope), [data.scope]);
  const pairs = useMemo(() => (areas ? areaPairs(areas, data.scope, side) : null), [areas, data.scope, side]);
  const placed = useMemo(() => new Set(areas?.areas.flatMap((a) => a.targets) ?? []), [areas]);
  // A choice holds while its area, its pair of areas, or its target is in the brief.
  const pickedArea = areaPick && areas?.areas.some((a) => a.id === areaPick) ? areaPick : null;
  const around = useMemo(
    () => (areas && pickedArea ? areaFocus(areas, links, side, pickedArea) : null),
    [areas, links, side, pickedArea],
  );
  // The list beside the picture: the picked area's pairs of areas, else those holding the most.
  const areaList = useMemo(
    () => (areas && pickedArea ? areaPairs(areas, data.scope, side, pickedArea) : null),
    [areas, data.scope, side, pickedArea],
  );
  const listed = areaList ?? pairs;
  const openPair = open ? (listed?.top.find((p) => p.key === open) ?? null) : null;
  const focusId = picked && placed.has(picked) ? picked : null;
  // What a picked target was picked from: the open pair, the picked area, or the whole picture.
  const behind: AreaFocus = openPair ? { kind: "pair", pair: openPair } : (around ?? { kind: "rest" });
  const behindKey = openPair ? `p:${openPair.key}` : pickedArea ? `a:${pickedArea}` : "rest";
  const focusKey = focusId ? `t:${focusId}` : behindKey;
  const focus: AreaFocus = focusId ? { kind: "target", id: focusId } : behind;
  // What orders the pair views' rows (the targets view keeps each area's own order).
  const rest = useMemo(
    () => (areas && !byTargets ? sideCounts(areas, links, side) : new Map<string, number>()),
    [areas, links, side, byTargets],
  );
  // One picture per lens, view and choice: the field re-forms only when they change.
  /* eslint-disable react-hooks/exhaustive-deps */
  // A picked target's row keeps the order it had: at rest, around its area, or with its pair open.
  // The targets view keeps each area's own order, as its list does.
  const basisKey = focusId ? behindKey : "";
  const rows = useMemo(
    () =>
      !areas
        ? []
        : byTargets
          ? areas.areas.map((a) => ({ id: a.id, targets: [...a.targets] }))
          : rowOrder(areas, rest, focus, links, side, focusId ? behind : { kind: "rest" }),
    // The targets view's rows never change with a pick: they re-form only with the lens.
    [areas, rest, byTargets ? "" : focusKey, byTargets ? "" : basisKey, byTargets],
  );
  const inks = useMemo(
    () =>
      !areas
        ? new Map<string, TargetInk>()
        : byTargets
          ? areaInks(areas, pickedArea, focusId)
          : targetInks(areas, focus, links, side),
    [areas, links, side, focusKey, byTargets, pickedArea],
  );
  const counts = useMemo(
    () => (areas && !byTargets ? rowCounts(areas, focus, links, side) : new Map<string, number>()),
    [areas, links, side, focusKey, byTargets],
  );
  /* eslint-enable react-hooks/exhaustive-deps */
  // Each area's readings over all its target pairs, and the rows in the
  // order of the sort: a new order moves the rows, and their dots with them.
  const tones = useMemo(
    () => (areas ? areaTones(areas, data.scope) : new Map<string, ToneCounts>()),
    [areas, data.scope],
  );
  const drawn = useMemo(
    () => (areas ? orderRows(rows, sortAreas(areas, tones, sort)) : rows),
    [areas, rows, tones, sort],
  );

  // A picked target's card comes into view. Keyboard focus follows a pick
  // to the card or to the headline naming the picked area, and "Back" to
  // the list (the buttons that were pressed are gone); the pointer's focus
  // stays where it was, so no focus ring appears.
  useEffect(() => {
    const want = moveFocus.current;
    moveFocus.current = null;
    if (revealCard.current) {
      revealCard.current = false;
      cardTitle.current?.closest<HTMLElement>(".brief-av-card")?.scrollIntoView?.({ block: "nearest" });
    }
    if (want === "card") cardTitle.current?.focus({ preventScroll: true });
    if (want === "headline") {
      headlineRef.current?.focus({ preventScroll: true });
      headlineRef.current?.scrollIntoView?.({ block: "nearest" });
    }
    if (want === "pair") {
      const heads = root.current?.querySelectorAll<HTMLElement>(".brief-av-pair-head") ?? [];
      const open = root.current?.querySelector<HTMLElement>('[data-open="true"] .brief-av-pair-head');
      (open ?? heads[0])?.focus({ preventScroll: true });
    }
  }, [focusId, pickedArea, open]);

  // The list beside the picture scrolls on its own when taller than the
  // window: an opened pair of areas comes into view there.
  useEffect(() => {
    if (!revealPair.current) return;
    revealPair.current = false;
    root.current?.querySelector<HTMLElement>('[data-open="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [open, pickedArea]);

  if (!active || !areas || !pairs || !listed) return null;

  const area = (id: string) => areas.areas.find((a) => a.id === id);
  const nameOf = (id: string) => area(id)?.name ?? id;
  const pairName = (p: { a: string; b: string }) =>
    p.a === p.b
      ? t("within", { area: nameOf(p.a) })
      : p.b === OTHER_AREA
        ? t("outside", { area: nameOf(p.a) })
        : t("between", { areaA: nameOf(p.a), areaB: nameOf(p.b) });
  const rowsOf = (p: AreaPair) => [...new Set([p.a, p.b])].filter((id) => id !== OTHER_AREA);
  const commitment = (id: string) => data.scope.commitments.find((c) => c.id === id);
  const docName = (doc: string) => data.scope.docs.find((d) => d.id === doc)?.name ?? doc;

  // Every choice forgets the target pointed at in the list: its button may be gone.
  // A picked area holds on the other side.
  const choose = (next: AreaView) => {
    setView(next);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
    setAllTargets(false);
  };
  // The picked area's name returns to the area from its open pair or a
  // picked target; picked again, it lets the area go. Focus moves only for
  // the keyboard: the pointer stays where it picked.
  const pickArea = (id: string, byKey: boolean) => {
    const letGo = pickedArea === id && !openPair && !focusId;
    setAreaPick(letGo ? null : id);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
    setFullText(false);
    setAllTargets(false);
    if (!letGo && byKey) moveFocus.current = "headline";
  };
  // The targets view's list: an area's row opens its targets, and closes them.
  const toggleArea = (id: string) => {
    const opening = pickedArea !== id;
    setAreaPick(opening ? id : null);
    revealPair.current = opening;
    setPicked(null);
    setPointedTarget(null);
    setFullText(false);
    setAllTargets(false);
  };
  const allAreas = (byKey: boolean) => {
    setAreaPick(null);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
    if (byKey) moveFocus.current = "pair";
  };
  const toggle = (p: AreaPair) => {
    const opening = openPair?.key !== p.key;
    setOpen(opening ? p.key : null);
    revealPair.current = opening;
    setPicked(null);
    setPointedTarget(null);
    setFullText(false);
  };
  // `byKey`: picked from the keyboard or assistive technology; the picture's
  // clicks are the pointer's.
  const pick = (id: string, byKey = false) => {
    const letGo = focusId === id;
    setPicked(letGo ? null : id);
    setPointedTarget(null);
    setFullText(false);
    if (letGo) return;
    // In the targets view a target opens its own area's list, where its card stands.
    if (byTargets) {
      const home = areas.areas.find((a) => a.targets.includes(id))?.id;
      if (home && home !== pickedArea) {
        setAreaPick(home);
        setAllTargets(false);
      }
    }
    revealCard.current = true;
    if (byKey) moveFocus.current = "card";
  };
  const back = (byKey: boolean) => {
    setPicked(null);
    setPointedTarget(null);
    if (byKey) moveFocus.current = "pair";
  };

  const head = areaHeadline(pairs);
  const lead = pairs.top[0];
  const nameLink = (chunks: ReactNode) =>
    lead ? (
      <AreaName
        onPoint={(on) => setPointedRows(on ? rowsOf(lead) : [])}
        onOpen={() => {
          setOpen(lead.key);
          revealPair.current = true;
          setPicked(null);
          setPointedTarget(null);
        }}
      >
        {chunks}
      </AreaName>
    ) : (
      chunks
    );
  const lensHeadline = () =>
    head.kind === "none"
      ? t("headlineNone", { side })
      : t.rich(
          head.kind === "within" ? "headlineWithin" : head.kind === "outside" ? "headlineOutside" : "headlineBetween",
          {
            pct: pct(head.share),
            side,
            areaA: nameOf(head.a),
            areaB: head.kind === "between" ? nameOf(head.b) : "",
            first: nameLink,
            second: nameLink,
          },
        );
  // A picked area's headline: the share of the side's target pairs that
  // involve it, counted as its list and the rows count them.
  const pickedHeadline = (id: string) => {
    const count = listed.top.reduce((sum, p) => sum + p.count, listed.rest.count);
    return count === 0
      ? t("headlineAreaNone", { side, area: nameOf(id) })
      : t("headlineArea", { pct: pct(count / pairs.total), side, area: nameOf(id) });
  };
  // The targets view's headline: the largest area's share of the targets placed,
  // or the picked area's count.
  const targetsHeadline = () => {
    const picked = pickedArea ? area(pickedArea) : undefined;
    if (picked) {
      return t("headlineTargetsArea", { count: picked.targets.length, placed: areas.placed, area: picked.name });
    }
    // The lens's areas come most targets first (`lensAreas`).
    const top = areas.areas[0];
    if (!top || areas.placed === 0) return t("headlineTargetsNone");
    return t.rich("headlineTargets", {
      pct: pct(top.targets.length / areas.placed),
      placed: areas.placed,
      area: top.name,
      // The largest area's name opens its targets.
      first: (chunks) => (
        <AreaName
          onPoint={(on) => setPointedRows(on ? [top.id] : [])}
          onOpen={(byKey) => {
            setAreaPick(top.id);
            setPicked(null);
            setPointedTarget(null);
            setAllTargets(false);
            revealPair.current = true;
            if (byKey) moveFocus.current = "headline";
          }}
        >
          {chunks}
        </AreaName>
      ),
    });
  };
  const headline = byTargets ? targetsHeadline() : pickedArea ? pickedHeadline(pickedArea) : lensHeadline();

  const card = (backLabel: string) => {
    if (!focusId) return null;
    const c = commitment(focusId);
    if (!c) return null;
    // Where its partners sit: the three areas holding most, then the rest
    // as one count, so the counts always add up.
    const by = partnersByArea(areas, links, side, focusId);
    const shown = by.areas.slice(0, 3).map((x) => ({ count: x.count, text: t("partnersIn", { count: x.count, area: nameOf(x.id) }) }));
    if (by.outside > 0 && shown.length < 3) shown.push({ count: by.outside, text: t("partnersOutside", { count: by.outside }) });
    const elsewhere = by.total - shown.reduce((sum, x) => sum + x.count, 0);
    const parts = shown.map((x) => x.text);
    if (elsewhere > 0) parts.push(t("partnersElsewhere", { count: elsewhere }));
    const long = c.text.trim().length > LONG_TEXT;
    const openTarget = onExplore ?? onOpenCommitment;
    return (
      <div className="brief-av-card" data-testid="brief-area-card">
        <button
          type="button"
          className="brief-av-back"
          aria-label={t("backTo", { name: backLabel })}
          onClick={(e) => back(e.detail === 0)}
        >
          <span aria-hidden="true">‹ </span>
          {backLabel}
        </button>
        <p className="brief-av-card-title" ref={cardTitle} tabIndex={-1}>
          <span>{c.label}</span>
        </p>
        <p className="brief-av-card-doc">{docName(c.doc)}</p>
        {c.text.trim() && c.text.trim() !== c.label && (
          <p className="brief-av-card-text" data-clamped={long && !fullText ? "true" : undefined}>
            {c.text}
          </p>
        )}
        {long && (
          <button type="button" className="brief-av-link" aria-expanded={fullText} onClick={() => setFullText((v) => !v)}>
            {fullText ? tp("shortText") : tp("fullText")}
          </button>
        )}
        <p className="brief-av-card-partners">
          {byTargets ? (
            // Both sides' counts: the way into the two views of target pairs.
            SIDES.map((s) => `${t("partners", { side: s, count: links[s].get(focusId)?.length ?? 0 })}.`).join(" ")
          ) : (
            <>
              {t("partners", { side, count: by.total })}
              {parts.length > 0 ? `: ${parts.join(", ")}` : ""}.
            </>
          )}
        </p>
        {openTarget && (
          <button type="button" className="brief-av-link" onClick={() => openTarget(focusId)}>
            {th(onExplore ? "exploreTarget" : "openTarget")}
          </button>
        )}
      </div>
    );
  };

  const involved = (p: AreaPair) => (
    <div className="brief-av-open">
      {rowsOf(p).map((areaId) => {
        const top = (area(areaId)?.targets ?? [])
          .filter((id) => (p.involvement.get(id) ?? 0) > 0)
          .sort((x, y) => (p.involvement.get(y) ?? 0) - (p.involvement.get(x) ?? 0))
          .slice(0, INVOLVED_MAX);
        return (
          <div key={areaId}>
            <h3 className="brief-av-sub">{t("involved", { area: nameOf(areaId) })}</h3>
            <ul className="brief-av-targets">
              {top.map((id) => {
                const c = commitment(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="brief-av-target"
                      data-testid="brief-area-target"
                      onClick={(e) => pick(id, e.detail === 0)}
                      onPointerEnter={() => setPointedTarget(id)}
                      onPointerLeave={() => setPointedTarget(null)}
                      onFocus={() => setPointedTarget(id)}
                      onBlur={() => setPointedTarget(null)}
                    >
                      <span className="brief-av-target-name">{c ? commitmentLine(c, 70) : id}</span>
                      <span className="brief-av-target-doc">{c ? docName(c.doc) : ""}</span>
                      <span className="brief-av-target-count">{n(p.involvement.get(id) ?? 0)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {onOpenAreaPair && (
        <button type="button" className="brief-av-link" onClick={() => onOpenAreaPair({ lens: active, key: p.key, side })}>
          {t("seePairs", { count: p.count })}
        </button>
      )}
    </div>
  );

  const rowLabel = (id: string) => {
    const a = area(id);
    if (!a) return null;
    const count = counts.get(id);
    const name = (
      <AreaName
        className="brief-av-name"
        title={a.acronym ? `${a.name} (${a.acronym})` : a.name}
        pressed={pickedArea === id}
        onPoint={(on) => setPointedRows(on ? [id] : [])}
        onOpen={(byKey) => pickArea(id, byKey)}
      >
        {a.name}
      </AreaName>
    );
    const of = count !== undefined && (
      <span className="brief-av-of" data-side={side}>
        {t("rowPairs", { side, count })}
      </span>
    );
    // The name on the left, the area's figures in the columns the head
    // above the picture names: its targets, and the result bar of all its
    // target pairs.
    const tone = tones.get(id) ?? emptyCounts();
    const shares = SHARE_COLUMNS.map((key) => areaShare(tone, key));
    const shown = (share: number | null) => (share === null ? "—" : pct(share));
    return (
      <>
        <span className="brief-av-label">
          {name}
          {a.targets.length < AREA_FEW_TARGETS && <span className="brief-av-few">{t("fewTargets")}</span>}
          {of}
        </span>
        <span className="brief-av-fig" data-on={sort.key === "targets" ? "true" : undefined} aria-hidden="true">
          {n(a.targets.length)}
        </span>
        <span className="brief-sr-only">{t("targets", { count: a.targets.length })}</span>
        <span className="brief-av-bar" aria-hidden="true">
          {shares[0] === null ? <span className="brief-av-fig">—</span> : <ResultBar counts={tone} />}
        </span>
        {shares[0] !== null && (
          <span className="brief-sr-only">
            {t("rowShares", {
              aligned: shown(shares[0]),
              partial: shown(shares[1]),
              apart: shown(shares[2]),
              total: tone.total,
            })}
          </span>
        )}
      </>
    );
  };
  const columnName = (key: AreaShareKey) =>
    td(key === "reinforce" ? "columnAligned" : key === "partial" ? "columnPartial" : "columnApart");
  const sortHead = (label: string, key: AreaSortKey) => {
    const on = sort.key === key;
    return (
      <button
        key={key}
        type="button"
        className="brief-av-sort"
        aria-pressed={on}
        aria-label={on ? t(sort.dir === "desc" ? "sortMost" : "sortLeast", { label }) : undefined}
        onClick={() => setSort((s) => nextAreaSort(s, key))}
      >
        {label}
        {on && <span aria-hidden="true">{sort.dir === "desc" ? " ▾" : " ▴"}</span>}
      </button>
    );
  };
  const tipFor = (id: string) => {
    const c = commitment(id);
    return (
      <>
        <strong>{c ? commitmentLine(c, 90) : id}</strong>
        <br />
        <span className="brief-hub-tip-meta">
          {byTargets ? (
            (c && docName(c.doc)) || ""
          ) : (
            <>
              {c ? `${docName(c.doc)} · ` : ""}
              {t("tip", { side, count: links[side].get(id)?.length ?? 0 })}
            </>
          )}
        </span>
      </>
    );
  };
  const marked = new Set(
    pointedRows.length > 0 ? pointedRows : focusId ? [] : openPair ? rowsOf(openPair) : pickedArea ? [pickedArea] : [],
  );
  // Set back: in the targets view, the rows other than a picked area; else the
  // rows outside an open pair, or without a target taking part with a picked area.
  const dimmed = new Set(
    byTargets
      ? pickedArea
        ? areas.areas.filter((a) => a.id !== pickedArea).map((a) => a.id)
        : []
      : focus.kind === "pair"
        ? areas.areas.filter((a) => !rowsOf(focus.pair).includes(a.id)).map((a) => a.id)
        : focus.kind === "area"
          ? areas.areas.filter((a) => !counts.has(a.id)).map((a) => a.id)
          : [],
  );
  const max = listed.top[0]?.count ?? 1;
  // The targets view lists the areas as `lensAreas` orders them: by their
  // number of targets, most first (ties in the lens's order), so its first
  // row is the area its headline names.
  const maxTargets = Math.max(1, areas.areas[0]?.targets.length ?? 0);
  // An open area's targets, in its own order; the first ones until all are asked for.
  const targetList = (a: LensArea) => {
    const shown = allTargets ? a.targets : a.targets.slice(0, TARGETS_SHOWN);
    return (
      <div className="brief-av-open">
        <ul className="brief-av-targets">
          {shown.map((id) => {
            const c = commitment(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className="brief-av-target"
                  data-testid="brief-area-target"
                  onClick={(e) => pick(id, e.detail === 0)}
                  onPointerEnter={() => setPointedTarget(id)}
                  onPointerLeave={() => setPointedTarget(null)}
                  onFocus={() => setPointedTarget(id)}
                  onBlur={() => setPointedTarget(null)}
                >
                  <span className="brief-av-target-name">{c ? commitmentLine(c, 70) : id}</span>
                  <span className="brief-av-target-doc">{c ? docName(c.doc) : ""}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {a.targets.length > TARGETS_SHOWN && (
          <button type="button" className="brief-av-link" aria-expanded={allTargets} onClick={() => setAllTargets((v) => !v)}>
            {allTargets ? t("showFewerTargets") : t("showAllTargets", { count: a.targets.length })}
          </button>
        )}
      </div>
    );
  };
  // The rest of the pairs of areas, summed, once the list names some.
  const restShown = listed.top.length > 0 && listed.rest.groups > 0;
  // Between two targets outside the lens: no picked area's pairs.
  const outsideShown = !pickedArea && pairs.outside > 0;

  return (
    <div className="brief-av" data-testid="brief-areas" data-tour="brief-areas" ref={root}>
      <div className="brief-av-picture">
        <div className="brief-av-head">
          <span className="brief-av-lens">{lensNameOf(source.lenses, active, tl)}</span>
          {sortHead(t("colTargets"), "targets")}
          <span className="brief-av-ends">
            {sortHead(columnName("apart"), "apart")}
            {sortHead(columnName("reinforce"), "reinforce")}
          </span>
        </div>
        <AreaField
          rows={drawn}
          inks={inks}
          side={side}
          rowLabel={rowLabel}
          marked={marked}
          dimmed={dimmed}
          pointed={pointedTarget}
          tipFor={tipFor}
          listLabel={t("lensGroup")}
          onPick={(id) => pick(id)}
        />
      </div>
      <div className="brief-av-side">
        <p className="brief-hub-kicker">{t("kicker")}</p>
        <h2 className="brief-hub-headline" tabIndex={-1} ref={headlineRef}>
          {headline}
        </h2>
        <p className="brief-av-choice" role="group" aria-label={t("lensGroup")}>
          {source.lenses.map((l) => (
            <button
              key={l.id}
              type="button"
              aria-pressed={l.id === active}
              title={lensTooltip(l, tl)}
              onClick={() => onLens(l.id)}
            >
              {lensName(l, tl)}
            </button>
          ))}
        </p>
        <p className="brief-av-choice" role="group" aria-label={t("sideGroup")}>
          {VIEWS.map((v) => (
            <button key={v} type="button" aria-pressed={v === view} onClick={() => choose(v)}>
              <span className="brief-av-glyph" data-side={v} aria-hidden="true" />
              {t(v === "targets" ? "viewTargets" : v === "apart" ? "sideApart" : "sideReinforce")}
            </button>
          ))}
        </p>
        {areas.placed < areas.total && (
          <p className="brief-av-scope">{t("scope", { placed: areas.placed, total: areas.total })}</p>
        )}
        {!byTargets && focusId && !openPair && card(pickedArea ? nameOf(pickedArea) : t("backAll"))}
        {!byTargets && pickedArea && (!focusId || openPair) && (
          <button
            type="button"
            className="brief-av-back"
            aria-label={t("backTo", { name: t("backAll") })}
            onClick={(e) => allAreas(e.detail === 0)}
          >
            <span aria-hidden="true">‹ </span>
            {t("backAll")}
          </button>
        )}
        {byTargets && (
          <ol className="brief-av-pairs" aria-label={t("areaList")}>
            {areas.areas.map((a) => {
              const isOpen = pickedArea === a.id;
              return (
                <li key={a.id} className="brief-av-pair" data-testid="brief-area-row" data-open={isOpen ? "true" : undefined}>
                  <button
                    type="button"
                    className="brief-av-pair-head"
                    aria-expanded={isOpen}
                    onClick={() => toggleArea(a.id)}
                    onPointerEnter={() => setPointedRows([a.id])}
                    onPointerLeave={() => setPointedRows([])}
                    onFocus={() => setPointedRows([a.id])}
                    onBlur={() => setPointedRows([])}
                  >
                    <span className="brief-av-pair-name">{a.name}</span>
                    <span className="brief-av-pair-bar" data-side="targets" aria-hidden="true">
                      <span style={{ width: `${((a.targets.length / maxTargets) * 100).toFixed(1)}%` }} />
                    </span>
                    <span className="brief-av-pair-count">{n(a.targets.length)}</span>
                    <span className="brief-av-pair-share">
                      {t("areaShareTargets", { pct: pct(a.targets.length / Math.max(1, areas.placed)) })}
                    </span>
                  </button>
                  {isOpen && (focusId ? card(a.name) : targetList(a))}
                </li>
              );
            })}
          </ol>
        )}
        {!byTargets && listed.top.length > 0 && (
          <ol className="brief-av-pairs">
            {listed.top.map((p) => {
              const isOpen = openPair?.key === p.key;
              return (
                <li key={p.key} className="brief-av-pair" data-testid="brief-area-pair" data-open={isOpen ? "true" : undefined}>
                  <button
                    type="button"
                    className="brief-av-pair-head"
                    aria-expanded={isOpen}
                    onClick={() => toggle(p)}
                    onPointerEnter={() => setPointedRows(rowsOf(p))}
                    onPointerLeave={() => setPointedRows([])}
                    onFocus={() => setPointedRows(rowsOf(p))}
                    onBlur={() => setPointedRows([])}
                  >
                    <span className="brief-av-pair-name">{pairName(p)}</span>
                    <span className="brief-av-pair-bar" data-side={side} aria-hidden="true">
                      <span style={{ width: `${((p.count / max) * 100).toFixed(1)}%` }} />
                    </span>
                    <span className="brief-av-pair-count">{n(p.count)}</span>
                    <span className="brief-av-pair-share">{t("share", { pct: pct(p.count / p.pairs), pairs: p.pairs })}</span>
                  </button>
                  {isOpen && (focusId ? card(pairName(p)) : involved(p))}
                </li>
              );
            })}
          </ol>
        )}
        {!byTargets && (restShown || outsideShown) && (
          <p className="brief-av-rest">
            {restShown && (
              <span>{t("rest", { groups: listed.rest.groups, count: listed.rest.count, pairs: listed.rest.pairs })}</span>
            )}
            {restShown && outsideShown && " "}
            {outsideShown && <span>{t("outsidePairs", { count: pairs.outside, side })}</span>}
          </p>
        )}
      </div>
    </div>
  );
}
