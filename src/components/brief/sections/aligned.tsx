"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { RankList } from "../rank-list";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

/** Rows the printed section shows; the screen overview shows six too. */
export const RANK_ROWS = 6;

/**
 * The strongest alignments: the targets with the most strong links to
 * targets in other documents, counted as the explorer counts them (strong
 * readings only). The headline says how concentrated those links are.
 */
export function AlignedSection({
  data,
  onOpenCommitment,
}: {
  data: BriefData;
  onOpenCommitment?: (id: string) => void;
}) {
  const t = useTranslations("brief.aligned");
  const { pct } = useNumbers();
  const c = data.strongConcentration;
  const headline =
    c.total === 0
      ? t("headlineEmpty")
      : c.concentrated
        ? t("headlineConcentrated", { total: c.total, pct: pct(c.share), top: c.top.length })
        : t("headlineSpread", { contested: c.contested });
  return (
    <SectionFrame id="aligned" headline={headline}>
      <StrongestList data={data} testId="brief-aligned-row" tour="brief-aligned" onOpen={onOpenCommitment} />
    </SectionFrame>
  );
}

export function StrongestList({
  data,
  limit = RANK_ROWS,
  testId,
  tour,
  onOpen,
  onHover,
  selected,
  onSelect,
  openLabel,
  hovered,
}: {
  data: BriefData;
  /** Rows shown (its data holds eight). */
  limit?: number;
  testId: string;
  tour?: string;
  onOpen?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** The picked target: rows pick instead of opening (see RankList). */
  selected?: string | null;
  onSelect?: (id: string) => void;
  openLabel?: (id: string) => string;
  hovered?: string | null;
}) {
  const t = useTranslations("brief.aligned");
  return (
    <RankList
      items={data.strongest.slice(0, limit).map((row) => ({
        commitment: row.commitment,
        value: row.strong,
        partnerDocs: row.partnerDocs,
      }))}
      tone="reinforce"
      docs={data.scope.docs}
      partner={(count, doc) => t("partner", { count, doc })}
      valueLabel={(count) => t("row", { count })}
      testId={testId}
      tour={tour}
      onOpen={onOpen}
      onHover={onHover}
      selected={selected}
      onSelect={onSelect}
      openLabel={openLabel}
      hovered={hovered}
    />
  );
}
