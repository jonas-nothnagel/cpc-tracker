"use client";

import { useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { isValidCode } from "@/lib/upload/documents";
import type { ServiceFacts } from "@/lib/upload/service";
import type { Draft, DraftChange, DraftDocument } from "@/lib/upload/types";
import { useDocumentState } from "./document-state";

const ACCEPT = ".pdf,.docx,.txt,.csv,.tsv,.xlsx,.xls";

/** Enter leaves a field, so its value is sent like a click elsewhere. */
function enterLeaves(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") e.currentTarget.blur();
}

/** The first step: the country, the files, and the documents they became. */
export function DocumentsStep({
  draft,
  country,
  locked,
  colors,
  facts,
  adding,
  onCountry,
  onFiles,
  onChange,
  onRead,
  onContinue,
}: {
  draft: Draft | null;
  country: string;
  locked: boolean;
  colors: string[];
  facts: ServiceFacts;
  adding: boolean;
  onCountry: (value: string) => void;
  onFiles: (files: File[]) => void;
  onChange: (change: DraftChange) => void;
  onRead: () => void;
  onContinue: () => void;
}) {
  const t = useTranslations("upload.documents");
  const stateOf = useDocumentState();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const documents = draft?.documents ?? [];
  const unread = documents.some((d) => d.state === "added" || d.state === "failed");
  const anyTargets = documents.some((d) => d.state === "read" && d.targets.some((x) => !x.removed));

  const commitName = (doc: DraftDocument) => (e: FocusEvent<HTMLInputElement>) => {
    const name = e.currentTarget.value.trim();
    if (name && name !== doc.name) onChange({ op: "document", id: doc.id, name });
    else e.currentTarget.value = doc.name;
  };
  const commitCode = (doc: DraftDocument) => (e: FocusEvent<HTMLInputElement>) => {
    const code = e.currentTarget.value.trim();
    const taken = documents.some((d) => d.id !== doc.id && d.code.toUpperCase() === code.toUpperCase());
    if (code !== doc.code && isValidCode(code) && !taken) onChange({ op: "document", id: doc.id, code });
    else e.currentTarget.value = doc.code;
  };

  return (
    <section aria-labelledby="up-step-title">
      <h2 id="up-step-title" className="up-title">
        {t("title")}
      </h2>

      <div className="up-field">
        {locked ? (
          <>
            <p className="up-field-name">{t("country")}</p>
            <p>{country}</p>
          </>
        ) : (
          <>
            <label htmlFor="up-country">{t("country")}</label>
            <input
            id="up-country"
            key={country}
            defaultValue={country}
            maxLength={80}
            autoComplete="country-name"
            onBlur={(e) => {
              const value = e.currentTarget.value.trim();
              if (value !== country) onCountry(value);
            }}
            onKeyDown={enterLeaves}
          />
          </>
        )}
      </div>

      <div
        className="up-drop"
        data-active={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <span>{t("drop")}</span>
        <button type="button" className="brief-button-quiet" disabled={adding} onClick={() => input.current?.click()}>
          {t("choose")}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={ACCEPT}
          onChange={(e) => {
            onFiles(Array.from(e.currentTarget.files ?? []));
            e.currentTarget.value = "";
          }}
        />
      </div>

      {(documents.length > 0 || draft?.btr) && (
        <ul className="up-docs">
          {documents.map((doc, i) => (
            <li key={doc.id} className="up-doc">
              <span className="up-swatch" style={{ background: colors[i] }} aria-hidden="true" />
              <input
                key={`name:${doc.name}`}
                className="up-inline up-doc-name"
                aria-label={t("nameLabel", { file: doc.fileName })}
                defaultValue={doc.name}
                maxLength={120}
                onBlur={commitName(doc)}
                onKeyDown={enterLeaves}
              />
              <input
                key={`code:${doc.code}`}
                className="up-inline up-doc-code"
                aria-label={t("codeLabel", { name: doc.name })}
                defaultValue={doc.code}
                maxLength={12}
                size={6}
                spellCheck={false}
                onBlur={commitCode(doc)}
                onKeyDown={enterLeaves}
              />
              <span className="up-doc-state" aria-live="polite">
                {stateOf(doc)}
              </span>
              <span className="up-doc-tools">
                {doc.state === "failed" && (
                  <button type="button" className="brief-button-quiet" onClick={onRead}>
                    {t("readAgain")}
                  </button>
                )}
                <button
                  type="button"
                  className="brief-button-quiet"
                  onClick={() => onChange({ op: "removeDocument", id: doc.id })}
                >
                  {t("remove")}
                </button>
              </span>
            </li>
          ))}
          {draft?.btr && (
            <li className="up-doc">
              <span aria-hidden="true" />
              <span className="up-doc-plain">{t("btr")}</span>
              <span className="up-doc-state">{t("btrActions", { count: draft.btr.actions })}</span>
              <span className="up-doc-tools">
                <button type="button" className="brief-button-quiet" onClick={() => onChange({ op: "removeBtr" })}>
                  {t("remove")}
                </button>
              </span>
            </li>
          )}
        </ul>
      )}

      {unread && (
        <p className="up-notice">
          {t("notice", { model: facts.model, provider: facts.provider })}
          {facts.publicOnly && ` ${t("publicOnly")}`}
        </p>
      )}

      {documents.length > 0 && (
        <div className="up-actions">
          {unread ? (
            <button type="button" className="brief-button-primary" onClick={onRead}>
              {t("read")}
            </button>
          ) : (
            <button type="button" className="brief-button-primary" disabled={!anyTargets} onClick={onContinue}>
              {t("continue")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
