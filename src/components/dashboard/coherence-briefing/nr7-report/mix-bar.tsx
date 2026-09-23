"use client";

/**
 * MixBar — one horizontal bar split by count, with every segment named in
 * the legend (word + count), so colour is never the only channel. Markup
 * follows centerpiece/friction-type-chart.tsx.
 */

export interface MixSegment {
  key: string;
  label: string;
  count: number;
  color: string;
}

export function MixBar({
  segments,
  ariaLabel,
  height = "h-2.5",
  legend = "inline",
}: {
  segments: MixSegment[];
  ariaLabel: string;
  height?: string;
  /** "inline": one line "6 on track · 10 limited"; "none": bar only (the
   *  caller prints its own words). */
  legend?: "inline" | "none";
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const shown = segments.filter((seg) => seg.count > 0);
  let consumed = 0;
  return (
    <div>
      <div
        role="img"
        aria-label={ariaLabel}
        className={`relative ${height} rounded-sm overflow-hidden bg-gray-100`}
      >
        {total > 0 &&
          shown.map((seg) => {
            const left = (consumed / total) * 100;
            const width = (seg.count / total) * 100;
            consumed += seg.count;
            return (
              <span
                key={seg.key}
                aria-hidden="true"
                title={`${seg.label} · ${seg.count.toLocaleString("en-US")}`}
                className="absolute inset-y-0"
                style={{ left: `${left}%`, width: `${width}%`, backgroundColor: seg.color }}
              />
            );
          })}
      </div>
      {legend === "inline" && (
        <p className="mt-1.5 text-caption text-[var(--undp-gray)] leading-snug">
          {segments.map((seg, i) => (
            <span key={seg.key} className="whitespace-nowrap">
              {i > 0 && <span aria-hidden="true"> · </span>}
              <span
                aria-hidden="true"
                className="inline-block w-2 h-2 rounded-sm align-middle mr-1"
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-[var(--undp-black)] font-medium tabular-nums">
                {seg.count.toLocaleString("en-US")}
              </span>{" "}
              {seg.label}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
