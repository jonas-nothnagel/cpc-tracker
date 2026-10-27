import { readFileSync } from "fs";
import { join } from "path";
import { getCountry } from "@/config/countries";
import {
  assembleDashboardData,
  derivePaths,
  getCountryDashboardPayload,
  type DerivedPaths,
} from "@/lib/dashboard-data";

/**
 * The dashboard payload behind a brief, for the brief's routes: a registered
 * country's (cached for the container's life), or a completed upload's.
 * Unknown countries and malformed analysis ids are refused before any file
 * is read.
 */

export type BriefPayload =
  | { kind: "ok"; data: Record<string, unknown>; countryId: string | null }
  | { kind: "error"; status: number; error: string };

/** A run's status as written, or null when it cannot be read: missing, or
 *  caught mid-write. */
export function readRunStatus(outputDir: string): { status?: string; completedAt?: string | null } | null {
  try {
    return JSON.parse(readFileSync(join(outputDir, "status.json"), "utf8"));
  } catch {
    return null;
  }
}

// An upload's payload, kept per run: a click on a comparison should not
// re-read every file. A re-run writes a new completedAt, so it reads afresh.
const analyses = new Map<string, Record<string, unknown>>();
const MAX_KEPT = 20;

/** A completed upload's payload; 409 until its run says completed (data read
 *  mid-run is partial). */
export function analysisPayload(paths: DerivedPaths, locale: string): BriefPayload {
  const run = readRunStatus(paths.outputDir);
  if (run?.status !== "completed") return { kind: "error", status: 409, error: "Analysis not complete" };
  const key = `${paths.outputDir}|${locale}|${run.completedAt ?? ""}`;
  const kept = analyses.get(key);
  if (kept) return { kind: "ok", data: kept, countryId: null };
  const assembled = assembleDashboardData(paths, "analysis", locale);
  if (assembled.kind !== "ok") return { kind: "error", status: assembled.status, error: assembled.error };
  const data = assembled.data as unknown as Record<string, unknown>;
  analyses.set(key, data);
  if (analyses.size > MAX_KEPT) analyses.delete(analyses.keys().next().value as string);
  return { kind: "ok", data, countryId: null };
}

/** The payload a brief route asks for, by `analysis` id or `country` slug. */
export function briefPayload(
  params: { country: string | null; analysis: string | null },
  locale: string,
): BriefPayload {
  if (params.analysis) {
    const derived = derivePaths(params.analysis, null);
    if (derived.kind === "error") return { kind: "error", status: derived.status, error: derived.error };
    if (derived.kind !== "analysis") return { kind: "error", status: 400, error: "Invalid analysis ID" };
    return analysisPayload(derived.paths, locale);
  }
  const entry = getCountry((params.country ?? "").toLowerCase());
  if (!entry || !entry.visible) return { kind: "error", status: 404, error: "Unknown country" };
  const result = getCountryDashboardPayload(entry.id, locale, null);
  if (result.kind !== "ok") return { kind: "error", status: result.status, error: result.error };
  return { kind: "ok", data: result.payload.data as unknown as Record<string, unknown>, countryId: entry.id };
}
