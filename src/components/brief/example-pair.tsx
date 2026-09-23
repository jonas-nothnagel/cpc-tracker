"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ExamplePair } from "@/lib/brief/compute";
import { fitLines } from "@/lib/brief/sheet";
import type { BriefCommitment, BriefDocument } from "@/lib/brief/source";

/** Most lines a quoted text shows before it ends on an ellipsis. */
const MAX_LINES = 4;

/**
 * Whole lines each quote can show in the room the section leaves. The box is
 * bounded by the A4 slot, so the fit follows the language and the length of
 * everything above it. Fluid narrow screens have no fixed slot and keep the
 * maximum; print re-fits, since the page can differ from the window.
 */
function useFittedLines(key: string) {
  const pairRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<[number, number]>([MAX_LINES, MAX_LINES]);
  useEffect(() => {
    const pair = pairRef.current;
    if (!pair) return;
    const fit = () => {
      const fluid =
        window.matchMedia?.("(max-width: 860px)").matches && !window.matchMedia?.("print").matches;
      const bottom = pair.getBoundingClientRect().bottom;
      const next = [...pair.querySelectorAll<HTMLElement>(".brief-quote-text")].map((el) =>
        fluid
          ? MAX_LINES
          : fitLines(bottom - el.getBoundingClientRect().top, parseFloat(getComputedStyle(el).lineHeight), MAX_LINES),
      );
      const [a = MAX_LINES, b = MAX_LINES] = next;
      setLines((prev) => (prev[0] === a && prev[1] === b ? prev : [a, b]));
    };
    fit();
    const printQuery = window.matchMedia?.("print");
    printQuery?.addEventListener?.("change", fit);
    window.addEventListener("beforeprint", fit);
    document.fonts?.ready.then(fit).catch(() => {});
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(pair);
    return () => {
      printQuery?.removeEventListener?.("change", fit);
      window.removeEventListener("beforeprint", fit);
      ro?.disconnect();
    };
  }, [key]);
  return { pairRef, lines };
}

function Quote({ c, docName, lines }: { c: BriefCommitment; docName: string; lines: number }) {
  return (
    <blockquote className="brief-quote" title={c.text}>
      <p className="brief-quote-source">
        <span>{docName}</span>
        <span className="brief-quote-label">{c.label}</span>
      </p>
      <p className="brief-quote-text" style={{ WebkitLineClamp: lines }}>
        {c.text}
      </p>
    </blockquote>
  );
}

/**
 * Two verbatim commitments side by side, joined by the tone's line: solid
 * green where they are aligned, dashed red where they may pull apart (the
 * dash carries the difference for readers who cannot tell the two inks
 * apart). Long texts end on a visible ellipsis; the full comparison, with
 * the AI reading, opens in the panel.
 */
export function ExamplePairView({
  example,
  tone,
  docs,
  themeName,
  onOpenPair,
  onOpenTheme,
}: {
  example: ExamplePair;
  tone: "reinforce" | "apart";
  docs: BriefDocument[];
  /** The theme the example comes from, if any. */
  themeName?: string;
  onOpenPair?: (aId: string, bId: string) => void;
  onOpenTheme?: () => void;
}) {
  const t = useTranslations("brief.themes");
  const docName = (id: string) => docs.find((d) => d.id === id)?.name ?? id;
  const { pairRef, lines } = useFittedLines(`${example.a.id}~${example.b.id}`);
  return (
    <figure className="brief-example" data-tour="brief-example">
      <figcaption className="brief-example-caption">
        {themeName ? t("exampleOf", { name: themeName }) : t("example")}
      </figcaption>
      <div className="brief-example-pair" ref={pairRef}>
        <Quote c={example.a} docName={docName(example.a.doc)} lines={lines[0]} />
        <span className={`brief-example-link brief-example-link-${tone}`} aria-hidden="true" />
        <Quote c={example.b} docName={docName(example.b.doc)} lines={lines[1]} />
      </div>
      <p className="brief-example-actions" data-screen-only>
        <button
          type="button"
          className="brief-button-quiet"
          onClick={() => onOpenPair?.(example.a.id, example.b.id)}
        >
          {t("readFull")}
        </button>
        {onOpenTheme && (
          <button type="button" className="brief-button-quiet" onClick={onOpenTheme}>
            {t("more")}
          </button>
        )}
      </p>
    </figure>
  );
}
