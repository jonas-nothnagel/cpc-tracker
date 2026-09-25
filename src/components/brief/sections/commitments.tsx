"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { RankList } from "../rank-list";
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
  const { pct } = useNumbers();
  const c = data.concentration;
  const headline =
    c.total === 0
      ? t("headlineEmpty")
      : c.concentrated
        ? t("headlineConcentrated", { pct: pct(c.share), total: c.total, top: c.top.length })
        : t("headlineSpread", { contested: c.contested });
  return (
    <SectionFrame id="commitments" headline={headline}>
      <ReviewList
        data={data}
        testId="brief-commitment-row"
        tour="brief-commitments"
        onOpen={onOpenCommitment}
      />
    </SectionFrame>
  );
}

/** The targets involved in the most potential misalignments. */
export function ReviewList({
  data,
  limit,
  testId,
  tour,
  onOpen,
  onHover,
  selected,
  onSelect,
  openLabel,
}: {
  data: BriefData;
  limit?: number;
  testId: string;
  tour?: string;
  onOpen?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** The picked target: rows pick instead of opening (see RankList). */
  selected?: string | null;
  onSelect?: (id: string) => void;
  openLabel?: (id: string) => string;
}) {
  const t = useTranslations("brief.commitments");
  return (
    <RankList
      items={data.commitments.slice(0, limit).map((row) => ({
        commitment: row.commitment,
        value: row.apart,
        partnerDocs: row.partnerDocs,
      }))}
      tone="apart"
      docs={data.scope.docs}
      partner={(count, doc) => t("partner", { count, doc })}
      testId={testId}
      tour={tour}
      onOpen={onOpen}
      onHover={onHover}
      selected={selected}
      onSelect={onSelect}
      openLabel={openLabel}
    />
  );
}
