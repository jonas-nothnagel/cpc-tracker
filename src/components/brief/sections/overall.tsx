"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { DotField, MAX_DOTS } from "../dot-field";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

export function OverallSection({ data }: { data: BriefData }) {
  const t = useTranslations("brief.overall");
  const { pct } = useNumbers();
  const c = data.counts;
  const unit = Math.max(1, Math.ceil(c.total / MAX_DOTS));
  const share = (v: number) => pct(c.total > 0 ? v / c.total : 0);
  return (
    <SectionFrame
      id="overall"
      headline={t(`headline.${data.lead}`, {
        country: data.countryName,
        aligned: share(c.reinforce),
        partial: share(c.partial),
        apart: share(c.apart),
      })}
      note={unit === 1 ? t("unitOne") : t("unitMany", { count: unit })}
    >
      <DotField counts={data.counts} />
    </SectionFrame>
  );
}
