"use client";

/**
 * CoherenceCanvas — the desk of documents and its inflamed pathways.
 *
 * Layer 1: the corpus's policy documents drawn as literal pages on a shallow
 * arc, joined by quiet green tissue whose opacity encodes each pair's aligned
 * share. Layer 2, on a deliberately separate scale: red, organic fibers for
 * the document pairs whose share of potential misalignment sits at or above
 * this corpus's own average — so a healthy corpus still shows where its own
 * friction concentrates instead of a uniformly green picture.
 *
 * The dive is staged: overview → one pathway (its ranked strands fanning
 * between the two pages) → one strand (the two verbatim commitments, the
 * mechanism sentence, the AI rationale behind a disclosure). No wall of
 * detail at any step.
 *
 * All strings and strand content arrive pre-translated via props; this
 * component owns geometry, staging, and motion only. Deterministic geometry
 * (hash-seeded jitter, no randomness) keeps SSR and client renders identical.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/navigation";
import { arcPositions, fiberPath, nerveWidth, type Pt } from "@/lib/pulse/geometry";
import type { CoherenceCanvasProps, PulseEdgeView } from "./types";

const VIEW_W = 1100;
const VIEW_H = 620;
const PAGE_W = 76;
const PAGE_H = 96;

type Stage =
  | { kind: "overview" }
  | { kind: "pathway"; edgeKey: string; strandKey?: string };

function nerveColor(rel: number): string {
  if (rel >= 2.2) return "#ee402d";
  if (rel >= 1.5) return "#ea580c";
  return "#d97706";
}

export function CoherenceCanvas({ docs, edges, countryId, strings }: CoherenceCanvasProps) {
  const [stage, setStage] = useState<Stage>({ kind: "overview" });
  const [hovered, setHovered] = useState<string | null>(null);
  const [rationaleOpen, setRationaleOpen] = useState(false);

  const positions = useMemo(() => {
    const pts = arcPositions(docs.length, VIEW_W, VIEW_H * 0.78);
    const byId = new Map<string, Pt>();
    docs.forEach((d, i) => byId.set(d.id, pts[i]));
    return byId;
  }, [docs]);

  const activeEdge: PulseEdgeView | null =
    stage.kind === "pathway"
      ? (edges.find((e) => e.key === stage.edgeKey) ?? null)
      : null;
  const activeStrand =
    stage.kind === "pathway" && stage.strandKey && activeEdge
      ? (activeEdge.strands.find((s) => s.pairKey === stage.strandKey) ?? null)
      : null;

  const goBack = useCallback(() => {
    setRationaleOpen(false);
    setStage((s) =>
      s.kind === "pathway" && s.strandKey
        ? { kind: "pathway", edgeKey: s.edgeKey }
        : { kind: "overview" },
    );
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack]);

  // Where each page sits in the current stage.
  const pagePlacement = (docId: string): { p: Pt; scale: number; dim: boolean } => {
    const home = positions.get(docId) ?? { x: VIEW_W / 2, y: VIEW_H / 2 };
    if (!activeEdge) return { p: home, scale: 1, dim: false };
    if (docId === activeEdge.a) return { p: { x: 150, y: 200 }, scale: 1.12, dim: false };
    if (docId === activeEdge.b) return { p: { x: 950, y: 200 }, scale: 1.12, dim: false };
    return { p: home, scale: 0.8, dim: true };
  };

  const anchor = (docId: string): Pt => {
    const { p } = pagePlacement(docId);
    return { x: p.x, y: p.y + PAGE_H / 2 + 4 };
  };

  const maxRel = useMemo(
    () => Math.max(0, ...edges.filter((e) => e.inflamed).map((e) => e.rel)),
    [edges],
  );

  const hoveredEdge = hovered ? (edges.find((e) => e.key === hovered) ?? null) : null;
  const docLabel = (id: string) => docs.find((d) => d.id === id)?.label ?? id;

  // Strand endpoints fan vertically between the two focused pages.
  const strandEndpoints = (i: number, n: number): { a: Pt; b: Pt } => {
    const spread = Math.min(36, 150 / Math.max(1, n - 1));
    const off = (i - (n - 1) / 2) * spread;
    return {
      a: { x: 150 + PAGE_W / 2 + 6, y: 200 + off },
      b: { x: 950 - PAGE_W / 2 - 6, y: 200 + off },
    };
  };

  return (
    <div className="relative w-full select-none">
      <style>{`
        .pulse-fiber { animation: pulseFiber 3.2s ease-in-out infinite; }
        @keyframes pulseFiber { 0%,100% { stroke-opacity: 0.65; } 50% { stroke-opacity: 1; } }
        .pulse-move { transition: transform 560ms cubic-bezier(.22,.61,.36,1), opacity 420ms ease-out; }
        .pulse-fade { transition: opacity 420ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .pulse-fiber { animation: none; }
          .pulse-move, .pulse-fade { transition: none; }
        }
      `}</style>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto block"
        role="img"
      >
        <defs>
          <filter id="pulse-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Layer 1: tissue */}
        <g className="pulse-fade" style={{ opacity: activeEdge ? 0 : 1 }}>
          {edges.map((e) => {
            const a = anchor(e.a);
            const b = anchor(e.b);
            const sag = 70 + Math.abs(b.x - a.x) * 0.2;
            const mid = { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + sag };
            return (
              <path
                key={`tissue-${e.key}`}
                d={`M ${a.x} ${a.y} Q ${mid.x} ${mid.y} ${b.x} ${b.y}`}
                fill="none"
                stroke="#196127"
                strokeWidth={1.3}
                strokeLinecap="round"
                opacity={0.05 + e.alignedShare * 0.15}
              />
            );
          })}
        </g>

        {/* Layer 2: inflamed fibers */}
        {edges
          .filter((e) => e.inflamed)
          .map((e) => {
            const a = anchor(e.a);
            const b = anchor(e.b);
            const sag = 88 + Math.abs(b.x - a.x) * 0.22;
            const d = fiberPath(e.key, a, b, e.rel, sag);
            const color = nerveColor(e.rel);
            const w = nerveWidth(e.rel);
            const isHover = hovered === e.key;
            const inPathway = activeEdge?.key === e.key;
            const dimmed = activeEdge ? 0.03 : 1;
            return (
              <g
                key={`nerve-${e.key}`}
                className="pulse-fade"
                style={{ opacity: inPathway ? 0 : dimmed }}
              >
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={w * 3}
                  opacity={isHover ? 0.3 : 0.16}
                  filter="url(#pulse-glow)"
                />
                <path
                  data-testid="pulse-nerve"
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHover ? w + 1 : w}
                  strokeDasharray="7 4"
                  strokeLinecap="round"
                  className={!activeEdge && e.rel === maxRel ? "pulse-fiber" : undefined}
                  opacity={isHover ? 1 : 0.85}
                />
                <path
                  data-testid={`pulse-nerve-hit-${e.key}`}
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  style={{ cursor: "pointer", pointerEvents: "stroke" }}
                  role="button"
                  tabIndex={activeEdge ? -1 : 0}
                  aria-label={`${docLabel(e.a)} ↔ ${docLabel(e.b)} · ${e.pathwayLine}`}
                  onMouseEnter={() => setHovered(e.key)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => {
                    setRationaleOpen(false);
                    setStage({ kind: "pathway", edgeKey: e.key });
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setStage({ kind: "pathway", edgeKey: e.key });
                    }
                  }}
                />
              </g>
            );
          })}

        {/* Pathway strands */}
        {activeEdge && (
          <g className="pulse-fade">
            {activeEdge.strands.map((s, i) => {
              const { a, b } = strandEndpoints(i, activeEdge.strands.length);
              const selected = activeStrand?.pairKey === s.pairKey;
              const anySelected = activeStrand !== null;
              const color = nerveColor(activeEdge.rel);
              return (
                <path
                  key={`strand-${s.pairKey}`}
                  d={fiberPath(s.pairKey, a, b, 1.2, 10)}
                  fill="none"
                  stroke={color}
                  strokeWidth={selected ? 3.5 : 2.2}
                  strokeDasharray={selected ? undefined : "6 4"}
                  strokeLinecap="round"
                  opacity={anySelected && !selected ? 0.18 : selected ? 0.95 : 0.6}
                />
              );
            })}
          </g>
        )}

        {/* The desk: documents as pages */}
        {docs.map((doc) => {
          const { p, scale, dim } = pagePlacement(doc.id);
          const x = -PAGE_W / 2;
          const y = -PAGE_H / 2;
          return (
            <g
              key={doc.id}
              data-testid="pulse-doc"
              className="pulse-move"
              style={{
                transform: `translate(${p.x}px, ${p.y}px) scale(${scale})`,
                opacity: dim ? 0.05 : 1,
              }}
            >
              <rect
                x={x}
                y={y}
                width={PAGE_W}
                height={PAGE_H}
                rx={5}
                fill="#ffffff"
                stroke="#d1d5db"
                strokeWidth={1}
              />
              {/* folded corner */}
              <path
                d={`M ${x + PAGE_W - 15} ${y} L ${x + PAGE_W} ${y + 15} L ${x + PAGE_W - 15} ${y + 15} Z`}
                fill="#eef0f2"
                stroke="#d1d5db"
                strokeWidth={0.8}
              />
              <rect x={x + 8} y={y + 8} width={PAGE_W - 30} height={4} rx={2} fill={doc.color} />
              {[0, 1, 2, 3, 4].map((li) => (
                <rect
                  key={li}
                  x={x + 8}
                  y={y + 24 + li * 12}
                  width={li === 4 ? 34 : PAGE_W - 22 - (li % 2) * 8}
                  height={2.6}
                  rx={1.3}
                  fill="#e5e7eb"
                />
              ))}
              <text
                y={-PAGE_H / 2 - 22}
                textAnchor="middle"
                fontSize={12.5}
                fontWeight={500}
                fill="#232e3d"
              >
                {doc.label}
              </text>
              <text
                y={-PAGE_H / 2 - 9}
                textAnchor="middle"
                fontSize={10.5}
                fill="#55606e"
              >
                {doc.targetCount} {strings.targetsWord}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Back affordance */}
      {activeEdge && (
        <button
          type="button"
          onClick={() => {
            setRationaleOpen(false);
            setStage({ kind: "overview" });
          }}
          className="absolute left-2 top-2 text-data font-medium text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] bg-[var(--undp-paper)]/80 px-2 py-1 rounded"
        >
          <span aria-hidden="true">← </span>
          <span>{strings.back}</span>
        </button>
      )}

      {/* Pathway / strand panel, centered between the two focused pages */}
      {activeEdge && !activeStrand && (
        <div className="absolute left-[22%] right-[22%] top-[42%] bottom-2 overflow-y-auto">
          <p className="text-data font-semibold text-[var(--undp-black)]">
            {docLabel(activeEdge.a)} ↔ {docLabel(activeEdge.b)}
          </p>
          <p className="text-caption text-[var(--undp-gray)] mb-2">
            {activeEdge.pathwayLine} · {strings.topStrands}
          </p>
          <ol className="border-t border-line">
            {activeEdge.strands.map((s) => (
              <li key={s.pairKey} className="border-b border-line">
                <button
                  type="button"
                  onClick={() => {
                    setRationaleOpen(false);
                    setStage({
                      kind: "pathway",
                      edgeKey: activeEdge.key,
                      strandKey: s.pairKey,
                    });
                  }}
                  className="block w-full py-2 text-left hover:bg-white/70"
                >
                  <span className="block text-data text-[var(--undp-black)]">
                    {s.rowTitle}
                  </span>
                  <span className="block text-caption text-[var(--undp-gray)]">
                    {s.signals}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          {activeEdge.moreLine && (
            <p className="mt-2 text-caption">
              <Link
                href={`/${countryId}/findings`}
                className="text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] underline underline-offset-2"
              >
                {activeEdge.moreLine}
              </Link>
            </p>
          )}
        </div>
      )}

      {activeEdge && activeStrand && (
        <div className="absolute left-[19%] right-[19%] top-[38%] bottom-2 overflow-y-auto">
          <button
            type="button"
            onClick={goBack}
            className="text-caption font-medium text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)] mb-1"
          >
            ‹ {docLabel(activeEdge.a)} ↔ {docLabel(activeEdge.b)}
          </button>
          <p
            className="text-xl leading-snug text-[var(--undp-black)] [text-wrap:balance] mb-2"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {activeStrand.claim}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md border border-line bg-white p-2.5">
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
                {activeStrand.aTag}
              </p>
              <p className="text-caption text-[var(--undp-black)] leading-relaxed max-h-28 overflow-y-auto">
                {activeStrand.aText}
              </p>
            </div>
            <div className="rounded-md border border-line bg-white p-2.5">
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
                {activeStrand.bTag}
              </p>
              <p className="text-caption text-[var(--undp-black)] leading-relaxed max-h-28 overflow-y-auto">
                {activeStrand.bText}
              </p>
            </div>
          </div>
          {activeStrand.mechanismSentence && (
            <p className="mt-2 text-caption text-[var(--undp-black)]">
              {activeStrand.mechanismSentence}
            </p>
          )}
          <p className="mt-1 text-caption text-[var(--undp-gray)]">
            {activeStrand.signals}
          </p>
          <p className="mt-2 flex items-baseline gap-4">
            <button
              type="button"
              onClick={() => setRationaleOpen((v) => !v)}
              className="text-caption font-medium text-[var(--undp-blue)] hover:text-[var(--undp-blue-dark)]"
            >
              {rationaleOpen ? strings.hideRationale : strings.showRationale}
            </button>
            <Link
              href={`/${countryId}/finding/${activeStrand.pairKey}`}
              className="text-caption font-medium text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
            >
              {strings.openPage}
            </Link>
          </p>
          {rationaleOpen && (
            <div className="mt-1">
              <p className="text-caption text-[var(--undp-black)] leading-relaxed">
                {activeStrand.rationale}
              </p>
              <p className="mt-1 text-caption text-[var(--undp-gray)]">
                {strings.aiDisclaimer}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Status line + legend */}
      <div className="mt-1 min-h-5">
        {stage.kind === "overview" && (
          <p className="text-caption text-[var(--undp-gray)]">
            {hoveredEdge
              ? `${docLabel(hoveredEdge.a)} ↔ ${docLabel(hoveredEdge.b)} · ${hoveredEdge.pathwayLine}`
              : strings.clickHint}
          </p>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-8 gap-y-1">
        <p className="text-caption text-[var(--undp-gray)] flex items-center gap-2">
          <svg width="26" height="6" aria-hidden="true">
            <line x1="1" y1="3" x2="25" y2="3" stroke="#196127" strokeWidth="2" opacity="0.5" />
          </svg>
          {strings.legendTissue}
        </p>
        <p className="text-caption text-[var(--undp-gray)] flex items-center gap-2">
          <svg width="26" height="6" aria-hidden="true">
            <line x1="1" y1="3" x2="25" y2="3" stroke="#ee402d" strokeWidth="3" strokeDasharray="5 3" />
          </svg>
          {strings.legendNerve}
        </p>
      </div>
    </div>
  );
}
