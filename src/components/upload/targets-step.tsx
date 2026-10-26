"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useNumbers } from "@/components/brief/ink";
import type { Draft, DraftChange, DraftDocument, DraftTarget } from "@/lib/upload/types";

/** One target: its label, its wording to edit in place, the original beside
 *  it, the passage it was read from on request, and Remove or Restore. */
function TargetRow({
  doc,
  target,
  onChange,
}: {
  doc: DraftDocument;
  target: DraftTarget;
  onChange: (change: DraftChange) => void;
}) {
  const t = useTranslations("upload.targets");
  const [text, setText] = useState(target.text);
  const [open, setOpen] = useState(false);
  const page = target.pageNumbers?.[0];
  const passages = (target.sources ?? []).map((s) => s.sourceText).filter(Boolean);
  const original = target.textOriginal && target.language && target.language !== "en";
  const change = (more: Partial<Extract<DraftChange, { op: "target" }>>) =>
    onChange({ op: "target", docId: doc.id, key: target.key, ...more });
  return (
    <li className="up-target" data-removed={target.removed || undefined}>
      <span className="up-target-label">{target.label}</span>
      <div className="up-target-body">
        <textarea
          className="up-inline up-target-text"
          aria-label={target.label ? t("textOf", { label: target.label }) : t("text")}
          value={text}
          rows={Math.max(1, Math.ceil(text.length / 90))}
          readOnly={target.removed}
          onChange={(e) => setText(e.currentTarget.value)}
          onBlur={() => {
            const next = text.trim();
            if (next && next !== target.text) change({ text: next });
            else setText(target.text);
          }}
        />
        {original && (
          <p className="up-target-original" lang={target.language}>
            {target.textOriginal}
          </p>
        )}
        {open && passages.length > 0 && (
          <div className="up-passage">
            <span className="up-passage-head">{t("passage", { document: doc.name })}</span>
            {passages.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
      </div>
      <span className="up-target-tools">
        {page !== undefined && passages.length > 0 && (
          <button type="button" className="brief-button-quiet" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {t("page", { page })}
          </button>
        )}
        <button type="button" className="brief-button-quiet" onClick={() => change({ removed: !target.removed })}>
          {target.removed ? t("restore") : t("remove")}
        </button>
      </span>
    </li>
  );
}

/** A label and a wording typed in by the reviewer. */
function AddTarget({ doc, onChange }: { doc: DraftDocument; onChange: (change: DraftChange) => void }) {
  const t = useTranslations("upload.targets");
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button type="button" className="brief-button-quiet" onClick={() => setOpen(true)}>
        {t("add")}
      </button>
    );
  }
  return (
    <div className="up-target up-target-new">
      <input
        className="up-inline up-target-label"
        aria-label={t("label")}
        placeholder={t("label")}
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.currentTarget.value)}
      />
      <textarea
        className="up-inline up-target-text"
        aria-label={t("text")}
        placeholder={t("text")}
        value={text}
        rows={2}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <span className="up-target-tools">
        <button
          type="button"
          className="brief-button-quiet"
          disabled={!text.trim()}
          onClick={() => {
            onChange({ op: "addTarget", docId: doc.id, label: label.trim(), text: text.trim() });
            setLabel("");
            setText("");
            setOpen(false);
          }}
        >
          {t("addButton")}
        </button>
      </span>
    </div>
  );
}

/** The second step: each document's targets, to check before the start. */
export function TargetsStep({
  draft,
  colors,
  over,
  onChange,
  onContinue,
}: {
  draft: Draft;
  colors: string[];
  /** Targets and reported actions beyond the limit of 150. */
  over: number;
  onChange: (change: DraftChange) => void;
  onContinue: () => void;
}) {
  const t = useTranslations("upload.targets");
  const { n } = useNumbers();
  const documents = draft.documents
    .map((doc, i) => ({ doc, color: colors[i] }))
    .filter(({ doc }) => doc.state === "read" && doc.targets.length > 0);
  const [chosen, setChosen] = useState(documents[0]?.doc.id);
  const current = documents.find(({ doc }) => doc.id === chosen)?.doc ?? documents[0]?.doc;
  if (!current) return null;
  return (
    <section aria-labelledby="up-step-title">
      <h2 id="up-step-title" className="up-title">
        {t("title")}
      </h2>
      {documents.length > 1 && (
        <div className="up-switch" role="group" aria-label={t("title")}>
          {documents.map(({ doc, color }) => (
            <button key={doc.id} type="button" aria-pressed={doc.id === current.id} onClick={() => setChosen(doc.id)}>
              <span className="up-swatch" style={{ background: color }} aria-hidden="true" />
              {doc.name}
              <span className="up-n">{n(doc.targets.filter((x) => !x.removed).length)}</span>
            </button>
          ))}
        </div>
      )}
      <ol className="up-targets" aria-label={current.name}>
        {current.targets.map((target) => (
          <TargetRow key={`${target.key}:${target.text}`} doc={current} target={target} onChange={onChange} />
        ))}
      </ol>
      <div className="up-more">
        <AddTarget key={current.id} doc={current} onChange={onChange} />
      </div>
      {over > 0 && <p className="up-line up-over">{t("over", { count: over })}</p>}
      <div className="up-actions">
        <button type="button" className="brief-button-primary" onClick={onContinue}>
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
