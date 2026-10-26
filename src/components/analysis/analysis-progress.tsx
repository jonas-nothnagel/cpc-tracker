"use client";

import "@/components/brief/brief.css";
import "@/components/upload/upload.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { DotField } from "@/components/brief/dot-field";
import type { AnalysisFacts } from "@/lib/brief/analysis";
import { emptyCounts, toneOf, type ToneCounts } from "@/lib/brief/compute";
import type { AlignmentLevel } from "@/types";
import { ProgressDots } from "./progress-dots";

const POLL_MS = 2000;
// Polls that may fail in a row (a status caught mid-write, a dropped
// connection) before the page says it cannot read the run: about a minute.
const MAX_FAILED_POLLS = 30;
/** The finished pairs sort into the brief's inks before the brief opens. */
const SORT_MS = 3200;
/** Pairs compared, and time spent, before the pace says the time left. */
const PACE_AFTER_PAIRS = 50;
const PACE_AFTER_MS = 15_000;
const FINISHED = new Set(["completed", "failed", "interrupted"]);

interface RunStatus {
  status?: string;
  state?: string;
  ahead?: number;
  step?: number;
  progress?: { pairsDone?: number; pairsTotal?: number; startedAt?: string };
  summary?: { totalPairs?: number; alignmentLevels?: Record<string, number> } | null;
}

/** The finished run's target pairs by how they read, as the brief counts them. */
function toneCountsOf(levels: Record<string, number> | undefined): ToneCounts | null {
  if (!levels) return null;
  const counts = emptyCounts();
  for (const [level, n] of Object.entries(levels)) {
    if (typeof n !== "number" || n <= 0) continue;
    counts[toneOf(level as AlignmentLevel)] += n;
    counts.total += n;
  }
  return counts.total > 0 ? counts : null;
}

/**
 * An uploaded analysis's address before its brief exists: in the brief's
 * hero type, one grey dot per target pair, filling as the pairs are compared.
 * When the run completes, the dots sort into the brief's inks and the same
 * address shows the brief. A run that stopped offers to continue.
 * `unreadable` (a completed run whose results cannot be read) never refreshes.
 */
export function AnalysisProgress({
  id,
  facts,
  unreadable = false,
}: {
  id: string;
  facts: AnalysisFacts | null;
  unreadable?: boolean;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("analysis");
  const tb = useTranslations("brief.hero");
  const brand = useTranslations("header")("brand");
  const [status, setStatus] = useState<RunStatus | null>(null);
  // When the status was read, for the pace of the comparisons.
  const [lookedAt, setLookedAt] = useState(0);
  const [problem, setProblem] = useState<"missing" | "statusCheck" | null>(null);
  const [copied, setCopied] = useState(false);
  // A new round of looks after "Continue".
  const [round, setRound] = useState(0);
  const failures = useRef(0);

  const poll = useCallback(async (): Promise<RunStatus | "retry" | null> => {
    try {
      const res = await fetch(`/api/analyze/${id}/status`);
      if (res.status === 400 || res.status === 404) {
        setProblem("missing");
        return null;
      }
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data: RunStatus = await res.json();
      failures.current = 0;
      setStatus(data);
      setLookedAt(Date.now());
      return data;
    } catch {
      failures.current += 1;
      if (failures.current < MAX_FAILED_POLLS) return "retry";
      setProblem("statusCheck");
      return null;
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function loop() {
      const data = await poll();
      if (!active) return;
      if (data === "retry" || (data && !FINISHED.has(data.status ?? ""))) {
        timer = setTimeout(() => {
          if (active) loop();
        }, POLL_MS);
      }
    }
    loop();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [poll, round]);

  const completed = status?.status === "completed";
  const counts = completed ? toneCountsOf(status?.summary?.alignmentLevels) : null;
  const sorted = counts !== null;
  useEffect(() => {
    if (!completed || unreadable) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (!sorted || reduce) {
      router.refresh();
      return;
    }
    const timer = setTimeout(() => router.refresh(), SORT_MS);
    return () => clearTimeout(timer);
  }, [completed, sorted, unreadable, router]);

  const continueRun = async () => {
    const res = await fetch(`/api/analyze/${id}/continue`, { method: "POST" });
    if (res.status === 401) {
      window.location.href = `/login?from=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    // 409: it had gone back in line already. Either way, look again.
    if (res.ok || res.status === 409) {
      failures.current = 0;
      if (res.ok) setStatus((s) => ({ ...s, status: "queued", state: "queued" }));
      setRound((r) => r + 1);
    }
  };

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setCopied(false);
    }
  };

  const stopped = status?.status === "interrupted" || status?.status === "failed";
  const queued = status?.state === "queued" || status?.status === "queued";
  const going = !!status && !completed && !stopped;
  const step = status?.step ?? 0;
  const total = status?.progress?.pairsTotal || facts?.pairs || 0;
  const done = queued ? 0 : step > 5 ? total : Math.min(total, status?.progress?.pairsDone ?? 0);
  const ahead = status?.ahead ?? 0;

  let title: string | null = null;
  if (counts) title = t("progress.byRating", { total: counts.total });
  else if (stopped) title = status?.status === "interrupted" ? t("stopped.title") : t("stopped.failed");
  else if (queued && ahead > 0) title = t("progress.ahead", { count: ahead });
  else if (total > 0 && !unreadable) title = t("progress.compared", { done, total });

  let stepLine: string | null = null;
  if (going && !queued) {
    if (step === 5) {
      const since = Date.parse(status?.progress?.startedAt ?? "");
      const spent = lookedAt - since;
      const pace = Number.isFinite(since) && spent >= PACE_AFTER_MS ? done / (spent / 60_000) : 0;
      stepLine =
        done >= PACE_AFTER_PAIRS && pace > 0
          ? t("progress.comparingLeft", { minutes: Math.max(1, Math.ceil((total - done) / pace)) })
          : t("progress.comparing");
    } else {
      stepLine = step > 5 ? t("progress.themes") : t("progress.reading");
    }
  }

  return (
    <div data-brief className="up-root">
      <header className="up-top">
        <a className="up-brand" href={locale === "en" ? "/" : `/${locale}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own lockup, small and static */}
          <img src="/undp-logo.png" alt="UNDP" width={22} height={44} /> <span>{brand}</span>
        </a>
      </header>
      <main className="up-wait">
        {facts && (
          <>
            <p className="up-kicker">{tb("kicker", { country: facts.country })}</p>
            <p className="up-wait-figures">
              <span>{tb("documents", { count: facts.documents })}</span>
              <span>{tb("commitments", { count: facts.targets })}</span>
            </p>
          </>
        )}
        {problem ? (
          <p className="up-line">{t(problem)}</p>
        ) : (
          <>
            {title && <p className="up-picture-title">{title}</p>}
            {counts ? (
              <div className="up-sorted">
                <DotField counts={counts} shares entrance="mixed" />
              </div>
            ) : (
              total > 0 &&
              !stopped &&
              !unreadable && <ProgressDots done={done} total={total} label={title ?? ""} />
            )}
            <div className="up-wait-lines">
              {stepLine && <p className="up-line">{stepLine}</p>}
              {going && (
                <>
                  <p className="up-line">{t("progress.closable")}</p>
                  <p className="up-line">
                    <button type="button" className="brief-button-quiet" onClick={copyAddress}>
                      {copied ? t("progress.copied") : t("progress.copy")}
                    </button>
                  </p>
                </>
              )}
              {counts && <p className="up-line">{t("progress.opening")}</p>}
              {unreadable && (
                <>
                  <p className="up-line">{t("unreadable")}</p>
                  <p className="up-line">
                    <button
                      type="button"
                      className="brief-button-quiet"
                      onClick={() => router.push(`/dashboard?analysisId=${id}`)}
                    >
                      {t("openPrevious")}
                    </button>
                  </p>
                </>
              )}
            </div>
            {stopped && (
              <div className="up-actions">
                <button type="button" className="brief-button-primary" onClick={continueRun}>
                  {t("stopped.continue")}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
