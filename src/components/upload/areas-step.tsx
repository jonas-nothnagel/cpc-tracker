"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { lensTooltip } from "@/components/brief/lens-tooltip";
import { OWN_AREA_LIMITS, isBlankOwnLens, ownLensProblem, parseAreas, type OwnLensInput } from "@/lib/upload/own-areas";
import type { PublishedLens } from "@/lib/upload/published-areas";
import type { Draft, DraftChange } from "@/lib/upload/types";
import { Plus } from "./plus";

type Lens = { name: string; source: string; areas: { name: string; description: string }[] };

const EMPTY_AREA = { name: "", description: "" };

function asLens(lens: OwnLensInput | null): Lens | null {
  return lens ? { name: lens.name, source: lens.source ?? "", areas: lens.areas.map((a) => ({ ...a })) } : null;
}

/** The third step: the four sets of policy areas every analysis reads, each
 *  with its areas, and the upload's own set, typed or pasted from a
 *  spreadsheet. */
export function AreasStep({
  draft,
  lenses,
  onChange,
  onContinue,
}: {
  draft: Draft;
  lenses: PublishedLens[];
  onChange: (change: DraftChange) => void;
  onContinue: () => void;
}) {
  const t = useTranslations("upload.areas");
  const tl = useTranslations("briefing.lens");
  const [lens, setLens] = useState<Lens | null>(() => asLens(draft.ownLens));
  // What a set still needs is said once something was typed and left.
  const [touched, setTouched] = useState(!!draft.ownLens);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");
  // Each set's areas stay folded until asked for.
  const [openSets, setOpenSets] = useState<Set<string>>(() => new Set());
  const L = OWN_AREA_LIMITS;
  const toggleSet = (id: string) =>
    setOpenSets((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const send = (next: Lens | null) => {
    // Left without a word in it, the set is none, and nothing is missing yet.
    if (next && isBlankOwnLens(next)) {
      onChange({ op: "ownLens", value: null });
      return;
    }
    setTouched(true);
    onChange({ op: "ownLens", value: next });
  };
  const edit = (next: Lens) => setLens(next);
  const setArea = (i: number, field: "name" | "description", value: string) =>
    lens && edit({ ...lens, areas: lens.areas.map((a, j) => (j === i ? { ...a, [field]: value } : a)) });

  const problem = lens && touched && !isBlankOwnLens(lens) ? ownLensProblem(lens) : null;
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

      <h3 className="up-sub">{t("included")}</h3>
      <div className="up-sets">
        {lenses.map(({ id, areas }) => {
          const open = openSets.has(id);
          return (
            <section key={id} className="up-set" aria-labelledby={`up-set-${id}`}>
              <h4 id={`up-set-${id}`} className="up-set-name" title={lensTooltip({ id }, (key) => tl(key))}>
                <button
                  type="button"
                  className="up-set-toggle"
                  aria-expanded={open}
                  aria-controls={`up-set-areas-${id}`}
                  onClick={() => toggleSet(id)}
                >
                  <span className="up-set-chevron" aria-hidden="true" />
                  <span>{tl(id)}</span>{" "}
                  <span className="up-set-count">{t("count", { count: areas.length })}</span>
                </button>
              </h4>
              {open && (
                <ul id={`up-set-areas-${id}`} className="up-set-areas" aria-label={tl(id)}>
                  {areas.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {!lens ? (
        <div className="up-own-add">
          <button type="button" className="brief-button-quiet" onClick={() => edit({ name: "", source: "", areas: [EMPTY_AREA] })}>
            <Plus />
            {t("add")}
          </button>
        </div>
      ) : (
        <section className="up-own" aria-labelledby="up-own-title">
          <div className="up-own-head">
            <h3 id="up-own-title" className="up-sub">
              {tl("own")}
            </h3>
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
                placeholder={t("sourcePlaceholder")}
                maxLength={L.source}
                onChange={(e) => edit({ ...lens, source: e.currentTarget.value })}
                onBlur={() => send(lens)}
              />
            </div>
          </div>
          <div className="up-areas">
            <div className="up-area up-areas-head" aria-hidden="true">
              <span>{t("area")}</span>
              <span>{t("description")}</span>
            </div>
            {lens.areas.map((a, i) => (
              <div key={i} className="up-area">
                <input
                  className="up-box"
                  aria-label={t("areaN", { n: i + 1 })}
                  placeholder={t("area")}
                  value={a.name}
                  maxLength={L.areaName}
                  onChange={(e) => setArea(i, "name", e.currentTarget.value)}
                  onBlur={() => send(lens)}
                />
                <textarea
                  className="up-box"
                  aria-label={t("descriptionN", { n: i + 1 })}
                  placeholder={t("description")}
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
          <div className="up-own-tools">
            {lens.areas.length < L.areas && (
              <button type="button" className="brief-button-quiet" onClick={() => edit({ ...lens, areas: [...lens.areas, EMPTY_AREA] })}>
                <Plus />
                {t("addArea")}
              </button>
            )}
            <button type="button" className="brief-button-quiet" aria-expanded={pasting} onClick={() => setPasting((p) => !p)}>
              {t("paste")}
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
        </section>
      )}
      {problemText && <p className="up-problem">{problemText}</p>}

      <div className="up-actions">
        <button type="button" className="brief-button-primary" onClick={onContinue}>
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
