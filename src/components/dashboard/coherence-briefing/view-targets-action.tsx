"use client";

import { useTranslations } from "next-intl";

/**
 * "15 targets →", the way into a document's own commitments.
 *
 * Sits beside "View document ↗" wherever a document's reference card appears.
 * The arrows carry the distinction: ↗ leaves for the source PDF, → stays inside
 * the tool. Renders nothing for a document with no extracted targets, so the
 * control never promises a list that would open empty.
 */
export function ViewTargetsAction({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const t = useTranslations("briefing.docTargets");
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-caption font-medium text-[var(--undp-blue)] hover:underline"
    >
      {t("action", { count })}
      <span aria-hidden="true">→</span>
    </button>
  );
}
