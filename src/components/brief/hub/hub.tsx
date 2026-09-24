"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { findDocPair, MIN_PAIR_COMPARISONS, shareOf, type Tone, type ToneCounts } from "@/lib/brief/compute";
import { MAX_THEMES, OTHER_THEME, type BriefData } from "@/lib/brief/data";
import { DOT_ORDER } from "@/lib/brief/dot-layout";
import { HUB_TOP, pairInOrder, type HubGroup, type HubStage } from "@/lib/brief/hub";
import { DOT_COLORS } from "../dot-field";
import { commitmentLine, useNumbers } from "../ink";
import { StrongestList } from "../sections/aligned";
import { ReviewList } from "../sections/commitments";
import { DocList, ResultBar } from "../sections/documents";
import { useOverallHeadline } from "../sections/overall";
import { ThemeList } from "../sections/themes";
import { HubCanvas, type HubTarget } from "./hub-canvas";

export type HubStep = "overview" | "reinforce" | "strong" | "apart" | "kinds" | "review" | "documents";

const aligned = (c: ToneCounts) => (c.total > 0 ? c.reinforce / c.total : 0);

/** A document named in a finding: set apart, and a way into it. An inline
 *  element with a button's role, so a long name wraps with the sentence. */
function DocName({ children, onSelect }: { children: ReactNode; onSelect?: () => void }) {
  if (!onSelect) return <span className="brief-docname brief-docname-static">{children}</span>;
  return (
    <span
      role="button"
      tabIndex={0}
      className="brief-docname"
      onClick={onSelect}
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

/**
 * The coherence overview on screen: the dot field of every target pair on
 * one side, and the steps of the overview beside it. As a step reaches the
 * middle of the window the dots re-form for it, each step a level deeper:
 * by rating; the aligned pairs by theme, each theme in bands by the pairs
 * of documents that carry it; the targets with the most strong alignments;
 * the potential misalignments by theme, by type, and the targets to review
 * first; and one document at the centre with its pairs with every other.
 */
export function Hub({
  data,
  onOpenTheme,
  onOpenCommitment,
  onOpenDocPair,
}: {
  data: BriefData;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
  onOpenCommitment?: (id: string) => void;
  onOpenDocPair?: (a: string, b: string) => void;
}) {
  const tb = useTranslations("brief");
  const th = useTranslations("brief.hub");
  const ts = useTranslations("brief.sections");
  const tm = useTranslations("labels.contradictionType");
  const td = useTranslations("labels.contradictionDescription");
  const { n, pct } = useNumbers();
  const overall = useOverallHeadline(data);

  const [active, setActive] = useState<HubStep>("overview");
  const [hover, setHover] = useState<{ key: string; stage: string } | null>(null);
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
  const hasKinds = data.mix.length > 0;

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    // A step leads while it crosses the middle of the window.
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const step = (entry.target as HTMLElement).dataset.step as HubStep | undefined;
          if (entry.isIntersecting && step) setActive(step);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    root.current?.querySelectorAll("[data-step]").forEach((el) => io.observe(el));
    return () => io.disconnect();
    // Steps come and go with the selection (no pairs, no types): observe anew.
  }, [hasPairs, hasKinds]);

  const stageKind = active === "documents" ? (focus ? `doc:${focus}` : "overview") : active;
  // What the pointer brought forward belongs to the step it was in.
  const hovered = hover && hover.stage === stageKind ? hover.key : null;
  const setHovered = (key: string | null) => setHover(key === null ? null : { key, stage: stageKind });
  const stage = useMemo<HubStage>(
    () =>
      stageKind.startsWith("doc:")
        ? { kind: "doc", doc: stageKind.slice(4) }
        : { kind: stageKind as Exclude<HubStage["kind"], "doc"> },
    [stageKind],
  );

  const goTo = (step: HubStep) => {
    const el = stepEl(step);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Keyboard and screen-reader users arrive where the pointer went.
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
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
  const themeRows = (tone: "reinforce" | "apart") =>
    (tone === "reinforce" ? data.together : data.apart).rows.slice(0, MAX_THEMES);
  const pairStat = (a: string, b: string) => findDocPair(data.pairs, a, b);
  const commitment = (id: string) => data.scope.commitments.find((x) => x.id === id);
  const mixTotal = data.mix.reduce((sum, m) => sum + m.count, 0);

  // Findings that name documents: the names lead into the documents.
  const leadHeadline = (tone: "reinforce" | "apart") => {
    const lead = data.leading[tone];
    const key = tone === "reinforce" ? "together" : "apart";
    if (!lead) {
      return tb(`${key}.headlineFallback`, {
        pct: pct(data.counts.total > 0 ? data.counts[tone] / data.counts.total : 0),
      });
    }
    const open = () => onOpenDocPair?.(lead.a.id, lead.b.id);
    return th.rich(tone === "reinforce" ? "leadTogether" : "leadApart", {
      docA: lead.a.name,
      docB: lead.b.name,
      pct: pct(shareOf(lead.counts, tone)),
      first: (chunks) => <DocName onSelect={open}>{chunks}</DocName>,
      second: (chunks) => <DocName onSelect={open}>{chunks}</DocName>,
    });
  };
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
    if (stage.kind === "doc") {
      const counts = pairStat(stage.doc, g.key)?.counts;
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
    }
    if (stage.kind === "strong" || stage.kind === "review") {
      const target = commitment(g.key);
      const rank = (stage.kind === "strong" ? data.strongest : data.commitments).findIndex((r) => r.commitment.id === g.key);
      return (
        <>
          <span className="brief-hub-label-name">
            <span className="brief-hub-rank">{rank + 1}</span> {target ? commitmentLine(target, 70) : g.key}
          </span>
          {target && <span className="brief-hub-label-meta">{docName(target.doc)}</span>}
        </>
      );
    }
    if (stage.kind === "kinds") {
      return (
        <>
          <span className="brief-hub-label-name">{tm(g.key)}</span>
          <span className="brief-hub-label-meta">{pct(mixTotal > 0 ? g.count / mixTotal : 0)}</span>
        </>
      );
    }
    const count = <span className="brief-hub-label-meta">{tb(`themes.count.${stage.kind}`, { count: g.count })}</span>;
    if (g.key === OTHER_THEME) {
      return (
        <>
          <span className="brief-hub-label-name">{tb("themes.other")}</span>
          {count}
        </>
      );
    }
    const index = themeRows(stage.kind).findIndex((r) => r.storyline.name === g.key);
    return (
      <>
        <span className="brief-hub-label-name">
          <span className="brief-hub-rank">{index + 1}</span> {g.key}
        </span>
        {count}
      </>
    );
  };

  const tipFor = ({ group: g, part }: HubTarget): ReactNode => {
    if (stage.kind === "overview") {
      const tone = g.key as Tone;
      return (
        <>
          <strong>{n(g.count)}</strong> {tb(`tone.${tone}`)} ({pct(share(g.count))})
        </>
      );
    }
    if (stage.kind === "doc") {
      const counts = pairStat(stage.doc, g.key)?.counts;
      if (!counts) return docName(g.key);
      const part = (v: number) => pct(counts.total > 0 ? v / counts.total : 0);
      return (
        <>
          <strong>{docName(g.key)}</strong>
          <br />
          {tb("panel.docPairCounts", {
            total: counts.total,
            aligned: part(counts.reinforce),
            partial: part(counts.partial),
            apart: part(counts.apart),
          })}
        </>
      );
    }
    if (stage.kind === "strong" || stage.kind === "review") {
      const target = commitment(g.key);
      return (
        <>
          <strong>{target ? commitmentLine(target, 70) : g.key}</strong>
          {part && (
            <>
              <br />
              {th(`partTip.${stage.kind}`, { count: part.count, doc: docName(part.key) })}
            </>
          )}
        </>
      );
    }
    if (stage.kind === "kinds") {
      return (
        <>
          <strong>{tm(g.key)}</strong>
          <br />
          {td(g.key)}
        </>
      );
    }
    if (g.key === OTHER_THEME) return tb("themes.otherTip", { count: g.count });
    if (!part) return <strong>{g.key}</strong>;
    return (
      <>
        <strong>{pairNames(part.key).names}</strong>
        <br />
        {th(`bandTip.${stage.kind}`, { count: part.count })}
      </>
    );
  };
  const clickable = ({ group: g, part }: HubTarget) => {
    if (stage.kind === "overview") return g.key === "reinforce" || g.key === "apart";
    if (stage.kind === "reinforce" || stage.kind === "apart") return g.key !== OTHER_THEME && part !== null;
    if (stage.kind === "kinds") return false;
    return true;
  };
  const onGroup = ({ group: g, part }: HubTarget) => {
    if (stage.kind === "overview") goTo(g.key === "reinforce" ? "reinforce" : "apart");
    else if (stage.kind === "doc") onOpenDocPair?.(stage.doc, g.key);
    else if (stage.kind === "strong" || stage.kind === "review") onOpenCommitment?.(g.key);
    else if (part) {
      // A band or a segment: the pair of documents behind it.
      const pair = pairNames(part.key);
      onOpenDocPair?.(pair.a, pair.b);
    }
  };

  const focusCounts = focusStat?.counts;

  return (
    <div className="brief-hub" data-testid="brief-hub" ref={root}>
      <div className="brief-hub-stage">
        <HubCanvas
          data={data}
          stage={stage}
          labelFor={labelFor}
          tipFor={tipFor}
          clickable={clickable}
          onGroup={onGroup}
          highlight={hovered}
          onHover={setHovered}
          center={
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
            ) : undefined
          }
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
            <section className="brief-hub-step" data-step="reinforce">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {leadHeadline("reinforce")}
              </h2>
              <ThemeList
                data={data}
                tone="reinforce"
                hovered={hovered}
                onHover={setHovered}
                onSelect={(name) => onOpenTheme?.("reinforcement", name)}
                tour="brief-themes"
              />
            </section>

            <section className="brief-hub-step brief-hub-substep" data-step="strong">
              <h3 className="brief-hub-sub">{ts("aligned")}</h3>
              <StrongestList
                data={data}
                testId="hub-strong-row"
                tour="brief-aligned"
                onOpen={onOpenCommitment}
                onHover={setHovered}
              />
            </section>

            <section className="brief-hub-step" data-step="apart">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {leadHeadline("apart")}
              </h2>
              <ThemeList
                data={data}
                tone="apart"
                hovered={hovered}
                onHover={setHovered}
                onSelect={(name) => onOpenTheme?.("friction", name)}
              />
            </section>

            {hasKinds && (
              <section className="brief-hub-step brief-hub-substep" data-step="kinds">
                <h3 className="brief-hub-sub">{th("kinds")}</h3>
                <ul className="brief-hub-kinds">
                  {data.mix.map((m) => (
                    <li
                      key={m.mechanism}
                      className="brief-hub-kind"
                      data-hovered={hovered === m.mechanism ? "true" : undefined}
                      onPointerEnter={() => setHovered(m.mechanism)}
                      onPointerLeave={() => setHovered(null)}
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
              </section>
            )}

            <section className="brief-hub-step brief-hub-substep" data-step="review">
              <h3 className="brief-hub-sub">{ts("commitments")}</h3>
              <ReviewList
                data={data}
                limit={HUB_TOP}
                testId="hub-apart-row"
                tour="brief-commitments"
                onOpen={onOpenCommitment}
                onHover={setHovered}
              />
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
                onHoverPartner={setHovered}
                tour="brief-documents"
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}
