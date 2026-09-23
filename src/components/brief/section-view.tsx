"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import type { SectionId } from "@/lib/brief/selection";
import { AlignedSection } from "./sections/aligned";
import { AreasSection } from "./sections/areas";
import { CommitmentsSection } from "./sections/commitments";
import { DocumentsSection } from "./sections/documents";
import { OverallSection } from "./sections/overall";
import { ThemeSectionView } from "./sections/themes";

export type ThemeTone = "reinforce" | "apart";

/** Screen sections are interactive and sized by their content; print
 *  sections sit in fixed A4 slots and are drawn in their settled state. */
export type SectionVariant = "screen" | "print";

export interface SectionHandlers {
  onOpenPair?: (aId: string, bId: string) => void;
  onOpenDocPair?: (a: string, b: string) => void;
  onOpenCommitment?: (id: string) => void;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
  onPickTheme?: (tone: ThemeTone, name: string) => void;
  /** Go to the section that explains one group of the overall picture. */
  onFocusTone?: (tone: ThemeTone) => void;
}

/** Renders one section of the brief by id. */
export function SectionView({
  id,
  variant = "screen",
  data,
  lensName,
  handlers,
  picked,
  replay,
}: {
  id: SectionId;
  variant?: SectionVariant;
  data: BriefData;
  lensName: string | null;
  handlers: SectionHandlers;
  picked?: Record<ThemeTone, string | null>;
  replay?: Record<ThemeTone, number>;
}) {
  const ts = useTranslations("brief.sections");
  const theme = (tone: ThemeTone) => (
    <ThemeSectionView
      data={data}
      tone={tone}
      variant={variant}
      picked={picked?.[tone]}
      replay={replay?.[tone]}
      onPick={handlers.onPickTheme ? (name) => handlers.onPickTheme?.(tone, name) : undefined}
      onOpenPair={handlers.onOpenPair}
      onOpenTheme={handlers.onOpenTheme}
    />
  );
  switch (id) {
    case "overall":
      return (
        <OverallSection
          data={data}
          variant={variant}
          onFocusTone={variant === "screen" ? handlers.onFocusTone : undefined}
        />
      );
    case "together":
      return theme("reinforce");
    case "apart":
      return theme("apart");
    case "aligned":
      return <AlignedSection data={data} onOpenCommitment={handlers.onOpenCommitment} />;
    case "commitments":
      return <CommitmentsSection data={data} onOpenCommitment={handlers.onOpenCommitment} />;
    case "documents":
      return (
        <DocumentsSection
          data={data}
          variant={variant}
          onOpenDocPair={handlers.onOpenDocPair}
        />
      );
    case "areas":
      return <AreasSection data={data} lensName={lensName} />;
    default:
      return <p className="brief-sec-empty">{ts(id)}</p>;
  }
}
