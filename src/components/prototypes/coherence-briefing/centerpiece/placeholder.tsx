"use client";

/**
 * Shared "coming soon" card used by the three non-wheel centerpiece variants
 * during Phase A. Keeps the variant picker live so the team can see the slate
 * of options without being able to switch into a half-built visual.
 */

export function ComingSoonPlaceholder({
  name,
  tagline,
}: {
  name: string;
  tagline: string;
}) {
  return (
    <div className="w-full flex items-center justify-center" style={{ minHeight: 480 }}>
      <div
        className="max-w-md w-full mx-auto text-center rounded-md border border-dashed border-gray-300 px-8 py-12"
        style={{ backgroundColor: "rgba(255,255,255,0.5)" }}
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-3">
          Variant in development
        </p>
        <h3 className="text-xl font-medium text-[var(--undp-black)] mb-2">
          {name}
        </h3>
        <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
          {tagline}
        </p>
        <p className="mt-6 text-xs text-[var(--undp-gray)]">
          Ships in Phase B for side-by-side comparison.
        </p>
      </div>
    </div>
  );
}
