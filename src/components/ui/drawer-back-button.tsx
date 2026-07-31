"use client";

import { useTranslations } from "next-intl";

/**
 * DrawerBackButton — the "← Back" row at the top of a drawer that was reached
 * by drilling down from another panel. DrawerShell renders it inside its own
 * sticky header whenever there is somewhere to go back to, which is why this
 * component carries no positioning or background of its own.
 *
 * The label is contextual ("Back to NDC ↔ NBSAP"), so a reader can tell where
 * back leads without having to remember the route they took.
 */
export function DrawerBackButton({
  onBack,
  label,
}: {
  onBack: () => void;
  /** Optional contextual label, e.g. "Back to NDC ↔ NBSAP". Falls back to a
   *  generic "Back" from the common namespace. */
  label?: string;
}) {
  const t = useTranslations("common");
  const visibleLabel = label ?? t("back");
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label={t("backAria")}
      className="w-full text-left text-caption text-[var(--undp-gray)] hover:text-[var(--undp-black)] px-6 py-2 border-b border-line transition-colors"
    >
      <span aria-hidden="true">←</span> {visibleLabel}
    </button>
  );
}
