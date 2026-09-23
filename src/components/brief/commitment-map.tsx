"use client";

import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { apartStep, reinforceStep, type MapCell } from "@/lib/brief/compute";
import { cellOrigin, layoutMap } from "@/lib/brief/map-layout";
import type { BriefCommitment, BriefDocument } from "@/lib/brief/source";
import { INK } from "./ink";

/** Drawing width of the map in sheet pixels (178 mm of content width). */
export const MAP_WIDTH = 672;
const MAP_MAX_HEIGHT = 540;
const LABEL_FONT = 12;
/** Rough width of one character of the 12px sans, for wrapping names. */
const CHAR_WIDTH = 6.4;

export type MapMode = "apart" | "together";

export function stepOf(cell: MapCell, mode: MapMode): number {
  return mode === "apart"
    ? apartStep(cell.apart)
    : reinforceStep(cell.total > 0 ? cell.reinforce / cell.total : 0);
}

function fillOf(step: number, mode: MapMode): string {
  if (mode === "apart") return step === 0 ? INK.paper : INK.red[step - 1];
  return INK.green[step];
}

/** Up to two lines of a document name within a block's width. */
function wrapName(name: string, width: number): string[] {
  const max = Math.max(4, Math.floor(width / CHAR_WIDTH));
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word;
    if (lines.length === 2) break;
  }
  if (lines.length < 2 && line) lines.push(line);
  if (lines.length > 2) lines.length = 2;
  const used = lines.join(" ").length;
  if (used < name.length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = `${last.slice(0, Math.max(1, max - 1)).replace(/[\s,;:]+$/, "")}…`;
  }
  return lines;
}

type Role = "selected" | "apart" | "reinforce" | "dim" | undefined;

/**
 * Every commitment as one square inside its document's area, shaded by the
 * chosen measure (a single-hue ramp per mode, so no red-green pairing within
 * one view). The most involved commitments carry numbered badges; selecting
 * a square lights up its partners by tone and dims the rest. One tab stop;
 * the arrow keys move between squares, Enter selects, Escape clears.
 */
export function CommitmentMap({
  cells,
  docs,
  mode,
  callouts,
  selected,
  partners,
  onSelect,
}: {
  cells: MapCell[];
  docs: BriefDocument[];
  mode: MapMode;
  callouts: string[];
  selected: string | null;
  partners: { apart: BriefCommitment[]; reinforce: BriefCommitment[] } | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations("brief.map");
  const [focus, setFocus] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  // A mouse click focuses the map too; only keyboard focus shows the ring.
  const pointerFocus = useRef(false);

  const byDoc = useMemo(() => {
    const map = new Map<string, MapCell[]>();
    for (const c of cells) {
      const list = map.get(c.commitment.doc) ?? [];
      list.push(c);
      map.set(c.commitment.doc, list);
    }
    return map;
  }, [cells]);

  const layout = useMemo(
    () =>
      layoutMap(
        docs.map((d) => ({ id: d.id, count: byDoc.get(d.id)?.length ?? 0 })),
        MAP_WIDTH,
        MAP_MAX_HEIGHT,
        { labelHeight: 36 },
      ),
    [docs, byDoc],
  );

  // Cells in reading order with their positions; keyboard order follows it.
  const placed = useMemo(() => {
    const out: { cell: MapCell; x: number; y: number }[] = [];
    for (const block of layout.blocks) {
      (byDoc.get(block.doc) ?? []).forEach((cell, i) => {
        const { x, y } = cellOrigin(layout, block, i);
        out.push({ cell, x, y });
      });
    }
    return out;
  }, [layout, byDoc]);

  const roleOf = useMemo(() => {
    if (!selected || !partners) return (_id: string): Role => undefined;
    const apart = new Set(partners.apart.map((c) => c.id));
    const reinforce = new Set(partners.reinforce.map((c) => c.id));
    return (id: string): Role =>
      id === selected ? "selected" : apart.has(id) ? "apart" : reinforce.has(id) ? "reinforce" : "dim";
  }, [selected, partners]);

  const docName = (id: string) => docs.find((d) => d.id === id)?.name ?? id;
  const describe = (cell: MapCell) =>
    t("cell", {
      label: cell.commitment.label,
      doc: docName(cell.commitment.doc),
      apart: cell.apart,
      reinforce: cell.reinforce,
      total: cell.total,
    });

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (placed.length === 0) return;
    const current = focus ?? 0;
    let next = current;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = Math.min(placed.length - 1, current + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = Math.max(0, current - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = placed.length - 1;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect(placed[current].cell.commitment.id);
        return;
      case "Escape":
        onSelect(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setFocus(next);
  };

  const size = layout.cell;
  const shown = hover ?? focus;
  const tip = shown !== null ? placed[shown] : null;

  return (
    <div
      className="brief-map"
      role="application"
      tabIndex={0}
      aria-label={t("aria", { count: cells.length })}
      onPointerDown={() => {
        pointerFocus.current = true;
      }}
      onFocus={() => {
        if (!pointerFocus.current) setFocus((f) => f ?? 0);
        pointerFocus.current = false;
      }}
      onBlur={() => setFocus(null)}
      onKeyDown={onKeyDown}
    >
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${Math.max(1, layout.height)}`}
        width="100%"
        className="brief-map-svg"
        aria-hidden="true"
      >
        {layout.blocks.map((block) => (
          <text key={`label-${block.doc}`} x={block.x} y={block.y} className="brief-map-doc">
            {wrapName(docName(block.doc), block.width).map((line, i) => (
              <tspan key={i} x={block.x} dy={i === 0 ? LABEL_FONT : LABEL_FONT * 1.25}>
                {line}
              </tspan>
            ))}
          </text>
        ))}
        {placed.map(({ cell, x, y }, i) => {
          const step = stepOf(cell, mode);
          const role = roleOf(cell.commitment.id);
          const outline =
            role === "selected"
              ? { stroke: INK.text, strokeWidth: 2 }
              : role === "apart"
                ? { stroke: INK.apart, strokeWidth: 2, strokeDasharray: "2.5 1.5" }
                : role === "reinforce"
                  ? { stroke: INK.reinforce, strokeWidth: 2 }
                  : mode === "apart" && step === 0
                    ? { stroke: "#cfd3d8", strokeWidth: 1 }
                    : {};
          return (
            <rect
              key={cell.commitment.id}
              data-testid="brief-cell"
              data-id={cell.commitment.id}
              data-step={step}
              data-role={role}
              data-focused={focus === i ? "true" : undefined}
              x={x + 0.5}
              y={y + 0.5}
              width={size - 1}
              height={size - 1}
              rx={Math.min(2, size / 6)}
              fill={fillOf(step, mode)}
              opacity={role === "dim" ? 0.22 : 1}
              {...outline}
              className="brief-map-cell"
              onClick={() => onSelect(selected === cell.commitment.id ? null : cell.commitment.id)}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            />
          );
        })}
        {focus !== null && placed[focus] && (
          <rect
            x={placed[focus].x - 2}
            y={placed[focus].y - 2}
            width={size + 4}
            height={size + 4}
            fill="none"
            stroke="#0468b1"
            strokeWidth={2}
            rx={3}
            pointerEvents="none"
          />
        )}
        {callouts.map((id, rank) => {
          const at = placed.find((p) => p.cell.commitment.id === id);
          if (!at) return null;
          const cx = at.x + size;
          const cy = at.y;
          return (
            <g key={`callout-${id}`} pointerEvents="none">
              <circle cx={cx} cy={cy} r={9} fill={INK.text} stroke={INK.paper} strokeWidth={1.5} />
              <text x={cx} y={cy + 4} textAnchor="middle" className="brief-map-badge">
                {rank + 1}
              </text>
            </g>
          );
        })}
      </svg>
      {tip && (
        <div
          className="brief-map-tip"
          style={{
            left: `${((tip.x + size / 2) / MAP_WIDTH) * 100}%`,
            top: `${(tip.y / Math.max(1, layout.height)) * 100}%`,
          }}
          role="presentation"
        >
          {describe(tip.cell)}
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {focus !== null && placed[focus] ? describe(placed[focus].cell) : ""}
      </p>
    </div>
  );
}
