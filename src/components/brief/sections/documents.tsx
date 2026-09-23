"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MIN_PAIR_COMPARISONS, type DocPairStat, type ToneCounts } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

const aligned = (c: ToneCounts) => (c.total > 0 ? c.reinforce / c.total : 0);

/** One result bar: potential misalignment from the left, alignment from the
 *  right, so position tells the two apart without colour. */
function ResultBar({ name, counts, few }: { name: string; counts: ToneCounts; few?: boolean }) {
  const t = useTranslations("brief.documents");
  const { pct } = useNumbers();
  const share = (v: number) => (counts.total > 0 ? v / counts.total : 0);
  const basis = (v: number) => ({ flexBasis: `${(share(v) * 100).toFixed(2)}%` });
  return (
    <>
      <span className="brief-pair-name">
        {name}
        {few && <span className="brief-pair-few"> ({t("few")})</span>}
      </span>
      <span className="brief-pair-bar-row" aria-hidden="true">
        <span className="brief-pair-value">{pct(share(counts.apart))}</span>
        <span className="brief-pair-bar">
          {counts.apart > 0 && <span className="brief-seg brief-seg-apart" style={basis(counts.apart)} />}
          {counts.partial > 0 && <span className="brief-seg brief-seg-partial" style={basis(counts.partial)} />}
          {counts.none > 0 && <span className="brief-seg brief-seg-none" style={basis(counts.none)} />}
          {counts.reinforce > 0 && (
            <span className="brief-seg brief-seg-reinforce" style={basis(counts.reinforce)} />
          )}
        </span>
        <span className="brief-pair-value brief-pair-value-end">{pct(share(counts.reinforce))}</span>
      </span>
    </>
  );
}

/**
 * How each document fits with the others: one row per document with all its
 * target pairs, most closely aligned first. On screen a document opens to
 * its pairs (sorted the same way), and a pair to its panel.
 */
export function DocumentsSection({
  data,
  variant = "screen",
  onOpenDocPair,
}: {
  data: BriefData;
  variant?: "screen" | "print";
  onOpenDocPair?: (a: string, b: string) => void;
}) {
  const t = useTranslations("brief");
  const { pct } = useNumbers();
  const [open, setOpen] = useState<string | null>(null);
  const rated = data.docs.filter((d) => d.counts.total >= MIN_PAIR_COMPARISONS);
  const high = rated[0];
  const low = rated[rated.length - 1];
  const headline =
    rated.length >= 2 && aligned(high.counts) !== aligned(low.counts)
      ? t("documents.headline", {
          low: pct(aligned(low.counts)),
          docLow: low.doc.name,
          high: pct(aligned(high.counts)),
          docHigh: high.doc.name,
        })
      : t("documents.headlineFallback", { pct: pct(aligned(data.counts)) });
  const order = new Map(data.scope.docs.map((d, i) => [d.id, i]));
  const partners = (docId: string): DocPairStat[] =>
    data.pairs
      .filter((p) => p.a.id === docId || p.b.id === docId)
      .sort((x, y) => {
        const ox = x.a.id === docId ? x.b.id : x.a.id;
        const oy = y.a.id === docId ? y.b.id : y.a.id;
        return aligned(y.counts) - aligned(x.counts) || (order.get(ox) ?? 0) - (order.get(oy) ?? 0);
      });
  const rowLabel = (name: string, c: ToneCounts) =>
    t("documents.docRow", {
      doc: name,
      apart: pct(c.total > 0 ? c.apart / c.total : 0),
      aligned: pct(aligned(c)),
      total: c.total,
    });

  return (
    <SectionFrame id="documents" headline={headline}>
      <p className="brief-pairs-head" data-testid="brief-pairs-head" aria-hidden="true">
        <span className="brief-pairs-head-apart">{t("documents.columnApart")}</span>
        <span className="brief-pairs-head-partial">{t("documents.columnPartial")}</span>
        <span className="brief-pairs-head-aligned">{t("documents.columnAligned")}</span>
      </p>
      <ol className="brief-pairs" data-tour="brief-documents">
        {data.docs.map(({ doc, counts }) => {
          const isOpen = open === doc.id;
          return (
            <li
              key={doc.id}
              className="brief-doc"
              data-testid="brief-doc-row"
              data-doc={doc.id}
              data-open={isOpen ? "true" : undefined}
            >
              {variant === "screen" ? (
                <button
                  type="button"
                  className="brief-pair brief-doc-button"
                  aria-expanded={isOpen}
                  aria-label={rowLabel(doc.name, counts)}
                  onClick={() => setOpen(isOpen ? null : doc.id)}
                >
                  <ResultBar name={doc.name} counts={counts} />
                </button>
              ) : (
                <div className="brief-pair" role="img" aria-label={rowLabel(doc.name, counts)}>
                  <ResultBar name={doc.name} counts={counts} />
                </div>
              )}
              {isOpen && (
                <ol className="brief-doc-pairs">
                  {partners(doc.id).map((p) => {
                    const other = p.a.id === doc.id ? p.b : p.a;
                    return (
                      <li key={`${p.a.id}~${p.b.id}`} data-testid="brief-pair-row" data-pair={`${p.a.id}~${p.b.id}`}>
                        <button
                          type="button"
                          className="brief-pair"
                          aria-label={rowLabel(other.name, p.counts)}
                          onClick={() => onOpenDocPair?.(p.a.id, p.b.id)}
                        >
                          <ResultBar
                            name={other.name}
                            counts={p.counts}
                            few={p.counts.total < MIN_PAIR_COMPARISONS}
                          />
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </li>
          );
        })}
      </ol>
    </SectionFrame>
  );
}
