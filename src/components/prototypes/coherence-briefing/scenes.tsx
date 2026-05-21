"use client";

/**
 * Narrative scenes that surround the centerpiece. The centerpiece itself (the
 * tour of variants) lives in `centerpiece/index.tsx`.
 *
 * Copy is hardcoded English prose plus data-driven counts. No LLM text.
 * Per guardrails:
 *   - no em dashes (commas, semicolons, periods only)
 *   - hedged language on the verdict; never prescriptive
 *   - numbers always trace to the data passed in
 */

import { ALIGNMENT_COLORS, getDocMediumLabel } from "@/lib/utils";
import type { HeadlineVerdict, FaultLine } from "@/lib/coherence-briefing";
import type { CountryConfig } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

// ─── Scene 0: Hero — both questions in focus ────────────────────────

export function HeroScene({
  countryName,
  docCount,
  targetCount,
  pairCount,
}: {
  countryName: string;
  docCount: number;
  targetCount: number;
  pairCount: number;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-5">
        Policy coherence briefing  ·  {countryName}
      </p>
      <h1
        className="text-[var(--undp-black)] leading-[1.05] font-medium mb-10"
        style={{
          fontFamily: HEADLINE_SERIF,
          fontSize: "clamp(2rem, 4.4vw, 3.25rem)",
          letterSpacing: "-0.015em",
        }}
      >
        A briefing in two questions.
      </h1>

      <ol className="space-y-5 mb-10">
        <QuestionRow
          tag="Q1"
          text="Are these policies pulling in the same direction?"
        />
        <QuestionRow
          tag="Q2"
          text="And where are the biggest gaps, sector by sector?"
        />
      </ol>

      <p className="text-sm md:text-base text-[var(--undp-gray)] leading-relaxed">
        {docCount} {docCount === 1 ? "document" : "documents"},{" "}
        {targetCount.toLocaleString()} targets,{" "}
        {pairCount.toLocaleString()} pairwise comparisons. Scroll through
        both, then dig into any sector.
      </p>
      <p className="mt-8 text-[11px] text-[var(--undp-gray)] flex items-center gap-2">
        <span aria-hidden="true">↓</span>
        Begin
      </p>
    </div>
  );
}

function QuestionRow({ tag, text }: { tag: string; text: string }) {
  return (
    <li className="flex items-start gap-5">
      <span
        className="text-xs font-medium tabular-nums tracking-wider text-[var(--undp-gray)] pt-2 select-none"
        aria-hidden="true"
      >
        {tag}
      </span>
      <span
        className="text-2xl md:text-3xl text-[var(--undp-black)] leading-snug"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {text}
      </span>
    </li>
  );
}

// ─── Scene 1: Primer ────────────────────────────────────────────────

/**
 * Two real pairs side by side: one alignment, one tension. Teaches the
 * reader what "a pair" means before the centerpiece floods the screen
 * with hundreds of them.
 */
export function PrimerScene({
  aligned,
  tension,
  countryConfig,
}: {
  aligned: FaultLine | null;
  tension: FaultLine | null;
  countryConfig: CountryConfig | null;
}) {
  return (
    <div>
      <h2
        className="text-xl md:text-2xl text-[var(--undp-black)] font-medium leading-snug mb-2"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        First, what we mean by a pair.
      </h2>
      <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-7 max-w-xl">
        Every comparison is two targets, drawn from two policy documents,
        with a verdict on whether they support each other or pull against
        each other.
      </p>

      <div className="grid md:grid-cols-2 gap-4">
        <PrimerCard
          kind="aligned"
          example={aligned}
          countryConfig={countryConfig}
          heading="Targets that support each other."
        />
        <PrimerCard
          kind="tension"
          example={tension}
          countryConfig={countryConfig}
          heading="Targets that pull against each other."
        />
      </div>
    </div>
  );
}

function PrimerCard({
  kind,
  example,
  countryConfig,
  heading,
}: {
  kind: "aligned" | "tension";
  example: FaultLine | null;
  countryConfig: CountryConfig | null;
  heading: string;
}) {
  const color =
    kind === "aligned" ? ALIGNMENT_COLORS.high : ALIGNMENT_COLORS.possible_conflict;
  if (!example) {
    return (
      <div className="rounded-md border border-gray-200 bg-white/60 p-4">
        <p className="text-sm font-medium text-[var(--undp-black)] mb-1">
          {heading}
        </p>
        <p className="text-xs text-[var(--undp-gray)]">
          No {kind === "aligned" ? "strong alignment" : "tension"} example
          available in this dataset.
        </p>
      </div>
    );
  }
  const { targetA, targetB } = example;
  const labelA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const labelB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <div className="rounded-md border border-gray-200 bg-white p-4">
      <p className="text-sm font-medium text-[var(--undp-black)] mb-3">
        {heading}
      </p>
      <div className="space-y-2.5">
        <TargetSnippet
          docLabel={labelA}
          sourceLabel={targetA.sourceLabel}
          text={targetA.text}
        />
        <div className="flex items-center gap-2 pl-1">
          <span
            aria-hidden="true"
            className="block h-px flex-1"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            }}
          />
          <span
            className="text-[10px] uppercase tracking-wider font-medium"
            style={{ color }}
          >
            {kind === "aligned" ? "supports" : "in tension with"}
          </span>
          <span
            aria-hidden="true"
            className="block h-px flex-1"
            style={{
              backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            }}
          />
        </div>
        <TargetSnippet
          docLabel={labelB}
          sourceLabel={targetB.sourceLabel}
          text={targetB.text}
        />
      </div>
    </div>
  );
}

function TargetSnippet({
  docLabel,
  sourceLabel,
  text,
}: {
  docLabel: string;
  sourceLabel: string;
  text: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1">
        {docLabel} · {sourceLabel}
      </p>
      <p
        className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ─── Scene 2: Centerpiece intro (lives ABOVE the centerpiece) ───────

export function CenterpieceIntroBlock({
  targetCount,
  countryName,
}: {
  targetCount: number;
  countryName: string;
}) {
  return (
    <div className="max-w-[680px] mx-auto px-6 mb-8 text-center">
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
        Question 1
      </p>
      <h2
        className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-tight mb-2"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        All {targetCount.toLocaleString()} {countryName} targets, in one frame.
      </h2>
      <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
        Each connecting line is one pair. Green where the two targets
        support each other; red where the pipeline flagged a tension.
        Switch visuals via the chips below.
      </p>
    </div>
  );
}

// ─── Scene 3: Verdict + hinge to Q2 ─────────────────────────────────

export function VerdictScene({
  verdict,
  topSectors,
  onContinue,
}: {
  verdict: HeadlineVerdict;
  /** Up to 3 sector names with the highest tension density, for the hinge. */
  topSectors: string[];
  onContinue: () => void;
}) {
  const tensionPct = Math.round(verdict.tensionShare * 100);
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
        Answer to question 1
      </p>
      <h2
        className="text-3xl md:text-4xl text-[var(--undp-black)] font-medium leading-tight mb-4"
        style={{ fontFamily: HEADLINE_SERIF, letterSpacing: "-0.015em" }}
      >
        {verdict.headline}
      </h2>
      <p className="text-sm md:text-base text-[var(--undp-gray)] leading-relaxed mb-10">
        Of {(verdict.alignmentPairs + verdict.tensionPairs).toLocaleString()}{" "}
        scored pairs, {verdict.alignmentPairs.toLocaleString()} show medium or
        strong alignment, while {verdict.tensionPairs.toLocaleString()}{" "}
        ({tensionPct}%) are flagged for review as possible misalignments or
        conflicts.
      </p>

      <div className="border-t border-gray-200 pt-8">
        <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-3">
          On to question 2
        </p>
        <h3
          className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-snug mb-3"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          Where do those {verdict.tensionPairs.toLocaleString()} tensions
          concentrate?
        </h3>
        {topSectors.length > 0 ? (
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-6">
            The dataset points to{" "}
            {topSectors.slice(0, 3).map((s, i, arr) => (
              <span key={s}>
                <span className="text-[var(--undp-black)] font-medium">
                  {s}
                </span>
                {i < arr.length - 1
                  ? i === arr.length - 2
                    ? ", and "
                    : ", "
                  : ""}
              </span>
            ))}
            . Click any sector below to see the pairs behind the number.
          </p>
        ) : (
          <p className="text-sm text-[var(--undp-gray)] leading-relaxed mb-6">
            The next section breaks tensions down by sector. Click any tile
            to see the pairs behind the number.
          </p>
        )}
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium text-white bg-[var(--undp-black)] hover:bg-[var(--undp-blue-dark)] transition-colors"
        >
          See the gaps, sector by sector
          <span aria-hidden="true">↓</span>
        </button>
      </div>
    </div>
  );
}
