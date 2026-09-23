"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { DotField, MAX_DOTS } from "../dot-field";
import { SectionFrame } from "./frame";

export function OverallSection({ data }: { data: BriefData }) {
  const t = useTranslations("brief.overall");
  const unit = Math.max(1, Math.ceil(data.counts.total / MAX_DOTS));
  return (
    <SectionFrame
      id="overall"
      headline={t(`headline.${data.verdict}`, { country: data.countryName })}
      note={unit === 1 ? t("unitOne") : t("unitMany", { count: unit })}
    >
      <DotField counts={data.counts} />
    </SectionFrame>
  );
}
