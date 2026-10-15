import type { CSSProperties } from "react";

/**
 * Rows of verbatim commitments drifting across the landing, more than anyone
 * could read: the scale of what the brief condenses. Each row repeats its
 * strip twice and slides by half its width, so the loop has no seam; items
 * carry their spacing as padding (not a flex gap) for the same reason.
 * Decorative: hidden from assistive technology, still under reduced motion.
 */
export function MovingText({
  lines,
  rows = 9,
  paused = false,
}: {
  lines: string[];
  rows?: number;
  paused?: boolean;
}) {
  if (lines.length === 0) return null;
  // Deal the lines out like cards so neighbouring rows show different documents.
  const strips = Array.from({ length: rows }, (_, r) => {
    const dealt = lines.filter((_, i) => i % rows === r);
    return dealt.length > 0 ? dealt : [lines[r % lines.length]];
  });
  return (
    <div className="brief-drift" aria-hidden="true" data-paused={paused ? "true" : "false"}>
      {strips.map((items, r) => (
        <div key={r} className="brief-drift-row">
          <div
            className="brief-drift-strip"
            style={
              {
                "--drift-duration": `${150 + ((r * 53) % 110)}s`,
                animationDirection: r % 2 === 1 ? "reverse" : "normal",
                animationDelay: `-${(r * 37) % 60}s`,
              } as CSSProperties
            }
          >
            {[...items, ...items].map((text, i) => (
              <span key={i} className="brief-drift-item">
                {text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
