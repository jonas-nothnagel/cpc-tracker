"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

export function CommitmentsSection({
  data,
  onOpenCommitment,
}: {
  data: BriefData;
  onOpenCommitment?: (id: string) => void;
}) {
  const t = useTranslations("brief.commitments");
  const { n, pct } = useNumbers();
  const c = data.concentration;
  const headline =
    c.total === 0
      ? t("headlineEmpty")
      : c.concentrated
        ? t("headlineConcentrated", { pct: pct(c.share), total: c.total, top: c.top.length })
        : t("headlineSpread", { contested: c.contested });
  const max = data.commitments[0]?.apart ?? 1;
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  return (
    <SectionFrame id="commitments" headline={headline}>
      <ol className="brief-rank">
        {data.commitments.map((row, i) => {
          const partner = row.partnerDocs[0];
          return (
            <li key={row.commitment.id} className="brief-rank-row" data-testid="brief-commitment-row">
              <span className="brief-rank-n">{i + 1}</span>
              <button
                type="button"
                className="brief-rank-main"
                onClick={() => onOpenCommitment?.(row.commitment.id)}
                title={row.commitment.text}
              >
                <span className="brief-rank-title">{row.commitment.label}</span>
                <span className="brief-rank-meta">
                  {docName(row.commitment.doc)}
                  {partner ? ` · ${t("mostlyWith", { doc: docName(partner.doc) })}` : ""}
                </span>
              </button>
              <span className="brief-rank-bar" aria-hidden="true">
                <span style={{ width: `${(row.apart / max) * 100}%` }} />
              </span>
              <span className="brief-rank-value">{n(row.apart)}</span>
            </li>
          );
        })}
      </ol>
    </SectionFrame>
  );
}
