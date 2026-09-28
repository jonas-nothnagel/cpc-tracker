"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
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

/** An area named in the headline: it points at its row and opens its pair. */
function AreaName({
  children,
  onPoint,
  onOpen,
}: {
  children: ReactNode;
  onPoint: (on: boolean) => void;
  onOpen: () => void;
}) {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <span
      role="button"
      tabIndex={0}
      className="brief-docname"
      onClick={onOpen}
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
 * pairs fall between. Pointing marks names; opening a pair of areas or
 * picking a target re-shapes the picture.
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
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [pointedRows, setPointedRows] = useState<string[]>([]);
  const [pointedTarget, setPointedTarget] = useState<string | null>(null);
  const [fullText, setFullText] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const cardTitle = useRef<HTMLParagraphElement>(null);
  // Where keyboard focus goes once a pick or "Back" has re-drawn the list.
  const moveFocus = useRef<"card" | "pair" | null>(null);
  // A new lens lets the open pair and the picked target go, for good.
  const [seenLens, setSeenLens] = useState(active);
  if (seenLens !== active) {
    setSeenLens(active);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
    setPointedRows([]);
  }

  const areas = useMemo(() => (active ? lensAreas(source, data.scope, active) : null), [source, data.scope, active]);
  const links = useMemo(() => sideLinks(data.scope), [data.scope]);
  const pairs = useMemo(() => (areas ? areaPairs(areas, data.scope, side) : null), [areas, data.scope, side]);
  const placed = useMemo(() => new Set(areas?.areas.flatMap((a) => a.targets) ?? []), [areas]);
  // A choice holds while its pair of areas, or its target, is in the brief.
  const openPair = open ? (pairs?.top.find((p) => p.key === open) ?? null) : null;
  const focusId = picked && placed.has(picked) ? picked : null;
  const focusKey = focusId ? `t:${focusId}` : openPair ? `p:${openPair.key}` : "rest";
  const focus: AreaFocus = focusId
    ? { kind: "target", id: focusId }
    : openPair
      ? { kind: "pair", pair: openPair }
      : { kind: "rest" };
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
  // A picked target's row keeps the order it had, at rest or with its pair open.
  const basisKey = focusId && openPair ? openPair.key : "";
  const rows = useMemo(
    () =>
      areas
        ? rowOrder(areas, rest, clouds, focus, links, side, focusId && openPair ? { kind: "pair", pair: openPair } : { kind: "rest" })
        : [],
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

  // Keyboard focus follows a pick to the target's card, and "Back" to its
  // pair of areas (the buttons that were pressed are gone).
  useEffect(() => {
    const want = moveFocus.current;
    moveFocus.current = null;
    if (want === "card") cardTitle.current?.focus({ preventScroll: true });
    if (want === "pair") {
      const heads = root.current?.querySelectorAll<HTMLElement>(".brief-av-pair-head") ?? [];
      const open = root.current?.querySelector<HTMLElement>('[data-open="true"] .brief-av-pair-head');
      (open ?? heads[0])?.focus({ preventScroll: true });
    }
  }, [focusId]);

  if (!active || !areas || !pairs) return null;

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
  const choose = (next: AreaSide) => {
    setSide(next);
    setOpen(null);
    setPicked(null);
    setPointedTarget(null);
  };
  const toggle = (p: AreaPair) => {
    setOpen(openPair?.key === p.key ? null : p.key);
    setPicked(null);
    setPointedTarget(null);
    setFullText(false);
  };
  const pick = (id: string) => {
    const letGo = focusId === id;
    setPicked(letGo ? null : id);
    setPointedTarget(null);
    setFullText(false);
    if (!letGo) moveFocus.current = "card";
  };
  const back = () => {
    setPicked(null);
    setPointedTarget(null);
    moveFocus.current = "pair";
  };

  const head = areaHeadline(pairs);
  const lead = pairs.top[0];
  const nameLink = (chunks: ReactNode) =>
    lead ? (
      <AreaName
        onPoint={(on) => setPointedRows(on ? rowsOf(lead) : [])}
        onOpen={() => {
          setOpen(lead.key);
          setPicked(null);
          setPointedTarget(null);
        }}
      >
        {chunks}
      </AreaName>
    ) : (
      chunks
    );
  const headline =
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

  const card = (backLabel: string) => {
    if (!focusId) return null;
    const c = commitment(focusId);
    if (!c) return null;
    const by = partnersByArea(areas, links, side, focusId);
    const parts = by.areas.slice(0, 3).map((x) => t("partnersIn", { count: x.count, area: nameOf(x.id) }));
    if (by.outside > 0 && parts.length < 3) parts.push(t("partnersOutside", { count: by.outside }));
    const more = by.areas.length + (by.outside > 0 ? 1 : 0) > parts.length;
    const long = c.text.trim().length > LONG_TEXT;
    const openTarget = onExplore ?? onOpenCommitment;
    return (
      <div className="brief-av-card" data-testid="brief-area-card">
        <button type="button" className="brief-av-back" aria-label={t("backTo", { name: backLabel })} onClick={back}>
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
          {parts.length > 0 ? `: ${parts.join(", ")}${more ? ", …" : ""}` : ""}.
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
            <h4 className="brief-av-sub">{t("involved", { area: nameOf(areaId) })}</h4>
            <ul className="brief-av-targets">
              {top.map((id) => {
                const c = commitment(id);
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="brief-av-target"
                      data-testid="brief-area-target"
                      onClick={() => pick(id)}
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
        <span className="brief-av-name" title={a.acronym ? `${a.name} (${a.acronym})` : undefined}>
          {a.name}
        </span>
        <span className="brief-av-n">{n(a.targets.length)}</span>
        {count !== undefined && (
          <span className="brief-av-of" data-side={side}>
            {t("rowOf", { count, total: a.targets.length })}
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
  const marked = new Set(pointedRows.length > 0 ? pointedRows : openPair && !focusId ? rowsOf(openPair) : []);
  const dimmed = new Set(
    focus.kind === "pair" ? areas.areas.filter((a) => !rowsOf(focus.pair).includes(a.id)).map((a) => a.id) : [],
  );
  const max = pairs.top[0]?.count ?? 1;

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
          onPick={pick}
        />
      </div>
      <div className="brief-av-side">
        <p className="brief-hub-kicker">{t("kicker")}</p>
        <h2 className="brief-hub-headline" tabIndex={-1}>
          {headline}
        </h2>
        <p className="brief-av-choice" role="group" aria-label={t("lensGroup")}>
          {source.lenses.map((l) => (
            <button key={l.id} type="button" aria-pressed={l.id === active} onClick={() => onLens(l.id)}>
              {tl(l.id)}
            </button>
          ))}
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
        {focusId && !openPair && card(t("backAll"))}
        {pairs.top.length > 0 && (
          <ol className="brief-av-pairs">
            {pairs.top.map((p) => {
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
        {pairs.top.length > 0 && pairs.rest.groups > 0 && (
          <p className="brief-av-rest">
            {t("rest", { groups: pairs.rest.groups, count: pairs.rest.count, pairs: pairs.rest.pairs })}
          </p>
        )}
      </div>
    </div>
  );
}
