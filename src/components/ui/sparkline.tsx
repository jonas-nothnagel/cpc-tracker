/**
 * Sparkline — a tiny inline SVG trend for a short yearly series (2 to ~30
 * points). Plain SVG on purpose: the briefing draws nothing with a chart
 * library, and a sparkline needs no axes, tooltip or legend. The word that
 * says what the line does (rising, unchanged, ...) belongs next to it in text,
 * so colour is never the only channel (DESIGN.md, Legible-Axis rule).
 *
 * Lifted verbatim from viz/implementation-coverage.tsx so the NR7 indicator
 * cards and the BTR emissions rows draw the same shape.
 */

export interface SparklinePoint {
  year: string;
  value: number;
}

export function Sparkline({
  data,
  color,
  width = 64,
  height = 20,
  title,
}: {
  data: SparklinePoint[];
  color: string;
  width?: number;
  height?: number;
  /** Accessible name; when omitted the SVG is decorative and hidden. */
  title?: string;
}) {
  if (data.length < 2) return <div style={{ width, height }} />;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((d.value - min) / range) * (height - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  return (
    <svg
      width={width}
      height={height}
      className="shrink-0"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <polygon points={areaPoints} fill={color} opacity={0.1} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
