"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Header } from "@/components/ui/header";
import { formatFootprintValue, type FootprintSnapshot } from "@/lib/footprint";

// ─── Types ───────────────────────────────────────────────────────────────────

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

function FootprintDisplay({ footprint }: { footprint: FootprintSnapshot }) {
  const t = useTranslations("analysis.footprint");
  if (!footprint.available) {
    return null;
  }

  const metrics = [
    { label: t("energyLabel"), value: formatFootprintValue(footprint.energy_wh), unit: t("energyUnit") },
    { label: t("waterLabel"), value: formatFootprintValue(footprint.water_ml), unit: t("waterUnit") },
    { label: t("co2Label"), value: formatFootprintValue(footprint.co2_geq), unit: t("co2Unit") },
    {
      label: t("mineralsLabel"),
      value: formatFootprintValue(footprint.minerals_ugsbeq),
      unit: t("mineralsUnit"),
    },
  ];

  const callSummary =
    footprint.source === "estimated"
      ? t("cachedCalls", { count: footprint.cached_call_count })
      : footprint.cached_call_count > 0
        ? t("callsWithCache", {
            tracked: footprint.tracked_call_count,
            cached: footprint.cached_call_count,
          })
        : t("callsTracked", { count: footprint.tracked_call_count });

  return (
    <div className="mt-6 max-w-md mx-auto">
      <div className="rounded-md border border-gray-100 bg-gray-50/50 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[var(--undp-black)]">
            {t("title")}
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
          {footprint.source === "estimated" ? t("estimatedNote") : t("measuredNote")}{" "}
          {t("indicativeNote")}
        </p>
      </div>
    </div>
  );
}

type NodeState = "pending" | "active" | "done";

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
      <div className="flex items-start gap-4">
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
          {!isLast && (
            <div
              className={`w-0.5 flex-1 min-h-[24px] transition-colors duration-500 ${
                state === "done" ? "bg-green-300" : "bg-gray-100"
              }`}
            />
          )}
        </div>

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
  const t = useTranslations("analysis.pipeline");
  const step = status.step;
  const done = status.status === "completed";
  const summary = status.summary;

  function getState(nodeStep: number): NodeState {
    if (done) return "done";
    if (step > nodeStep) return "done";
    if (step === nodeStep) return "active";
    return "pending";
  }

  return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-4">
        <InputChip label={t("input.policyTargets")} state={step >= 1 ? "active" : "pending"} />
        <span className={`text-xs transition-colors duration-500 ${step >= 1 ? "text-[var(--undp-gray)]" : "text-gray-200"}`}>+</span>
        <InputChip label={t("input.taxonomy")} state={step >= 1 ? "active" : "pending"} />
      </div>

      <div className="flex justify-center mb-2">
        <div className={`w-0.5 h-5 transition-colors duration-500 ${step >= 1 ? "bg-gray-300" : "bg-gray-100"}`} />
      </div>

      <div className="max-w-md mx-auto">
        <PipelineNode
          step={1}
          title={t("step1.title")}
          detail={t("step1.detail")}
          output={getState(1) === "done" ? t("step1.output") : undefined}
          state={getState(1)}
        />
        <PipelineNode
          step={2}
          title={t("step2.title")}
          detail={t("step2.detail")}
          output={
            getState(2) === "done" && summary
              ? t("step2.output", {
                  relevant: summary.relevantClassifications,
                  total: summary.totalClassifications,
                })
              : undefined
          }
          state={getState(2)}
        />
        <PipelineNode
          step={3}
          title={t("step3.title")}
          detail={t("step3.detail")}
          output={
            getState(3) === "done" && summary
              ? t("step3.output", { count: summary.totalPairs })
              : undefined
          }
          state={getState(3)}
        />
        <PipelineNode
          step={4}
          title={t("step4.title")}
          detail={t("step4.detail")}
          output={getState(4) === "done" ? t("step4.output") : undefined}
          state={getState(4)}
        />
        <PipelineNode
          step={5}
          title={t("step5.title")}
          detail={t("step5.detail")}
          output={
            getState(5) === "done" && summary
              ? t("step5.output", {
                  count: summary.totalPairs,
                  high: summary.alignmentLevels?.high ?? 0,
                  medium: summary.alignmentLevels?.medium ?? 0,
                  low: summary.alignmentLevels?.low ?? 0,
                })
              : undefined
          }
          state={getState(5)}
          isLast
        />
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const t = useTranslations("analysis");
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/${id}/status`);
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? t("errors.notFound"));
        return null;
      }
      const data: AnalysisStatus = await res.json();
      setStatus(data);
      return data;
    } catch {
      setError(t("errors.statusCheck"));
      return null;
    }
  }, [id, t]);

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
      <Header subtitle={t("headerSubtitle")} />

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        {error && (
          <div className="text-center">
            <h2 className="text-lg font-medium text-red-600 mb-2">{t("errorHeading")}</h2>
            <p className="text-sm text-[var(--undp-gray)]">{error}</p>
            <Link
              href="/upload"
              className="inline-block mt-6 px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
            >
              {t("backToUpload")}
            </Link>
          </div>
        )}

        {!error && !status && (
          <div className="text-center py-12">
            <p className="text-[var(--undp-gray)]">
              {t("loadingStatus")}
            </p>
          </div>
        )}

        {status &&
          status.status !== "failed" &&
          status.status !== "completed" && (
            <div>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
                  {t("running.title")}
                </h1>
                <p className="text-sm text-[var(--undp-gray)]">
                  {status.message}
                </p>
              </div>

              <div className="mb-6 max-w-md mx-auto">
                <div className="flex justify-between text-xs text-[var(--undp-gray)] mb-2">
                  <span>
                    {t("running.stepOf", { step: status.step, total: status.totalSteps })}
                  </span>
                  <span>{elapsed > 0 ? t("running.elapsed", { sec: elapsed }) : ""}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-[var(--undp-blue)] h-1.5 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.max(progress, 3)}%` }}
                  />
                </div>
              </div>

              {status.footprint && (
                <div className="mb-10">
                  <FootprintDisplay footprint={status.footprint} />
                </div>
              )}

              <PipelineViz status={status} />
            </div>
          )}

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
                {t("complete.title")}
              </h1>
              {status.summary && (
                <p className="text-sm text-[var(--undp-gray)] mb-6">
                  {t("complete.summary", {
                    targets: status.summary.totalTargets,
                    pairs: status.summary.totalPairs,
                    sec: status.summary.elapsedSeconds,
                  })}
                </p>
              )}
              <button
                onClick={() => router.push(`/dashboard?analysisId=${id}`)}
                className="px-8 py-3 bg-[var(--undp-blue)] text-white text-sm font-medium rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                {t("complete.viewDashboard")}
              </button>
              {status.footprint && (
                <FootprintDisplay footprint={status.footprint} />
              )}
            </div>

            <PipelineViz status={status} />
          </div>
        )}

        {status?.status === "failed" && (
          <div>
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5">
                <span className="text-red-600 text-2xl font-bold">!</span>
              </div>
              <h1 className="text-2xl font-semibold text-[var(--undp-black)] mb-2">
                {t("failed.title")}
              </h1>
              <p className="text-sm text-red-600 mb-4">{status.error}</p>
              <p className="text-sm text-[var(--undp-gray)] mb-6">
                {t("failed.body")}
              </p>
              <Link
                href="/upload"
                className="inline-block px-6 py-2.5 bg-[var(--undp-blue)] text-white text-sm rounded-md hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                {t("backToUpload")}
              </Link>
            </div>

            <PipelineViz status={status} />
          </div>
        )}
      </main>

      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 text-sm text-[var(--undp-gray)]">
          {t("footer")}
        </div>
      </footer>
    </div>
  );
}
