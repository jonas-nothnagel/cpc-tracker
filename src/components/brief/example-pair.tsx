"use client";

import { useTranslations } from "next-intl";
import type { ExamplePair } from "@/lib/brief/compute";
import type { BriefCommitment, BriefDocument } from "@/lib/brief/source";

function Quote({ c, docName }: { c: BriefCommitment; docName: string }) {
  return (
    <blockquote className="brief-quote" title={c.text}>
      <p className="brief-quote-source">
        <span>{docName}</span>
        <span className="brief-quote-label">{c.label}</span>
      </p>
      <p className="brief-quote-text">{c.text}</p>
    </blockquote>
  );
}

/**
 * Two verbatim commitments, side by side, joined by the tone's line: solid
 * green where they reinforce each other, dashed red where they may pull
 * apart (the dash carries the difference for readers who cannot tell the
 * two inks apart). The AI reading opens in the comparison panel.
 */
export function ExamplePairView({
  example,
  tone,
  docs,
  onOpenPair,
}: {
  example: ExamplePair;
  tone: "reinforce" | "apart";
  docs: BriefDocument[];
  onOpenPair?: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief");
  const docName = (id: string) => docs.find((d) => d.id === id)?.name ?? id;
  return (
    <figure className="brief-example">
      <figcaption className="brief-example-caption">
        {t(tone === "reinforce" ? "together.example" : "apart.example")}
      </figcaption>
      <div className="brief-example-pair">
        <Quote c={example.a} docName={docName(example.a.doc)} />
        <span className={`brief-example-link brief-example-link-${tone}`} aria-hidden="true" />
        <Quote c={example.b} docName={docName(example.b.doc)} />
      </div>
      {tone === "apart" && (
        <p className="brief-example-actions" data-screen-only>
          <button
            type="button"
            className="brief-button-quiet"
            onClick={() => onOpenPair?.(example.a.id, example.b.id)}
          >
            {t("apart.showReading")}
          </button>
        </p>
      )}
    </figure>
  );
}
