"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { dotCounts, fieldLayout, niceUnit, type FieldLayout } from "@/lib/footprint/field";
import { regionsOf, type UseGroup } from "@/lib/footprint/uses";
import { useAmounts } from "./amounts";
import { usePurposeName } from "./names";
import { resourceOf, type Resource } from "./resources";

/** Dots stacked in a column, and columns in the largest use's row. */
const LINES = 4;
const COLUMNS = 100;
/** Runs the open list shows before "Show all". */
const RUNS_SHOWN = 12;
/** The dots in UNDP Blue; while a use is in focus the others pale. */
const DOT = "#0468b1";
const DOT_PALE = "#c6d9ec";

/** Small deterministic PRNG, so the dots gather the same way every time. */
function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function paint(
  canvas: HTMLCanvasElement,
  layout: FieldLayout,
  w: number,
  h: number,
  progress: number,
  from: Float32Array | null,
  focusRow: number | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = Math.max(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const e = 1 - Math.pow(1 - progress, 3);
  const r = layout.radius;
  // The use in focus in UNDP Blue, the others pale; all blue when none is.
  for (const inFocus of [false, true]) {
    if (inFocus && focusRow === null) break;
    ctx.fillStyle = focusRow === null || inFocus ? DOT : DOT_PALE;
    ctx.beginPath();
    for (let i = 0; i < layout.xs.length; i++) {
      if (focusRow !== null && (layout.row[i] === focusRow) !== inFocus) continue;
      let x = layout.xs[i];
      let y = layout.ys[i];
      if (from && e < 1) {
        x = from[2 * i] + (x - from[2 * i]) * e;
        y = from[2 * i + 1] + (y - from[2 * i + 1]) * e;
      }
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

/**
 * Every use as a row of dots, each dot the same round amount of the chosen
 * resource, so the rows compare by length. The dots gather into their rows
 * when the field comes into view and again when the resource changes.
 * Pointing at a row brings it forward (and marks its steps on the running
 * total); choosing it keeps it forward and lists its runs under the field.
 */
export function UseField({
  uses,
  resource,
  pointed,
  chosen,
  onPoint,
  onChoose,
}: {
  uses: UseGroup[];
  resource: Resource;
  pointed: string | null;
  chosen: string | null;
  onPoint: (key: string | null) => void;
  onChoose: (key: string | null) => void;
}) {
  const t = useTranslations("sustainability");
  const { text, day } = useAmounts();
  const nameOf = usePurposeName();
  const box = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Zero until measured: nothing is painted before the field has a size.
  const [measured, setMeasured] = useState(0);
  const [complete, setComplete] = useState(false);
  const settledFor = useRef<Resource | null>(null);
  const focusRef = useRef<number | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setMeasured(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(
    () => [...uses].sort((a, b) => b[resource] - a[resource] || a.key.localeCompare(b.key)),
    [uses, resource],
  );
  const max = rows[0]?.[resource] ?? 0;
  const unit = niceUnit(max, LINES * COLUMNS);
  const counts = useMemo(() => dotCounts(rows.map((u) => u[resource]), unit), [rows, resource, unit]);

  const width = measured || 800;
  const narrow = width < 640;
  const rowHeight = narrow ? 64 : 56;
  const labelWidth = narrow ? 0 : Math.min(272, width * 0.32);
  const valueWidth = narrow ? 0 : 96;
  const x0 = narrow ? 0 : labelWidth + 24;
  const dotsWidth = narrow ? width : width - x0 - valueWidth - 24;
  const pitch = dotsWidth / COLUMNS;
  const blockTop = narrow ? 32 : (rowHeight - LINES * pitch) / 2;
  const height = rows.length * rowHeight;
  const layout = useMemo(
    () =>
      fieldLayout(counts, {
        x0,
        width: dotsWidth,
        rowHeight,
        blockTop,
        lines: LINES,
        columns: COLUMNS,
      }),
    [counts, x0, dotsWidth, rowHeight, blockTop],
  );

  const focusKey = pointed ?? chosen;
  const focusIndex = focusKey === null ? -1 : rows.findIndex((u) => u.key === focusKey);
  const focusRow = focusIndex >= 0 ? focusIndex : null;

  // Gather the dots on first view and whenever the resource changes; a
  // resize repaints them settled.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || measured === 0) return;
    const finish = () => {
      paint(canvas, layout, width, height, 1, null, focusRef.current);
      settledFor.current = resource;
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (settledFor.current === resource || reduce || typeof IntersectionObserver === "undefined") {
      finish();
      return;
    }
    const rand = seeded(layout.xs.length * 7919 + resource.length);
    const from = new Float32Array(layout.xs.length * 2);
    for (let i = 0; i < layout.xs.length; i++) {
      from[2 * i] = rand() * width;
      from[2 * i + 1] = rand() * height;
    }
    paint(canvas, layout, width, height, 0, from, null);
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / 1300);
      paint(canvas, layout, width, height, p, from, p < 1 ? null : focusRef.current);
      if (p < 1) frame = requestAnimationFrame(step);
      else settledFor.current = resource;
    };
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          frame = requestAnimationFrame(step);
        }
      },
      { threshold: 0.25 },
    );
    io.observe(canvas);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [layout, width, height, measured, resource]);

  // Focus repaints a settled field; it never restarts the gathering.
  useEffect(() => {
    focusRef.current = focusRow;
    const canvas = canvasRef.current;
    if (!canvas || measured === 0 || settledFor.current !== resource) return;
    paint(canvas, layout, width, height, 1, null, focusRow);
  }, [focusRow, layout, width, height, measured, resource]);

  const { suffix, label } = resourceOf(resource);
  const withSuffix = (amount: string) => (suffix ? `${amount} ${suffix}` : amount);
  const chosenUse = rows.find((u) => u.key === chosen) ?? null;
  const severalRegions = chosenUse ? regionsOf(chosenUse.entries).length > 1 : false;
  const runs = chosenUse
    ? complete
      ? chosenUse.entries
      : chosenUse.entries.slice(0, RUNS_SHOWN)
    : [];

  return (
    <section className="mt-14" aria-labelledby="fp-uses-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="fp-uses-title" className="font-semibold text-[var(--undp-black)]">
          {t("byUse", { resource: t(`figures.${label}`) })}
        </h2>
        <p className="flex items-center gap-2 text-data text-[var(--undp-gray)]">
          <span
            aria-hidden="true"
            className="inline-block rounded-full bg-[var(--undp-blue)]"
            style={{ width: 2 * layout.radius, height: 2 * layout.radius }}
          />
          {t("perDot", { amount: withSuffix(text(unit, resource)) })}
        </p>
      </div>
      <div
        ref={box}
        className="relative mt-3 border-t border-[var(--color-line-strong)]"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
        <ol className="absolute inset-0">
          {rows.map((use, i) => {
            const isChosen = chosen === use.key;
            const meta = [
              use.kind === "chat"
                ? t("meta.answers", { count: use.entries.length })
                : t("meta.runs", { count: use.entries.length }),
              ...(use.models.length > 1 ? [t("meta.models", { count: use.models.length })] : []),
            ].join(" · ");
            return (
              <li
                key={use.key}
                data-testid="fp-row"
                data-dots={counts[i]}
                className="absolute inset-x-0 border-b border-[var(--color-line)]"
                style={{ top: i * rowHeight, height: rowHeight }}
              >
                <button
                  type="button"
                  aria-pressed={isChosen}
                  onClick={() => {
                    onChoose(isChosen ? null : use.key);
                    setComplete(false);
                  }}
                  onPointerEnter={() => onPoint(use.key)}
                  onPointerLeave={() => onPoint(null)}
                  onFocus={() => onPoint(use.key)}
                  onBlur={() => onPoint(null)}
                  className={`group flex h-full w-full text-left ${
                    narrow ? "flex-col justify-start pt-1.5" : "items-center"
                  }`}
                >
                  <span
                    className={`flex min-w-0 ${narrow ? "w-full items-baseline justify-between gap-3" : "flex-col"}`}
                    style={narrow ? undefined : { width: labelWidth }}
                  >
                    <span
                      className={`fp-row-name truncate font-semibold underline-offset-4 ${
                        isChosen
                          ? "text-[var(--undp-blue)] underline decoration-2"
                          : "text-[var(--undp-black)] decoration-[rgba(35,46,61,0.35)] group-hover:underline"
                      }`}
                    >
                      {nameOf(use)}
                    </span>
                    <span className="fp-row-meta truncate text-data text-[var(--undp-gray)]">{meta}</span>
                  </span>
                  {!narrow && <span className="flex-1" aria-hidden="true" />}
                  <span
                    className={`fp-row-value whitespace-nowrap font-semibold tabular-nums text-[var(--undp-black)] ${
                      narrow ? "absolute right-0 top-1.5" : "text-right"
                    }`}
                    style={narrow ? undefined : { width: valueWidth }}
                  >
                    {text(use[resource], resource)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {chosenUse && (
        <div data-testid="fp-runs" className="mt-5 border-t-2 border-[var(--undp-blue)] pt-3">
          <div className="flex items-baseline justify-between gap-4">
            <p className="fp-runs-title font-semibold text-[var(--undp-black)]">{nameOf(chosenUse)}</p>
            <button
              type="button"
              onClick={() => onChoose(null)}
              className="text-data text-[var(--undp-black)] underline decoration-[rgba(35,46,61,0.35)] underline-offset-4 hover:text-[var(--undp-blue)]"
            >
              {t("close")}
            </button>
          </div>
          <p className="fp-row-resources mt-1 text-data text-[var(--undp-black)]">
            {t("resources", {
              carbon: text(chosenUse.co2_geq, "co2_geq"),
              energy: text(chosenUse.energy_wh, "energy_wh"),
              water: text(chosenUse.water_ml, "water_ml"),
              minerals: text(chosenUse.minerals_ugsbeq, "minerals_ugsbeq"),
            })}
          </p>
          <ol className="mt-2 text-data sm:grid sm:grid-cols-[max-content_minmax(0,1fr)_max-content_5.5rem] sm:gap-x-4">
            {runs.map((e, i) => {
              const what = [e.model, severalRegions ? e.region : null].filter(Boolean).join(" · ");
              return (
                <li
                  key={`${e.ts}-${i}`}
                  data-testid="fp-entry"
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-[var(--color-line)] py-1.5 sm:col-span-full sm:grid-cols-subgrid sm:items-baseline"
                >
                  <span className="fp-entry-date whitespace-nowrap text-[var(--undp-gray)]">{day(e.ts)}</span>
                  <span className="col-span-2 row-start-2 truncate sm:col-span-1 sm:row-start-auto" title={what}>
                    {what}
                  </span>
                  <span className="col-span-2 row-start-3 whitespace-nowrap tabular-nums text-[var(--undp-gray)] sm:col-span-1 sm:row-start-auto">
                    {e.cached_call_count > 0
                      ? t("entry.requestsReused", { count: e.call_count, reused: e.cached_call_count })
                      : t("entry.requests", { count: e.call_count })}
                  </span>
                  <span className="col-start-2 row-start-1 whitespace-nowrap text-right tabular-nums sm:col-start-auto sm:row-start-auto">
                    {text(e[resource], resource)}
                  </span>
                </li>
              );
            })}
          </ol>
          {!complete && chosenUse.entries.length > RUNS_SHOWN && (
            <button
              type="button"
              onClick={() => setComplete(true)}
              className="mt-2 text-data text-[var(--undp-black)] underline decoration-[rgba(35,46,61,0.35)] underline-offset-4 hover:text-[var(--undp-blue)]"
            >
              {t("showAll", { count: chosenUse.entries.length })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
