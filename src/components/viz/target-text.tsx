"use client";

import type { Target } from "@/types";

/**
 * Renders target text with quantitative and time-bound phrases highlighted.
 * Used in modals, tooltips, and lists where targets are displayed.
 */
export function TargetTextWithHighlights({ target }: { target: Target }) {
  const { text, quantitativeDetails, timeBoundDetails } = target;

  if (!quantitativeDetails && !timeBoundDetails) {
    return <span>{text}</span>;
  }

  const quantPhrases = (quantitativeDetails ?? "")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const timePhrases = (timeBoundDetails ?? "")
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (quantPhrases.length === 0 && timePhrases.length === 0) {
    return <span>{text}</span>;
  }

  // Build list of (substring, className) to highlight, longest first
  const highlights: { str: string; className: string }[] = [
    ...quantPhrases.map((str) => ({ str, className: "bg-[var(--undp-blue)]/15 font-medium" })),
    ...timePhrases.map((str) => ({ str, className: "bg-amber-100 font-medium" })),
  ].sort((a, b) => b.str.length - a.str.length);

  let remaining = text;
  const parts: React.ReactNode[] = [];
  let key = 0;

  while (remaining.length > 0) {
    let best: { index: number; len: number; className: string } | null = null;
    for (const { str, className } of highlights) {
      if (!str) continue;
      const idx = remaining.indexOf(str);
      if (idx !== -1 && (best === null || idx < best.index)) {
        best = { index: idx, len: str.length, className };
      }
    }

    if (best === null) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    if (best.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, best.index)}</span>);
    }
    parts.push(
      <span key={key++} className={best.className} title="Measurable outcome">
        {remaining.slice(best.index, best.index + best.len)}
      </span>
    );
    remaining = remaining.slice(best.index + best.len);
  }

  return <span>{parts}</span>;
}
