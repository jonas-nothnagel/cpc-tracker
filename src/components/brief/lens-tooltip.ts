import type { LensId } from "@/lib/brief/source";

/** The `briefing.lens` key of a lens's explanation, where it has one: the
 *  menu and the policy areas' choice show the same one. */
export function lensTooltipKey(id: LensId): "ggaTooltip" | "hrTooltip" | null {
  return id === "gga" ? "ggaTooltip" : id === "hr" ? "hrTooltip" : null;
}
