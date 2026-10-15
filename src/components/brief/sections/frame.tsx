"use client";

import type { ReactNode } from "react";
import type { SectionId } from "@/lib/brief/selection";

/** Every section opens with its finding as a serif headline, then the
 *  evidence. No label above the headline: the finding names the subject. */
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
  return (
    <div className="brief-sec" data-sec={id}>
      <h2 className="brief-sec-headline" tabIndex={-1}>
        {headline}
      </h2>
      {sub && <p className="brief-sec-sub">{sub}</p>}
      <div className="brief-sec-body">{children}</div>
      {note && <p className="brief-sec-note">{note}</p>}
    </div>
  );
}
