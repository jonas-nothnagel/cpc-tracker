"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { commitmentLine, useNumbers } from "../ink";
import { SectionFrame } from "./frame";

/** The targets aligned with the largest share of the targets they were
 *  compared with: where the documents already pull together. */
export function AlignedSection({
  data,
  onOpenCommitment,
}: {
  data: BriefData;
  onOpenCommitment?: (id: string) => void;
}) {
  const t = useTranslations("brief.aligned");
  const { pct } = useNumbers();
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  const share = (r: { aligned: number; compared: number }) =>
    r.compared > 0 ? r.aligned / r.compared : 0;
  const top = data.aligned[0];
  const headline = top
    ? t("headline", {
        target: commitmentLine(top.commitment, 60),
        doc: docName(top.commitment.doc),
        pct: pct(share(top)),
      })
    : t("headlineEmpty");
  return (
    <SectionFrame id="aligned" headline={headline}>
      <ol className="brief-rank" data-tour="brief-aligned">
        {data.aligned.map((row, i) => {
          return (
            <li key={row.commitment.id} className="brief-rank-row" data-testid="brief-aligned-row">
              <span className="brief-rank-n">{i + 1}</span>
              <button
                type="button"
                className="brief-rank-main"
                onClick={() => onOpenCommitment?.(row.commitment.id)}
                title={row.commitment.text}
              >
                <span className="brief-rank-title">{commitmentLine(row.commitment)}</span>
                <span className="brief-rank-meta">
                  {docName(row.commitment.doc)}
                  {` · ${t("meta", { aligned: row.aligned, compared: row.compared })}`}
                </span>
              </button>
              <span
                className="brief-rank-bar brief-rank-bar-aligned"
                role="img"
                aria-label={t("row", { aligned: row.aligned, compared: row.compared })}
              >
                <span style={{ width: `${(share(row) * 100).toFixed(1)}%` }} />
              </span>
              <span className="brief-rank-value">{pct(share(row))}</span>
            </li>
          );
        })}
      </ol>
    </SectionFrame>
  );
}
