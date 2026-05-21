"use client";

/**
 * The four narrative scenes that surround the centerpiece in the findings-first
 * briefing. The centerpiece (Scene 4) lives in `centerpiece/index.tsx` because
 * it dispatches between multiple visualisation variants.
 *
 * Copy is hardcoded English prose plus data-driven counts. No LLM text. Per
 * guardrails:
 *   - no em dashes (commas, semicolons, periods only)
 *   - hedged language on the verdict; never prescriptive
 *   - numbers always trace to the data passed in
 */

import { ALIGNMENT_COLORS } from "@/lib/utils";
import { getDocMediumLabel } from "@/lib/utils";
import type {
  HeadlineVerdict,
  FaultLine,
} from "@/lib/coherence-briefing";
import type { CountryConfig } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

// ─── Scene 1: Hero ──────────────────────────────────────────────────

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
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-6">
        Policy coherence briefing
      </p>
      <h1
        className="text-[var(--undp-black)] leading-[1.05] font-medium"
        style={{
          fontFamily: HEADLINE_SERIF,
          fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
          letterSpacing: "-0.015em",
        }}
      >
        Are {countryName}&rsquo;s policies pulling in the same direction?
      </h1>
      <p className="mt-8 text-base md:text-lg text-[var(--undp-gray)] leading-relaxed">
        {docCount} {docCount === 1 ? "document" : "documents"},{" "}
        {targetCount.toLocaleString()} targets,{" "}
        {pairCount.toLocaleString()} pairwise comparisons. The next few minutes
        walk you through what the dataset is saying.
      </p>
      <p className="mt-10 text-xs text-[var(--undp-gray)] flex items-center gap-2">
        <span aria-hidden="true">↓</span>
        Scroll to begin
      </p>
    </div>
  );
}

// ─── Scene 2: Primer ────────────────────────────────────────────────

/**
 * Teach the reader what a "pair" is by showing one verified aligned pair and
 * one verified tension pair, side by side. Picks come from the data via
 * `pickPrimerExamples`, so the wording is always real.
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
        className="text-2xl md:text-3xl text-[var(--undp-black)] font-medium leading-snug mb-3"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        First, a small vocabulary.
      </h2>
      <p className="text-[var(--undp-gray)] leading-relaxed mb-10">
        Every comparison in this dataset is a pair: two targets, drawn from
        two policy documents, and a verdict on whether they support each
        other or pull against each other.
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        <PrimerCard
          kind="aligned"
          example={aligned}
          countryConfig={countryConfig}
          heading="Two targets can support each other."
          subhead="The verdict reads as alignment."
        />
        <PrimerCard
          kind="tension"
          example={tension}
          countryConfig={countryConfig}
          heading="Or pull against each other."
          subhead="Flagged for human review as a possible conflict."
        />
      </div>

      <p className="mt-10 text-sm text-[var(--undp-gray)] leading-relaxed">
        Every pair in this briefing was scored individually. The next section
        shows what happens when you look at all of them at once.
      </p>
    </div>
  );
}

function PrimerCard({
  kind,
  example,
  countryConfig,
  heading,
  subhead,
}: {
  kind: "aligned" | "tension";
  example: FaultLine | null;
  countryConfig: CountryConfig | null;
  heading: string;
  subhead: string;
}) {
  const color =
    kind === "aligned" ? ALIGNMENT_COLORS.high : ALIGNMENT_COLORS.possible_conflict;
  if (!example) {
    return (
      <div className="rounded-md border border-gray-200 bg-white/60 p-5">
        <p className="text-sm font-medium text-[var(--undp-black)] mb-2">
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
    <div className="rounded-md border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-[var(--undp-black)] mb-1">
        {heading}
      </p>
      <p className="text-xs text-[var(--undp-gray)] mb-5">{subhead}</p>
      <div className="space-y-4">
        <TargetSnippet docLabel={labelA} sourceLabel={targetA.sourceLabel} text={targetA.text} />
        <div className="flex items-center gap-3 pl-1">
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
        <TargetSnippet docLabel={labelB} sourceLabel={targetB.sourceLabel} text={targetB.text} />
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
        className="text-sm text-[var(--undp-black)] leading-snug overflow-hidden"
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

// ─── Scene 3: Build-up prelude ──────────────────────────────────────

export function BuildupPreludeScene({ targetCount }: { targetCount: number }) {
  return (
    <div className="text-center">
      <h2
        className="text-3xl md:text-4xl text-[var(--undp-black)] font-medium leading-tight mb-6"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        Now, all {targetCount.toLocaleString()} targets.
      </h2>
      <p className="text-[var(--undp-gray)] text-base md:text-lg leading-relaxed">
        Watch what happens when the whole policy set sits in one frame.
      </p>
      <p className="mt-12 text-xs text-[var(--undp-gray)] flex items-center justify-center gap-2">
        <span aria-hidden="true">↓</span>
        Keep scrolling
      </p>
    </div>
  );
}

// ─── Scene 5: Verdict + handoff ─────────────────────────────────────

export function VerdictScene({
  verdict,
  faultLineCount,
  onJumpToFaultLines,
  onJumpToSectors,
}: {
  verdict: HeadlineVerdict;
  faultLineCount: number;
  onJumpToFaultLines: () => void;
  onJumpToSectors: () => void;
}) {
  const tensionPct = Math.round(verdict.tensionShare * 100);
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-6">
        Verdict
      </p>
      <h2
        className="text-3xl md:text-5xl text-[var(--undp-black)] font-medium leading-tight"
        style={{ fontFamily: HEADLINE_SERIF, letterSpacing: "-0.015em" }}
      >
        {verdict.headline}
      </h2>
      <p className="mt-6 text-base md:text-lg text-[var(--undp-gray)] leading-relaxed">
        Of {(verdict.alignmentPairs + verdict.tensionPairs).toLocaleString()}{" "}
        scored pairs, {verdict.alignmentPairs.toLocaleString()} show medium or
        strong alignment, while {verdict.tensionPairs.toLocaleString()}{" "}
        ({tensionPct}%) are flagged for review as possible misalignments or
        conflicts.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onJumpToFaultLines}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium text-white bg-[var(--undp-black)] hover:bg-[var(--undp-blue-dark)] transition-colors"
        >
          See the {faultLineCount} biggest fault lines
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          onClick={onJumpToSectors}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium border border-[var(--undp-black)]/40 text-[var(--undp-black)] hover:border-[var(--undp-black)] transition-colors"
        >
          Sector by sector
          <span aria-hidden="true">↓</span>
        </button>
      </div>

      <p className="mt-12 text-xs text-[var(--undp-gray)] leading-relaxed max-w-md">
        This is a brainstorming prototype. Verdict bucketing thresholds are
        Phase A heuristics and will tighten as more countries are added.
      </p>
    </div>
  );
}
