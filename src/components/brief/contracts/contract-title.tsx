"use client";

import { useTranslations } from "next-intl";
import type { Contract } from "@/lib/brief/contracts/model";

/** A contract's title as the page lists it: the English machine translation
 *  when there is one, else the original in Mongolian, marked as such. */
export function ContractTitle({
  contract,
  className = "ct-list-title",
}: {
  contract: Pick<Contract, "title" | "translated">;
  className?: string;
}) {
  const t = useTranslations("brief.contracts.tip");
  if (contract.translated) return <span className={className}>{contract.title}</span>;
  return (
    <span className={className}>
      <span lang="mn">{contract.title}</span>
      <span className="ct-untranslated"> ({t("untranslated")})</span>
    </span>
  );
}
