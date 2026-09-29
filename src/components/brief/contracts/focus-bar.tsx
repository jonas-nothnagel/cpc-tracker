"use client";

import { useTranslations } from "next-intl";
import { NO_AREA } from "@/lib/brief/contracts/areas";
import type { Focus } from "@/lib/brief/contracts/focus";
import { NO_PLACE } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";

/**
 * The page's focus in one line under its head, in view while the page
 * scrolls: the policy area, the document and the place every view answers,
 * each with a way to let it go. "the whole record" when nothing is chosen.
 */
export function FocusBar({
  setup,
  focus,
  placeNames,
  onFocus,
}: {
  setup: ContractsSetup;
  focus: Focus;
  placeNames: Record<string, string>;
  onFocus: (patch: Partial<Focus>) => void;
}) {
  const t = useTranslations("brief.contracts");
  const lens = setup.lenses.find((l) => l.id === focus.lens);
  const parts: { key: "area" | "doc" | "place"; name: string }[] = [];
  if (focus.area !== null)
    parts.push({ key: "area", name: focus.area === NO_AREA ? t("areas.none") : (lens?.categories.find((c) => c.id === focus.area)?.name ?? focus.area) });
  if (focus.doc !== null) parts.push({ key: "doc", name: setup.documents.find((d) => d.id === focus.doc)?.name ?? focus.doc });
  if (focus.place !== null) parts.push({ key: "place", name: focus.place === NO_PLACE ? t("places.noPlace") : (placeNames[focus.place] ?? focus.place) });
  return (
    <div className="ct-focusbar" role="group" aria-label={t("focus.label")}>
      <span className="ct-focusbar-label">{t("focus.label")}</span>
      {parts.length === 0 ? (
        <span className="ct-focusbar-none">{t("focus.none")}</span>
      ) : (
        parts.map((p) => (
          <span key={p.key} className="ct-focusbar-item">
            {p.name}
            <button type="button" className="ct-focusbar-clear" aria-label={t("focus.clear", { name: p.name })} onClick={() => onFocus({ [p.key]: null })}>
              ✕
            </button>
          </span>
        ))
      )}
    </div>
  );
}
