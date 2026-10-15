"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { docCodeSegments, firstSentence } from "@/lib/brief/text";

export type DocNames = { id: string; name: string }[];

/** An AI text as written, with each document code it uses explained in a
 *  tooltip ("FSS": Food Supply and Security Measures). */
export function AiText({ text, docs }: { text: string; docs: DocNames }) {
  return (
    <>
      {docCodeSegments(text, docs).map((seg, i) =>
        typeof seg === "string" ? (
          seg
        ) : (
          <abbr key={i} title={seg.name}>
            {seg.code}
          </abbr>
        ),
      )}
    </>
  );
}

/** The AI's own confidence in a reading, as the app words it. */
export function confidenceLabel(
  tc: (key: "high" | "medium" | "low") => string,
  value?: string | null,
): string | null {
  return value === "high" || value === "medium" || value === "low" ? tc(value) : null;
}

/** An AI section's heading, with the AI's confidence beside it. */
export function AiHeading({
  label,
  confidence,
  as: Tag = "h3",
}: {
  label: string;
  confidence: string | null;
  as?: "h3" | "h4";
}) {
  return (
    <Tag className="brief-panel-h">
      {label}
      {confidence && (
        <>
          <span className="brief-panel-sep" aria-hidden="true">
            {" · "}
          </span>
          <span className="brief-panel-conf">{confidence}</span>
        </>
      )}
    </Tag>
  );
}

/** An AI paragraph's first sentence, the rest on request. */
export function FirstSentence({ text, docs = [] }: { text: string; docs?: DocNames }) {
  const t = useTranslations("brief.panel");
  const [more, setMore] = useState(false);
  const { first, rest } = firstSentence(text);
  return (
    <p className="brief-panel-text">
      <AiText text={more ? text : first} docs={docs} />
      {rest && !more && (
        <>
          {" "}
          <button type="button" className="brief-panel-more" onClick={() => setMore(true)}>
            {t("more")}
          </button>
        </>
      )}
    </p>
  );
}

/**
 * The AI explanation of one comparison: its heading with the AI's
 * confidence, the first sentence (the rest on request), then what the
 * caller adds (resources, caveats, the review control).
 */
export function Explanation({
  text,
  docs,
  confidence,
  heading = "h3",
  children,
}: {
  text: string;
  docs?: DocNames;
  confidence?: string | null;
  heading?: "h3" | "h4";
  children?: ReactNode;
}) {
  const t = useTranslations("brief.panel");
  const tc = useTranslations("labels.confidence");
  return (
    <section className="brief-cmp-ai">
      <AiHeading label={t("aiExplanation")} confidence={confidenceLabel(tc, confidence)} as={heading} />
      <FirstSentence text={text} docs={docs} />
      {children}
    </section>
  );
}
