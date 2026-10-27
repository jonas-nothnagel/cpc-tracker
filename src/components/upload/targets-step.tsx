"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Draft, DraftChange, DraftDocument, DraftTarget } from "@/lib/upload/types";
import { Plus } from "./plus";

/** One target as the brief quotes it: its label, its wording, the original
 *  beside it, the passage it was read from on request, and Edit, Remove or
 *  Restore. The wording turns into a field only while it is edited. */
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
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(target.text);
  const [open, setOpen] = useState(false);
  const page = target.pageNumbers?.[0];
  const passages = (target.sources ?? []).map((s) => s.sourceText).filter(Boolean);
  const original = target.textOriginal && target.language && target.language !== "en";
  const change = (more: Partial<Extract<DraftChange, { op: "target" }>>) =>
    onChange({ op: "target", docId: doc.id, key: target.key, ...more });
  return (
    <li className="up-target" data-removed={target.removed || undefined}>
      <div className="up-target-head">
        <span className="up-target-label">{target.label}</span>
        <span className="up-target-tools">
          {page !== undefined && passages.length > 0 && (
            <button type="button" className="brief-button-quiet" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {t("page", { page })}
            </button>
          )}
          {!target.removed && !editing && (
            <button
              type="button"
              className="brief-button-quiet"
              onClick={() => {
                setText(target.text);
                setEditing(true);
              }}
            >
              {t("edit")}
            </button>
          )}
          <button type="button" className="brief-button-quiet" onClick={() => change({ removed: !target.removed })}>
            {target.removed ? t("restore") : t("remove")}
          </button>
        </span>
      </div>
      {editing ? (
        <textarea
          className="up-box up-target-edit"
          aria-label={target.label ? t("textOf", { label: target.label }) : t("text")}
          value={text}
          // The field opens where the reviewer asked for it.
          autoFocus
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setText(target.text);
              setEditing(false);
            }
          }}
          onBlur={() => {
            const next = text.trim();
            if (next && next !== target.text) change({ text: next });
            setEditing(false);
          }}
        />
      ) : (
        <p className="up-target-text">{target.text}</p>
      )}
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
        <Plus />
        {t("add")}
      </button>
    );
  }
  return (
    <div className="up-target-new">
      <input
        className="up-box up-target-new-label"
        aria-label={t("label")}
        placeholder={t("label")}
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.currentTarget.value)}
      />
      <textarea
        className="up-box up-target-edit"
        aria-label={t("text")}
        placeholder={t("text")}
        value={text}
        rows={2}
        onChange={(e) => setText(e.currentTarget.value)}
      />
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
    </div>
  );
}

/** The second step: every document's targets under its name, to check
 *  before the start. */
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
  const documents = draft.documents
    .map((doc, i) => ({ doc, color: colors[i] }))
    .filter(({ doc }) => doc.state === "read" && doc.targets.length > 0);
  if (documents.length === 0) return null;
  return (
    <section aria-labelledby="up-step-title">
      <h2 id="up-step-title" className="up-title">
        {t("title")}
      </h2>
      {documents.map(({ doc, color }) => (
        <section key={doc.id} className="up-target-doc" aria-labelledby={`up-doc-${doc.id}`}>
          <h3 id={`up-doc-${doc.id}`} className="up-doc-title">
            <span className="up-swatch" style={{ background: color }} aria-hidden="true" />
            <span>{doc.name}</span>
          </h3>
          <p className="up-doc-count">{t("kept", { count: doc.targets.filter((x) => !x.removed).length })}</p>
          <ol className="up-targets" aria-label={doc.name}>
            {doc.targets.map((target) => (
              <TargetRow key={target.key} doc={doc} target={target} onChange={onChange} />
            ))}
          </ol>
          <div className="up-more">
            <AddTarget doc={doc} onChange={onChange} />
          </div>
        </section>
      ))}
      {over > 0 && <p className="up-line up-over">{t("over", { count: over })}</p>}
      <div className="up-actions">
        <button type="button" className="brief-button-primary" onClick={onContinue}>
          {t("continue")}
        </button>
      </div>
    </section>
  );
}
