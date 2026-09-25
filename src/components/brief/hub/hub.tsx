"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  emptyCounts,
  findDocPair,
  MIN_PAIR_COMPARISONS,
  shareOf,
  toneOf,
  type Concentration,
  type Tone,
  type ToneCounts,
} from "@/lib/brief/compute";
import { MAX_THEMES, type BriefData } from "@/lib/brief/data";
import { DOT_ORDER } from "@/lib/brief/dot-layout";
import { HUB_TOP, pairInOrder, type HubGroup, type HubStage, type HubTone, type MapFocus } from "@/lib/brief/hub";
import { getDocPairKey } from "@/lib/coherence-briefing";
import type { AlignmentMechanism } from "@/types";
import { DOT_COLORS } from "../dot-field";
import { commitmentLine, useNumbers } from "../ink";
import { StrongestList } from "../sections/aligned";
import { ReviewList } from "../sections/commitments";
import { DocList, ResultBar } from "../sections/documents";
import { useOverallHeadline } from "../sections/overall";
import { ThemeList } from "../sections/themes";
import { HubCanvas, type HubTarget } from "./hub-canvas";

export type HubStep = "overview" | "map" | "reinforce" | "strong" | "apart" | "review" | "documents";

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

/** A target's pairs by how they read, overall and per other document. */
function targetCounts(data: BriefData, id: string): { all: ToneCounts; byDoc: Map<string, ToneCounts> } {
  const all = emptyCounts();
  const byDoc = new Map<string, ToneCounts>();
  for (const c of data.scope.comparisons) {
    const other = c.a.id === id ? c.b : c.b.id === id ? c.a : null;
    if (!other) continue;
    const tone = toneOf(c.level);
    const counts = byDoc.get(other.doc) ?? emptyCounts();
    counts[tone] += 1;
    counts.total += 1;
    byDoc.set(other.doc, counts);
    all[tone] += 1;
    all.total += 1;
  }
  return { all, byDoc };
}

/** A theme (`theme:<tone>:<n>`) or a type of potential misalignment
 *  (`kind:<type>`) under the pointer: the map's tone and emphasis for it. */
function previewOf(key: string | null): { tone: HubTone; focus: MapFocus } | null {
  const theme = key ? /^theme:(reinforce|apart):(\d+)$/.exec(key) : null;
  if (theme) return { tone: theme[1] as HubTone, focus: { kind: "theme", index: Number(theme[2]) } };
  if (key?.startsWith("kind:")) {
    return { tone: "apart", focus: { kind: "mechanism", mechanism: key.slice(5) as AlignmentMechanism } };
  }
  return null;
}

/**
 * The coherence overview on screen: the dot field of every target pair on
 * one side, the steps of the overview beside it, in four parts. The overall
 * picture by rating, then the same dots as a map of the documents; what
 * works well and where to look closer, each one section whose headline,
 * themes and types bring their pairs forward on the map before a target
 * takes the centre with its pairs around it; and one document in the
 * centre with its pairs with every other.
 */
export function Hub({
  data,
  onOpenTheme,
  onOpenCommitment,
  onOpenDocPair,
  onOpenPair,
}: {
  data: BriefData;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
  onOpenCommitment?: (id: string) => void;
  onOpenDocPair?: (a: string, b: string) => void;
  onOpenPair?: (a: string, b: string) => void;
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
  // The targets the reader put in the centre, per list.
  const [picked, setPicked] = useState<{ strong: string | null; review: string | null }>({
    strong: null,
    review: null,
  });
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
  const inList = (id: string | null, ids: string[]) => (id !== null && ids.includes(id) ? id : (ids[0] ?? null));
  const strongId = inList(picked.strong, data.strongest.slice(0, HUB_TOP).map((r) => r.commitment.id));
  const reviewId = inList(picked.review, data.commitments.slice(0, reviewLimit).map((r) => r.commitment.id));

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
    // Steps come and go with the selection (no pairs, no potential misalignment): observe anew.
  }, [hasPairs, hasApart, hasStrong]);

  // It holds while its own step leads, or until another step takes the lead
  // (a row keeps focus after the reader scrolled away).
  const hovered = hover && (hover.home === active || hover.at === active) ? hover.key : null;
  const pointAt = (home: HubStep | null) => (key: string | null) =>
    setHover((prev) =>
      key === null ? null : prev && prev.key === key && prev.home === home ? prev : { key, home, at: active },
    );
  const setHovered = pointAt(null);

  // A theme or type the reader points at shows its pairs on the map, in its
  // own tone, whichever step leads.
  const preview = previewOf(hovered);
  const mapFocus = (tone?: HubTone): MapFocus | undefined => {
    if (hovered?.startsWith("axis:")) return { kind: "doc", doc: hovered.slice(5) };
    return tone ? { kind: "top" } : undefined;
  };
  const stageSpec: HubStage = preview
    ? { kind: "map", tone: preview.tone, focus: preview.focus }
    : active === "overview"
      ? { kind: "overview" }
      : active === "map"
        ? { kind: "map", focus: mapFocus() }
        : active === "reinforce" || (active === "strong" && !strongId)
          ? { kind: "map", tone: "reinforce", focus: mapFocus("reinforce") }
          : active === "apart" || (active === "review" && !reviewId)
            ? { kind: "map", tone: "apart", focus: mapFocus("apart") }
            : active === "strong"
              ? { kind: "target", id: strongId! }
              : active === "review"
                ? { kind: "target", id: reviewId! }
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
  const inFocus = stage.kind === "target" ? stage.id : null;
  const focusTarget = useMemo(() => (inFocus ? targetCounts(data, inFocus) : null), [data, inFocus]);

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
  const outlined = [data.leading.reinforce, data.leading.apart]
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => getDocPairKey(p.a.id, p.b.id));

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
    const counts =
      stage.kind === "doc"
        ? pairStat(stage.doc, g.key)?.counts
        : stage.kind === "target"
          ? focusTarget?.byDoc.get(g.key)
          : undefined;
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
    if (t.kind === "dot") {
      const p = data.scope.comparisons[t.index];
      if (!p || !inFocus || (p.a.id !== inFocus && p.b.id !== inFocus)) return null;
      const other = p.a.id === inFocus ? p.b : p.a;
      return (
        <>
          <strong>{tb(`panel.rating.${p.level}`)}</strong>
          <br />
          {commitmentLine(other, 90)}
          <br />
          <span className="brief-hub-tip-meta">{docName(other.doc)}</span>
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
    const counts = stage.kind === "doc" ? pairStat(stage.doc, g.key)?.counts : focusTarget?.byDoc.get(g.key);
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
    return stage.kind !== "target";
  };
  const onSelect = (t: HubTarget) => {
    if (t.kind === "axis") {
      focusDoc(t.axis.key);
      goTo("documents");
      return;
    }
    if (t.kind === "dot") {
      const p = data.scope.comparisons[t.index];
      if (p) onOpenPair?.(p.a.id, p.b.id);
      return;
    }
    const g = t.group;
    if (stage.kind === "overview") goTo(g.key === "reinforce" ? "reinforce" : "apart");
    else if (stage.kind === "doc") onOpenDocPair?.(stage.doc, g.key);
    else if (stage.kind === "map") {
      const pair = pairNames(g.key);
      onOpenDocPair?.(pair.a, pair.b);
    }
  };

  const focusCounts = focusStat?.counts;
  const centerTarget = inFocus ? commitment(inFocus) : null;
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
    ) : centerTarget && focusTarget ? (
      <>
        <span className="brief-hub-center-name brief-hub-center-target">{commitmentLine(centerTarget, 64)}</span>
        <span className="brief-hub-center-meta">{docName(centerTarget.doc)}</span>
        {focusTarget.all.total > 0 && (
          <>
            <span className="brief-hub-center-bar">
              <ResultBar counts={focusTarget.all} />
            </span>
            <span className="brief-hub-center-meta">{th("centerPairs", { count: focusTarget.all.total })}</span>
          </>
        )}
      </>
    ) : undefined;
  const openLabel = (id: string) => th("openTarget", { count: targetCounts(data, id).all.total });
  const pick = (list: "strong" | "review") => (id: string) => setPicked((cur) => ({ ...cur, [list]: id }));
  const themeRows = (tone: "reinforce" | "apart") =>
    (tone === "reinforce" ? data.together : data.apart).rows.slice(0, MAX_THEMES);
  const themeHover = (tone: "reinforce" | "apart") => (name: string | null) => {
    const index = name === null ? -1 : themeRows(tone).findIndex((r) => r.storyline.name === name);
    pointAt(tone)(index >= 0 ? `theme:${tone}:${index}` : null);
  };
  const hoveredTheme = (tone: "reinforce" | "apart") =>
    preview?.tone === tone && preview.focus.kind === "theme"
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
          onCenter={inFocus ? () => onOpenCommitment?.(inFocus) : undefined}
          highlight={hovered && !hovered.includes(":") ? hovered : null}
          outlined={active === "map" && !preview ? outlined : []}
          onHover={setHovered}
          center={center}
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
                      <button type="button" className="brief-dots-link" onClick={() => goTo(tone)}>
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

            <div className="brief-hub-part" data-part="aligned">
              <section className="brief-hub-step" data-step="reinforce">
                <h2 className="brief-hub-headline" tabIndex={-1}>
                  {concentrationHeadline(data.strongConcentration, "aligned")}
                </h2>
                <ThemeList
                  data={data}
                  tone="reinforce"
                  hovered={hoveredTheme("reinforce")}
                  onHover={themeHover("reinforce")}
                  onSelect={(name) => onOpenTheme?.("reinforcement", name)}
                  tour="brief-themes"
                />
              </section>

              {hasStrong && (
                <section className="brief-hub-step brief-hub-substep" data-step="strong">
                  <h3 className="brief-hub-sub" tabIndex={-1}>
                    {ts("aligned")}
                  </h3>
                  <StrongestList
                    data={data}
                    testId="hub-strong-row"
                    tour="brief-aligned"
                    onOpen={onOpenCommitment}
                    selected={strongId}
                    onSelect={pick("strong")}
                    openLabel={openLabel}
                  />
                </section>
              )}
            </div>

            <div className="brief-hub-part" data-part="apart">
              <section className="brief-hub-step" data-step="apart">
                <h2 className="brief-hub-headline" tabIndex={-1}>
                  {concentrationHeadline(concentration, "commitments")}
                </h2>
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

              {hasApart && (
                <section className="brief-hub-step brief-hub-substep" data-step="review">
                  <h3 className="brief-hub-sub" tabIndex={-1}>
                    {ts("commitments")}
                  </h3>
                  <ReviewList
                    data={data}
                    limit={reviewLimit}
                    testId="hub-apart-row"
                    tour="brief-commitments"
                    onOpen={onOpenCommitment}
                    selected={reviewId}
                    onSelect={pick("review")}
                    openLabel={openLabel}
                  />
                </section>
              )}
            </div>

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
