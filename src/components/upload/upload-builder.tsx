"use client";

import { useTranslations } from "next-intl";
import { DotCanvas } from "@/components/brief/dot-field";
import { INK, useNumbers } from "@/components/brief/ink";
import type { DraftCounts } from "@/lib/upload/counts";
import { MAX_ITEMS } from "@/lib/upload/limits";
import { analysisPicture } from "@/lib/upload/picture";
import { STEPS, type StepId } from "@/lib/upload/steps";
import type { Draft } from "@/lib/upload/types";
import { useDocumentState } from "./document-state";

/**
 * The brief's builder column beside the current step: the steps, the
 * documents with their colour squares, and the analysis as a picture, one
 * dot per target in its document's colour among the 150 it can hold. The
 * page's title is the hero's.
 */
export function UploadBuilder({
  draft,
  colors,
  counts,
  step,
  reachable,
  onStep,
}: {
  draft: Draft | null;
  colors: string[];
  counts: DraftCounts;
  step: StepId;
  reachable: (step: StepId) => boolean;
  onStep: (step: StepId) => void;
}) {
  const t = useTranslations("upload.builder");
  const ts = useTranslations("upload.steps");
  const td = useTranslations("upload.documents");
  const { n } = useNumbers();
  const stateOf = useDocumentState();
  const documents = draft?.documents ?? [];
  const picture = analysisPicture(draft);
  // The dots sort themselves again whenever a reading's targets arrive.
  const arrived = documents.filter((d) => d.state === "read").length + (draft?.btr ? 1 : 0);
  return (
    <aside className="brief-builder">
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
      <fieldset className="brief-builder-group">
        <legend>{t("analysis")}</legend>
        <DotCanvas
          className="up-picture"
          unit={1}
          entrance="mixed"
          replay={arrived}
          groups={picture.map((g) => ({
            key: g.key,
            count: g.count,
            color: g.kind === "document" ? colors[g.index] : g.kind === "actions" ? INK.muted : INK.none,
            tip:
              g.kind === "document"
                ? t("pictureDocument", { name: g.name, count: g.count })
                : g.kind === "actions"
                  ? td("btrActions", { count: g.count })
                  : t("pictureFree", { count: g.count }),
          }))}
        />
        <dl className="up-figures">
          <dt>{counts.actions > 0 ? t("targetsAndActions") : t("targets")}</dt>
          <dd>{t("of", { count: counts.items, max: MAX_ITEMS })}</dd>
          {counts.pairs > 0 && (
            <>
              <dt>{t("pairs")}</dt>
              <dd>{n(counts.pairs)}</dd>
            </>
          )}
        </dl>
      </fieldset>
    </aside>
  );
}
