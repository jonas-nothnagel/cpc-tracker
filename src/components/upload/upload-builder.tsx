"use client";

import { useTranslations } from "next-intl";
import { useNumbers } from "@/components/brief/ink";
import type { DraftCounts } from "@/lib/upload/counts";
import { MAX_ITEMS } from "@/lib/upload/limits";
import { STEPS, type StepId } from "@/lib/upload/steps";
import type { Draft } from "@/lib/upload/types";
import { useDocumentState } from "./document-state";

/**
 * The brief's builder column beside the current step: the steps, the
 * documents with their colour squares, and the analysis's running figures.
 */
export function UploadBuilder({
  draft,
  country,
  colors,
  counts,
  step,
  reachable,
  onStep,
}: {
  draft: Draft | null;
  country: string;
  colors: string[];
  counts: DraftCounts;
  step: StepId;
  reachable: (step: StepId) => boolean;
  onStep: (step: StepId) => void;
}) {
  const t = useTranslations("upload.builder");
  const ts = useTranslations("upload.steps");
  const { n } = useNumbers();
  const stateOf = useDocumentState();
  const documents = draft?.documents ?? [];
  return (
    <aside className="brief-builder" aria-labelledby="up-builder-title">
      <h2 id="up-builder-title" className="brief-builder-title">
        {country ? t("title", { country }) : t("titleEmpty")}
      </h2>
      <fieldset className="brief-builder-group">
        <legend>{t("steps")}</legend>
        <ol className="up-steps">
          {STEPS.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                className="up-step-link"
                aria-current={id === step ? "step" : undefined}
                disabled={!reachable(id)}
                onClick={() => onStep(id)}
              >
                <span className="up-num">{i + 1}</span>
                <span className="up-step-name">{ts(id)}</span>
              </button>
            </li>
          ))}
        </ol>
      </fieldset>
      {documents.length > 0 && (
        <fieldset className="brief-builder-group">
          <legend>{t("documents")}</legend>
          {documents.map((d, i) => (
            <div key={d.id} className="brief-check">
              <span className="brief-check-swatch" style={{ background: colors[i] }} aria-hidden="true" />
              <span className="brief-check-text">
                <span className="brief-check-name">{d.name}</span>
                <span className="brief-check-meta">{stateOf(d)}</span>
              </span>
            </div>
          ))}
        </fieldset>
      )}
      {counts.items > 0 && (
        <fieldset className="brief-builder-group">
          <legend>{t("analysis")}</legend>
          <dl className="up-figures">
            <dt>{counts.actions > 0 ? t("targetsAndActions") : t("targets")}</dt>
            <dd>{t("of", { count: counts.items, max: MAX_ITEMS })}</dd>
            <dt>{t("pairs")}</dt>
            <dd>{n(counts.pairs)}</dd>
          </dl>
        </fieldset>
      )}
    </aside>
  );
}
