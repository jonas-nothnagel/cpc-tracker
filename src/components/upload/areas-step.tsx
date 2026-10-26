"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { lensTooltip } from "@/components/brief/lens-tooltip";
import type { LensId } from "@/lib/brief/source";
import { OWN_AREA_LIMITS, ownLensProblem, parseAreas, type OwnLensInput } from "@/lib/upload/own-areas";
import type { Draft, DraftChange } from "@/lib/upload/types";

/** The published policy areas every analysis reads, by their brief names. */
const PUBLISHED: LensId[] = ["globe", "ipcc", "gga", "hr"];

type Lens = { name: string; source: string; areas: { name: string; description: string }[] };

const EMPTY_AREA = { name: "", description: "" };

function asLens(lens: OwnLensInput | null): Lens | null {
  return lens ? { name: lens.name, source: lens.source ?? "", areas: lens.areas.map((a) => ({ ...a })) } : null;
}

/** The third step: the policy areas every analysis reads, and the upload's
 *  own, typed or pasted from a spreadsheet. */
export function AreasStep({
  draft,
  onChange,
  onContinue,
}: {
  draft: Draft;
  onChange: (change: DraftChange) => void;
  onContinue: () => void;
}) {
  const t = useTranslations("upload.areas");
  const tl = useTranslations("briefing.lens");
  const [lens, setLens] = useState<Lens | null>(() => asLens(draft.ownLens));
  const [touched, setTouched] = useState(!!draft.ownLens);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  const L = OWN_AREA_LIMITS;

  const send = (next: Lens | null) => {
    setTouched(true);
    onChange({ op: "ownLens", value: next });
  };
  const edit = (next: Lens) => setLens(next);
  const setArea = (i: number, field: "name" | "description", value: string) =>
    lens && edit({ ...lens, areas: lens.areas.map((a, j) => (j === i ? { ...a, [field]: value } : a)) });

  const problem = lens && touched ? ownLensProblem(lens) : null;
  const problemText = problem
    ? problem.code === "description" || problem.code === "duplicate"
      ? t(`problems.${problem.code}`, { area: problem.area ?? "" })
      : t(`problems.${problem.code}`)
    : null;

  return (
    <section aria-labelledby="up-step-title">
      <h2 id="up-step-title" className="up-title">
        {t("title")}
      </h2>
      <ul className="up-lenses">
        {PUBLISHED.map((id) => (
          <li key={id} className="up-lens" title={lensTooltip({ id }, (key) => tl(key))}>
            {tl(id)}
          </li>
        ))}
      </ul>

      {!lens ? (
        <div className="up-more">
          <button type="button" className="brief-button-quiet" onClick={() => edit({ name: "", source: "", areas: [EMPTY_AREA] })}>
            {t("add")}
          </button>
        </div>
      ) : (
        <div className="up-own" role="group" aria-label={t("add")}>
          <div className="up-own-fields">
            <div className="up-field">
              <label htmlFor="up-own-name">{t("name")}</label>
              <input
                id="up-own-name"
                value={lens.name}
                placeholder={t("namePlaceholder")}
                maxLength={L.name}
                onChange={(e) => edit({ ...lens, name: e.currentTarget.value })}
                onBlur={() => send(lens)}
              />
            </div>
            <div className="up-field">
              <label htmlFor="up-own-source">{t("source")}</label>
              <input
                id="up-own-source"
                value={lens.source}
                maxLength={L.source}
                onChange={(e) => edit({ ...lens, source: e.currentTarget.value })}
                onBlur={() => send(lens)}
              />
            </div>
          </div>
          <div className="up-areas">
            <span className="up-areas-head" aria-hidden="true">
              {t("area")}
            </span>
            <span className="up-areas-head" aria-hidden="true">
              {t("description")}
            </span>
            <span aria-hidden="true" />
            {lens.areas.map((a, i) => (
              <div key={i} className="up-area">
                <input
                  className="up-inline"
                  aria-label={t("areaN", { n: i + 1 })}
                  value={a.name}
                  maxLength={L.areaName}
                  onChange={(e) => setArea(i, "name", e.currentTarget.value)}
                  onBlur={() => send(lens)}
                />
                <textarea
                  className="up-inline"
                  aria-label={t("descriptionN", { n: i + 1 })}
                  value={a.description}
                  rows={1}
                  maxLength={L.description}
                  onChange={(e) => setArea(i, "description", e.currentTarget.value)}
                  onBlur={() => send(lens)}
                />
                <button
                  type="button"
                  className="brief-button-quiet"
                  onClick={() => {
                    const next = { ...lens, areas: lens.areas.filter((_, j) => j !== i) };
                    edit(next);
                    send(next);
                  }}
                >
                  {t("removeArea")}
                </button>
              </div>
            ))}
          </div>
          {problemText && <p className="up-line up-over">{problemText}</p>}
          <div className="up-own-tools">
            {lens.areas.length < L.areas && (
              <button type="button" className="brief-button-quiet" onClick={() => edit({ ...lens, areas: [...lens.areas, EMPTY_AREA] })}>
                {t("addArea")}
              </button>
            )}
            <button type="button" className="brief-button-quiet" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>
              {t("paste")}
            </button>
            <button
              type="button"
              className="brief-button-quiet"
              onClick={() => {
                setLens(null);
                send(null);
              }}
            >
              {t("remove")}
            </button>
          </div>
          {pasting && (
            <div className="up-paste">
              <textarea
                className="up-box"
                aria-label={t("pasteLabel")}
                placeholder={t("pasteLabel")}
                rows={4}
                value={pasted}
                onChange={(e) => setPasted(e.currentTarget.value)}
              />
              <button
                type="button"
                className="brief-button-quiet"
                disabled={!pasted.trim()}
                onClick={() => {
                  const kept = lens.areas.filter((a) => a.name.trim() || a.description.trim());
                  const next = { ...lens, areas: [...kept, ...parseAreas(pasted)].slice(0, L.areas) };
                  edit(next);
                  send(next);
                  setPasted("");
                  setPasting(false);
                }}
              >
                {t("pasteAdd")}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="up-actions">
        <button type="button" className="brief-button-primary" onClick={onContinue}>
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
