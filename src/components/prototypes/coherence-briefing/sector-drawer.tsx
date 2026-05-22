"use client";

/**
 * SectorDrawer — opens when the user clicks a sector tile on the Q2 grid.
 * Phase A2 MVP of what the plan calls "Phase C: per-sector briefing".
 *
 * Renders the top flagged pairs and top alignments touching the sector. No
 * LLM narrative, no pathway hints yet; that arrives in the full Phase C
 * drawer.
 */

import { useEffect } from "react";
import {
  ALIGNMENT_COLORS,
  ALIGNMENT_LABELS,
  getDocMediumLabel,
} from "@/lib/utils";
import { isContradiction } from "@/types";
import type { FaultLine, SectorBriefing } from "@/lib/coherence-briefing";
import type { CountryConfig, SectorSynthesis } from "@/types";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const ALIGNED_DOT_COLOR = "#196127";
const FRICTION_DOT_COLOR = "#dc2626";
const AI_DISCLAIMER =
  "AI-generated synthesis. Treat as a prompt to review, not a settled finding.";

export function SectorDrawer({
  briefing,
  sectorSynthesis,
  countryConfig,
  onClose,
}: {
  briefing: SectorBriefing | null;
  sectorSynthesis: SectorSynthesis | null;
  countryConfig: CountryConfig | null;
  onClose: () => void;
}) {
  // Close on Escape — standard drawer affordance.
  useEffect(() => {
    if (!briefing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [briefing, onClose]);

  // Lock body scroll while the drawer is open so background scroll doesn't
  // sneak through on touch devices.
  useEffect(() => {
    if (!briefing) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [briefing]);

  if (!briefing) return null;
  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        type="button"
        aria-label="Close sector view"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--undp-black)]/40 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Sector view: ${briefing.categoryName}`}
        className="relative h-full w-full sm:w-[520px] md:w-[600px] bg-white shadow-2xl overflow-y-auto"
        style={{ backgroundColor: "#fbfaf7" }}
      >
        <header className="sticky top-0 z-10 px-6 py-4 border-b border-gray-200 flex items-start justify-between gap-4 bg-white/90 backdrop-blur">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
              Sector view
            </p>
            <h3
              className="text-xl text-[var(--undp-black)] font-medium leading-tight"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {briefing.categoryName}
            </h3>
            <p className="mt-1 text-xs text-[var(--undp-gray)]">
              {briefing.targetCount} targets · {briefing.signalCount}{" "}
              scored pairs touch this sector
            </p>
            <p className="mt-3 text-[13px] leading-snug text-[var(--undp-black)]">
              {briefing.synthesisSentence}
            </p>
            {briefing.recurringHub &&
              briefing.recurringHub.flaggedPairCount >= 2 && (
                <p className="mt-2 text-[11px] text-[var(--undp-gray)] line-clamp-3">
                  <span className="uppercase tracking-wider text-[9px] font-semibold mr-1">
                    Recurs:
                  </span>
                  {briefing.recurringHub.target.sourceLabel} ·{" "}
                  {briefing.recurringHub.target.text}
                </p>
              )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--undp-gray)] hover:text-[var(--undp-black)] text-2xl leading-none"
          >
            ×
          </button>
        </header>

        <div className="px-6 py-6 space-y-8">
          {sectorSynthesis && (
            <SectorSynthesisBlock synthesis={sectorSynthesis} />
          )}

          <DrawerList
            heading="What's pulling together"
            subhead="Strongest alignments touching this sector."
            empty="No medium-or-strong alignments touch this sector."
            entries={briefing.topAlignments}
            countryConfig={countryConfig}
          />

          <DrawerList
            heading="What's pulling against the rest"
            subhead="Top flagged pairs touching this sector, severity-sorted."
            empty="No flagged pairs in this sector."
            entries={briefing.topTensions}
            countryConfig={countryConfig}
          />
        </div>
      </aside>
    </div>
  );
}

function SectorSynthesisBlock({
  synthesis,
}: {
  synthesis: SectorSynthesis;
}) {
  if (synthesis.synthesis_error !== null) {
    return (
      <section className="rounded-md border border-gray-200 bg-white p-4">
        <p className="text-xs italic text-[var(--undp-gray)]">
          Synthesis failed for this sector; raw pairs follow.
        </p>
      </section>
    );
  }
  const { storyline_name, reinforce, clash, coordination_hint } =
    synthesis.synthesis;
  const total =
    synthesis.pool_composition.primary_count +
    synthesis.pool_composition.relevant_only_count;
  const parts: string[] = [];
  if (synthesis.contradiction_types.implementation_tension) {
    parts.push(
      `implementation tension (${synthesis.contradiction_types.implementation_tension.toLocaleString()})`,
    );
  }
  if (synthesis.contradiction_types.resource_competition) {
    parts.push(
      `resource competition (${synthesis.contradiction_types.resource_competition.toLocaleString()})`,
    );
  }
  if (synthesis.contradiction_types.goal_conflict) {
    parts.push(
      `goal conflict (${synthesis.contradiction_types.goal_conflict.toLocaleString()})`,
    );
  }
  return (
    <section className="space-y-4">
      <p
        className="text-[15px] text-[var(--undp-black)] leading-snug"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        {storyline_name}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <SynthesisPanel
          label="Reinforces"
          dotColor={ALIGNED_DOT_COLOR}
          body={reinforce}
        />
        <SynthesisPanel
          label="Flagged for review"
          dotColor={FRICTION_DOT_COLOR}
          dashed
          body={clash}
        />
      </div>
      {coordination_hint && (
        <div className="border-l-2 border-gray-300 pl-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1">
            Coordination pathway
          </p>
          <p className="text-[13px] text-[var(--undp-black)] leading-relaxed italic">
            {coordination_hint}
          </p>
        </div>
      )}
      <div className="border-t border-gray-200 pt-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-2">
          Pool composition
        </p>
        <p className="text-[14px] text-[var(--undp-black)] tabular-nums font-medium">
          <span style={{ color: ALIGNMENT_COLORS.high }}>
            {synthesis.aligned_count.toLocaleString()} aligned
          </span>
          <span className="text-[var(--undp-gray)] mx-2">·</span>
          <span style={{ color: ALIGNMENT_COLORS.possible_conflict }}>
            {synthesis.flagged_count.toLocaleString()} flagged
          </span>
        </p>
        <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
          Synthesised from {total.toLocaleString()} pair
          {total === 1 ? "" : "s"} ·{" "}
          {synthesis.pool_composition.primary_count.toLocaleString()} primary +{" "}
          {synthesis.pool_composition.relevant_only_count.toLocaleString()}{" "}
          relevant
        </p>
        {parts.length > 0 && (
          <p className="mt-1 text-[11px] text-[var(--undp-gray)] tabular-nums">
            Flagged subtypes: {parts.join(", ")}
          </p>
        )}
      </div>
      <p className="text-[10px] text-[var(--undp-gray)] leading-relaxed">
        {AI_DISCLAIMER}
      </p>
    </section>
  );
}

function SynthesisPanel({
  label,
  dotColor,
  dashed,
  body,
}: {
  label: string;
  dotColor: string;
  dashed?: boolean;
  body: string;
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2">
        <span
          aria-hidden="true"
          className="block h-2.5 w-2.5 rounded-full"
          style={
            dashed
              ? { boxShadow: `inset 0 0 0 1px ${dotColor}` }
              : { backgroundColor: dotColor }
          }
        />
        <p className="text-[10px] uppercase tracking-wider text-[var(--undp-black)] font-medium">
          {label}
        </p>
      </div>
      <p className="text-[12px] text-[var(--undp-black)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}

function DrawerList({
  heading,
  subhead,
  empty,
  entries,
  countryConfig,
}: {
  heading: string;
  subhead: string;
  empty: string;
  entries: FaultLine[];
  countryConfig: CountryConfig | null;
}) {
  return (
    <section>
      <h4 className="text-sm font-medium text-[var(--undp-black)] mb-1">
        {heading}
      </h4>
      <p className="text-xs text-[var(--undp-gray)] mb-4">{subhead}</p>
      {entries.length === 0 ? (
        <p className="text-xs text-[var(--undp-gray)] italic">{empty}</p>
      ) : (
        <ol className="space-y-4">
          {entries.map((line) => (
            <DrawerRow
              key={`${line.pair.targetAId}__${line.pair.targetBId}`}
              line={line}
              countryConfig={countryConfig}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function DrawerRow({
  line,
  countryConfig,
}: {
  line: FaultLine;
  countryConfig: CountryConfig | null;
}) {
  const { targetA, targetB, pair } = line;
  const color = ALIGNMENT_COLORS[pair.alignment];
  const isContra = isContradiction(pair.alignment);
  const docA = getDocMediumLabel(countryConfig, targetA.sourceDocument);
  const docB = getDocMediumLabel(countryConfig, targetB.sourceDocument);
  return (
    <li className="rounded-md border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span
          className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${color}20`,
            color,
            border: `1px solid ${color}40`,
          }}
        >
          {ALIGNMENT_LABELS[pair.alignment]}
        </span>
        <span className="text-[10px] text-[var(--undp-gray)]">
          {docA} {targetA.sourceLabel} {isContra ? "↮" : "↔"} {docB}{" "}
          {targetB.sourceLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2">
        <p
          className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {targetA.text}
        </p>
        <p
          className="text-[13px] text-[var(--undp-black)] leading-snug overflow-hidden"
          style={{
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {targetB.text}
        </p>
      </div>
      {pair.description && (
        <p className="mt-2 text-[11px] text-[var(--undp-gray)] italic leading-relaxed line-clamp-3">
          <span className="not-italic font-medium mr-1 uppercase tracking-wider">
            AI rationale:
          </span>
          {pair.description}
        </p>
      )}
    </li>
  );
}
