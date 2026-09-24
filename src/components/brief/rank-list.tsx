"use client";

import type { BriefCommitment, BriefDocument } from "@/lib/brief/source";
import { commitmentLine, useNumbers } from "./ink";

export interface RankItem {
  commitment: BriefCommitment;
  value: number;
  /** Documents of its partners, by count. */
  partnerDocs: { doc: string; count: number }[];
}

/**
 * Targets ranked by a count: the target, its document and its partner
 * documents with their counts, then a halftone bar and the count. Used for
 * the strongest alignments (green) and the targets to review first (red).
 */
export function RankList({
  items,
  tone,
  docs,
  partner,
  valueLabel,
  testId,
  tour,
  onOpen,
  onHover,
}: {
  items: RankItem[];
  tone: "reinforce" | "apart";
  docs: BriefDocument[];
  /** "5 with Document A" */
  partner: (count: number, doc: string) => string;
  /** The bar's size in words; without it the bar is decorative. */
  valueLabel?: (value: number) => string;
  testId: string;
  tour?: string;
  onOpen?: (id: string) => void;
  /** The target under the pointer (null when it leaves). */
  onHover?: (id: string | null) => void;
}) {
  const { n } = useNumbers();
  const docName = (id: string) => docs.find((d) => d.id === id)?.name ?? id;
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ol className="brief-rank" data-tour={tour}>
      {items.map((item, i) => {
        const partners = item.partnerDocs
          .slice(0, 2)
          .map((p) => partner(p.count, docName(p.doc)))
          .join(", ");
        const width = { width: `${((item.value / max) * 100).toFixed(1)}%` };
        return (
          <li
            key={item.commitment.id}
            className="brief-rank-row"
            data-testid={testId}
            onPointerEnter={onHover ? () => onHover(item.commitment.id) : undefined}
            onPointerLeave={onHover ? () => onHover(null) : undefined}
          >
            <span className="brief-rank-n">{i + 1}</span>
            <button
              type="button"
              className="brief-rank-main"
              onClick={() => onOpen?.(item.commitment.id)}
              title={item.commitment.text}
            >
              <span className="brief-rank-title">{commitmentLine(item.commitment)}</span>
              <span className="brief-rank-meta">
                {docName(item.commitment.doc)}
                {partners ? ` · ${partners}` : ""}
              </span>
            </button>
            {valueLabel ? (
              <span
                className={`brief-rank-bar${tone === "reinforce" ? " brief-rank-bar-aligned" : ""}`}
                role="img"
                aria-label={valueLabel(item.value)}
              >
                <span style={width} />
              </span>
            ) : (
              <span
                className={`brief-rank-bar${tone === "reinforce" ? " brief-rank-bar-aligned" : ""}`}
                aria-hidden="true"
              >
                <span style={width} />
              </span>
            )}
            <span className="brief-rank-value">{n(item.value)}</span>
          </li>
        );
      })}
    </ol>
  );
}
