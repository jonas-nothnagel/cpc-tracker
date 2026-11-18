import type { ReactNode } from "react";

/**
 * How a section of the brief opens, on the overview's column split: top left
 * the serif title naming what the section shows, the source under it and the
 * section's own choices; top right one insight sentence (a share with its
 * denominator, following the reader's choices), then what the right column
 * holds. With nothing to state, the title stands alone (DESIGN.md, the
 * Title-Names-The-Section Rule).
 */
export function SectionHead({
  title,
  titleId,
  source,
  controls,
  insight,
  children,
}: {
  title: ReactNode;
  titleId?: string;
  /** Where the figures come from, in grey under the title. */
  source?: ReactNode;
  /** The section's own choices (a currency, a lens), under the title. */
  controls?: ReactNode;
  /** One sentence; it changes with the reader's choices, and says so to a screen reader. */
  insight?: ReactNode;
  /** What stands under the sentence in the right column. */
  children?: ReactNode;
}) {
  return (
    <header className="brief-sec-head">
      <div className="brief-sec-head-main">
        <h2 id={titleId} className="brief-sec-title" tabIndex={-1}>
          {title}
        </h2>
        {source && <p className="brief-sec-source">{source}</p>}
        {controls && <div className="brief-sec-controls">{controls}</div>}
      </div>
      {(insight || children) && (
        <div className="brief-sec-head-side">
          {insight && (
            <p className="brief-hub-headline" aria-live="polite">
              {insight}
            </p>
          )}
          {children}
        </div>
      )}
    </header>
  );
}
