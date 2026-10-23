import type { BriefLens, LensId } from "@/lib/brief/source";

/** The `briefing.lens` key of a lens's explanation, where the catalog has one:
 *  two global lenses, and the policy areas an upload brings when it names no
 *  source of its own. */
export function lensTooltipKey(id: LensId): "ggaTooltip" | "hrTooltip" | "ownTooltip" | null {
  return id === "gga" ? "ggaTooltip" : id === "hr" ? "hrTooltip" : id === "own" ? "ownTooltip" : null;
}

/** A lens's explanation, the same in the policy areas' choice and the ring:
 *  a country's own lens names its source itself (from its taxonomy file), a
 *  global lens through the catalog. */
export function lensTooltip(
  lens: Pick<BriefLens, "id" | "tooltip">,
  tl: (key: "ggaTooltip" | "hrTooltip" | "ownTooltip") => string,
): string | undefined {
  if (lens.tooltip) return lens.tooltip;
  const key = lensTooltipKey(lens.id);
  return key ? tl(key) : undefined;
}

/** A lens's name wherever it is shown: the policy areas an upload brings by
 *  the name they came with, every other lens from the catalog. */
export function lensName(lens: Pick<BriefLens, "id" | "name">, tl: (key: LensId) => string): string {
  return lens.name ?? tl(lens.id);
}

/** `lensName` for a lens known by its id only. */
export function lensNameOf(lenses: readonly BriefLens[], id: LensId, tl: (key: LensId) => string): string {
  return lensName(lenses.find((l) => l.id === id) ?? { id }, tl);
}
