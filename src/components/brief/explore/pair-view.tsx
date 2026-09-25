"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FeedbackControl } from "@/components/dashboard/coherence-briefing/feedback-control";
import { toneOf } from "@/lib/brief/compute";
import type { FoundPair } from "@/lib/brief/pair";
import type { ExploreItem } from "@/lib/brief/explore/model";
import { Explanation, type DocNames } from "../ai-text";
import { Comparison, type ComparisonSide } from "../comparison";
import { useResourceLine } from "../sections/themes";
import { RING_INK } from "./ring-canvas";

/**
 * One comparison beside the ring: the two targets as two stops on the
 * rating's line (as in the brief's panel), the AI explanation (loaded on
 * demand) with its caveat and the review control, and a way to put the
 * other target in the centre.
 */
export function PairView({
  countryId,
  a,
  b,
  partner,
  commitments,
  docName,
  docColor,
  docs,
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
  /** A document's colour; reported actions and budget lines take their layer's. */
  docColor?: (id: string) => string | undefined;
  /** The documents, so the codes the AI explanation uses are explained. */
  docs?: DocNames;
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
  const sideOf = (c: ExploreItem): ComparisonSide => ({
    label: c.kind !== "target" && c.code ? `${c.code} ${c.name}` : c.label,
    text: c.text,
    docName: docName(c.doc),
    color:
      c.kind === "action" ? RING_INK.action : c.kind === "budget" ? RING_INK.budget : (docColor?.(c.doc) ?? RING_INK.rest),
  });

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
        <Comparison first={sideOf(first)} second={sideOf(second)} tone={pair ? toneOf(pair.alignment) : "none"} />
      )}
      {!current && <p className="brief-panel-caveat">{tp("loading")}</p>}
      {current?.status === "error" && <p className="brief-panel-caveat">{tp("error")}</p>}
      {pair?.description && (
        <div className="ex-pair-ai">
          <Explanation text={pair.description} docs={docs} confidence={pair.confidence} heading="h4" />
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
