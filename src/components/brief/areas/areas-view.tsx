"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  areaFocus,
  areaHeadline,
  areaPairs,
  cloudSizes,
  lensAreas,
  OTHER_AREA,
  partnersByArea,
  restClouds,
  rowCounts,
  rowOrder,
  sideLinks,
  targetInks,
  type AreaFocus,
  type AreaPair,
  type AreaSide,
  type TargetInk,
} from "@/lib/brief/areas";
import type { BriefData } from "@/lib/brief/data";
import type { BriefSource, LensId } from "@/lib/brief/source";
import { LONG_TEXT } from "../comparison";
import { commitmentLine, useNumbers } from "../ink";
import { lensTooltipKey } from "../lens-tooltip";
import { AreaField } from "./area-field";

const SIDES: AreaSide[] = ["apart", "reinforce"];
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
 * Policy areas on screen: the bar chart of targets per area, each target
 * with its point cloud, beside the pairs of areas the chosen side's target
 * pairs fall between. Pointing marks names; picking an area by its name,
 * opening a pair of areas or picking a target re-shapes the picture.
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
  const { n, pct } = useNumbers();
  const active = lens ?? source.lenses[0]?.id ?? null;
  const [side, setSide] = useState<AreaSide>("apart");
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
  const rest = useMemo(
    () => (areas ? restClouds(areas, links, side) : new Map<string, number>()),
    [areas, links, side],
  );
  // One picture per lens, side and choice: the field re-forms only when they change.
  /* eslint-disable react-hooks/exhaustive-deps */
  const clouds = useMemo(
    () => (areas ? cloudSizes(areas, links, side, focus) : new Map<string, number>()),
    [areas, links, side, focusKey],
  );
  // A picked target's row keeps the order it had: at rest, around its area, or with its pair open.
  const basisKey = focusId ? behindKey : "";
  const rows = useMemo(
    () => (areas ? rowOrder(areas, rest, clouds, focus, links, side, focusId ? behind : { kind: "rest" }) : []),
    [areas, rest, clouds, focusKey, basisKey],
  );
  const inks = useMemo(
    () => (areas ? targetInks(areas, focus, links, side) : new Map<string, TargetInk>()),
    [areas, links, side, focusKey],
  );
  const counts = useMemo(
    () => (areas ? rowCounts(areas, focus, links, side) : new Map<string, number>()),
    [areas, links, side, focusKey],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

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
  }, [open]);

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
  const choose = (next: AreaSide) => {
    setSide(next);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
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
    if (!letGo && byKey) moveFocus.current = "headline";
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
  const headline = pickedArea ? pickedHeadline(pickedArea) : lensHeadline();

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
          {t("partners", { side, count: by.total })}
          {parts.length > 0 ? `: ${parts.join(", ")}` : ""}.
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
    return (
      <>
        <AreaName
          className="brief-av-name"
          title={a.acronym ? `${a.name} (${a.acronym})` : a.name}
          pressed={pickedArea === id}
          onPoint={(on) => setPointedRows(on ? [id] : [])}
          onOpen={(byKey) => pickArea(id, byKey)}
        >
          {a.name}
        </AreaName>
        <span className="brief-av-n" aria-hidden="true">
          {n(a.targets.length)}
        </span>
        <span className="brief-sr-only">{t("targets", { count: a.targets.length })}</span>
        {count !== undefined && (
          <span className="brief-av-of" data-side={side}>
            {t("rowPairs", { side, count })}
          </span>
        )}
      </>
    );
  };
  const tipFor = (id: string) => {
    const c = commitment(id);
    return (
      <>
        <strong>{c ? commitmentLine(c, 90) : id}</strong>
        <br />
        <span className="brief-hub-tip-meta">
          {c ? `${docName(c.doc)} · ` : ""}
          {t("tip", { side, count: links[side].get(id)?.length ?? 0 })}
        </span>
      </>
    );
  };
  const marked = new Set(
    pointedRows.length > 0 ? pointedRows : focusId ? [] : openPair ? rowsOf(openPair) : pickedArea ? [pickedArea] : [],
  );
  // Set back: the rows outside an open pair, or without a target taking part with a picked area.
  const dimmed = new Set(
    focus.kind === "pair"
      ? areas.areas.filter((a) => !rowsOf(focus.pair).includes(a.id)).map((a) => a.id)
      : focus.kind === "area"
        ? areas.areas.filter((a) => !counts.has(a.id)).map((a) => a.id)
        : [],
  );
  const max = listed.top[0]?.count ?? 1;
  // The rest of the pairs of areas, summed, once the list names some.
  const restShown = listed.top.length > 0 && listed.rest.groups > 0;
  // Between two targets outside the lens: no picked area's pairs.
  const outsideShown = !pickedArea && pairs.outside > 0;

  return (
    <div className="brief-av" data-testid="brief-areas" data-tour="brief-areas" ref={root}>
      <div className="brief-av-picture">
        <AreaField
          rows={rows}
          restClouds={rest}
          clouds={clouds}
          inks={inks}
          side={side}
          rowLabel={rowLabel}
          marked={marked}
          dimmed={dimmed}
          pointed={pointedTarget}
          tipFor={tipFor}
          formatCount={n}
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
          {source.lenses.map((l) => {
            const tip = lensTooltipKey(l.id);
            return (
              <button
                key={l.id}
                type="button"
                aria-pressed={l.id === active}
                title={tip ? tl(tip) : undefined}
                onClick={() => onLens(l.id)}
              >
                {tl(l.id)}
              </button>
            );
          })}
        </p>
        <p className="brief-av-choice" role="group" aria-label={t("sideGroup")}>
          {SIDES.map((s) => (
            <button key={s} type="button" aria-pressed={s === side} onClick={() => choose(s)}>
              <span className="brief-av-glyph" data-side={s} aria-hidden="true" />
              {t(s === "apart" ? "sideApart" : "sideReinforce")}
            </button>
          ))}
        </p>
        {areas.placed < areas.total && (
          <p className="brief-av-scope">{t("scope", { placed: areas.placed, total: areas.total })}</p>
        )}
        {focusId && !openPair && card(pickedArea ? nameOf(pickedArea) : t("backAll"))}
        {pickedArea && (!focusId || openPair) && (
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
        {listed.top.length > 0 && (
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
        {(restShown || outsideShown) && (
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
