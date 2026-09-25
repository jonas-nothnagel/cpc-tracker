"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FeedbackControl } from "@/components/dashboard/coherence-briefing/feedback-control";
import { toneOf } from "@/lib/brief/compute";
import type { FoundPair } from "@/lib/brief/pair";
import type { ExploreItem } from "@/lib/brief/explore/model";
import type { BriefCommitment } from "@/lib/brief/source";
import { useResourceLine } from "../sections/themes";

/** A target's text, a few lines at first, the rest on request. */
function Quote({ c, docName }: { c: BriefCommitment; docName: string }) {
  const item = c as ExploreItem;
  const label = item.kind && item.kind !== "target" ? (item.code ? `${item.code} ${item.name}` : c.label) : c.label;
  const t = useTranslations("brief.explore");
  const [open, setOpen] = useState(false);
  const long = c.text.length > 280;
  return (
    <blockquote className="brief-panel-quote">
      <p className="brief-panel-quote-source">
        {docName} · <span className="brief-panel-quote-label">{label}</span>
      </p>
      <p className="brief-panel-quote-text ex-quote" data-clamped={long && !open ? "true" : undefined}>
        {c.text}
      </p>
      {long && (
        <button type="button" className="brief-panel-more" onClick={() => setOpen((v) => !v)}>
          {open ? t("less") : t("more")}
        </button>
      )}
    </blockquote>
  );
}

/**
 * One comparison beside the ring: the two targets joined by the rating's
 * line, the AI explanation (loaded on demand) with its caveat and the review
 * control, and a way to put the other target in the centre.
 */
export function PairView({
  countryId,
  a,
  b,
  partner,
  commitments,
  docName,
  countryName,
  onCentre,
  onClose,
}: {
  countryId: string;
  /** The two seats, as asked for (the centre first). */
  a: string;
  b: string;
  /** The seat that is not in the centre. */
  partner: string;
  commitments: Map<string, ExploreItem>;
  docName: (id: string) => string;
  countryName: string;
  onCentre: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("brief.explore");
  const tp = useTranslations("brief.panel");
  const td = useTranslations("briefing.drawer.pair");
  const tm = useTranslations("labels.contradictionType");
  const locale = useLocale();
  const resourceLine = useResourceLine();
  const [state, setState] = useState<{ key: string; status: "ok" | "error"; found?: FoundPair } | null>(null);
  const key = `${a}~${b}`;

  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({ country: countryId, a, b, locale });
    fetch(`/api/brief/pair?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<FoundPair>) : Promise.reject(new Error())))
      .then((found) => alive && setState({ key, status: "ok", found }))
      .catch(() => alive && setState({ key, status: "error" }));
    return () => {
      alive = false;
    };
  }, [a, b, countryId, locale, key]);

  const current = state?.key === key ? state : null;
  const found = current?.status === "ok" ? current.found : undefined;
  // The stored order, so an explanation that says "the first target" points
  // at the first quote.
  const first = commitments.get(found?.pair.targetAId ?? a);
  const second = commitments.get(found?.pair.targetBId ?? b);
  const pair = found?.pair;
  // A reported action or budget line on one side: its own wording and caveat.
  const layer = [commitments.get(a), commitments.get(b)].find((c) => c && c.kind !== "target")?.kind ?? null;
  const flagged = pair?.alignment === "flagged" && layer !== "budget";
  const resources =
    pair && flagged && pair.mechanism === "resource_competition" ? resourceLine(pair.contestedResources ?? []) : null;

  return (
    <section className="ex-pair" aria-live="polite" data-testid="explore-pair">
      <div className="ex-pair-head">
        <h3 className="ex-pair-title">
          {!pair
            ? tp("pairDialog")
            : layer === "budget"
              ? t(pair.alignment === "high" ? "tipBudgetMatch" : "tipBudgetNone")
              : layer === "action" && pair.alignment === "flagged"
                ? t("tipActionPull")
                : tp(`rating.${pair.alignment}`)}
          {pair && flagged && pair.mechanism && <span className="ex-pair-type">{tm(pair.mechanism)}</span>}
        </h3>
        <span className="ex-pair-tools">
          <button type="button" className="ex-link" onClick={() => onCentre(partner)}>
            {t("centre")}
          </button>
          <button type="button" className="ex-close" onClick={onClose} aria-label={t("close")}>
            ×
          </button>
        </span>
      </div>
      {first && second && (
        <div className="brief-panel-pair">
          <Quote c={first} docName={docName(first.doc)} />
          <span
            className={`brief-panel-link brief-panel-link-${pair ? toneOf(pair.alignment) : "none"}`}
            aria-hidden="true"
          />
          <Quote c={second} docName={docName(second.doc)} />
        </div>
      )}
      {!current && <p className="brief-panel-caveat">{tp("loading")}</p>}
      {current?.status === "error" && <p className="brief-panel-caveat">{tp("error")}</p>}
      {pair?.description && (
        <div className="ex-pair-ai">
          <h4 className="brief-panel-h">{tp("aiExplanation")}</h4>
          <p className="brief-panel-text">{pair.description}</p>
          {resources && <p className="brief-panel-meta">{resources}</p>}
          {pair.descriptionTranslationPending && (
            <p className="brief-panel-caveat">{td("rationaleTranslationPending")}</p>
          )}
          {layer === "action" && <p className="brief-panel-caveat">{t("caveatBtr", { country: countryName })}</p>}
          {layer === "budget" && <p className="brief-panel-caveat">{t("caveatBer")}</p>}
          <p className="brief-panel-caveat">{td("aiRationaleDisclaimer")}</p>
          <FeedbackControl
            variant="bar"
            countryId={countryId}
            surface="target_pair_rationale"
            anchorIds={[pair.targetAId, pair.targetBId]}
            contentText={pair.description}
            context={{
              alignment: pair.alignment,
              mechanism: pair.mechanism,
              confidence: pair.confidence,
              manageability: pair.manageability,
            }}
          />
        </div>
      )}
    </section>
  );
}
