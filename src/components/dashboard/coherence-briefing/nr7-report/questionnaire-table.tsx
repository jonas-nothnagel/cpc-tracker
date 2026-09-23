"use client";

/**
 * QuestionnaireTable — the GBF binary-indicator answers for one national
 * target, as the country recorded them. Scale answers get the four words;
 * enum and free-text answers are shown as recorded (API codes split into
 * words, never rewritten) under their own heading.
 */

import { useTranslations } from "next-intl";
import { ANSWER_COLORS, type AnswerKey } from "./nr7-colors";
import { humaniseAnswerCode } from "./nr7-self-report";
import type { Nr7QuestionnaireAnswer } from "@/types";

const KEY_OF: Record<NonNullable<Nr7QuestionnaireAnswer["responseValue"]>, AnswerKey> = {
  yes: "yes",
  partially: "partially",
  under_development: "underDevelopment",
  no: "no",
};

export function useAnswerLabels(): Record<AnswerKey, string> {
  const t = useTranslations("briefing.nr7Report.answers");
  return {
    yes: t("yes"),
    partially: t("partially"),
    underDevelopment: t("underDevelopment"),
    no: t("no"),
  };
}

export function QuestionnaireTable({
  scale,
  other,
}: {
  scale: Nr7QuestionnaireAnswer[];
  other: Nr7QuestionnaireAnswer[];
}) {
  const t = useTranslations("briefing.nr7Report.targets.expand");
  const labels = useAnswerLabels();
  return (
    <div className="space-y-3">
      {scale.length > 0 && (
        <table className="w-full text-caption">
          <thead>
            <tr className="text-left text-[var(--undp-gray)]">
              <th scope="col" className="font-medium pb-1 pr-2 w-14">
                {t("questionNumber")}
              </th>
              <th scope="col" className="font-medium pb-1 pr-2">
                {t("question")}
              </th>
              <th scope="col" className="font-medium pb-1 whitespace-nowrap">
                {t("answer")}
              </th>
            </tr>
          </thead>
          <tbody className="align-top">
            {scale.map((a) => {
              const key = a.responseValue ? KEY_OF[a.responseValue] : null;
              return (
                <tr key={`${a.indicatorCode}-${a.questionNumber}`} className="border-t border-line-soft">
                  <td className="py-1.5 pr-2 tabular-nums text-[var(--undp-gray)]">{a.questionNumber}</td>
                  <td className="py-1.5 pr-2 text-[var(--undp-black)] leading-snug">
                    {a.questionTitle ?? t("questionUnnamed", { n: a.questionNumber })}
                  </td>
                  <td className="py-1.5 whitespace-nowrap">
                    {key && (
                      <span
                        aria-hidden="true"
                        className="inline-block w-2 h-2 rounded-sm align-middle mr-1.5"
                        style={{ backgroundColor: ANSWER_COLORS[key] }}
                      />
                    )}
                    <span className="text-[var(--undp-black)] font-medium">
                      {key ? labels[key] : a.response}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {other.length > 0 && (
        <div>
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
            {t("otherAnswers")}
          </p>
          <ul className="space-y-1.5">
            {other.map((a) => (
              <li key={`${a.indicatorCode}-${a.questionNumber}`} className="text-caption leading-snug">
                <span className="text-[var(--undp-gray)] tabular-nums mr-1.5">{a.questionNumber}</span>
                <span className="text-[var(--undp-black)]">
                  {a.questionTitle ?? t("questionUnnamed", { n: a.questionNumber })}
                </span>
                <span className="block text-[var(--undp-black)] italic mt-0.5">
                  “{humaniseAnswerCode(a.response)}”
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
