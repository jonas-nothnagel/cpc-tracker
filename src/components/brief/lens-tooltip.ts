import type { BriefLens, LensId } from "@/lib/brief/source";

/** The `briefing.lens` key of a global lens's explanation, where it has one. */
export function lensTooltipKey(id: LensId): "ggaTooltip" | "hrTooltip" | null {
  return id === "gga" ? "ggaTooltip" : id === "hr" ? "hrTooltip" : null;
}

/** A lens's explanation, the same in the menu, the policy areas' choice and the
 *  ring: a country's own lens names its source itself (from its taxonomy
 *  file), a global lens through the catalog. */
export function lensTooltip(
  lens: Pick<BriefLens, "id" | "tooltip">,
  tl: (key: "ggaTooltip" | "hrTooltip") => string,
): string | undefined {
  if (lens.tooltip) return lens.tooltip;
  const key = lensTooltipKey(lens.id);
  return key ? tl(key) : undefined;
}
