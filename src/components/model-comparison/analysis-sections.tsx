"use client";

/**
 * Analytic sections for the model-comparison page.
 *
 * Frames each model on its own analytical terms — no model is treated
 * as ground truth. Sections cover: per-model "detection personality",
 * flagging overlap across all models, what each model uniquely flags,
 * mechanism focus, rationale character, an LLM-judged rationale sample,
 * and descriptive cross-model agreement / cost / guardrail tables.
 */

import { useCallback, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { exportRatings, setRating } from "@/lib/evaluation-api";
import type {
  AlignmentLevel,
  JudgeVerdict,
  ModelComparisonReport,
  ModelDisagreementRow,
  PairFlagDetails,
  PairRating,
  PairRatingValue,
  RatingsByCountry,
  TargetSummary,
} from "@/types";

const LABEL_DISPLAY: Record<string, { label: string; tier: string }> = {
  "gpt-5-4": { label: "GPT-5.4", tier: "flagship proprietary" },
  "gpt-5-4-mini": { label: "GPT-5.4 mini", tier: "proprietary mini" },
  "deepseek-v4-pro": { label: "DeepSeek V4 Pro", tier: "flagship OSS" },
  "llama-4-maverick-17b-128e-instruct-fp8": {
    label: "Llama 4 Maverick 17B",
    tier: "OSS mid (MoE)",
  },
};

function prettify(slug: string): string {
  return LABEL_DISPLAY[slug]?.label ?? slug;
}

function tierOf(slug: string): string {
  return LABEL_DISPLAY[slug]?.tier ?? "";
}

// Reuses the alignment palette already in use by the dashboard.
const LEVEL_COLOR: Record<AlignmentLevel, string> = {
  none: "#f3f4f6",
  low: "#fde68a",
  medium: "#86efac",
  high: "#22c55e",
  flagged: "#f87171",
};

// Distinct hues for the four canonical Mongolia slugs so side-by-side
// views (judge verdicts, unique-signal tabs) read at a glance. Falls back
// to a neutral indigo for unknown slugs.
const MODEL_COLOR: Record<string, string> = {
  "gpt-5-4": "#0468b1",
  "gpt-5-4-mini": "#0ea5e9",
  "deepseek-v4-pro": "#a855f7",
  "llama-4-maverick-17b-128e-instruct-fp8": "#f59e0b",
};

function modelColor(slug: string): string {
  return MODEL_COLOR[slug] ?? "#6366f1";
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtNumber(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// Rough USD per 1M output tokens — surfaced in the cost table only.
const APPROX_USD_PER_1M_OUTPUT: Record<string, number> = {
  "gpt-5-4": 8.0,
  "gpt-5-4-mini": 0.6,
  "deepseek-v4-pro": 1.2,
  "llama-4-maverick-17b-128e-instruct-fp8": 0.9,
};

function approxRunCost(slug: string, callCount: number | null): number | null {
  if (!callCount) return null;
  const usdPer1M = APPROX_USD_PER_1M_OUTPUT[slug];
  if (usdPer1M == null) return null;
  // Weighted-average ~200 output tokens per call across the pipeline.
  const totalOutputTokens = callCount * 200;
  return (totalOutputTokens / 1_000_000) * usdPer1M;
}

function kappaInterpretation(k: number): string {
  if (k < 0) return "worse than chance";
  if (k < 0.2) return "slight";
  if (k < 0.4) return "fair";
  if (k < 0.6) return "moderate";
  if (k < 0.8) return "substantial";
  return "almost perfect";
}

const ALIGNMENT_LEVELS_ORDER: AlignmentLevel[] = [
  "none",
  "low",
  "medium",
  "high",
  "flagged",
];

const MECHANISM_KEYS = [
  "goal_conflict",
  "resource_competition",
  "delivery_friction",
] as const;

function prettifyMechanism(key: string): string {
  if (key === "goal_conflict") return "Goal conflict";
  if (key === "resource_competition") return "Resource competition";
  if (key === "delivery_friction") return "Delivery friction";
  if (key === "unspecified") return "Unspecified";
  return key;
}

export function AnalysisSections({ report }: { report: ModelComparisonReport }) {
  return (
    <div className="space-y-10 mt-10">
      <DetectionPersonalities report={report} />
      <FlaggingOverlapSection report={report} />
      <UniqueSignalTabs report={report} />
      <MostContestedPairs
        models={report.models}
        targets={report.targets}
        disagreements={report.disagreements}
      />
      <MechanismFocus report={report} />
      <RationaleCharacterSection report={report} />
      <JudgeResults report={report} />
      <PairwiseAgreementMatrix
        models={report.models}
        agreementMatrix={report.agreementMatrix}
        kappaMatrix={report.kappaMatrix}
      />
      <VocabCompliance report={report} />
      <CostSummaryTable report={report} />
    </div>
  );
}

/** Manual evaluation tool sections (rating + precision estimation).
 *  Rendered on its own page at /mongolia/model-evaluation so the analyst
 *  view and the rating workflow each have their own focus. Shares all
 *  helpers, DisagreementRow, and TargetBlock with `AnalysisSections` —
 *  it's the same module, different entry point. */
export function EvaluationSections({
  report,
  initialRatings = {},
}: {
  report: ModelComparisonReport;
  initialRatings?: RatingsByCountry;
}) {
  const [ratings, setRatings] = useState<RatingsByCountry>(initialRatings);

  const applyRating = useCallback(
    (pairKey: string, next: PairRating | null) => {
      setRatings((prev) => {
        if (next === null) {
          const copy = { ...prev };
          delete copy[pairKey];
          return copy;
        }
        return { ...prev, [pairKey]: next };
      });
    },
    [],
  );

  return (
    <div className="space-y-10 mt-10">
      <EvaluationTutorial models={report.models} />
      <EvaluationSampleTabs
        report={report}
        ratings={ratings}
        onChangeRating={applyRating}
      />
      <ConsensusEvaluation
        report={report}
        ratings={ratings}
        onChangeRating={applyRating}
      />
    </div>
  );
}

/** A compact 4-step tutorial rendered at the top of the evaluation page.
 *  Each step shows a mini-mockup of the actual UI element the reviewer
 *  will see, so the visual language carries through to the live tool.
 *  Sticks to the existing palette (LEVEL_COLOR, MODEL_COLOR, rating
 *  button hues) so the mockups read as continuous with the real rows. */
function EvaluationTutorial({ models }: { models: string[] }) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <h2 className="text-base font-medium text-[var(--undp-black)] mb-1">
        How to complete an evaluation
      </h2>
      <p className="text-xs text-[var(--undp-gray)] mb-4 max-w-3xl">
        Each row in the samples below is one flagged policy-pair. Work
        through them in this order — the mock visuals show what
        you&apos;ll see at each step.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <TutorialStep
          number={1}
          title="Read both targets"
          caption="Two policy statements that a model flagged for potential misalignment. The source-document badge (e.g., NDC, FSS) tells you which document each came from."
        >
          <div className="flex gap-1.5">
            {(["A", "B"] as const).map((label) => (
              <div
                key={label}
                className="flex-1 bg-gray-50 border border-gray-200 rounded p-1.5"
              >
                <div className="flex items-baseline gap-1">
                  <span className="text-[8px] uppercase tracking-wide text-[var(--undp-gray)]">
                    Target {label}
                  </span>
                  <span className="text-[8px] px-1 rounded bg-blue-50 border border-blue-200 text-blue-900">
                    NDC
                  </span>
                </div>
                <div className="h-1 w-full bg-gray-300 rounded mt-1" />
                <div className="h-1 w-4/5 bg-gray-300 rounded mt-0.5" />
                <div className="h-1 w-3/5 bg-gray-300 rounded mt-0.5" />
              </div>
            ))}
          </div>
        </TutorialStep>

        <TutorialStep
          number={2}
          title="Compare model rationales"
          caption={`All ${models.length} models' verbatim reasoning, plus their flag metadata (mechanism, confidence, manageability) when they flagged. Look for substantive engagement with specific policy content — not length.`}
        >
          <div className="grid grid-cols-2 gap-1.5">
            {models.slice(0, 4).map((m) => (
              <div
                key={m}
                className="bg-white border rounded p-1.5"
                style={{
                  borderLeftColor: modelColor(m),
                  borderLeftWidth: 2,
                }}
              >
                <div className="text-[8px] font-medium text-[var(--undp-black)] truncate">
                  {prettify(m)}
                </div>
                <div className="h-1 w-full bg-gray-300 rounded mt-1" />
                <div className="h-1 w-3/4 bg-gray-300 rounded mt-0.5" />
              </div>
            ))}
          </div>
        </TutorialStep>

        <TutorialStep
          number={3}
          title="Pick a rating"
          caption='Choose "Real concern" if a policymaker should look at this pair, "Thin" if the flag is over-cautious, or "Skip" if you need more context. Your rating saves to the server immediately.'
        >
          <div className="flex flex-wrap gap-1">
            {(["real", "thin", "skip"] as const).map((value) => (
              <span
                key={value}
                className="text-[10px] px-2 py-1 rounded border"
                style={{
                  borderColor: RATING_COLOR[value],
                  color: RATING_COLOR[value],
                }}
              >
                {RATING_LABEL[value]}
              </span>
            ))}
          </div>
        </TutorialStep>

        <TutorialStep
          number={4}
          title="Watch precision converge"
          caption="As you rate more pairs, the Wilson 95% confidence interval narrows. Wide CI = not enough samples to conclude anything. Skipped pairs don't count toward precision."
        >
          <div className="bg-white border border-gray-200 rounded p-2">
            <div className="text-[10px] font-medium">7 of 30 rated</div>
            <div className="text-[10px] text-[var(--undp-gray)] tabular-nums">
              real 5 · thin 2 · skip 0
            </div>
            <div className="text-[10px] mt-1">
              <span className="font-medium">71%</span>{" "}
              <span className="text-[var(--undp-gray)]">
                (95% CI: 36% – 92%)
              </span>
            </div>
          </div>
        </TutorialStep>
      </div>

      <div className="bg-gray-50 border border-gray-100 rounded p-3 text-xs">
        <div className="font-medium text-[var(--undp-black)] mb-2">
          Decision rubric
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <div className="flex items-start gap-2">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-white whitespace-nowrap mt-0.5"
              style={{ backgroundColor: RATING_COLOR.real }}
            >
              Real concern
            </span>
            <span className="text-[var(--undp-gray)]">
              A policymaker reading this rationale should take action
              (coordinate, escalate, review).
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-white whitespace-nowrap mt-0.5"
              style={{ backgroundColor: RATING_COLOR.thin }}
            >
              Thin
            </span>
            <span className="text-[var(--undp-gray)]">
              Technically a flag but no actionable policy concern. The model
              is being over-cautious.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded text-white whitespace-nowrap mt-0.5"
              style={{ backgroundColor: RATING_COLOR.skip }}
            >
              Skip
            </span>
            <span className="text-[var(--undp-gray)]">
              You can&apos;t tell without more context (domain knowledge,
              source documents). Excluded from the precision math.
            </span>
          </div>
        </div>
      </div>

      <div className="text-xs text-[var(--undp-gray)] mt-3 italic max-w-3xl">
        Precision = <span className="font-mono">real / (real + thin)</span>.
        With n &lt; 10 the CI is wide; aim for at least 20 ratings per
        sample before drawing conclusions. Your ratings save to the server
        as you click — visible across browsers, devices, and reviewers.
      </div>
    </section>
  );
}

function TutorialStep({
  number,
  title,
  caption,
  children,
}: {
  number: number;
  title: string;
  caption: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--undp-blue)] text-white text-xs font-medium">
          {number}
        </span>
        <span className="text-sm font-medium text-[var(--undp-black)]">
          {title}
        </span>
      </div>
      <div className="bg-gray-50 border border-gray-100 rounded p-2 min-h-[64px] flex items-center">
        <div className="w-full">{children}</div>
      </div>
      <p className="text-xs text-[var(--undp-gray)] leading-snug">{caption}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Detection personalities — per-model label distribution + one-line read
// ---------------------------------------------------------------------------

function DetectionPersonalities({ report }: { report: ModelComparisonReport }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Detection personalities
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        How each model distributes its alignment labels across the{" "}
        {report.pairCount.toLocaleString()} common pairs. The shape of the
        distribution is the model&apos;s &ldquo;personality&rdquo; — some are
        sensitive (flag liberally), some are cautious (default to none),
        some cluster on the middle. AI-generated; runs are deterministic at
        temperature 0 but model interpretations vary.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.models.map((slug) => (
          <DetectionPersonalityCard
            key={slug}
            slug={slug}
            distribution={report.distributions[slug]}
            levels={report.alignmentLevels}
          />
        ))}
      </div>
    </section>
  );
}

function DetectionPersonalityCard({
  slug,
  distribution,
  levels,
}: {
  slug: string;
  distribution: Record<AlignmentLevel, number>;
  levels: AlignmentLevel[];
}) {
  const total = levels.reduce((acc, l) => acc + (distribution?.[l] ?? 0), 0) || 1;
  const flaggedPct = (distribution?.flagged ?? 0) / total;
  const nonePct = (distribution?.none ?? 0) / total;
  const mediumPct = (distribution?.medium ?? 0) / total;
  const description = personalityPhrase({ flaggedPct, nonePct, mediumPct });

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-sm font-medium text-[var(--undp-black)]">
          {prettify(slug)}
        </div>
        <div className="text-xs text-[var(--undp-gray)]">{tierOf(slug)}</div>
      </div>
      <div className="text-xs text-[var(--undp-gray)] italic mb-3">
        {description}
      </div>
      <div className="flex h-6 rounded overflow-hidden border border-gray-100">
        {levels.map((l) => {
          const count = distribution?.[l] ?? 0;
          const width = (count / total) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={l}
              title={`${l}: ${count.toLocaleString()} (${pct(count / total)})`}
              style={{
                width: `${width}%`,
                backgroundColor: LEVEL_COLOR[l],
              }}
            />
          );
        })}
      </div>
      <div className="grid grid-cols-5 gap-1 text-center mt-2">
        {levels.map((l) => {
          const count = distribution?.[l] ?? 0;
          return (
            <div key={l} className="flex flex-col items-center">
              <div className="text-xs tabular-nums font-medium">
                {count.toLocaleString()}
              </div>
              <div className="text-[10px] text-[var(--undp-gray)] capitalize">
                {l}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function personalityPhrase({
  flaggedPct,
  nonePct,
  mediumPct,
}: {
  flaggedPct: number;
  nonePct: number;
  mediumPct: number;
}): string {
  if (flaggedPct >= 0.5)
    return `High-sensitivity — flags ${pct(flaggedPct)} of pairs for review`;
  if (nonePct >= 0.25)
    return `High-caution — gives ${pct(nonePct)} of pairs “none”`;
  if (mediumPct >= 0.5)
    return `Centre-mass — clusters ${pct(mediumPct)} of pairs at “medium”`;
  if (flaggedPct >= 0.1)
    return `Moderate — flags ${pct(flaggedPct)}; rest spread across the scale`;
  return "Balanced — no single label dominates";
}

// ---------------------------------------------------------------------------
// 2. Flagging overlap — Venn-style bucket counts
// ---------------------------------------------------------------------------

function FlaggingOverlapSection({ report }: { report: ModelComparisonReport }) {
  const overlap = report.flaggingOverlap;
  const nModels = report.models.length;
  const data = Array.from({ length: nModels }, (_, i) => {
    const n = i + 1;
    return {
      n,
      label: `${n} of ${nModels}`,
      count: overlap.flaggedByCount?.[String(n)] ?? 0,
    };
  });
  const consensusPct =
    overlap.unionFlaggedCount > 0
      ? overlap.consensusFlaggedCount / overlap.unionFlaggedCount
      : 0;
  const soloPct =
    overlap.unionFlaggedCount > 0
      ? (overlap.flaggedByCount?.["1"] ?? 0) / overlap.unionFlaggedCount
      : 0;

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Flagging overlap
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-2 max-w-3xl">
        Across the {report.pairCount.toLocaleString()} common pairs,{" "}
        <span className="font-medium">
          {overlap.unionFlaggedCount.toLocaleString()}
        </span>{" "}
        were flagged by at least one model.{" "}
        <span className="font-medium">
          {overlap.consensusFlaggedCount.toLocaleString()}
        </span>{" "}
        ({pct(consensusPct)}) were flagged by all {nModels} models —
        high-confidence concerns where every model independently agreed there
        is potential misalignment.{" "}
        {(overlap.flaggedByCount?.["1"] ?? 0).toLocaleString()} ({pct(soloPct)})
        were flagged by exactly one model — that model&apos;s distinctive read.
      </p>
      <div className="bg-white border border-gray-100 rounded-lg p-4 mt-4">
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={data} margin={{ left: 16, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => {
                  const n = typeof value === "number" ? value : Number(value);
                  return [n.toLocaleString(), "Pairs"];
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.n}
                    fill={d.n === nModels ? "#22c55e" : d.n === 1 ? "#f59e0b" : "#0468b1"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs text-[var(--undp-gray)] mt-2 max-w-3xl">
          Read left-to-right: the leftmost bar is single-model flags (one
          model&apos;s unique signal); the rightmost is consensus flags
          (every model agreed).
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. What each model uniquely sees — tabbed unique-signal browser
// ---------------------------------------------------------------------------

function UniqueSignalTabs({ report }: { report: ModelComparisonReport }) {
  const [active, setActive] = useState(report.models[0] ?? "");
  const rows = report.uniqueSignal?.[active] ?? [];

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        What each model uniquely sees
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Pairs flagged by this model and <em>not</em> flagged by any other.
        Open a row to compare every model&apos;s rationale side by side — the
        selected model called it a potential misalignment; the others said
        none / low / medium / high. Useful for judging whether this
        model&apos;s extra flags are substantive or noisy.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {report.models.map((slug) => {
          const count = report.uniqueSignal?.[slug]?.length ?? 0;
          const isActive = slug === active;
          return (
            <button
              key={slug}
              onClick={() => setActive(slug)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                isActive
                  ? "border-[var(--undp-blue)] bg-[var(--undp-blue)] text-white"
                  : "border-gray-200 bg-white text-[var(--undp-black)] hover:border-gray-300"
              }`}
              style={
                isActive
                  ? { backgroundColor: modelColor(slug), borderColor: modelColor(slug) }
                  : undefined
              }
            >
              {prettify(slug)}{" "}
              <span
                className={`ml-1 ${isActive ? "opacity-80" : "text-[var(--undp-gray)]"}`}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>
      {rows.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-lg p-6 text-sm text-[var(--undp-gray)] italic">
          {prettify(active)} did not flag any pair that no other model also
          flagged.
        </div>
      ) : (
        <UniqueSignalTable
          models={report.models}
          targets={report.targets}
          rows={rows}
        />
      )}
    </section>
  );
}

function UniqueSignalTable({
  models,
  targets,
  rows,
}: {
  models: string[];
  targets: Record<string, TargetSummary>;
  rows: ModelDisagreementRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  return (
    <div className="overflow-x-auto border border-gray-100 bg-white rounded-lg">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--undp-gray)]">
          <tr>
            <th className="text-left px-3 py-2">Pair</th>
            {models.map((m) => (
              <th key={m} className="text-left px-3 py-2">
                {prettify(m)}
              </th>
            ))}
            <th className="text-right px-3 py-2">Spread</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = `${row.targetAId}--${row.targetBId}`;
            return (
              <DisagreementRow
                key={key}
                row={row}
                models={models}
                targets={targets}
                isOpen={expanded.has(key)}
                onToggle={() => toggle(key)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Top-50 most-contested pairs — the catch-all disagreement browser
// ---------------------------------------------------------------------------

function MostContestedPairs({
  models,
  targets,
  disagreements,
}: {
  models: string[];
  targets: Record<string, TargetSummary>;
  disagreements: ModelDisagreementRow[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? disagreements : disagreements.slice(0, 20);

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Top-{disagreements.length} most-contested pairs
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Pairs ranked by the number of distinct labels assigned across all
        models (and ordinal spread as tiebreak). The head of the list is
        &ldquo;everyone disagrees&rdquo;; the tail is &ldquo;a single 2-way
        split.&rdquo; Click any row to read all four rationales side by side.
      </p>
      <div className="overflow-x-auto border border-gray-100 bg-white rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--undp-gray)]">
            <tr>
              <th className="text-left px-3 py-2">Pair</th>
              {models.map((m) => (
                <th key={m} className="text-left px-3 py-2">
                  {prettify(m)}
                </th>
              ))}
              <th className="text-right px-3 py-2">Spread</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = `${row.targetAId}--${row.targetBId}`;
              return (
                <DisagreementRow
                  key={key}
                  row={row}
                  models={models}
                  targets={targets}
                  isOpen={expanded.has(key)}
                  onToggle={() => toggle(key)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {disagreements.length > 20 && (
        <button
          className="text-sm text-[var(--undp-blue)] hover:underline mt-3"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? `Show top 20 only`
            : `Show all ${disagreements.length} most-contested pairs`}
        </button>
      )}
    </section>
  );
}

function TargetBlock({
  label,
  targetId,
  target,
}: {
  label: "Target A" | "Target B";
  targetId: string;
  target: TargetSummary | undefined;
}) {
  const [showActivities, setShowActivities] = useState(false);
  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="flex items-baseline gap-2 mb-1 flex-wrap">
        <span className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)]">
          {label}
        </span>
        <span className="font-mono text-xs text-[var(--undp-black)]">
          {targetId}
        </span>
        {target?.sourceDocument && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-900">
            {target.sourceDocument}
          </span>
        )}
        {target?.sourceLabel && (
          <span className="text-xs text-[var(--undp-gray)]">
            {target.sourceLabel}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--undp-black)] leading-relaxed whitespace-pre-line">
        {target?.text || (
          <em className="text-gray-400">(target text unavailable)</em>
        )}
      </p>
      {target?.activities && (
        <div className="mt-2">
          <button
            onClick={() => setShowActivities((v) => !v)}
            className="text-xs text-[var(--undp-blue)] hover:underline"
          >
            {showActivities ? "− Hide activities" : "+ Show activities"}
          </button>
          {showActivities && (
            <p className="text-xs text-[var(--undp-gray)] leading-relaxed whitespace-pre-line mt-1.5 border-l-2 border-gray-200 pl-2">
              {target.activities}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function FlagDetailsChips({ details }: { details: PairFlagDetails }) {
  const chips: Array<{ label: string; value: string }> = [
    { label: "mechanism", value: prettifyMechanism(details.mechanism) },
    { label: "confidence", value: details.confidence },
    { label: "manageability", value: details.manageability },
  ];
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-900"
          title={`${chip.label}: ${chip.value}`}
        >
          {chip.label}: {chip.value}
        </span>
      ))}
      {details.contestedResources.length > 0 && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-900"
          title="Resources both targets contest"
        >
          contests: {details.contestedResources.join(", ")}
        </span>
      )}
    </div>
  );
}

function DisagreementRow({
  row,
  models,
  targets,
  isOpen,
  onToggle,
  footer,
}: {
  row: ModelDisagreementRow;
  models: string[];
  /** Target ID → text + source-doc metadata. Optional so callers that
   *  don't have a targets map can still render labels-only. */
  targets?: Record<string, TargetSummary>;
  isOpen: boolean;
  onToggle: () => void;
  /** Rendered inside the expanded area, below the rationale grid. Used by
   *  the evaluation sections to inject rating controls without forking
   *  the row layout. */
  footer?: React.ReactNode;
}) {
  return (
    <>
      <tr
        className="border-t border-gray-100 cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <td className="px-3 py-2 font-mono text-xs">
          <span className="text-[var(--undp-gray)] mr-1">{isOpen ? "▼" : "▶"}</span>
          {row.targetAId} ↔ {row.targetBId}
        </td>
        {models.map((m) => {
          const lvl = row.labels[m] as AlignmentLevel;
          return (
            <td key={m} className="px-3 py-2">
              <span
                className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                style={{ backgroundColor: LEVEL_COLOR[lvl], color: "#111827" }}
              >
                {lvl}
              </span>
            </td>
          );
        })}
        <td className="text-right px-3 py-2 tabular-nums text-xs text-[var(--undp-gray)]">
          {row.distinctLabelCount}/{models.length} distinct
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-gray-100 bg-gray-50/50">
          <td colSpan={models.length + 2} className="px-3 py-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <TargetBlock
                label="Target A"
                targetId={row.targetAId}
                target={targets?.[row.targetAId]}
              />
              <TargetBlock
                label="Target B"
                targetId={row.targetBId}
                target={targets?.[row.targetBId]}
              />
            </div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--undp-gray)] mb-1.5">
              Model rationales
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {models.map((m) => {
                const details = row.flagDetails?.[m];
                return (
                  <div
                    key={m}
                    className="bg-white border rounded p-3"
                    style={{ borderLeftColor: modelColor(m), borderLeftWidth: 3 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-[var(--undp-black)]">
                        {prettify(m)}
                      </span>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: LEVEL_COLOR[row.labels[m] as AlignmentLevel],
                        }}
                      >
                        {row.labels[m]}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
                      {row.descriptions[m] || (
                        <em className="text-gray-400">(no rationale recorded)</em>
                      )}
                    </p>
                    {details && <FlagDetailsChips details={details} />}
                  </div>
                );
              })}
            </div>
            {footer && <div className="mt-3">{footer}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Mechanism focus — model × mechanism breakdown of flagged pairs
// ---------------------------------------------------------------------------

function MechanismFocus({ report }: { report: ModelComparisonReport }) {
  const allKeys = new Set<string>();
  for (const slug of report.models) {
    for (const key of Object.keys(report.mechanisms[slug] ?? {})) {
      allKeys.add(key);
    }
  }
  // Sort canonical mechanisms first, then any extras alphabetically.
  const mechKeys = [
    ...MECHANISM_KEYS.filter((k) => allKeys.has(k)),
    ...[...allKeys]
      .filter(
        (k) => !MECHANISM_KEYS.includes(k as (typeof MECHANISM_KEYS)[number]),
      )
      .sort(),
  ];

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Mechanism focus per model
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        For each model&apos;s flagged pairs, the breakdown of which
        mechanism it cited. A model that concentrates flags in
        &ldquo;goal conflict&rdquo; reads policy contradictions as
        outcome-level; one that concentrates in &ldquo;delivery friction&rdquo;
        reads them as implementation overlap. Useful for understanding
        what a model is mostly looking for.
      </p>
      <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg p-3">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--undp-gray)]">
            <tr>
              <th className="text-left px-3 py-2">Model</th>
              {mechKeys.map((k) => (
                <th key={k} className="text-right px-3 py-2">
                  {prettifyMechanism(k)}
                </th>
              ))}
              <th className="text-right px-3 py-2">Total flagged</th>
            </tr>
          </thead>
          <tbody>
            {report.models.map((slug) => {
              const mech = report.mechanisms[slug] ?? {};
              const total = Object.values(mech).reduce((a, b) => a + b, 0);
              return (
                <tr key={slug} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{prettify(slug)}</td>
                  {mechKeys.map((k) => {
                    const v = mech[k] ?? 0;
                    const share = total > 0 ? v / total : 0;
                    return (
                      <td
                        key={k}
                        className="text-right px-3 py-2 tabular-nums"
                      >
                        {v.toLocaleString()}
                        <span className="text-xs text-[var(--undp-gray)] ml-1">
                          ({pct(share)})
                        </span>
                      </td>
                    );
                  })}
                  <td className="text-right px-3 py-2 tabular-nums font-medium">
                    {total.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. Rationale character — cheap proxies for analytical specificity
// ---------------------------------------------------------------------------

function RationaleCharacterSection({ report }: { report: ModelComparisonReport }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Rationale character
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Cheap proxies for how each model writes its alignment rationales.
        Length and citation patterns are not quality on their own — a long
        rationale isn&apos;t automatically better — but together they sketch
        whether a model engages with specific evidence or stays abstract.
      </p>
      <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg p-3">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--undp-gray)]">
            <tr>
              <th className="text-left px-3 py-2">Model</th>
              <th className="text-right px-3 py-2">Avg words</th>
              <th className="text-right px-3 py-2">Median words</th>
              <th className="text-right px-3 py-2">% with numbers</th>
              <th className="text-right px-3 py-2">% citing source target</th>
            </tr>
          </thead>
          <tbody>
            {report.models.map((slug) => {
              const c = report.rationaleCharacter?.[slug];
              return (
                <tr key={slug} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{prettify(slug)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {c ? c.avgWords.toFixed(1) : "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {c ? c.medianWords.toFixed(1) : "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {c ? pct(c.pctNumeric) : "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {c ? pct(c.pctPolicyCitation) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="text-xs text-[var(--undp-gray)] mt-3 italic">
          &ldquo;Citing source target&rdquo; checks for the uppercase target-ID
          prefixes observed in this country&apos;s data (e.g., NDC, BTR, FSS,
          ILDN). Counts presence, not frequency.
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 7. LLM-judged rationale comparison
// ---------------------------------------------------------------------------

function JudgeResults({ report }: { report: ModelComparisonReport }) {
  if (!report.judgeModel || !report.judgeAggregates || !report.judgeVerdicts) {
    return (
      <section>
        <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
          LLM-judged rationale comparison
        </h2>
        <p className="text-xs text-[var(--undp-gray)] italic max-w-3xl">
          Not run for this country. Re-run the analyzer with{" "}
          <code className="font-mono text-[10px] px-1 bg-gray-100">
            uv run python -m src.analyze_model_comparison --country {report.country}{" "}
            --with-judge --judge-sample-size 30
          </code>{" "}
          to populate this section.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        LLM-judged rationale comparison
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-3 max-w-3xl">
        A judge LLM read the four candidate rationales for a sample of
        disagreement pairs and scored each on specificity, reasoning, and
        decision-usefulness. Model identities were anonymized per-pair (A /
        B / C / D shuffled by a hash of the pair-key) so the judge cannot
        pattern-match on brand or naming style.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-900 max-w-3xl">
        <span className="font-medium">Disclaimer:</span> the judge is{" "}
        <span className="font-mono">{report.judgeModel}</span> on a sample of{" "}
        {report.judgeSampleSize} disagreement pairs. The judge is itself one
        of the models being evaluated; anonymization mitigates brand bias
        but cannot eliminate stylistic self-recognition. Treat these scores
        as one signal among several, not a verdict.
      </div>

      <JudgeAggregateTable
        models={report.models}
        aggregates={report.judgeAggregates}
        sampleSize={report.judgeSampleSize ?? 0}
      />

      <JudgeVerdictSamples verdicts={report.judgeVerdicts} />
    </section>
  );
}

function JudgeAggregateTable({
  models,
  aggregates,
  sampleSize,
}: {
  models: string[];
  aggregates: NonNullable<ModelComparisonReport["judgeAggregates"]>;
  sampleSize: number;
}) {
  return (
    <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg p-3 mb-4">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-[var(--undp-gray)]">
          <tr>
            <th className="text-left px-3 py-2">Model</th>
            <th className="text-right px-3 py-2">Avg specificity</th>
            <th className="text-right px-3 py-2">Avg reasoning</th>
            <th className="text-right px-3 py-2">Avg useful</th>
            <th className="text-right px-3 py-2">Wins</th>
          </tr>
        </thead>
        <tbody>
          {models.map((slug) => {
            const a = aggregates[slug];
            const winPct = sampleSize > 0 ? (a?.winCount ?? 0) / sampleSize : 0;
            return (
              <tr key={slug} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{prettify(slug)}</td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {a ? a.avgSpecificity.toFixed(2) : "—"}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {a ? a.avgReasoning.toFixed(2) : "—"}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {a ? a.avgUseful.toFixed(2) : "—"}
                </td>
                <td className="text-right px-3 py-2 tabular-nums">
                  {a?.winCount ?? 0}
                  <span className="text-xs text-[var(--undp-gray)] ml-1">
                    ({pct(winPct)})
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function JudgeVerdictSamples({ verdicts }: { verdicts: JudgeVerdict[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? verdicts : verdicts.slice(0, 5);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <div className="text-sm font-medium text-[var(--undp-black)] mb-2">
        Sample verdicts
      </div>
      <div className="space-y-3">
        {visible.map((v) => {
          const key = `${v.targetAId}--${v.targetBId}`;
          const isOpen = expanded.has(key);
          return (
            <JudgeVerdictCard
              key={key}
              verdict={v}
              isOpen={isOpen}
              onToggle={() => toggle(key)}
            />
          );
        })}
      </div>
      {verdicts.length > 5 && (
        <button
          className="text-sm text-[var(--undp-blue)] hover:underline mt-3"
          onClick={() => setShowAll((s) => !s)}
        >
          {showAll
            ? `Show top 5 only`
            : `Show all ${verdicts.length} judged pairs`}
        </button>
      )}
    </div>
  );
}

function JudgeVerdictCard({
  verdict,
  isOpen,
  onToggle,
}: {
  verdict: JudgeVerdict;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const slugsByLetter = Object.entries(verdict.shuffleMap).reduce(
    (acc, [slug, letter]) => {
      acc[letter] = slug;
      return acc;
    },
    {} as Record<string, string>,
  );
  const letters = Object.keys(slugsByLetter).sort();

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-3">
      <button
        className="w-full flex items-baseline justify-between text-left"
        onClick={onToggle}
      >
        <div className="font-mono text-xs">
          <span className="text-[var(--undp-gray)] mr-1">
            {isOpen ? "▼" : "▶"}
          </span>
          {verdict.targetAId} ↔ {verdict.targetBId}
        </div>
        <div className="text-xs text-[var(--undp-gray)]">
          Judge winner:{" "}
          <span className="font-medium text-[var(--undp-black)]">
            {verdict.winnerSlug ? prettify(verdict.winnerSlug) : "—"}
          </span>
        </div>
      </button>
      {isOpen && (
        <div className="mt-3 space-y-3">
          <div className="text-xs text-[var(--undp-gray)] italic">
            Judge reasoning: {verdict.winnerReasoning || "(none recorded)"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {letters.map((letter) => {
              const slug = slugsByLetter[letter];
              const scores = verdict.scores[slug];
              const isWinner = slug === verdict.winnerSlug;
              return (
                <div
                  key={letter}
                  className="border rounded p-3"
                  style={{
                    borderLeftColor: modelColor(slug),
                    borderLeftWidth: 3,
                    backgroundColor: isWinner ? "rgba(34, 197, 94, 0.06)" : "white",
                  }}
                >
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-xs font-medium text-[var(--undp-black)]">
                      Rationale {letter} — {prettify(slug)}
                      {isWinner && (
                        <span className="ml-2 text-xs text-green-700">
                          (judge pick)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--undp-gray)] tabular-nums">
                      {scores
                        ? `S ${scores.specificity} · R ${scores.reasoning} · U ${scores.useful}`
                        : "—"}
                    </div>
                  </div>
                  <p className="text-xs text-[var(--undp-gray)] leading-relaxed">
                    {verdict.rationales[slug] || (
                      <em className="text-gray-400">(no rationale recorded)</em>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Pairwise agreement matrix (descriptive — kept from v1)
// ---------------------------------------------------------------------------

function PairwiseAgreementMatrix({
  models,
  agreementMatrix,
  kappaMatrix,
}: {
  models: string[];
  agreementMatrix: Record<string, Record<string, number>>;
  kappaMatrix: Record<string, Record<string, number>>;
}) {
  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Pairwise agreement (do any models cluster?)
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Each cell shows raw agreement % between two models, with Cohen&apos;s
        κ (chance-adjusted) in the tooltip. Descriptive only — two models
        agreeing on the same biased pattern would also score high here.
      </p>
      <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg p-3">
        <table className="text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-2"></th>
              {models.map((m) => (
                <th
                  key={m}
                  className="p-2 font-normal text-[var(--undp-gray)] text-center"
                >
                  {prettify(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((rowSlug) => (
              <tr key={rowSlug}>
                <td className="p-2 text-[var(--undp-gray)] text-right">
                  {prettify(rowSlug)}
                </td>
                {models.map((colSlug) => {
                  const agr = agreementMatrix[rowSlug][colSlug];
                  const kpa = kappaMatrix[rowSlug][colSlug];
                  const isDiag = rowSlug === colSlug;
                  return (
                    <td
                      key={colSlug}
                      className="p-2 text-center tabular-nums"
                      style={{
                        backgroundColor: isDiag
                          ? "rgba(34, 197, 94, 0.15)"
                          : `rgba(4, 104, 177, ${0.05 + agr * 0.5})`,
                      }}
                      title={`κ = ${kpa.toFixed(3)} (${kappaInterpretation(kpa)})`}
                    >
                      {pct(agr)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 9. Vocab compliance — CLAUDE.md guardrail check
// ---------------------------------------------------------------------------

function VocabCompliance({ report }: { report: ModelComparisonReport }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Vocabulary compliance (guardrail check)
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Project guardrails ban the words &ldquo;tension&rdquo; and
        &ldquo;contradiction&rdquo; in stored outputs because they overclaim
        confidence that the model cannot have against highly varied policy
        documents. The display vocabulary is &ldquo;possible misalignment.&rdquo;
        High violation rates mean a model is producing language we cannot
        ship without manual rewording.
      </p>
      <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg p-3">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--undp-gray)]">
            <tr>
              <th className="text-left px-3 py-2">Model</th>
              <th className="text-right px-3 py-2">Tension hits</th>
              <th className="text-right px-3 py-2">Contradiction hits</th>
              <th className="text-right px-3 py-2">Rationales with ≥1 banned word</th>
              <th className="text-right px-3 py-2">Violation rate</th>
            </tr>
          </thead>
          <tbody>
            {report.models.map((slug) => {
              const v = report.vocabCompliance[slug];
              return (
                <tr key={slug} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{prettify(slug)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {v?.tensionWordHits.toLocaleString() ?? "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {v?.contradictionWordHits.toLocaleString() ?? "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {v?.pairsWithViolation.toLocaleString() ?? "—"}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    <span
                      className={
                        (v?.violationRate ?? 0) > 0.05
                          ? "text-red-700 font-medium"
                          : "text-[var(--undp-black)]"
                      }
                    >
                      {v ? pct(v.violationRate) : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 10. Cost summary — descriptive table (no agreement-as-Y axis)
// ---------------------------------------------------------------------------

function CostSummaryTable({ report }: { report: ModelComparisonReport }) {
  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Cost &amp; footprint per model
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Per-model wall-clock, call volume, energy / CO₂e / water (from
        EcoLogits, &ldquo;estimated&rdquo; when the model isn&apos;t in the
        registry), and an approximate USD cost (Azure list × measured call
        volume × ~200 output tokens/call). Descriptive only — choice of
        production model should consider this alongside the analytical
        signals above, not in isolation.
      </p>
      <div className="overflow-x-auto bg-white border border-gray-100 rounded-lg p-3">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-[var(--undp-gray)]">
            <tr>
              <th className="text-left px-3 py-2">Model</th>
              <th className="text-right px-3 py-2">Wall-clock (s)</th>
              <th className="text-right px-3 py-2">LLM calls</th>
              <th className="text-right px-3 py-2">Energy (Wh)</th>
              <th className="text-right px-3 py-2">CO₂e (g)</th>
              <th className="text-right px-3 py-2">Water (mL)</th>
              <th className="text-right px-3 py-2">Approx USD</th>
            </tr>
          </thead>
          <tbody>
            {report.models.map((slug) => {
              const c = report.costs[slug];
              const usd = approxRunCost(slug, c?.callCount ?? null);
              return (
                <tr key={slug} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{prettify(slug)}</td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {fmtNumber(c?.elapsedSeconds ?? null)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {fmtNumber(c?.callCount ?? null)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {fmtNumber(c?.energyWh ?? null)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {fmtNumber(c?.co2Geq ?? null)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {fmtNumber(c?.waterMl ?? null)}
                  </td>
                  <td className="text-right px-3 py-2 tabular-nums">
                    {usd == null ? "—" : `$${usd.toFixed(2)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// `ALIGNMENT_LEVELS_ORDER` is referenced from related components in the
// dashboard; export so other surfaces can stay aligned without a separate
// source of truth.
export { ALIGNMENT_LEVELS_ORDER };

// ---------------------------------------------------------------------------
// Evaluation sample sections (manual rating tool)
// ---------------------------------------------------------------------------
//
// Rate individual flagged pairs as "real concern" / "thin / not actionable" /
// "skip". Ratings are persisted server-side via POST /api/ratings/[country],
// so they survive browsers, devices, and deploys. The page reads the current
// ratings on render; mutations are optimistic with rollback on API error.

const RATING_LABEL: Record<PairRatingValue, string> = {
  real: "Real concern",
  thin: "Thin / not actionable",
  skip: "Skip",
};

const RATING_COLOR: Record<PairRatingValue, string> = {
  real: "#22c55e",
  thin: "#f87171",
  skip: "#9ca3af",
};

function pairKeyOf(row: { targetAId: string; targetBId: string }): string {
  return `${row.targetAId}::${row.targetBId}`;
}

/** Wilson 95% CI for a binomial proportion. Correct for small samples
 *  (down to ~n=5); the naïve normal approximation collapses badly there. */
function wilsonInterval(real: number, evaluated: number): [number, number] {
  if (evaluated === 0) return [0, 0];
  const z = 1.96;
  const p = real / evaluated;
  const n = evaluated;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const margin =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

function RatingControls({
  country,
  pairKey,
  currentRating,
  onChange,
}: {
  country: string;
  pairKey: string;
  currentRating: PairRating | undefined;
  onChange: (pairKey: string, next: PairRating | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(!!currentRating?.note);
  const [noteDraft, setNoteDraft] = useState(currentRating?.note ?? "");

  const submit = async (value: PairRatingValue) => {
    setError(null);
    const previous = currentRating ?? null;
    const next: PairRating = {
      rating: value,
      note: noteDraft,
      ts: Date.now(),
    };
    onChange(pairKey, next);
    setPending(true);
    try {
      await setRating(country, pairKey, next);
    } catch (err) {
      onChange(pairKey, previous);
      setError(err instanceof Error ? err.message : "rating write failed");
    } finally {
      setPending(false);
    }
  };

  const saveNote = async () => {
    if (!currentRating) return;
    const updated: PairRating = {
      ...currentRating,
      note: noteDraft,
      ts: Date.now(),
    };
    setError(null);
    onChange(pairKey, updated);
    setPending(true);
    try {
      await setRating(country, pairKey, updated);
    } catch (err) {
      onChange(pairKey, currentRating);
      setError(err instanceof Error ? err.message : "note write failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded p-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-[var(--undp-black)]">
          Your evaluation:
        </span>
        {(Object.keys(RATING_LABEL) as PairRatingValue[]).map((value) => {
          const isActive = currentRating?.rating === value;
          return (
            <button
              key={value}
              onClick={() => submit(value)}
              disabled={pending}
              className="px-2.5 py-1 text-xs rounded border transition-colors disabled:opacity-60"
              style={{
                borderColor: isActive ? RATING_COLOR[value] : "#e5e7eb",
                backgroundColor: isActive ? RATING_COLOR[value] : "white",
                color: isActive ? "white" : "#111827",
              }}
            >
              {RATING_LABEL[value]}
            </button>
          );
        })}
        <button
          onClick={() => setNoteOpen((v) => !v)}
          className="text-xs text-[var(--undp-blue)] hover:underline ml-auto"
        >
          {noteOpen ? "− Hide note" : "+ Add note"}
        </button>
      </div>
      {noteOpen && (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            className="text-xs border border-gray-200 rounded p-2 w-full min-h-[60px]"
            placeholder="Optional reviewer note (e.g., why this pair is or isn't actionable)"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={saveNote}
              disabled={pending || !currentRating}
              className="text-xs px-2 py-1 bg-[var(--undp-blue)] text-white rounded disabled:opacity-50"
            >
              Save note
            </button>
            <span className="text-xs text-[var(--undp-gray)]">
              {currentRating
                ? `Note saves alongside the existing "${RATING_LABEL[currentRating.rating]}" rating.`
                : "Pick a rating above first; then your note saves with it."}
            </span>
          </div>
        </div>
      )}
      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}
      <div className="text-xs text-[var(--undp-gray)] mt-2 italic">
        Your evaluations are saved to the server alongside the model outputs
        (not stored only in this browser).
      </div>
    </div>
  );
}

function RatingProgress({
  sampleRatings,
  sampleSize,
}: {
  sampleRatings: PairRating[];
  sampleSize: number;
}) {
  const counts = sampleRatings.reduce(
    (acc, r) => {
      acc[r.rating] = (acc[r.rating] ?? 0) + 1;
      return acc;
    },
    { real: 0, thin: 0, skip: 0 } as Record<PairRatingValue, number>,
  );
  const evaluated = counts.real + counts.thin;
  const precision = evaluated > 0 ? counts.real / evaluated : null;
  const [ciLo, ciHi] = wilsonInterval(counts.real, evaluated);

  return (
    <div className="bg-white border border-gray-100 rounded-lg p-4 mb-3">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-sm font-medium">
          {sampleRatings.length} of {sampleSize} rated
        </div>
        <div className="text-xs text-[var(--undp-gray)] tabular-nums">
          real {counts.real} · thin {counts.thin} · skip {counts.skip}
        </div>
      </div>
      {precision !== null ? (
        <div className="mt-2 text-sm">
          <span className="font-medium">
            Precision so far: {(precision * 100).toFixed(0)}%
          </span>
          <span className="text-xs text-[var(--undp-gray)] ml-2">
            (95% CI: {(ciLo * 100).toFixed(0)}% – {(ciHi * 100).toFixed(0)}%, n = {evaluated})
          </span>
        </div>
      ) : (
        <div className="mt-2 text-xs text-[var(--undp-gray)] italic">
          Rate at least one pair as &ldquo;real concern&rdquo; or &ldquo;thin&rdquo;
          to see a precision estimate. Skipped pairs are excluded from the math.
        </div>
      )}
    </div>
  );
}

function EvaluationSampleSection({
  country,
  heading,
  framing,
  sample,
  totalAvailable,
  models,
  targets,
  ratings,
  onChangeRating,
}: {
  country: string;
  heading: string;
  framing: React.ReactNode;
  sample: ModelDisagreementRow[];
  totalAvailable: number;
  models: string[];
  targets: Record<string, TargetSummary>;
  ratings: RatingsByCountry;
  onChangeRating: (pairKey: string, next: PairRating | null) => void;
}) {
  const [showOnlyUnrated, setShowOnlyUnrated] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Default-expand every row in the sample so the reviewer can read
    // rationales without an extra click per pair.
    return new Set(sample.map((row) => pairKeyOf(row)));
  });
  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sampleRatings = useMemo(
    () =>
      sample
        .map((row) => ratings[pairKeyOf(row)])
        .filter((r): r is PairRating => r != null),
    [sample, ratings],
  );

  const visible = useMemo(
    () =>
      showOnlyUnrated
        ? sample.filter((row) => !ratings[pairKeyOf(row)])
        : sample,
    [sample, ratings, showOnlyUnrated],
  );

  const handleExport = () => exportRatings(country, ratings);

  return (
    <section>
      <h3 className="text-base font-medium text-[var(--undp-black)] mb-2">
        {heading}
      </h3>
      <div className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        {framing}
      </div>
      <RatingProgress
        sampleRatings={sampleRatings}
        sampleSize={sample.length}
      />
      <div className="flex items-center gap-3 mb-3">
        <label className="text-xs text-[var(--undp-gray)] flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={showOnlyUnrated}
            onChange={(e) => setShowOnlyUnrated(e.target.checked)}
          />
          Show only unrated
        </label>
        <button
          onClick={handleExport}
          className="text-xs text-[var(--undp-blue)] hover:underline ml-auto"
        >
          Export all ratings as JSON
        </button>
      </div>
      {sample.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-lg p-6 text-sm text-[var(--undp-gray)] italic">
          No pairs in the random sample. {totalAvailable === 0
            ? "This model has no qualifying flags."
            : "Regenerate the analyzer artifact to populate it."}
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 bg-white rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-[var(--undp-gray)]">
              <tr>
                <th className="text-left px-3 py-2">Pair</th>
                {models.map((m) => (
                  <th key={m} className="text-left px-3 py-2">
                    {prettify(m)}
                  </th>
                ))}
                <th className="text-right px-3 py-2">Your rating</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const key = pairKeyOf(row);
                const rating = ratings[key];
                return (
                  <DisagreementRow
                    key={key}
                    row={row}
                    models={models}
                    targets={targets}
                    isOpen={expanded.has(key)}
                    onToggle={() => toggle(key)}
                    footer={
                      <RatingControls
                        country={country}
                        pairKey={key}
                        currentRating={rating}
                        onChange={onChangeRating}
                      />
                    }
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EvaluationSampleTabs({
  report,
  ratings,
  onChangeRating,
}: {
  report: ModelComparisonReport;
  ratings: RatingsByCountry;
  onChangeRating: (pairKey: string, next: PairRating | null) => void;
}) {
  const [active, setActive] = useState(report.models[0] ?? "");
  const sample = report.uniqueSignalRandomSample?.[active] ?? [];
  const total = report.uniqueSignalTotal?.[active] ?? 0;

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Evaluate each model&apos;s solo flags
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        For each model, a deterministic random sample drawn from the
        model&apos;s FULL solo-flag set. Rate each pair as &ldquo;real
        concern&rdquo; (worth a policymaker&apos;s attention) or &ldquo;thin /
        not actionable.&rdquo; The precision estimate updates as you go and
        carries a 95% confidence interval — small samples produce wide
        intervals; that&apos;s the math telling you what you can and
        can&apos;t conclude.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {report.models.map((slug) => {
          const sampleForModel = report.uniqueSignalRandomSample?.[slug] ?? [];
          const ratedCount = sampleForModel.filter(
            (row) => ratings[pairKeyOf(row)],
          ).length;
          const isActive = slug === active;
          return (
            <button
              key={slug}
              onClick={() => setActive(slug)}
              className="px-3 py-1.5 text-xs rounded border transition-colors"
              style={
                isActive
                  ? {
                      backgroundColor: modelColor(slug),
                      borderColor: modelColor(slug),
                      color: "white",
                    }
                  : { borderColor: "#e5e7eb", backgroundColor: "white" }
              }
            >
              {prettify(slug)}{" "}
              <span
                className={`ml-1 ${
                  isActive ? "opacity-80" : "text-[var(--undp-gray)]"
                }`}
              >
                ({ratedCount}/{sampleForModel.length})
              </span>
            </button>
          );
        })}
      </div>
      <EvaluationSampleSection
        key={active}
        country={report.country}
        heading={`${prettify(active)} solo flags`}
        framing={
          <>
            Random sample of {sample.length} pairs drawn from the{" "}
            <span className="font-medium">{total.toLocaleString()}</span> pairs
            that <span className="font-medium">only {prettify(active)}</span>{" "}
            flagged (no other model agreed). Reading these tells you whether
            this model is catching real concerns the others missed, or
            over-flagging.
          </>
        }
        sample={sample}
        totalAvailable={total}
        models={report.models}
        targets={report.targets}
        ratings={ratings}
        onChangeRating={onChangeRating}
      />
    </section>
  );
}

function ConsensusEvaluation({
  report,
  ratings,
  onChangeRating,
}: {
  report: ModelComparisonReport;
  ratings: RatingsByCountry;
  onChangeRating: (pairKey: string, next: PairRating | null) => void;
}) {
  const sample = report.consensusFlaggedRandomSample ?? [];
  const consensusTotal = report.flaggingOverlap?.consensusFlaggedCount ?? 0;

  return (
    <section>
      <h2 className="text-lg font-medium text-[var(--undp-black)] mb-2">
        Validate the consensus queue
      </h2>
      <p className="text-sm text-[var(--undp-gray)] mb-4 max-w-3xl">
        Pairs flagged by ALL {report.models.length} models. If the
        consensus queue isn&apos;t mostly &ldquo;real concern&rdquo;, the
        high-confidence triage tier needs recalibration. Rating this sample
        tells you whether you can act on consensus flags without further
        review.
      </p>
      <EvaluationSampleSection
        country={report.country}
        heading="Consensus-flagged pairs"
        framing={
          <>
            Random sample of {sample.length} pairs drawn from the{" "}
            <span className="font-medium">{consensusTotal.toLocaleString()}</span>{" "}
            pairs every model independently flagged. High precision here
            would mean the consensus queue is a safe, low-noise triage tier.
          </>
        }
        sample={sample}
        totalAvailable={consensusTotal}
        models={report.models}
        targets={report.targets}
        ratings={ratings}
        onChangeRating={onChangeRating}
      />
    </section>
  );
}
