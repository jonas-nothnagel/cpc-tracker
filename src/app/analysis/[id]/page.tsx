"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/ui/header";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FootprintSnapshot {
  energy_wh: number;
  water_ml: number;
  co2_geq: number;
  minerals_ugsbeq: number;
  call_count: number;
  tracked_call_count: number;
  cached_call_count: number;
  model: string | null;
  available: boolean;
  source?: "measured" | "estimated" | "unavailable";
}

interface AnalysisStatus {
  status: "starting" | "running" | "completed" | "failed";
  step: number;
  totalSteps: number;
  currentStep: string;
  message: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
  summary: {
    totalTargets: number;
    totalClassifications: number;
    relevantClassifications: number;
    totalPairs: number;
    alignmentLevels: Record<string, number>;
    elapsedSeconds: number;
  } | null;
  footprint?: FootprintSnapshot;
}

function formatFootprintValue(value: number): string {
  if (!isFinite(value) || value < 0) return "0";
  if (value === 0) return "0";
  if (value < 0.01) return "<0.01";
  if (value < 100) return value.toFixed(2);
  return Math.round(value).toLocaleString();
}

function FootprintDisplay({ footprint }: { footprint: FootprintSnapshot }) {
  if (!footprint.available) {
    return null;
  }

  const metrics = [
    { label: "Energy", value: formatFootprintValue(footprint.energy_wh), unit: "Wh" },
    { label: "Water", value: formatFootprintValue(footprint.water_ml), unit: "mL" },
    { label: "CO\u2082eq", value: formatFootprintValue(footprint.co2_geq), unit: "g" },
    {
      label: "Minerals",
      value: formatFootprintValue(footprint.minerals_ugsbeq),
      unit: "\u00b5gSbeq",
    },
  ];

  const callSummary =
    footprint.source === "estimated"
      ? `${footprint.cached_call_count.toLocaleString()} cached calls`
      : `${footprint.tracked_call_count.toLocaleString()} calls tracked${
          footprint.cached_call_count > 0
            ? ` \u00b7 ${footprint.cached_call_count.toLocaleString()} cached`
            : ""
        }`;

  return (
    <div className="mt-6 max-w-md mx-auto">
      <div className="rounded-md border border-gray-100 bg-gray-50/50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[var(--undp-black)]">
            Environmental footprint
          </span>
          <span className="text-[10px] text-[var(--undp-gray)]">
            {callSummary}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {metrics.map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-sm font-semibold text-[var(--undp-black)]">
                {m.value}
              </div>
              <div className="text-[10px] text-[var(--undp-gray)]">
                {m.label} ({m.unit})
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-[var(--undp-gray)] mt-2 leading-snug">
          {footprint.source === "estimated"
            ? "Estimated from call counts (cached run) via EcoLogits."
            : "Measured via EcoLogits."}{" "}
          Values are indicative and may differ from actual consumption.
        </p>
      </div>
    </div>
  );
}

type NodeState = "pending" | "active" | "done";

// ─── Pipeline visualization ──────────────────────────────────────────────────

function PipelineNode({
  step,
  title,
  detail,
  output,
  state,
  isLast,
}: {
  step: number;
  title: string;
  detail?: string;
  output?: string;
  state: NodeState;
  isLast?: boolean;
}) {
  return (
    <div className="relative">
      {/* Node row */}
      <div className="flex items-start gap-4">
        {/* Step indicator + connector line */}
        <div className="flex flex-col items-center w-8 shrink-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-all duration-500 ${
              state === "done"
                ? "border-green-500 bg-green-500 text-white"
                : state === "active"
                ? "border-[var(--undp-blue)] bg-[var(--undp-blue)] text-white"
                : "border-gray-200 bg-white text-gray-300"
            }`}
          >
            {state === "done" ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2.5 7.5L5.5 10.5L11.5 3.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              step
            )}
          </div>
          {/* Connector line */}
          {!isLast && (
            <div
              className={`w-0.5 flex-1 min-h-[24px] transition-colors duration-500 ${
                state === "done" ? "bg-green-300" : "bg-gray-100"
              }`}
            />
          )}
        </div>

        {/* Content box */}
        <div
          className={`flex-1 rounded-lg border px-4 py-3 mb-3 transition-all duration-500 ${
            state === "active"
              ? "border-[var(--undp-blue)] bg-blue-50/50 shadow-sm"
              : state === "done"
              ? "border-green-200 bg-green-50/30"
              : "border-gray-100 bg-gray-50/50"
          }`}
        >
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-medium transition-colors duration-300 ${
                state === "active"
                  ? "text-[var(--undp-blue)]"
                  : state === "done"
                  ? "text-[var(--undp-black)]"
                  : "text-gray-300"
              }`}
            >
              {title}
            </span>
            {state === "active" && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-[var(--undp-blue)] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          {detail && (
            <p
              className={`text-xs mt-1 transition-colors duration-300 ${
                state === "pending" ? "text-gray-200" : "text-[var(--undp-gray)]"
              }`}
            >
              {detail}
            </p>
          )}
          {output && state === "done" && (
            <div className="mt-2">
              <span className="inline-block text-[10px] font-mono px-2 py-0.5 rounded bg-green-100 text-green-700">
                {output}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InputChip({
  label,
  state,
}: {
  label: string;
  state: NodeState;
}) {
  return (
    <span
      className={`inline-block text-[10px] font-mono px-2.5 py-1 rounded border transition-all duration-500 ${
        state === "pending"
          ? "border-gray-100 bg-gray-50 text-gray-300"
          : "border-gray-200 bg-white text-[var(--undp-gray)] shadow-sm"
      }`}
    >
      {label}
    </span>
  );
}

function PipelineViz({ status }: { status: AnalysisStatus }) {
  const step = status.step;
  const done = status.status === "completed";
  const summary = status.summary;

  function getState(nodeStep: number): NodeState {
    if (done) return "done";
    if (step > nodeStep) return "done";
    if (step === nodeStep) return "active";
    return "pending";
  }

  const pairCount = summary ? summary.totalPairs.toLocaleString() : "...";

  return (
    <div>
      {/* Input labels */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <InputChip label="Your policy targets" state={step >= 1 ? "active" : "pending"} />
        <span className={`text-xs transition-colors duration-500 ${step >= 1 ? "text-[var(--undp-gray)]" : "text-gray-200"}`}>+</span>
        <InputChip label="NBS categories & IPCC sectors" state={step >= 1 ? "active" : "pending"} />
      </div>

      {/* Merge arrow */}
      <div className="flex justify-center mb-2">
        <div className={`w-0.5 h-5 transition-colors duration-500 ${step >= 1 ? "bg-gray-300" : "bg-gray-100"}`} />
      </div>

      {/* Pipeline steps */}
      <div className="max-w-md mx-auto">
        <PipelineNode
          step={1}
          title="Quantitative detection"
          detail="Scanning each target for numeric metrics and time-bound commitments"
          output={getState(1) === "done" ? "Metrics and deadlines identified" : undefined}
          state={getState(1)}
        />
        <PipelineNode
          step={2}
          title="Thematic classification"
          detail="Mapping each target to relevant NBS categories and IPCC sectors"
          output={
            getState(2) === "done" && summary
              ? `${summary.relevantClassifications} relevant matches found across ${summary.totalClassifications.toLocaleString()} comparisons`
              : undefined
          }
          state={getState(2)}
        />
        <PipelineNode
          step={3}
          title="Cross-document pairing"
          detail="Identifying targets from different documents that share common IPCC sectors"
          output={
            getState(3) === "done"
              ? `${pairCount} target pairs identified for comparison`
              : undefined
          }
          state={getState(3)}
        />
        <PipelineNode
          step={4}
          title="Target decomposition"
          detail="Breaking down each target into goals, actions, ecosystems, audiences, and expected impacts"
          output={getState(4) === "done" ? "All paired targets decomposed" : undefined}
          state={getState(4)}
        />
        <PipelineNode
          step={5}
          title="Alignment assessment"
          detail="Comparing target pairs to determine policy coherence levels"
          output={
            getState(5) === "done" && summary
              ? `${pairCount} pairs assessed: ${summary.alignmentLevels?.high ?? 0} high, ${summary.alignmentLevels?.medium ?? 0} medium, ${summary.alignmentLevels?.low ?? 0} low alignment`
              : undefined
          }
          state={getState(5)}
          isLast
        />
      </div>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/${id}/status`);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Analysis not found");
        return null;
      }
      const data: AnalysisStatus = await res.json();
      setStatus(data);
      return data;
    } catch {
      setError("Failed to check analysis status");
      return null;
    }
  }, [id]);

  useEffect(() => {
    let active = true;

    async function loop() {
      const data = await poll();
      if (!active) return;
      if (data && (data.status === "starting" || data.status === "running")) {
        setTimeout(() => {
          if (active) loop();
        }, 2000);
      }
    }

    loop();
    return () => {
      active = false;
    };
  }, [poll]);

  // Live elapsed timer
  useEffect(() => {
    if (
      !status ||
      status.status === "completed" ||
      status.status === "failed"
    )
      return;
    const start = new Date(status.startedAt).getTime();
    const interval = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const progress = status
    ? Math.round((status.step / status.totalSteps) * 100)
    : 0;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header subtitle="Analysis" />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {/* ─── Error state ──────────────────────────────────── */}
        {error && (
          <div className="text-center">
            <h2 className="text-lg font-medium text-red-600 mb-2">Error</h2>
            <p className="text-sm text-[var(--undp-gray)]">{error}</p>
            <Link
              href="/upload"
              className="inline-block mt-6 px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
            >
              Back to Upload
            </Link>
          </div>
        )}

        {/* ─── Loading ──────────────────────────────────────── */}
        {!error && !status && (
          <div className="text-center py-12">
            <p className="text-[var(--undp-gray)]">
              Loading analysis status...
            </p>
          </div>
        )}

        {/* ─── Running ──────────────────────────────────────── */}
        {status &&
          status.status !== "failed" &&
          status.status !== "completed" && (
            <div>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
                  Running Analysis
                </h1>
                <p className="text-sm text-[var(--undp-gray)]">
                  {status.message}
                </p>
              </div>

              {/* Progress summary bar */}
              <div className="mb-6 max-w-md mx-auto">
                <div className="flex justify-between text-xs text-[var(--undp-gray)] mb-2">
                  <span>
                    Step {status.step} of {status.totalSteps}
                  </span>
                  <span>{elapsed > 0 ? `${elapsed}s` : ""}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-[var(--undp-blue)] h-1.5 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(progress, 3)}%` }}
                  />
                </div>
              </div>

              {/* Running environmental footprint */}
              {status.footprint && (
                <div className="mb-10">
                  <FootprintDisplay footprint={status.footprint} />
                </div>
              )}

              {/* Pipeline diagram */}
              <PipelineViz status={status} />
            </div>
          )}

        {/* ─── Completed ────────────────────────────────────── */}
        {status?.status === "completed" && (
          <div>
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 28 28"
                  fill="none"
                  className="text-green-600"
                >
                  <path
                    d="M5 15L11 21L23 7"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
                Analysis Complete
              </h1>
              {status.summary && (
                <p className="text-sm text-[var(--undp-gray)] mb-6">
                  Processed {status.summary.totalTargets} targets with{" "}
                  {status.summary.totalPairs} alignment pairs in{" "}
                  {status.summary.elapsedSeconds}s
                </p>
              )}
              <button
                onClick={() => router.push(`/dashboard?analysisId=${id}`)}
                className="px-8 py-3 bg-[var(--undp-blue)] text-white text-sm font-medium rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                View Dashboard →
              </button>
              {status.footprint && (
                <FootprintDisplay footprint={status.footprint} />
              )}
            </div>

            {/* Show completed pipeline */}
            <PipelineViz status={status} />
          </div>
        )}

        {/* ─── Failed ───────────────────────────────────────── */}
        {status?.status === "failed" && (
          <div>
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
                <span className="text-red-600 text-2xl font-bold">!</span>
              </div>
              <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
                Analysis Failed
              </h1>
              <p className="text-sm text-red-600 mb-4">{status.error}</p>
              <p className="text-sm text-[var(--undp-gray)] mb-6">
                The pipeline encountered an error. Please check your targets and
                try again.
              </p>
              <Link
                href="/upload"
                className="inline-block px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                Back to Upload
              </Link>
            </div>

            {/* Show pipeline state at failure */}
            <PipelineViz status={status} />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          United Nations Development Programme · CPC Tracker
        </div>
      </footer>
    </div>
  );
}
