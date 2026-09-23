"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { SectionId } from "@/lib/brief/selection";

/** Every section reads the same way: the question it answers, the finding as
 *  a serif headline, the evidence, then any provenance note. */
export function SectionFrame({
  id,
  headline,
  sub,
  note,
  children,
}: {
  id: SectionId;
  headline: ReactNode;
  sub?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const ts = useTranslations("brief.sections");
  return (
    <div className="brief-sec">
      <p className="brief-sec-label">{ts(id)}</p>
      <h2 className="brief-sec-headline">{headline}</h2>
      {sub && <p className="brief-sec-sub">{sub}</p>}
      <div className="brief-sec-body">{children}</div>
      {note && <p className="brief-sec-note">{note}</p>}
    </div>
  );
}
