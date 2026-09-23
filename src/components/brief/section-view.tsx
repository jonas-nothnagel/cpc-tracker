"use client";

import { useTranslations } from "next-intl";
import type { SectionId } from "@/lib/brief/selection";

/** Renders one section of the brief by id. */
export function SectionView({ id }: { id: SectionId }) {
  const ts = useTranslations("brief.sections");
  return <p className="brief-section-label">{ts(id)}</p>;
}
