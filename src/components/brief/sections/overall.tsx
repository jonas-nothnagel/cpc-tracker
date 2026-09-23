"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { DotField } from "../dot-field";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

export function OverallSection({
  data,
  variant = "screen",
  onFocusTone,
  focusTones = ["reinforce", "apart"],
}: {
  data: BriefData;
  variant?: "screen" | "print";
  /** Go to the section behind the aligned or potential-misalignment group. */
  onFocusTone?: (tone: "reinforce" | "apart") => void;
  /** The groups whose section is in the brief; the others stay plain labels. */
  focusTones?: ("reinforce" | "apart")[];
}) {
  const t = useTranslations("brief.overall");
  const { pct } = useNumbers();
  const c = data.counts;
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
    >
      <div className="brief-overall" data-tour="brief-overall">
        <DotField
          counts={data.counts}
          still={variant === "print"}
          onFocusTone={onFocusTone}
          focusTones={focusTones}
        />
      </div>
    </SectionFrame>
  );
}
