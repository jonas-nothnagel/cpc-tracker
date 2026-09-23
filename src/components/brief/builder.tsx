"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SECTION_UNITS } from "@/lib/brief/sections";
import { SECTION_IDS, type BriefSelection, type SectionId } from "@/lib/brief/selection";
import type { BriefSource, LensId } from "@/lib/brief/source";

/**
 * The brief's controls: which documents, which policy-area lens, which
 * sections in which order. Every change re-lays the sheets at once; the page
 * count is the feedback. Screen only.
 */
export function Builder({
  source,
  selection,
  pageCount,
  onChange,
  onReset,
  onPrint,
}: {
  source: BriefSource;
  selection: BriefSelection;
  pageCount: number;
  onChange: (next: BriefSelection) => void;
  onReset: () => void;
  onPrint: () => void;
}) {
  const t = useTranslations("brief.builder");
  const ts = useTranslations("brief.sections");
  const tl = useTranslations("briefing.lens");
  const [copied, setCopied] = useState(false);

  const selectedDocs = new Set(selection.docs);
  const atMinimum = selection.docs.length <= 2;
  const toggleDoc = (id: string) => {
    const next = selectedDocs.has(id)
      ? selection.docs.filter((d) => d !== id)
      : source.documents.map((d) => d.id).filter((d) => d === id || selectedDocs.has(d));
    if (next.length < 2) return;
    onChange({ ...selection, docs: next });
  };

  const allowed = SECTION_IDS.filter((id) => id !== "areas" || source.lenses.length > 0);
  const unselected = allowed.filter((id) => !selection.sections.includes(id));
  const toggleSection = (id: SectionId) => {
    const on = selection.sections.includes(id);
    onChange({
      ...selection,
      sections: on ? selection.sections.filter((s) => s !== id) : [...selection.sections, id],
    });
  };
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= selection.sections.length) return;
    const sections = [...selection.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...selection, sections });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  };

  const lensLabel = (id: LensId) => tl(id);
  const lensTooltip = (id: LensId) =>
    id === "gga" ? tl("ggaTooltip") : id === "hr" ? tl("hrTooltip") : undefined;

  return (
    <aside className="brief-builder" data-screen-only aria-labelledby="brief-builder-title">
      <h2 id="brief-builder-title" className="brief-builder-title" tabIndex={-1}>
        {t("title")}
      </h2>

      <fieldset className="brief-builder-group">
        <legend>{t("documents")}</legend>
        {source.documents.map((d) => {
          const checked = selectedDocs.has(d.id);
          return (
            <label key={d.id} className="brief-check" title={d.full}>
              <input
                type="checkbox"
                checked={checked}
                disabled={checked && atMinimum}
                onChange={() => toggleDoc(d.id)}
              />
              <span className="brief-check-swatch" style={{ background: d.color }} aria-hidden="true" />
              <span className="brief-check-text">
                <span className="brief-check-name">{d.name}</span>
                <span className="brief-check-meta">{t("commitments", { count: d.count })}</span>
              </span>
            </label>
          );
        })}
        {atMinimum && <p className="brief-builder-hint">{t("minDocuments")}</p>}
      </fieldset>

      {source.lenses.length > 0 && (
        <fieldset className="brief-builder-group">
          <legend>{t("lens")}</legend>
          {source.lenses.map((l) => (
            <label key={l.id} className="brief-check" title={lensTooltip(l.id)}>
              <input
                type="radio"
                name="brief-lens"
                checked={selection.lens === l.id}
                onChange={() => onChange({ ...selection, lens: l.id })}
              />
              <span className="brief-check-text">
                <span className="brief-check-name">{lensLabel(l.id)}</span>
              </span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="brief-builder-group">
        <legend>{t("sections")}</legend>
        <ol className="brief-section-list">
          {selection.sections.map((id, index) => (
            <li key={id} className="brief-section-row">
              <label className="brief-check">
                <input type="checkbox" checked onChange={() => toggleSection(id)} />
                <span className="brief-check-text">
                  <span className="brief-check-name">{ts(id)}</span>
                  <span className="brief-check-meta">{t("size", { units: String(SECTION_UNITS[id]) })}</span>
                </span>
              </label>
              <span className="brief-section-move">
                <button
                  type="button"
                  aria-label={t("moveUp", { section: ts(id) })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <span aria-hidden="true">↑</span>
                </button>
                <button
                  type="button"
                  aria-label={t("moveDown", { section: ts(id) })}
                  disabled={index === selection.sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <span aria-hidden="true">↓</span>
                </button>
              </span>
            </li>
          ))}
        </ol>
        {unselected.length > 0 && (
          <ul className="brief-section-list brief-section-list-off">
            {unselected.map((id) => (
              <li key={id} className="brief-section-row">
                <label className="brief-check">
                  <input type="checkbox" checked={false} onChange={() => toggleSection(id)} />
                  <span className="brief-check-text">
                    <span className="brief-check-name">{ts(id)}</span>
                    <span className="brief-check-meta">
                      {t("size", { units: String(SECTION_UNITS[id]) })}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <div className="brief-builder-foot">
        <p className="brief-builder-pages" aria-live="polite">
          {t("pages", { count: pageCount })}
        </p>
        <button type="button" className="brief-button-primary" onClick={onPrint}>
          {t("print")}
        </button>
        <button type="button" className="brief-button-quiet" onClick={copyLink}>
          {copied ? t("copied") : t("copyLink")}
        </button>
        <button type="button" className="brief-button-quiet" onClick={onReset}>
          {t("reset")}
        </button>
      </div>
    </aside>
  );
}
