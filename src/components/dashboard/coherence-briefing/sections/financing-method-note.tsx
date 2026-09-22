"use client";

/**
 * "How these figures are produced" — the financing slide's methodology
 * disclosure, rendered in SlideFrame's disclosure slot whenever the
 * funding-target grid is shown (any BER country using the grid layout, not
 * a country-id gate).
 *
 * Factual methodology content, not an AI suggestion: it answers the four
 * questions Panama's BIOFIN focal point raised (July 2026) — what counts as
 * aligned, how multi-target programmes are treated, how to read per-target
 * figures, and how double counting is handled — in the same language the
 * copy rule mandates: alignment is between funding-line DESCRIPTIONS and
 * target TEXT, never money flowing to a target.
 */

import { useTranslations } from "next-intl";

export function FinancingMethodNote() {
  const t = useTranslations("briefing.financing.methodNote");
  const questions = ["q1", "q2", "q3", "q4"] as const;
  return (
    <details data-tour="grid-method" className="group max-w-prose">
      <summary className="cursor-pointer text-body font-medium text-[var(--undp-black)] list-none flex items-center gap-2">
        <span
          aria-hidden="true"
          className="text-[var(--undp-gray)] transition-transform group-open:rotate-90"
        >
          ›
        </span>
        {t("title")}
      </summary>
      <div className="mt-3 space-y-3 text-data leading-relaxed text-[var(--undp-black)]">
        <p>{t("intro")}</p>
        {questions.map((q) => (
          <div key={q}>
            <p className="font-medium">{t(`${q}Title`)}</p>
            <p className="text-[var(--undp-gray)]">{t(`${q}Body`)}</p>
          </div>
        ))}
        <p className="text-caption italic text-[var(--undp-gray)]">
          {t("coverageNote")}
        </p>
      </div>
    </details>
  );
}
