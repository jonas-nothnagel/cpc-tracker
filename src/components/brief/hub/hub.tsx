"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  findDocPair,
  MIN_PAIR_COMPARISONS,
  shareOf,
  type Concentration,
  type Tone,
  type ToneCounts,
} from "@/lib/brief/compute";
import { MAX_THEMES, type BriefData } from "@/lib/brief/data";
import { DOT_ORDER } from "@/lib/brief/dot-layout";
import {
  HUB_TOP,
  MARK_TEXT,
  pairInOrder,
  sideLevel,
  type HubGroup,
  type HubMark,
  type HubStage,
  type HubTone,
  type MapFocus,
} from "@/lib/brief/hub";
import { getDocPairKey, getStorylineDocPairKeys } from "@/lib/coherence-briefing";
import type { AlignmentMechanism } from "@/types";
import { DOT_COLORS } from "../dot-field";
import { commitmentLine, useNumbers } from "../ink";
import { StrongestList } from "../sections/aligned";
import { ReviewList } from "../sections/commitments";
import { DocList, ResultBar } from "../sections/documents";
import { useOverallHeadline } from "../sections/overall";
import { ThemeList } from "../sections/themes";
import { HubCanvas, type HubTarget } from "./hub-canvas";

export type HubStep = "overview" | "map" | "reinforce" | "apart" | "documents";

/** Most targets the list of targets to review first shows (its data holds eight). */
const REVIEW_MAX = 8;

const aligned = (c: ToneCounts) => (c.total > 0 ? c.reinforce / c.total : 0);

/** A document named in a finding: set apart, and a way into it. An inline
 *  element with a button's role, so a long name wraps with the sentence. */
function DocName({
  children,
  onSelect,
  onHover,
}: {
  children: ReactNode;
  onSelect?: () => void;
  /** Pointing at the name brings its part of the field forward. */
  onHover?: (on: boolean) => void;
}) {
  if (!onSelect) return <span className="brief-docname brief-docname-static">{children}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      className="brief-docname"
      onClick={onSelect}
      onPointerEnter={onHover ? () => onHover(true) : undefined}
      onPointerLeave={onHover ? () => onHover(false) : undefined}
      onFocus={onHover ? () => onHover(true) : undefined}
      onBlur={onHover ? () => onHover(false) : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {children}
    </span>
  );
}

/** A theme (`theme:<side>:<n>`), a type of potential misalignment
 *  (`kind:<type>`) or a target (`target:<side>:<id>`) under the pointer:
 *  the side of the map it belongs to, and what that side brings forward. */
function previewOf(key: string | null): { side: HubTone; focus: MapFocus } | null {
  if (!key) return null;
  const theme = /^theme:(reinforce|apart):(\d+)$/.exec(key);
  if (theme) return { side: theme[1] as HubTone, focus: { kind: "theme", index: Number(theme[2]) } };
  if (key.startsWith("kind:")) {
    return { side: "apart", focus: { kind: "mechanism", mechanism: key.slice(5) as AlignmentMechanism } };
  }
  const target = /^target:(reinforce|apart):(.+)$/.exec(key);
  if (target) return { side: target[1] as HubTone, focus: { kind: "target", id: target[2] } };
  return null;
}

/**
 * The coherence overview on screen: the dot field of every target pair on
 * one side, the steps of the overview beside it, each a level deeper. The
 * overall picture by rating; the same dots as a map of the documents; each
 * side of it as its own landscape (what works well, where to look closer),
 * its targets named on the map and listed, its themes and types brought
 * forward on request; and one document in the centre with its pairs with
 * every other. A single target is explored further on the ring.
 */
export function Hub({
  data,
  onOpenTheme,
  onOpenCommitment,
  onOpenDocPair,
  onOpenPair,
  onExplore,
}: {
  data: BriefData;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
  onOpenCommitment?: (id: string) => void;
  onOpenDocPair?: (a: string, b: string) => void;
  onOpenPair?: (a: string, b: string) => void;
  /** Puts a target in the centre of the ring further down. */
  onExplore?: (id: string) => void;
}) {
  const tb = useTranslations("brief");
  const th = useTranslations("brief.hub");
  const ts = useTranslations("brief.sections");
  const tm = useTranslations("labels.contradictionType");
  const td = useTranslations("labels.contradictionDescription");
  const { n, pct } = useNumbers();
  const overall = useOverallHeadline(data);

  const [active, setActive] = useState<HubStep>("overview");
  // What the pointer or keyboard is on: its key, the step it sits in (none
  // for the field itself) and the step that led when it arrived.
  const [hover, setHover] = useState<{ key: string; home: HubStep | null; at: HubStep } | null>(null);
  // The target the reader keeps forward on each side.
  const [picked, setPicked] = useState<Record<HubTone, string | null>>({ reinforce: null, apart: null });
  // A rating chosen in the overall picture, brought forward on the map
  // until the reader moves on.
  const [mapTone, setMapTone] = useState<HubTone | null>(null);
  // The document at the centre of the hub, and the row open in the list.
  const firstDoc = data.docs[0]?.doc.id ?? null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(firstDoc);
  const inScope = (id: string | null) => id !== null && data.docs.some((d) => d.doc.id === id);
  const focus = inScope(chosen) ? chosen : firstDoc;
  const openDoc = inScope(open) ? open : null;

  const root = useRef<HTMLDivElement>(null);
  const stepEl = (step: HubStep) => root.current?.querySelector<HTMLElement>(`[data-step="${step}"]`) ?? null;
  const hasPairs = data.counts.total > 0;
  const hasApart = data.counts.apart > 0;
  const hasStrong = data.strongest.length > 0;

  const concentration = data.concentration;
  const reviewLimit = concentration.concentrated
    ? Math.min(REVIEW_MAX, Math.max(HUB_TOP, concentration.top.length))
    : HUB_TOP;
  // The targets with pairs on each side: a picked target the selection
  // leaves without any is let go.
  const onSide = useMemo(() => {
    const sets: Record<HubTone, Set<string>> = { reinforce: new Set(), apart: new Set() };
    for (const c of data.scope.comparisons) {
      const side: HubTone | null = c.level === sideLevel("reinforce") ? "reinforce" : c.level === sideLevel("apart") ? "apart" : null;
      if (!side) continue;
      sets[side].add(c.a.id);
      sets[side].add(c.b.id);
    }
    return sets;
  }, [data]);
  const pickedOn = (side: HubTone) => {
    const id = picked[side];
    return id !== null && onSide[side].has(id) ? id : null;
  };

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // The step across the middle of the window, if any.
    const middle = (): HubStep | null => {
      const y = window.innerHeight / 2;
      for (const el of root.current?.querySelectorAll<HTMLElement>("[data-step]") ?? []) {
        const box = el.getBoundingClientRect();
        if (box.top <= y && box.bottom >= y) return el.dataset.step as HubStep;
      }
      return null;
    };
    // A step leads while it crosses the middle of the window. When the lead
    // leaves after a jump (the walkthrough, a link), the step now at the
    // middle leads, even one that was in the band all along.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const step = (entry.target as HTMLElement).dataset.step as HubStep | undefined;
          if (!step) continue;
          if (entry.isIntersecting) setActive(step);
          else {
            const next = middle();
            if (next) setActive((cur) => (cur === step ? next : cur));
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.current?.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    return () => io.disconnect();
    // Steps come and go with the selection (no pairs at all): observe anew.
  }, [hasPairs]);

  // A rating brought forward on the map holds while the map leads.
  const lastActive = useRef<HubStep>(active);
  useEffect(() => {
    if (lastActive.current === "map" && active !== "map") setMapTone(null);
    lastActive.current = active;
  }, [active]);

  // It holds while its own step leads, or until another step takes the lead
  // (a row keeps focus after the reader scrolled away).
  const hovered = hover && (hover.home === active || hover.at === active) ? hover.key : null;
  const pointAt = (home: HubStep | null) => (key: string | null) =>
    setHover((prev) =>
      key === null ? null : prev && prev.key === key && prev.home === home ? prev : { key, home, at: active },
    );
  const setHovered = pointAt(null);

  // A theme, type or target the reader points at shows its pairs on its own
  // side of the map, whichever step leads.
  const preview = previewOf(hovered);
  const axisDoc = hovered?.startsWith("axis:") ? hovered.slice(5) : null;
  const sideFocus = (side: HubTone): MapFocus => {
    if (axisDoc) return { kind: "doc", doc: axisDoc };
    const id = pickedOn(side);
    return id ? { kind: "target", id } : { kind: "top" };
  };
  const stageSpec: HubStage = preview
    ? { kind: "map", side: preview.side, focus: preview.focus }
    : active === "overview"
      ? { kind: "overview" }
      : active === "map"
        ? {
            kind: "map",
            ...(mapTone ? { tone: mapTone } : {}),
            ...(axisDoc ? { focus: { kind: "doc", doc: axisDoc } } : {}),
          }
        : active === "reinforce" || active === "apart"
          ? { kind: "map", side: active, focus: sideFocus(active) }
          : focus
            ? { kind: "doc", doc: focus }
            : { kind: "overview" };
  const specKey = JSON.stringify(stageSpec);
  // One stage object per step and question, so the field only re-forms when they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stage = useMemo<HubStage>(() => stageSpec, [specKey]);

  const goTo = (step: HubStep) => {
    const el = stepEl(step);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Keyboard and screen-reader users arrive where the pointer went.
    el.querySelector<HTMLElement>("h2, h3")?.focus({ preventScroll: true });
  };
  const focusDoc = (id: string) => {
    setOpen(id);
    setChosen(id);
  };
  // A rating from the overall picture: on to the map, with its pairs forward.
  const showTone = (tone: HubTone) => {
    setMapTone(tone);
    goTo("map");
  };
  // A second click on the kept target lets it go.
  const pick = (side: HubTone) => (id: string) =>
    setPicked((cur) => ({ ...cur, [side]: cur[side] === id ? null : id }));
  const toggleDoc = (id: string) => {
    setOpen((cur) => (cur === id ? null : id));
    setChosen(id);
  };

  const c = data.counts;
  const share = (v: number) => (c.total > 0 ? v / c.total : 0);
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  const pairNames = (key: string) => {
    const [a, b] = pairInOrder(key, data.scope.docs);
    return { a, b, names: th("pairNames", { docA: docName(a), docB: docName(b) }) };
  };
  const pairStat = (a: string, b: string) => findDocPair(data.pairs, a, b);
  const commitment = (id: string) => data.scope.commitments.find((x) => x.id === id);
  const mixTotal = data.mix.reduce((sum, m) => sum + m.count, 0);
  const pairCounts = (counts: ToneCounts) => {
    const part = (v: number) => pct(counts.total > 0 ? v / counts.total : 0);
    return tb("panel.docPairCounts", {
      total: counts.total,
      aligned: part(counts.reinforce),
      partial: part(counts.partial),
      apart: part(counts.apart),
    });
  };

  // Findings that name documents: the names lead into the documents, and
  // pointing at them brings their block forward on the map.
  const leadLine = (tone: "reinforce" | "apart") => {
    const lead = data.leading[tone];
    const key = tone === "reinforce" ? "together" : "apart";
    if (!lead) {
      return tb(`${key}.headlineFallback`, {
        pct: pct(data.counts.total > 0 ? data.counts[tone] / data.counts.total : 0),
      });
    }
    const openPair = () => onOpenDocPair?.(lead.a.id, lead.b.id);
    const block = getDocPairKey(lead.a.id, lead.b.id);
    const point = (on: boolean) => pointAt("map")(on ? block : null);
    return th.rich(tone === "reinforce" ? "leadTogether" : "leadApart", {
      docA: lead.a.name,
      docB: lead.b.name,
      pct: pct(shareOf(lead.counts, tone)),
      first: (chunks) => (
        <DocName onSelect={openPair} onHover={point}>
          {chunks}
        </DocName>
      ),
      second: (chunks) => (
        <DocName onSelect={openPair} onHover={point}>
          {chunks}
        </DocName>
      ),
    });
  };
  const leadBlocks = [data.leading.reinforce, data.leading.apart]
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => getDocPairKey(p.a.id, p.b.id));
  const themeRows = (tone: HubTone) => (tone === "reinforce" ? data.together : data.apart).rows.slice(0, MAX_THEMES);
  // The map outlines the pairs of documents a finding names: the two lead
  // pairs on the map itself, a theme's pairs while it is pointed at.
  const previewTheme = preview?.focus.kind === "theme" ? themeRows(preview.side)[preview.focus.index] : undefined;
  const themeBlocks = previewTheme ? [...getStorylineDocPairKeys(previewTheme.storyline)] : null;
  const outlined = themeBlocks ?? (active === "map" && !preview ? leadBlocks : []);

  // A side's finding: how few targets carry it (a union of pairs, never a sum).
  const concentrationHeadline = (k: Concentration, section: "aligned" | "commitments") =>
    k.total === 0
      ? tb(`${section}.headlineEmpty`)
      : k.concentrated
        ? tb(`${section}.headlineConcentrated`, { total: k.total, pct: pct(k.share), top: k.top.length })
        : tb(`${section}.headlineSpread`, { contested: k.contested });

  const rated = data.docs.filter((d) => d.counts.total >= MIN_PAIR_COMPARISONS);
  const high = rated[0];
  const low = rated[rated.length - 1];
  const documentsHeadline =
    rated.length >= 2 && aligned(high.counts) !== aligned(low.counts)
      ? th.rich("documentsLead", {
          low: pct(aligned(low.counts)),
          docLow: low.doc.name,
          high: pct(aligned(high.counts)),
          docHigh: high.doc.name,
          first: (chunks) => <DocName onSelect={() => focusDoc(low.doc.id)}>{chunks}</DocName>,
          second: (chunks) => <DocName onSelect={() => focusDoc(high.doc.id)}>{chunks}</DocName>,
        })
      : tb("documents.headlineFallback", { pct: pct(aligned(data.counts)) });

  // The document at the centre, in one line: its shares, and the other
  // document with the highest share of potential misalignment (among those
  // with enough target pairs to rate).
  const focusStat = data.docs.find((d) => d.doc.id === focus) ?? null;
  const takeaway = (() => {
    if (!focusStat || !focus) return null;
    const counts = focusStat.counts;
    const values = {
      doc: focusStat.doc.name,
      aligned: pct(aligned(counts)),
      apart: pct(counts.total > 0 ? counts.apart / counts.total : 0),
      total: counts.total,
      name: (chunks: ReactNode) => <DocName>{chunks}</DocName>,
    };
    if (counts.apart === 0) return th.rich("focusNone", values);
    const worst = data.pairs
      .filter((p) => (p.a.id === focus || p.b.id === focus) && p.counts.total >= MIN_PAIR_COMPARISONS && p.counts.apart > 0)
      .map((p) => ({ other: p.a.id === focus ? p.b : p.a, share: shareOf(p.counts, "apart") }))
      .sort((x, y) => y.share - x.share)[0];
    if (!worst) return th.rich("focusPlain", values);
    return th.rich("focus", {
      ...values,
      partner: worst.other.name,
      partnerShare: pct(worst.share),
      other: (chunks: ReactNode) => (
        <DocName onSelect={() => onOpenDocPair?.(focus, worst.other.id)}>{chunks}</DocName>
      ),
    });
  })();

  const labelFor = (g: HubGroup): ReactNode => {
    if (stage.kind === "overview") return pct(share(g.count));
    const counts = stage.kind === "doc" ? pairStat(stage.doc, g.key)?.counts : undefined;
    return (
      <>
        <span className="brief-hub-label-name">{docName(g.key)}</span>
        {counts && counts.total > 0 && (
          <span className="brief-hub-label-bar">
            <ResultBar counts={counts} />
          </span>
        )}
      </>
    );
  };

  const markCount = (side: HubTone, count: number) =>
    side === "apart" ? th("countApart", { count }) : tb("aligned.row", { count });

  const tipFor = (t: HubTarget): ReactNode => {
    if (t.kind === "axis") {
      const stat = data.docs.find((d) => d.doc.id === t.axis.key);
      if (!stat) return docName(t.axis.key);
      return (
        <>
          <strong>{stat.doc.name}</strong>
          <br />
          {pairCounts(stat.counts)}
        </>
      );
    }
    if (t.kind === "mark") {
      const c = commitment(t.mark.id);
      const side = stage.kind === "map" ? stage.side : undefined;
      return (
        <>
          <strong>{c ? commitmentLine(c, 110) : t.mark.id}</strong>
          <br />
          {side ? markCount(side, t.mark.count) : n(t.mark.count)}
          <br />
          <span className="brief-hub-tip-meta">{docName(t.mark.doc)}</span>
        </>
      );
    }
    if (t.kind === "dot") {
      const p = data.scope.comparisons[t.index];
      if (!p) return null;
      return (
        <>
          <strong>{tb(`panel.rating.${p.level}`)}</strong>
          <br />
          {commitmentLine(p.a, 70)} <span className="brief-hub-tip-meta">{docName(p.a.doc)}</span>
          <br />
          {commitmentLine(p.b, 70)} <span className="brief-hub-tip-meta">{docName(p.b.doc)}</span>
        </>
      );
    }
    const g = t.group;
    if (stage.kind === "overview") {
      const tone = g.key as Tone;
      return (
        <>
          <strong>{n(g.count)}</strong> {tb(`tone.${tone}`)} ({pct(share(g.count))})
        </>
      );
    }
    if (stage.kind === "map") {
      const pair = pairNames(g.key);
      const counts = pairStat(pair.a, pair.b)?.counts;
      return (
        <>
          <strong>{pair.names}</strong>
          {counts && (
            <>
              <br />
              {pairCounts(counts)}
            </>
          )}
        </>
      );
    }
    const counts = stage.kind === "doc" ? pairStat(stage.doc, g.key)?.counts : undefined;
    if (!counts) return docName(g.key);
    return (
      <>
        <strong>{docName(g.key)}</strong>
        <br />
        {pairCounts(counts)}
      </>
    );
  };
  const clickable = (t: HubTarget) => {
    if (t.kind !== "group") return true;
    if (stage.kind === "overview") return t.group.key === "reinforce" || t.group.key === "apart";
    return true;
  };
  const onSelect = (t: HubTarget) => {
    if (t.kind === "axis") {
      focusDoc(t.axis.key);
      goTo("documents");
      return;
    }
    if (t.kind === "mark") {
      if (stage.kind === "map" && stage.side) pick(stage.side)(t.mark.id);
      return;
    }
    if (t.kind === "dot") {
      const p = data.scope.comparisons[t.index];
      if (p) onOpenPair?.(p.a.id, p.b.id);
      return;
    }
    const g = t.group;
    if (stage.kind === "overview") showTone(g.key as HubTone);
    // Around a document, another document takes the centre.
    else if (stage.kind === "doc") focusDoc(g.key);
    else if (stage.kind === "map") {
      const pair = pairNames(g.key);
      onOpenDocPair?.(pair.a, pair.b);
    }
  };

  const markLabel = (m: HubMark): ReactNode => {
    const c = commitment(m.id);
    return (
      <>
        <span className="brief-hub-mark-name">{c ? commitmentLine(c, MARK_TEXT) : m.id}</span>
        <span className="brief-hub-mark-count">{n(m.count)}</span>
      </>
    );
  };

  const focusCounts = focusStat?.counts;
  const center =
    stage.kind === "doc" ? (
      <>
        <span className="brief-hub-center-name">{docName(stage.doc)}</span>
        {focusCounts && focusCounts.total > 0 && (
          <>
            <span className="brief-hub-center-bar">
              <ResultBar counts={focusCounts} />
            </span>
            <span className="brief-hub-center-meta">{th("centerPairs", { count: focusCounts.total })}</span>
          </>
        )}
      </>
    ) : undefined;
  // A picked row's way on: the ring when there is one, else the target's panel.
  const openTarget = onExplore ?? onOpenCommitment;
  const openLabel = () => th(onExplore ? "exploreTarget" : "openTarget");
  const hoverTarget = (side: HubTone) => (id: string | null) => pointAt(side)(id ? `target:${side}:${id}` : null);
  const hoveredTarget = (side: HubTone) =>
    preview?.side === side && preview.focus.kind === "target" ? preview.focus.id : null;
  const themeHover = (tone: HubTone) => (name: string | null) => {
    const index = name === null ? -1 : themeRows(tone).findIndex((r) => r.storyline.name === name);
    pointAt(tone)(index >= 0 ? `theme:${tone}:${index}` : null);
  };
  const hoveredTheme = (tone: HubTone) =>
    preview?.side === tone && preview.focus.kind === "theme"
      ? (themeRows(tone)[preview.focus.index]?.storyline.name ?? null)
      : null;

  return (
    <div className="brief-hub" data-testid="brief-hub" ref={root}>
      <div className="brief-hub-stage">
        <HubCanvas
          data={data}
          stage={stage}
          labelFor={labelFor}
          tipFor={tipFor}
          clickable={clickable}
          onSelect={onSelect}
          highlight={hovered && !hovered.includes(":") ? hovered : null}
          outlined={outlined}
          onHover={setHovered}
          center={center}
          markLabel={markLabel}
        />
      </div>
      <div className="brief-hub-steps">
        <section className="brief-hub-step" data-step="overview" data-tour="brief-overall">
          <h2 className="brief-hub-headline" tabIndex={-1}>
            {overall}
          </h2>
          {hasPairs && (
            <ul className="brief-dots-legend brief-hub-legend">
              {DOT_ORDER.filter((tone) => c[tone] > 0).map((tone) => {
                const label = (
                  <>
                    <span className="brief-dots-key" style={{ background: DOT_COLORS[tone] }} aria-hidden="true" />
                    <span className="brief-dots-pct">{pct(share(c[tone]))}</span>{" "}
                    <span className="brief-dots-tone">{tb(`tone.${tone}`)}</span>
                  </>
                );
                return (
                  <li key={tone}>
                    {tone === "reinforce" || tone === "apart" ? (
                      <button type="button" className="brief-dots-link" onClick={() => showTone(tone)}>
                        {label}
                        <span className="brief-dots-arrow" aria-hidden="true">
                          ↓
                        </span>
                      </button>
                    ) : (
                      label
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {hasPairs && (
          <>
            <section className="brief-hub-step" data-step="map" data-tour="brief-map">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {leadLine("reinforce")}
              </h2>
              {data.leading.apart && (
                <p className="brief-hub-second" data-testid="hub-map-apart">
                  {leadLine("apart")}
                </p>
              )}
            </section>

            <section className="brief-hub-step brief-hub-side" data-step="reinforce">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {concentrationHeadline(data.strongConcentration, "aligned")}
              </h2>
              {hasStrong && (
                <>
                  <h3 className="brief-hub-sub">{ts("aligned")}</h3>
                  <StrongestList
                    data={data}
                    testId="hub-strong-row"
                    tour="brief-aligned"
                    onOpen={openTarget}
                    selected={pickedOn("reinforce")}
                    onSelect={pick("reinforce")}
                    openLabel={openLabel}
                    onHover={hoverTarget("reinforce")}
                    hovered={hoveredTarget("reinforce")}
                  />
                </>
              )}
              <ThemeList
                data={data}
                tone="reinforce"
                hovered={hoveredTheme("reinforce")}
                onHover={themeHover("reinforce")}
                onSelect={(name) => onOpenTheme?.("reinforcement", name)}
                tour="brief-themes"
              />
            </section>

            <section className="brief-hub-step brief-hub-side" data-step="apart">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {concentrationHeadline(concentration, "commitments")}
              </h2>
              {hasApart && (
                <>
                  <h3 className="brief-hub-sub">{ts("commitments")}</h3>
                  <ReviewList
                    data={data}
                    limit={reviewLimit}
                    testId="hub-apart-row"
                    tour="brief-commitments"
                    onOpen={openTarget}
                    selected={pickedOn("apart")}
                    onSelect={pick("apart")}
                    openLabel={openLabel}
                    onHover={hoverTarget("apart")}
                    hovered={hoveredTarget("apart")}
                  />
                </>
              )}
              <ThemeList
                data={data}
                tone="apart"
                hovered={hoveredTheme("apart")}
                onHover={themeHover("apart")}
                onSelect={(name) => onOpenTheme?.("friction", name)}
              />
              {data.mix.length > 0 && (
                <>
                  <h3 className="brief-hub-sub brief-hub-sub-inline">{th("kinds")}</h3>
                  <ul className="brief-hub-kinds">
                    {data.mix.map((m) => (
                      <li
                        key={m.mechanism}
                        className="brief-hub-kind"
                        tabIndex={0}
                        data-hovered={hovered === `kind:${m.mechanism}` ? "true" : undefined}
                        onPointerEnter={() => pointAt("apart")(`kind:${m.mechanism}`)}
                        onPointerLeave={() => pointAt("apart")(null)}
                        onFocus={() => pointAt("apart")(`kind:${m.mechanism}`)}
                        onBlur={() => pointAt("apart")(null)}
                      >
                        <span className="brief-hub-kind-main">
                          <span className="brief-hub-kind-name">{tm(m.mechanism)}</span>
                          <span className="brief-hub-kind-desc">{td(m.mechanism)}</span>
                        </span>
                        <span className="brief-hub-kind-bar brief-screen-apart" aria-hidden="true">
                          <span style={{ width: `${((m.count / mixTotal) * 100).toFixed(1)}%` }} />
                        </span>
                        <span className="brief-hub-kind-value">{pct(m.count / mixTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <section className="brief-hub-step" data-step="documents">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {documentsHeadline}
              </h2>
              {takeaway && (
                <p className="brief-hub-focus" data-testid="hub-focus">
                  {takeaway}
                </p>
              )}
              <DocList
                data={data}
                open={openDoc}
                onToggle={toggleDoc}
                onOpenDocPair={onOpenDocPair}
                onHoverPartner={pointAt("documents")}
                tour="brief-documents"
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
