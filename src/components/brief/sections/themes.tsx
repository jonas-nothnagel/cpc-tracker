"use client";

import { useTranslations } from "next-intl";
import { shareOf } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import { ExamplePairView } from "../example-pair";
import { useNumbers } from "../ink";
import { ThemeGrid } from "../theme-grid";
import { SectionFrame } from "./frame";

/** "What works well together" (reinforce) and "Where policies may pull
 *  apart" (apart): the leading pair of documents as the finding, the
 *  recurring themes as the evidence, one pair of commitments as the example. */
export function ThemeSectionView({
  data,
  tone,
  onOpenPair,
  onOpenTheme,
}: {
  data: BriefData;
  tone: "reinforce" | "apart";
  countryId?: string;
  onOpenPair?: (aId: string, bId: string) => void;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
}) {
  const t = useTranslations("brief");
  const { pct } = useNumbers();
  const key = tone === "reinforce" ? "together" : "apart";
  const section = data[key];
  const lead = data.leading[tone];
  const headline = lead
    ? t(`${key}.headline`, {
        docA: lead.a.name,
        docB: lead.b.name,
        pct: pct(shareOf(lead.counts, tone)),
      })
    : t(`${key}.headlineFallback`, {
        pct: pct(data.counts.total > 0 ? data.counts[tone] / data.counts.total : 0),
      });
  const note =
    section.rows.length > 0
      ? `${t("themes.aiNote")}${section.exact ? "" : ` ${t("themes.notExact")}`}`
      : undefined;
  return (
    <SectionFrame id={key} headline={headline} note={note}>
      <p className="brief-sec-sub">{t(`${key}.themes`)}</p>
      {section.rows.length > 0 ? (
        <ThemeGrid
          rows={section.rows}
          docs={data.scope.docs}
          tone={tone}
          onOpenTheme={(name) => onOpenTheme?.(tone === "reinforce" ? "reinforcement" : "friction", name)}
        />
      ) : (
        <p className="brief-sec-empty">{t(`${key}.themesEmpty`)}</p>
      )}
      {section.example && (
        <ExamplePairView
          example={section.example}
          tone={tone}
          docs={data.scope.docs}
          onOpenPair={onOpenPair}
        />
      )}
    </SectionFrame>
  );
}
