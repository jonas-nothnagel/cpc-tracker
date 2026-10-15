"use client";

import { useTranslations } from "next-intl";

import { getCountry } from "@/config/countries";
import type { UseKind } from "@/lib/footprint/uses";

/** What a use is called on the page: the country for an analysis, else the
 *  use in words ("Reading uploaded documents", "Chat"). */
export function usePurposeName() {
  const t = useTranslations("sustainability");
  return (use: { kind: UseKind; country: string | null }) => {
    if (use.kind !== "analysis") return t(`use.${use.kind}`);
    if (use.country === null) return t("use.other");
    return getCountry(use.country)?.name ?? use.country;
  };
}
