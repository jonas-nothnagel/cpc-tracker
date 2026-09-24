"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ToneCounts } from "@/lib/brief/compute";
import type { BriefCommitment } from "@/lib/brief/source";
import { commitmentLine, useNumbers } from "../ink";
import { ResultBar } from "../sections/documents";

/** Rows shown before a quiet "Show all". */
export const PREVIEW = 6;

/** A list that shows its first rows and the rest on request. */
export function Expandable<T>({
  items,
  preview = PREVIEW,
  render,
  className,
}: {
  items: T[];
  preview?: number;
  render: (items: T[]) => ReactNode;
  className?: string;
}) {
  const t = useTranslations("brief.panel");
  const te = useTranslations("brief.explore");
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, preview);
  return (
    <div className={className}>
      {render(shown)}
      {items.length > preview && (
        <button type="button" className="brief-panel-more ex-more" onClick={() => setAll((v) => !v)}>
          {all ? te("less") : t("showAll", { count: items.length })}
        </button>
      )}
    </div>
  );
}

/** Ranked targets: a target, its document, its count as a halftone bar. */
export function RankRows({
  rows,
  tone,
  docName,
  onOpen,
  onHover,
  testId,
}: {
  rows: { commitment: BriefCommitment; value: number }[];
  tone: "reinforce" | "apart";
  docName: (id: string) => string;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
  testId: string;
}) {
  const { n } = useNumbers();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ol className="ex-rank">
      {rows.map((row, i) => (
        <li
          key={row.commitment.id}
          className="ex-rank-row"
          data-testid={testId}
          onPointerEnter={() => onHover(row.commitment.id)}
          onPointerLeave={() => onHover(null)}
        >
          <span className="ex-rank-n">{i + 1}</span>
          <button
            type="button"
            className="ex-rank-main"
            onClick={() => onOpen(row.commitment.id)}
            onFocus={() => onHover(row.commitment.id)}
            onBlur={() => onHover(null)}
          >
            <span className="ex-rank-title">{commitmentLine(row.commitment)}</span>
            <span className="ex-rank-meta">{docName(row.commitment.doc)}</span>
          </button>
          <span className={`ex-rank-bar ex-rank-bar-${tone}`} aria-hidden="true">
            <span style={{ width: `${((row.value / max) * 100).toFixed(1)}%` }} />
          </span>
          <span className="ex-rank-value">{n(row.value)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Targets or target pairs, one row each, marked with the rating's ink. */
export function MarkRows({
  rows,
  tone,
  selected,
  onOpen,
  onHover,
  testId,
}: {
  rows: { key: string; lines: ReactNode[]; type?: string; hover?: string }[];
  tone: "reinforce" | "apart" | "ink";
  selected?: string | null;
  onOpen: (key: string) => void;
  onHover?: (id: string | null) => void;
  testId: string;
}) {
  return (
    <ol className="brief-panel-rows ex-rows">
      {rows.map((row) => (
        <li
          key={row.key}
          className="brief-panel-row"
          data-testid={testId}
          data-selected={selected === row.key ? "true" : undefined}
          onPointerEnter={() => row.hover && onHover?.(row.hover)}
          onPointerLeave={() => onHover?.(null)}
        >
          <button
            type="button"
            onClick={() => onOpen(row.key)}
            onFocus={() => row.hover && onHover?.(row.hover)}
            onBlur={() => onHover?.(null)}
          >
            <span
              className={`brief-panel-mark ${tone === "ink" ? "ex-mark-ink" : `brief-panel-mark-${tone}`}`}
              aria-hidden="true"
            />
            <span className="brief-panel-row-main">
              {row.lines.map((line, k) => (
                <span key={k} className="brief-panel-row-line">
                  {line}
                </span>
              ))}
              {row.type && <span className="brief-panel-row-type">{row.type}</span>}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

/** A target as a row line: its document, then its label or first words. */
export function TargetLine({ c, docName }: { c: BriefCommitment; docName: (id: string) => string }) {
  return (
    <>
      <span className="brief-panel-row-doc">{docName(c.doc)} · </span>
      {commitmentLine(c)}
    </>
  );
}

/** The ring's inks in words, with their counts: the key is the tally. */
export function ToneKey({ counts, share = false }: { counts: ToneCounts; share?: boolean }) {
  const tt = useTranslations("brief.tone");
  const { n, pct } = useNumbers();
  const tones = (["reinforce", "partial", "none", "apart"] as const).filter((tone) => counts[tone] > 0);
  return (
    <ul className="ex-key">
      {tones.map((tone) => (
        <li key={tone}>
          <span className={`ex-key-mark ex-key-${tone}`} aria-hidden="true" />
          <span className="ex-key-n">{share ? pct(counts[tone] / Math.max(1, counts.total)) : n(counts[tone])}</span>{" "}
          {tt(tone)}
        </li>
      ))}
    </ul>
  );
}

/** A group of targets as a row: its name, its size, its result bar. */
export function GroupRow({
  name,
  meta,
  counts,
  open,
  onOpen,
  onHover,
  children,
  testId,
}: {
  name: string;
  meta?: string;
  counts: ToneCounts;
  open?: boolean;
  onOpen: () => void;
  onHover?: (on: boolean) => void;
  children?: ReactNode;
  testId: string;
}) {
  return (
    <li
      className="ex-group-row"
      data-testid={testId}
      data-open={open ? "true" : undefined}
      onPointerEnter={() => onHover?.(true)}
      onPointerLeave={() => onHover?.(false)}
    >
      <button type="button" className="ex-group-row-main" aria-expanded={open} onClick={onOpen}>
        <span className="ex-group-row-name">
          {name}
          {meta && <span className="ex-group-row-meta"> {meta}</span>}
        </span>
        {counts.total > 0 && (
          <span className="ex-group-row-bar" aria-hidden="true">
            <ResultBar counts={counts} />
          </span>
        )}
      </button>
      {children}
    </li>
  );
}
