"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  eventFigures,
  orderedEvents,
  type FootprintEvent,
  type Localized,
} from "@/lib/footprint/events";
import {
  bursts,
  labelledBursts,
  placeLabels,
  runningTotal,
  type TotalStep,
} from "@/lib/footprint/timeline";
import type { LedgerEvent } from "@/lib/footprint/types";
import { purposeOf, recordedSpan, type UseKind } from "@/lib/footprint/uses";
import { useAmounts } from "./amounts";
import { usePurposeName } from "./names";
import { resourceOf, type Resource } from "./resources";

const DAY_MS = 86_400_000;
/** The chart in px: its height, the room above the line for event markers
 *  and step names, below it for the months, and to its right for the total. */
const HEIGHT = 260;
const TOP = 48;
const BOTTOM = 26;
const RIGHT = 76;
/** A step name's line height, and about how wide a character sets at 12px. */
const LABEL_HEIGHT = 12;
const CHAR_WIDTH = 6.4;
/** An event marker's radius, and how far above the top of its step it sits. */
const MARKER_R = 9;
const MARKER_LIFT = 18;
/** Runs the pointer's note lists for one day. */
const NOTE_RUNS = 4;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const INK = "#232e3d";
const HAIRLINE = "#d1d5db";
/** The line, its shade and what is marked or chosen in UNDP Blue; while
 *  something is marked the rest of the line pales. */
const BLUE = "#0468b1";
const BLUE_PALE = "#b9cfe6";
const AREA = "#e8f0f8";

const dayStart = (ts: string) => Date.parse(`${ts.slice(0, 10)}T00:00:00Z`);

type Use = { kind: UseKind; country: string | null };
const sameUse = (a: Use, b: Use) => a.kind === b.kind && a.country === b.country;

/**
 * The running total of the chosen resource, stepping up with every run. The
 * line draws itself when the chart comes into view and again when the
 * resource changes; numbered events say what the footprint was for where it
 * grew, and the list under the chart tells each one with its figures. Pointing
 * at an event (on the line or in the list) marks its steps; a use in focus
 * (pointed at or chosen in the field above) marks and names its own steps; a
 * day's runs show under the pointer.
 */
export function RunningTotal({
  events,
  resource,
  focus,
  curated,
}: {
  events: LedgerEvent[];
  resource: Resource;
  focus: Use | null;
  /** The curated events; those without a row in this ledger are left out. */
  curated: FootprintEvent[];
}) {
  const t = useTranslations("sustainability");
  const locale = useLocale();
  const { text, day, monthShort, date } = useAmounts();
  const nameOf = usePurposeName();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [hovered, setHovered] = useState<number | null>(null);
  // The event pointed at, and whether on the line (which opens its card) or
  // in the list (which already tells it).
  const [activeEvent, setActiveEvent] = useState<{ n: number; on: "line" | "list" } | null>(null);
  // False until the chart is in view; a change of resource draws it again.
  const [drawn, setDrawn] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = box.current;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (
      !el ||
      reduce ||
      typeof IntersectionObserver === "undefined" ||
      typeof requestAnimationFrame === "undefined"
    ) {
      setDrawn(true);
      return;
    }
    if (seen.current) {
      // Redraw for the new resource: hide the line for a frame, then draw.
      setDrawn(false);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setDrawn(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          seen.current = true;
          setDrawn(true);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [resource]);

  const steps = useMemo(() => runningTotal(events, resource), [events, resource]);
  const span = useMemo(() => recordedSpan(events), [events]);
  const numbered = useMemo(() => orderedEvents(curated, events), [curated, events]);
  const total = steps.at(-1)?.total ?? 0;
  if (steps.length === 0 || total <= 0 || !span) return null;

  const words = (w: Localized) => w[locale as keyof Localized] ?? w.en;
  const { label } = resourceOf(resource);
  const resourceName = t(`figures.${label}`);
  const t0 = dayStart(steps[0].ts);
  const t1 = dayStart(steps[steps.length - 1].ts) + DAY_MS;
  const plotW = Math.max(160, width - RIGHT);
  const x = (ms: number) => ((ms - t0) / (t1 - t0)) * plotW;
  const y = (v: number) => TOP + (1 - v / total) * (HEIGHT - TOP - BOTTOM);
  const at = (s: TotalStep) => x(Date.parse(s.ts));
  const base = y(0);

  let line = `M0,${base}`;
  for (const s of steps) line += `H${at(s).toFixed(1)}V${y(s.total).toFixed(1)}`;
  line += `H${plotW}`;
  const area = `${line}V${base}H0Z`;

  // The line only rises, so its highest point between two x is at the right one.
  const totalAt = (px: number) => {
    let v = 0;
    for (const s of steps) {
      if (at(s) > px) break;
      v = s.total;
    }
    return v;
  };

  // What is marked: the event pointed at, else the use in focus.
  const active = activeEvent ? (numbered.find((e) => e.n === activeEvent.n) ?? null) : null;
  const activeRows = active ? new Set(active.rows) : null;
  const marked = (s: TotalStep) =>
    activeRows ? activeRows.has(s.entry) : focus ? sameUse(purposeOf(s.entry), focus) : false;
  const markedSteps = activeRows || focus ? steps.filter((s) => s.delta > 0 && marked(s)) : [];

  // At rest the events tell the steps; a use in focus names its own largest.
  const own = focus && !active ? bursts(steps).filter((b) => sameUse(b, focus)) : [];
  const named = labelledBursts(own, own.reduce((sum, b) => sum + b.delta, 0)).map((burst) => ({
    burst,
    label: t("timeline.step", { name: nameOf(burst), amount: text(burst.delta, resource) }),
  }));
  const placed = placeLabels(
    named.map(({ burst, label: name }) => ({
      x: x(Date.parse(burst.to)),
      y: y(burst.total),
      width: name.length * CHAR_WIDTH,
    })),
    LABEL_HEIGHT,
    (_x0, x1) => y(totalAt(x1)),
  );

  // A marker sits above the top of its event's last step; one that would
  // cover an earlier marker moves up until it is clear.
  const markers = numbered.map((e) => {
    const lastRow = e.rows.reduce((a, b) => (a.ts > b.ts ? a : b));
    const step = steps.find((s) => s.entry === lastRow) ?? steps[steps.length - 1];
    return { n: e.n, x: at(step), stepTop: y(step.total), cy: y(step.total) - MARKER_LIFT };
  });
  const gap = 2 * MARKER_R + 2;
  for (let i = 0; i < markers.length; i++) {
    for (let moved = true; moved; ) {
      moved = false;
      for (let j = 0; j < i; j++) {
        const [m, p] = [markers[i], markers[j]];
        if (Math.abs(p.x - m.x) < gap && Math.abs(p.cy - m.cy) < gap) {
          m.cy = p.cy - gap;
          moved = true;
        }
      }
    }
  }

  const ticks: { x: number; label: string }[] = [];
  const firstDay = new Date(t0);
  for (
    let m = Date.UTC(firstDay.getUTCFullYear(), firstDay.getUTCMonth(), 1);
    m < t1;
    m = Date.UTC(new Date(m).getUTCFullYear(), new Date(m).getUTCMonth() + 1, 1)
  ) {
    const px = x(Math.max(m, t0));
    if (ticks.length === 0 || px - ticks[ticks.length - 1].x >= 40) {
      ticks.push({ x: px, label: monthShort(m) });
    }
  }

  // The pointer reads by day: everything recorded on the day nearest to it.
  const days: { key: string; x: number; runs: TotalStep[]; total: number }[] = [];
  for (const s of steps) {
    const key = s.ts.slice(0, 10);
    const last = days.at(-1);
    if (last && last.key === key) {
      last.runs.push(s);
      last.x = at(s);
      last.total = s.total;
    } else {
      days.push({ key, x: at(s), runs: [s], total: s.total });
    }
  }
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let nearest = 0;
    days.forEach((d, i) => {
      if (Math.abs(d.x - px) < Math.abs(days[nearest].x - px)) nearest = i;
    });
    setHovered(nearest);
  };
  const note = hovered === null ? null : (days[hovered] ?? null);
  const fade = (delay: number) => ({
    opacity: drawn ? 1 : 0,
    transition: drawn ? `opacity 500ms ease ${delay}ms` : "none",
  });

  const dates = (first: string, last: string) => {
    const [a, b] = [first.slice(0, 10), last.slice(0, 10)];
    return a === b ? date(b) : t("span", { from: date(a, a.slice(0, 4) !== b.slice(0, 4)), to: date(b) });
  };
  const card = activeEvent?.on === "line" && active ? active : null;
  const cardMarker = card ? markers.find((m) => m.n === card.n) : null;
  const cardFigures = card ? eventFigures(card.rows, resource) : null;

  return (
    <section className="mt-14" aria-labelledby="fp-total-title">
      <h2 id="fp-total-title" className="font-semibold text-[var(--undp-black)]">
        {t("overTime", { resource: resourceName })}
      </h2>
      <div ref={box} className="relative mt-4">
        <svg
          role="img"
          aria-label={t("timeline.label", {
            resource: resourceName.toLocaleLowerCase(),
            from: date(span.from),
            to: date(span.to),
            total: text(total, resource),
          })}
          width={width}
          height={HEIGHT}
          className="block max-w-full overflow-visible"
        >
          <path d={area} fill={AREA} style={fade(400)} />
          <line x1={0} x2={plotW} y1={base} y2={base} stroke={HAIRLINE} />
          {ticks.map((tick) => (
            <g key={tick.x}>
              <line x1={tick.x} x2={tick.x} y1={base} y2={base + 5} stroke={HAIRLINE} />
              <text x={tick.x + 3} y={base + 18} className="fill-[var(--undp-gray)] text-[12px]">
                {tick.label}
              </text>
            </g>
          ))}
          <path
            d={line}
            pathLength={1}
            fill="none"
            stroke={markedSteps.length ? BLUE_PALE : BLUE}
            strokeWidth={1.75}
            strokeLinejoin="round"
            style={{
              strokeDasharray: 1,
              strokeDashoffset: drawn ? 0 : 1,
              transition: drawn ? `stroke-dashoffset 1400ms ${EASE}, stroke 200ms ease` : "none",
            }}
          />
          {markedSteps.map((s) => (
            <line
              key={s.ts}
              className="fp-focus-step"
              x1={at(s)}
              x2={at(s)}
              y1={y(s.total - s.delta)}
              y2={y(s.total)}
              stroke={BLUE}
              strokeWidth={3.5}
              strokeLinecap="round"
            />
          ))}
          <g style={fade(900)}>
            {named.map(({ burst, label: name }, i) => {
              const p = placed[i];
              return p ? (
                <text
                  key={burst.from}
                  x={p.x}
                  y={p.y}
                  textAnchor={p.anchor}
                  className="fp-step-label fill-[var(--undp-black)] text-[12px]"
                >
                  {name}
                </text>
              ) : null;
            })}
            <text
              x={plotW + 8}
              y={y(total) + 4}
              className="fp-total-label fill-[var(--undp-black)] text-[13px] font-semibold"
            >
              {text(total, resource)}
            </text>
          </g>
          {note && (
            <line x1={note.x} x2={note.x} y1={TOP - 10} y2={base} stroke={INK} strokeDasharray="2 3" />
          )}
          <rect
            x={0}
            y={0}
            width={plotW}
            height={HEIGHT}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHovered(null)}
          />
          <g style={fade(1100)}>
            {markers.map((m) => {
              const on = activeEvent?.n === m.n;
              return (
                <g
                  key={m.n}
                  className="fp-event-marker"
                  data-active={on ? "true" : undefined}
                  onPointerEnter={() => {
                    setHovered(null);
                    setActiveEvent({ n: m.n, on: "line" });
                  }}
                  onPointerLeave={() => setActiveEvent(null)}
                >
                  <line x1={m.x} x2={m.x} y1={m.cy + MARKER_R} y2={m.stepTop} stroke={on ? BLUE : INK} strokeWidth={1} />
                  <circle
                    cx={m.x}
                    cy={m.cy}
                    r={MARKER_R}
                    fill={on ? BLUE : "#fff"}
                    stroke={on ? BLUE : INK}
                    strokeWidth={1.25}
                  />
                  <text
                    x={m.x}
                    y={m.cy + 3.6}
                    textAnchor="middle"
                    className={`text-[10.5px] font-semibold ${on ? "fill-white" : "fill-[var(--undp-black)]"}`}
                  >
                    {m.n}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {note && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 z-10 w-max max-w-[20rem] -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-data shadow-[var(--shadow-pop)]"
            style={{ left: Math.min(Math.max(note.x, 160), width - 160) }}
          >
            <p className="font-semibold text-[var(--undp-black)]">{day(note.runs[0].ts)}</p>
            {note.runs.slice(0, NOTE_RUNS).map((s, i) => (
              <p key={i} className="flex justify-between gap-4 text-[var(--undp-black)]">
                <span className="truncate">
                  {nameOf(purposeOf(s.entry))} · {s.entry.model}
                </span>
                <span className="tabular-nums">{text(s.delta, resource)}</span>
              </p>
            ))}
            {note.runs.length > NOTE_RUNS && (
              <p className="text-[var(--undp-gray)]">
                {t("timeline.more", { count: note.runs.length - NOTE_RUNS })}
              </p>
            )}
            <p className="mt-1 text-[var(--undp-gray)]">
              {t("timeline.then", { amount: text(note.total, resource) })}
            </p>
          </div>
        )}
        {card && cardMarker && cardFigures && (
          <div
            data-testid="fp-event-card"
            aria-hidden="true"
            className="pointer-events-none absolute z-10 w-max max-w-[22rem] -translate-x-1/2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-data shadow-[var(--shadow-pop)]"
            style={{
              left: Math.min(Math.max(cardMarker.x, 176), width - 176),
              top: cardMarker.cy + MARKER_R + 8,
            }}
          >
            <p className="font-semibold text-[var(--undp-black)]">
              {card.n}. {words(card.event.title)}
            </p>
            <p className="text-[var(--undp-gray)]">{dates(cardFigures.first, cardFigures.last)}</p>
            <p className="mt-1 whitespace-normal text-[var(--undp-black)]">{words(card.event.detail)}</p>
            <p className="mt-1 tabular-nums text-[var(--undp-black)]">
              {t("entry.requests", { count: cardFigures.requests })} · {text(cardFigures.amount, resource)}
            </p>
          </div>
        )}
      </div>

      {numbered.length > 0 && (
        <>
          <h3 className="mt-8 font-semibold text-[var(--undp-black)]">{t("events")}</h3>
          <ol className="mt-2 border-t border-[var(--color-line)]">
            {numbered.map((e) => {
              const f = eventFigures(e.rows, resource);
              const on = activeEvent?.n === e.n;
              return (
                <li
                  key={e.event.id}
                  data-testid="fp-event"
                  data-active={on ? "true" : undefined}
                  onPointerEnter={() => setActiveEvent({ n: e.n, on: "list" })}
                  onPointerLeave={() => setActiveEvent(null)}
                  className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-[var(--color-line)] py-2.5 transition-colors sm:grid-cols-[1.75rem_10rem_minmax(0,1fr)_auto] sm:items-baseline ${
                    on ? "bg-[var(--undp-light)]" : ""
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`row-span-3 flex h-[18px] w-[18px] items-center justify-center self-start rounded-full border-[1.25px] text-[10.5px] font-semibold sm:row-span-1 sm:self-baseline ${
                      on
                        ? "border-[var(--undp-blue)] bg-[var(--undp-blue)] text-white"
                        : "border-[var(--undp-black)] text-[var(--undp-black)]"
                    }`}
                  >
                    {e.n}
                  </span>
                  <span className="fp-event-date text-data text-[var(--undp-gray)]">{dates(f.first, f.last)}</span>
                  <span className="min-w-0">
                    <span className="fp-event-title font-semibold text-[var(--undp-black)]">
                      {words(e.event.title)}
                    </span>
                    <span className="fp-event-detail block text-data text-[var(--undp-black)]">
                      {words(e.event.detail)}
                    </span>
                  </span>
                  <span className="fp-event-figures whitespace-nowrap text-data tabular-nums text-[var(--undp-gray)] sm:text-right">
                    {t("entry.requests", { count: f.requests })} · {text(f.amount, resource)}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
