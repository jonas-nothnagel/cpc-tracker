/** Segmented-control pill grammar shared by the workbench top bar and its controls strip. */
export function pillClass(active: boolean, activeBg: string, size: "sm" | "md" = "sm"): string {
  const pad = size === "md" ? "px-4 py-2 text-body" : "px-3.5 py-1.5 text-data";
  return `cursor-pointer whitespace-nowrap rounded-full ${pad} font-medium transition-colors ${
    active ? `${activeBg} text-white` : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
  }`;
}

/** The pill container: a hairline ring around the segments. */
export const SEGMENT_CLASS =
  "inline-flex items-center gap-0.5 rounded-full border border-line-strong bg-white p-[3px]";
