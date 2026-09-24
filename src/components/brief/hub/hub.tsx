"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { pairKeyOf, type Tone } from "@/lib/brief/compute";
import { MAX_THEMES, OTHER_THEME, type BriefData } from "@/lib/brief/data";
import { DOT_ORDER } from "@/lib/brief/dot-layout";
import type { HubGroup, HubStage } from "@/lib/brief/hub";
import { DOT_COLORS } from "../dot-field";
import { useNumbers } from "../ink";
import { StrongestList } from "../sections/aligned";
import { ReviewList } from "../sections/commitments";
import { DocList, useDocumentsHeadline } from "../sections/documents";
import { useOverallHeadline } from "../sections/overall";
import { ThemeList, useThemeHeadline } from "../sections/themes";
import { HubCanvas } from "./hub-canvas";

export type HubStep = "overview" | "reinforce" | "apart" | "documents";

/** Rows each list shows in the overview. */
const ROWS = 6;

/**
 * The coherence overview on screen: the dot field of every target pair on
 * one side, and the steps of the overview beside it. As a step reaches the
 * middle of the window the dots re-form for it: by rating, by the themes of
 * alignment, by the themes of potential misalignment, and around one
 * document. Each step lists what the dots show.
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
  const together = useThemeHeadline(data, "reinforce");
  const apart = useThemeHeadline(data, "apart");
  const documents = useDocumentsHeadline(data);

  const [active, setActive] = useState<HubStep>("overview");
  const [hovered, setHovered] = useState<string | null>(null);
  // The document at the centre of the wheel, and the row open in the list.
  const firstDoc = data.docs[0]?.doc.id ?? null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(firstDoc);
  const inScope = (id: string | null) => id !== null && data.docs.some((d) => d.doc.id === id);
  const focus = inScope(chosen) ? chosen : firstDoc;
  const openDoc = inScope(open) ? open : null;

  const root = useRef<HTMLDivElement>(null);
  const stepEl = (step: HubStep) => root.current?.querySelector<HTMLElement>(`[data-step="${step}"]`) ?? null;
  const hasPairs = data.counts.total > 0;

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
  }, [hasPairs]);

  const stageKind = active === "documents" ? (focus ? `doc:${focus}` : "overview") : active;
  const stage = useMemo<HubStage>(
    () =>
      stageKind.startsWith("doc:")
        ? { kind: "doc", doc: stageKind.slice(4) }
        : { kind: stageKind as "overview" | "reinforce" | "apart" },
    [stageKind],
  );

  const goTo = (step: HubStep) => {
    const el = stepEl(step);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // Keyboard and screen-reader users arrive where the pointer went.
    el.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };
  const toggleDoc = (id: string) => {
    setOpen((cur) => (cur === id ? null : id));
    setChosen(id);
  };

  const c = data.counts;
  const share = (v: number) => (c.total > 0 ? v / c.total : 0);
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  const themeRows = (tone: "reinforce" | "apart") =>
    (tone === "reinforce" ? data.together : data.apart).rows.slice(0, MAX_THEMES);
  const pairStat = (a: string, b: string) => data.pairs.find((p) => pairKeyOf(p.a.id, p.b.id) === pairKeyOf(a, b));

  const labelFor = (g: HubGroup): ReactNode => {
    if (stage.kind === "overview") return pct(share(g.count));
    if (stage.kind === "doc") return <span className="brief-hub-label-name">{docName(g.key)}</span>;
    if (g.key === OTHER_THEME) return tb("themes.other");
    return String(themeRows(stage.kind).findIndex((r) => r.storyline.name === g.key) + 1);
  };
  const tipFor = (g: HubGroup): ReactNode => {
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
    if (g.key === OTHER_THEME) return tb("themes.otherTip", { count: g.count });
    return (
      <>
        <strong>{g.key}</strong>
        <br />
        {tb(`themes.count.${stage.kind}`, { count: g.count })}
      </>
    );
  };
  const clickable = (g: HubGroup) =>
    stage.kind === "overview" ? g.key === "reinforce" || g.key === "apart" : g.key !== OTHER_THEME;
  const onGroup = (g: HubGroup) => {
    if (stage.kind === "overview") goTo(g.key === "reinforce" ? "reinforce" : "apart");
    else if (stage.kind === "doc") onOpenDocPair?.(stage.doc, g.key);
    else onOpenTheme?.(stage.kind === "reinforce" ? "reinforcement" : "friction", g.key);
  };

  const mixTotal = data.mix.reduce((sum, m) => sum + m.count, 0);

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
            stage.kind === "doc" ? <span className="brief-hub-center-name">{docName(stage.doc)}</span> : undefined
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
                {together}
              </h2>
              <ThemeList
                data={data}
                tone="reinforce"
                hovered={hovered}
                onHover={setHovered}
                onSelect={(name) => onOpenTheme?.("reinforcement", name)}
                tour="brief-themes"
              />
              <h3 className="brief-hub-sub">{ts("aligned")}</h3>
              <StrongestList data={data} testId="hub-strong-row" tour="brief-aligned" onOpen={onOpenCommitment} />
            </section>

            <section className="brief-hub-step" data-step="apart">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {apart}
              </h2>
              <ThemeList
                data={data}
                tone="apart"
                hovered={hovered}
                onHover={setHovered}
                onSelect={(name) => onOpenTheme?.("friction", name)}
              />
              {data.mix.length > 0 && (
                <>
                  <h3 className="brief-hub-sub">{th("kinds")}</h3>
                  <ul className="brief-hub-kinds">
                    {data.mix.map((m) => (
                      <li key={m.mechanism} className="brief-hub-kind" title={td(m.mechanism)}>
                        <span className="brief-hub-kind-name">{tm(m.mechanism)}</span>
                        <span className="brief-hub-kind-bar brief-screen-apart" aria-hidden="true">
                          <span style={{ width: `${((m.count / mixTotal) * 100).toFixed(1)}%` }} />
                        </span>
                        <span className="brief-hub-kind-value">{pct(m.count / mixTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <h3 className="brief-hub-sub">{ts("commitments")}</h3>
              <ReviewList
                data={data}
                limit={ROWS}
                testId="hub-apart-row"
                tour="brief-commitments"
                onOpen={onOpenCommitment}
              />
            </section>

            <section className="brief-hub-step" data-step="documents">
              <h2 className="brief-hub-headline" tabIndex={-1}>
                {documents}
              </h2>
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
