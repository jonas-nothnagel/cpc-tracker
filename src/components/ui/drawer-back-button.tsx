"use client";

import { useTranslations } from "next-intl";

/**
 * DrawerBackButton — sticky "← Back" affordance for drawers that drill deeper
 * via useDrawerHistory.push. Render at the top of the drawer body when
 * history.canGoBack is true; the parent decides what label to show (defaults
 * to a generic "Back").
 *
 * Style matches PairDrawer's existing back row (the de facto pattern in this
 * codebase) so adopting it across drawers reads consistent.
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
      className="sticky top-0 z-20 w-full text-left text-[11px] text-[var(--undp-gray)] hover:text-[var(--undp-black)] px-6 py-2 bg-white/90 backdrop-blur border-b border-gray-200"
    >
      ← {visibleLabel}
    </button>
  );
}
