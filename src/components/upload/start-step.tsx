"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ProgressDots } from "@/components/analysis/progress-dots";
import { useNumbers } from "@/components/brief/ink";
import { draftCounts } from "@/lib/upload/counts";
import { estimateRun, type Speed } from "@/lib/upload/estimate";
import { MAX_ITEMS } from "@/lib/upload/limits";
import { ownLensProblem } from "@/lib/upload/own-areas";
import type { Draft } from "@/lib/upload/types";

/** The published policy areas every analysis reads. */
const PUBLISHED_LENSES = 4;

/** The last step: the analysis's scale in the brief's own words, its target
 *  pairs as dots, its time and footprint in one line, and the start. */
export function StartStep({
  draft,
  ahead,
  speed,
  error = null,
  onStart,
}: {
  draft: Draft;
  /** Analyses running or waiting before this one would start. */
  ahead: number;
  speed: Speed;
  error?: "busy" | "generic" | null;
  onStart: () => void | Promise<void>;
}) {
  const t = useTranslations("upload.start");
  const tt = useTranslations("upload.targets");
  const { n } = useNumbers();
  const [starting, setStarting] = useState(false);
  const counts = draftCounts(draft);
  const lenses = PUBLISHED_LENSES + (draft.ownLens ? 1 : 0);
  const { minutes, kg } = estimateRun(
    { targets: counts.targets, pairs: counts.pairs + counts.actions * counts.targets, lenses },
    speed,
  );

  const problems: string[] = [];
  if (!draft.country.trim()) problems.push(t("problems.country"));
  if (counts.withTargets < 2) problems.push(t("problems.documents"));
  if (counts.items > MAX_ITEMS) problems.push(tt("over", { count: counts.items - MAX_ITEMS }));
  if (draft.documents.some((d) => d.state === "queued" || d.state === "reading")) problems.push(t("problems.reading"));
  if (draft.documents.some((d) => d.state === "added")) problems.push(t("problems.unread"));
  if (draft.ownLens && ownLensProblem(draft.ownLens)) problems.push(t("problems.ownLens"));

  return (
    <section aria-labelledby="up-step-title">
      <h2 id="up-step-title" className="up-title">
        {t("title")}
      </h2>
      <p className="up-statement">
        <span>{t("documents", { count: counts.withTargets })}</span>
        <span>{t("targets", { count: counts.targets })}</span>
        <span>{t("pairs", { count: counts.pairs })}</span>
      </p>
      {counts.pairs > 0 && (
        // The picture the waiting page fills as the pairs are compared.
        <div className="up-start-picture">
          <ProgressDots done={0} total={counts.pairs} label={t("pairs", { count: counts.pairs })} />
        </div>
      )}
      <p className="up-line">
        {t.rich("estimate", {
          minutes,
          kg: n(kg),
          abbr: (chunks) => <abbr title={t("co2e")}>{chunks}</abbr>,
        })}
      </p>
      {ahead > 0 && <p className="up-line">{t("ahead", { count: ahead })}</p>}
      {problems.map((p) => (
        <p key={p} className="up-line up-over">
          {p}
        </p>
      ))}
      {error && (
        <p className="up-error" role="alert">
          {t(`errors.${error}`)}
        </p>
      )}
      <div className="up-actions">
        <button
          type="button"
          className="brief-button-primary"
          disabled={problems.length > 0 || starting}
          onClick={async () => {
            setStarting(true);
            try {
              await onStart();
            } finally {
              setStarting(false);
            }
          }}
        >
          {t("start")}
        </button>
      </div>
    </section>
  );
}
