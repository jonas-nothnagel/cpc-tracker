"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { closerGaps, closerRows, statOf, targetStats, tenders, topTenders, type TenderDot } from "@/lib/brief/contracts/angles";
import { NO_AREA } from "@/lib/brief/contracts/areas";
import { layoutCloser, type CloserDot } from "@/lib/brief/contracts/closer";
import { contractInFocus, focusContext, targetInFocus, type Focus } from "@/lib/brief/contracts/focus";
import type { MisalignedReading } from "@/lib/brief/contracts/load";
import { NO_PLACE, type Contract } from "@/lib/brief/contracts/model";
import { placeKey } from "@/lib/brief/contracts/places";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { targetLine } from "@/lib/brief/text";
import { FirstSentence } from "../ai-text";
import { mixInk } from "../hub/hub-canvas";
import { FIELD_INK } from "./money-field";
import { useMoney } from "./money";

/** Tenders of a target listed before "Show more"; tenders at rest; places named. */
const TENDERS_SHOWN = 4;
const TOP_TENDERS = 5;
const PLACES_SHOWN = 4;
const FALLBACK_WIDTH = 640;

/**
 * Where to look closer: the targets with potentially misaligned tenders, one
 * row each, a dot per tender (potentially misaligned to the left, strongly
 * matching to the right), then the targets no contract strongly matches,
 * by document. It answers the page's focus. At rest the right side names the
 * tenders behind the most potential misalignments; a target (or one of its
 * dots) opens its tenders with the AI's reasons, fetched on request.
 */
export function CloserBlock({
  setup,
  focus,
  placeNames = {},
  onContract,
}: {
  setup: ContractsSetup;
  focus: Focus;
  /** Place codes to names (from the map's outlines). */
  placeNames?: Record<string, string>;
  onContract: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts");
  const tc = useTranslations("brief.contracts.panel.confidence");
  const m = useMoney();
  const file = setup.file;
  const docOf = useMemo(() => new Map(setup.targets.map((x) => [x.id, x.doc])), [setup]);
  const docs = useMemo(() => new Map(setup.documents.map((d) => [d.id, d])), [setup]);
  const targets = useMemo(() => new Map(setup.targets.map((x) => [x.id, x])), [setup]);
  const lens = setup.lenses.find((l) => l.id === focus.lens) ?? setup.lenses[0] ?? null;
  const fctx = useMemo(() => focusContext({ docOf, categories: lens?.categories ?? [], primary: lens?.primary ?? {} }), [docOf, lens]);
  const code = (docId: string) => docs.get(docId)?.code ?? docId;

  // The contracts in the place in focus, and the targets in focus.
  const here = useMemo(() => file.contracts.filter((c) => contractInFocus(c, focus, fctx, { place: true })), [file, focus, fctx]);
  const ids = useMemo(() => setup.targets.map((x) => x.id).filter((id) => targetInFocus(id, focus, fctx, { area: true, doc: true })), [setup, focus, fctx]);
  const stats = useMemo(() => targetStats(here, () => true), [here]);
  const rows = useMemo(() => closerRows(ids, stats), [ids, stats]);
  const gaps = useMemo(
    () => closerGaps(ids, file.contracts, docOf, setup.documents.map((d) => d.id)),
    [ids, file, docOf, setup],
  );
  const misByTarget = useMemo(() => {
    const out = new Map<string, TenderDot[]>();
    for (const id of rows) out.set(id, tenders(here, "mis", (x) => x === id));
    return out;
  }, [rows, here]);
  const inScope = useMemo(() => tenders(here, "mis", (x) => ids.includes(x)), [here, ids]);

  const [sel, setSel] = useState<{ target: string | null; tender: string | null }>({ target: null, tender: null });
  const [more, setMore] = useState(false);
  const [lit, setLit] = useState<string | null>(null);
  // A focus that leaves the chosen target out lets it go.
  const target = sel.target !== null && ids.includes(sel.target) ? sel.target : null;

  // Why each tender was raised, for the target open: fetched when it opens.
  const [readings, setReadings] = useState<{ target: string; byContract: Map<string, MisalignedReading> } | null>(null);
  useEffect(() => {
    if (!target || !(misByTarget.get(target)?.length ?? 0)) return;
    let alive = true;
    const query = new URLSearchParams({ country: setup.countryId, target });
    fetch(`/api/brief/contracts?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<{ misaligned: MisalignedReading[] }>) : Promise.reject(new Error())))
      .then((body) => {
        if (alive) setReadings({ target, byContract: new Map(body.misaligned.map((r) => [r.contract, r])) });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [target, misByTarget, setup.countryId]);
  const readingOf = (tender: TenderDot) => {
    if (!readings || readings.target !== target) return null;
    for (const c of tender.lots) {
      const r = readings.byContract.get(c.id);
      if (r) return r;
    }
    return null;
  };

  // ── The picture ───────────────────────────────────────────────────
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.clientWidth) || FALLBACK_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const w = width ?? FALLBACK_WIDTH;
  const layout = useMemo(
    () => layoutCloser(rows.map((id) => ({ id, mis: (misByTarget.get(id) ?? []).map((d) => d.tender), match: statOf(stats, id).match.size })), w),
    [rows, misByTarget, stats, w],
  );
  useEffect(() => {
    const el = canvas.current;
    const g = el?.getContext?.("2d") ?? null;
    if (!el || !g) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    el.width = Math.round(w * dpr);
    el.height = Math.round(layout.height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, layout.height);
    g.fillStyle = FIELD_INK.leader;
    for (const r of layout.rows) g.fillRect(layout.spine - 0.5, r.mid - layout.pitch * 1.5 - 2, 1, layout.pitch * 3 + 4);
    const focusOn = lit ?? target;
    for (const d of layout.dots) {
      const ink = d.kind === "mis" ? FIELD_INK.mis : FIELD_INK.match;
      g.fillStyle = focusOn !== null && d.target !== focusOn ? mixInk(ink, "#ffffff", 0.25) : ink;
      g.beginPath();
      g.arc(d.x, d.y, layout.pitch * 0.38, 0, Math.PI * 2);
      g.fill();
      if (sel.tender !== null && d.tender === sel.tender && d.target === target) {
        g.strokeStyle = FIELD_INK.record;
        g.lineWidth = 1.3;
        g.beginPath();
        g.arc(d.x, d.y, layout.pitch * 0.95, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }, [layout, w, lit, target, sel.tender]);

  const dotAt = (x: number, y: number): CloserDot | null => {
    let best: CloserDot | null = null;
    let bd = 3.2;
    for (const d of layout.dots) {
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  };
  const [tip, setTip] = useState<{ x: number; y: number; dot: CloserDot } | null>(null);
  const local = (e: { currentTarget: HTMLElement; clientX: number; clientY: number }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const pick = (id: string, tender: string | null = null) => {
    setSel((cur) => (cur.target === id && tender === null && cur.tender === null ? { target: null, tender: null } : { target: id, tender }));
    setMore(false);
  };

  // ── The words ─────────────────────────────────────────────────────
  const what = () => {
    const doc = focus.doc !== null ? code(focus.doc) : null;
    if (focus.area === NO_AREA) return doc ? t("places.what.bothNoArea", { doc }) : t("places.what.noArea");
    const area = focus.area !== null ? (lens?.categories.find((c) => c.id === focus.area)?.name ?? focus.area) : null;
    return doc && area ? t("places.what.both", { doc, area }) : doc ? t("places.what.doc", { doc }) : area ? t("places.what.area", { area }) : t("places.what.target");
  };
  const placeName = (c: string) => (c === NO_PLACE ? t("places.noPlace") : (placeNames[c] ?? c));
  const inPlace = focus.place !== null ? t("closer.inPlace", { place: placeName(focus.place) }) : "";
  const focusNote =
    focus.area !== null || focus.doc !== null || focus.place !== null
      ? t("focus.note", {
          parts: [
            focus.area !== null ? (focus.area === NO_AREA ? t("areas.none") : (lens?.categories.find((c) => c.id === focus.area)?.name ?? focus.area)) : null,
            focus.doc !== null ? (docs.get(focus.doc)?.name ?? focus.doc) : null,
            focus.place !== null ? placeName(focus.place) : null,
          ]
            .filter(Boolean)
            .join(" · "),
        })
      : null;
  const tenderCount = new Set(inScope.map((d) => d.tender)).size;
  const perDoc = new Map<string, number>();
  for (const d of inScope) for (const doc of new Set(d.targets.map((x) => docOf.get(x)).filter((x): x is string => !!x))) perDoc.set(doc, (perDoc.get(doc) ?? 0) + 1);
  const topDoc = [...perDoc.entries()].sort((a, b) => b[1] - a[1])[0];
  const outnumber = rows.filter((id) => statOf(stats, id).mis.size > statOf(stats, id).match.size).length;
  const gapCount = gaps.reduce((s, g) => s + g.ids.length, 0);
  const headline =
    tenderCount > 0
      ? t("closer.headline", {
          count: tenderCount,
          what: what(),
          place: inPlace,
          top: focus.doc === null && topDoc ? t("closer.top", { pct: m.pct(topDoc[1] / tenderCount), doc: code(topDoc[0]) }) : "",
        })
      : t("closer.headlineNone", { what: what(), place: inPlace });
  const second = [
    rows.length > 0 ? (outnumber > 0 ? t("closer.outnumber", { count: outnumber, total: rows.length }) : t("closer.outnumberNone", { total: rows.length })) : null,
    gapCount > 0 ? (rows.length > 0 ? t("closer.gapsLine", { count: gapCount }) : t("closer.gapsOnly", { count: gapCount })) : null,
  ]
    .filter(Boolean)
    .join(" ");

  const detail = (() => {
    if (!target) return null;
    const x = targets.get(target);
    const mine = [...(misByTarget.get(target) ?? [])].sort((a, b) => Number(b.tender === sel.tender) - Number(a.tender === sel.tender) || b.value - a.value);
    const matching = here.filter((c) => c.matches.includes(target)).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
    const matchValue = matching.reduce((s, c) => s + c.value, 0);
    const byPlace = new Map<string, number>();
    for (const c of matching) byPlace.set(placeKey(c), (byPlace.get(placeKey(c)) ?? 0) + c.value);
    const places = [...byPlace.entries()].sort((a, b) => b[1] - a[1]).slice(0, PLACES_SHOWN);
    return (
      <div className="ct-pick">
        <button type="button" className="ct-back" onClick={() => setSel({ target: null, tender: null })}>
          ‹ {t("closer.back")}
        </button>
        <h3 className="ct-pick-name" data-lit="">
          {x ? `${code(x.doc)} · ${targetLine(x, 80)}` : target}
        </h3>
        {x && (
          <>
            <p className="ct-pick-facts">{docs.get(x.doc)?.name ?? x.doc}</p>
            <p className="ct-closer-text">{x.text}</p>
          </>
        )}
        {mine.length > 0 && (
          <>
            <p className="ct-sub">{t("closer.misHead", { count: mine.length })}</p>
            <ul className="ct-tenders">
              {(more ? mine : mine.slice(0, TENDERS_SHOWN)).map((d) => {
                const r = readingOf(d);
                return (
                  <li key={d.tender} className="ct-tender-line ct-closer-tender" data-lit={d.tender === sel.tender ? "" : undefined}>
                    <button type="button" className="ct-tender-open" onClick={() => onContract(d.lead.id)}>
                      {d.lead.title}
                    </button>
                    <span className="ct-list-meta">{t("closer.tenderLine", { count: d.lots.length, value: m.amount(d.value), year: d.lead.year })}</span>
                    {r && (
                      <div className="ct-tender-why">
                        <FirstSentence text={r.text} />
                        {r.confidence && <span className="ct-list-meta">{tc(r.confidence as "high")}</span>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {mine.length > TENDERS_SHOWN && (
              <button type="button" className="ct-back" onClick={() => setMore((v) => !v)}>
                {more ? t("closer.fewer") : t("closer.more", { count: mine.length - TENDERS_SHOWN })}
              </button>
            )}
          </>
        )}
        <p className="ct-sub">
          {matching.length > 0 ? t("closer.matchHead", { count: statOf(stats, target).match.size, value: m.amount(matchValue) }) : t("closer.matchNone")}
        </p>
        {matching.length > 0 && (
          <ul className="ct-closer-matches">
            {matching.slice(0, 3).map((c: Contract) => (
              <li key={c.id}>
                <button type="button" className="ct-plain-link" onClick={() => onContract(c.id)}>
                  {c.title} <span className="ct-list-meta">· {m.amount(c.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {places.length > 0 && (
          <>
            <p className="ct-sub">{t("closer.places")}</p>
            <p className="ct-codes">
              {places.map(([p, v]) => (
                <span key={p}>
                  {placeName(p)} <b>{m.pct(matchValue > 0 ? v / matchValue : 0)}</b>
                </span>
              ))}
            </p>
          </>
        )}
        <Link className="ct-link" href={`/${setup.countryId}/brief/explore?focus=${encodeURIComponent(target)}`}>
          {t("closer.explore")}
          <span aria-hidden="true"> ›</span>
        </Link>
      </div>
    );
  })();

  const top = topTenders(inScope, TOP_TENDERS);

  return (
    <section className="ct-closer brief-hub" data-deep="closer">
      <div className="ct-closer-left">
        <div
          ref={wrap}
          className="ct-closer-field"
          style={{ height: `${layout.height}px` }}
          onPointerMove={(e) => {
            const { x, y } = local(e);
            const d = dotAt(x, y);
            setTip(d ? { x, y, dot: d } : null);
          }}
          onPointerLeave={() => setTip(null)}
          onClick={(e) => {
            const { x, y } = local(e);
            const d = dotAt(x, y);
            if (d) pick(d.target, d.kind === "mis" ? d.tender : null);
          }}
        >
          <canvas ref={canvas} aria-hidden="true" style={{ width: `${w}px`, height: `${layout.height}px` }} />
          <ul className="ct-closer-rows" aria-label={t("closer.rowsLabel")}>
            {layout.rows.map((r) => {
              const x = targets.get(r.id);
              const s = statOf(stats, r.id);
              return (
                <li key={r.id} data-testid={`closer-row-${r.id}`} data-mis={s.mis.size} data-match={s.match.size} style={{ top: `${r.y}px` }}>
                  <button
                    type="button"
                    className="ct-closer-name"
                    data-lit={lit === r.id || target === r.id ? "" : undefined}
                    onClick={() => pick(r.id)}
                    onPointerEnter={() => setLit(r.id)}
                    onPointerLeave={() => setLit(null)}
                    title={x ? targetLine(x, 240) : r.id}
                  >
                    {x ? (
                      <>
                        {code(x.doc)} · {x.label}
                        {x.label.length < 24 && <span className="ct-closer-name-text"> {targetLine(x, 90).slice(x.label.length + 1)}</span>}
                      </>
                    ) : (
                      r.id
                    )}
                  </button>
                  <span className="ct-closer-count ct-closer-count-mis" style={{ right: `${w - layout.spine + 5 + r.misCols * layout.pitch + 6}px`, top: `${r.mid - r.y}px` }}>
                    {m.n(s.mis.size)}
                  </span>
                  <span className="ct-closer-count" style={{ left: `${layout.spine + 5 + r.matchCols * layout.pitch + 6}px`, top: `${r.mid - r.y}px` }}>
                    {m.n(s.match.size)}
                  </span>
                </li>
              );
            })}
          </ul>
          {tip && (
            <div className="ct-tip" style={{ left: `${Math.min(tip.x + 14, w - 260)}px`, top: `${tip.y + 14}px` }}>
              {tip.dot.kind === "mis" ? (
                (() => {
                  const d = misByTarget.get(tip.dot.target)?.find((q) => q.tender === tip.dot.tender);
                  return d ? (
                    <>
                      <span className="ct-tip-title">{d.lead.title}</span>
                      <span className="ct-tip-meta">{t("closer.tipMis", { count: d.lots.length, value: m.amount(d.value), year: d.lead.year })}</span>
                    </>
                  ) : null;
                })()
              ) : (
                <span className="ct-tip-meta">{t("closer.tipMatch", { count: statOf(stats, tip.dot.target).match.size })}</span>
              )}
            </div>
          )}
        </div>
        {gaps.length > 0 && (
          <div className="ct-closer-gaps" role="group" aria-label={t("closer.gaps")}>
            <h3 className="ct-closer-gaps-head">{t("closer.gaps")}</h3>
            {gaps.map((g) => (
              <div key={g.doc} className="ct-closer-gap">
                <p className="ct-closer-gap-doc">{t("closer.gapsDoc", { doc: code(g.doc), count: g.ids.length })}</p>
                <ul>
                  {g.ids.map((id) => {
                    const x = targets.get(id);
                    return (
                      <li key={id}>
                        <button type="button" className="ct-plain-link" data-lit={target === id ? "" : undefined} onClick={() => pick(id)}>
                          {x ? targetLine(x, 90) : id}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
      <aside className="ct-closer-side">
        <p className="brief-hub-kicker">{t("closer.kicker")}</p>
        {focusNote && <p className="ct-focus-note">{focusNote}</p>}
        <h2 className="brief-hub-headline">{headline}</h2>
        {second && <p className="brief-hub-second">{second}</p>}
        <p className="ct-tag">{t("closer.tag")}</p>
        {detail ?? (
          top.length > 0 && (
            <>
              <p className="ct-sub">{t("closer.topHead")}</p>
              <ul className="ct-tenders">
                {top.map((g) => {
                  const first = inScope.find((d) => d.tender === g.tenders[0]);
                  return (
                    <li key={g.title} className="ct-tender-line">
                      <button type="button" className="ct-tender-open" onClick={() => first && pick(first.targets[0], first.tender)}>
                        {g.title}
                      </button>
                      <span className="ct-list-meta">{t("closer.topLine", { tenders: g.tenders.length, contracts: g.contracts, year: g.year, targets: g.targets })}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )
        )}
      </aside>
    </section>
  );
}
