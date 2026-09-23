"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import type { SectionId } from "@/lib/brief/selection";
import { AreasSection } from "./sections/areas";
import { CommitmentsSection } from "./sections/commitments";
import { DocumentsSection } from "./sections/documents";
import { OverallSection } from "./sections/overall";
import { ThemeSectionView } from "./sections/themes";

export interface SectionHandlers {
  onOpenPair?: (aId: string, bId: string) => void;
  onOpenDocPair?: (a: string, b: string) => void;
  onOpenCommitment?: (id: string) => void;
}

/** Renders one section of the brief by id. */
export function SectionView({
  id,
  data,
  lensName,
  handlers,
}: {
  id: SectionId;
  data: BriefData;
  lensName: string | null;
  handlers: SectionHandlers;
}) {
  const ts = useTranslations("brief.sections");
  switch (id) {
    case "overall":
      return <OverallSection data={data} />;
    case "together":
      return <ThemeSectionView data={data} tone="reinforce" onOpenPair={handlers.onOpenPair} />;
    case "apart":
      return <ThemeSectionView data={data} tone="apart" onOpenPair={handlers.onOpenPair} />;
    case "commitments":
      return <CommitmentsSection data={data} onOpenCommitment={handlers.onOpenCommitment} />;
    case "documents":
      return <DocumentsSection data={data} onOpenDocPair={handlers.onOpenDocPair} />;
    case "areas":
      return <AreasSection data={data} lensName={lensName} />;
    default:
      return <p className="brief-sec-label">{ts(id)}</p>;
  }
}
