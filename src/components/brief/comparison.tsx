"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Tone } from "@/lib/brief/compute";

/** One target of a comparison: its title, its text, and its document. */
export interface ComparisonSide {
  label: string;
  text: string;
  docName: string;
  /** The document's colour, as on the map and in the builder. */
  color: string;
}

/** A text longer than this shows a few lines first. */
export const LONG_TEXT = 280;

function Stop({ side }: { side: ComparisonSide }) {
  const t = useTranslations("brief.panel");
  const [open, setOpen] = useState(false);
  const text = side.text.trim();
  const long = text.length > LONG_TEXT;
  return (
    <div className="brief-cmp-stop">
      <span className="brief-cmp-mark" style={{ background: side.color }} aria-hidden="true" />
      <p className="brief-cmp-doc">{side.docName}</p>
      <p className="brief-cmp-label">{side.label}</p>
      {text && text !== side.label && (
        <p className="brief-cmp-text" data-clamped={long && !open ? "true" : undefined}>
          {text}
        </p>
      )}
      {long && (
        <button type="button" className="brief-panel-more" onClick={() => setOpen((v) => !v)}>
          {open ? t("shortText") : t("fullText")}
        </button>
      )}
    </div>
  );
}

/**
 * Two targets compared: two stops on one line in the rating's ink (solid
 * green aligned, grey partial, dotted grey no clear relationship, dashed red
 * potential misalignment), each stop marked with its document's colour. The
 * dash tells potential misalignment apart without relying on red and green.
 */
export function Comparison({ first, second, tone }: { first: ComparisonSide; second: ComparisonSide; tone: Tone }) {
  return (
    <div className="brief-cmp" data-tone={tone} data-testid="brief-comparison">
      <Stop side={first} />
      <Stop side={second} />
    </div>
  );
}
