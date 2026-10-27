import { join } from "path";
import { routing, type Locale } from "@/i18n/routing";
import { derivePaths, type DerivedPaths } from "@/lib/dashboard-data";
import { pairCount } from "@/lib/upload/documents";
import { readJson } from "@/lib/upload/files";
import { briefInEnglish } from "./language-gate";
import { analysisPayload } from "./payload";
import { buildBriefSource, type BriefSource } from "./source";

type Params = Record<string, string | string[] | undefined>;

/**
 * What an uploaded analysis's address shows: nothing for an unknown id; the
 * progress of a run still going, or failed; the brief once the run is
 * complete; and a plain notice when a completed run's results cannot be
 * read, so the page never waits for them forever.
 */
export type AnalysisBrief =
  | { kind: "missing" }
  | { kind: "pending" }
  | { kind: "unreadable" }
  | { kind: "ready"; source: BriefSource; data: Record<string, unknown> };

export function analysisBriefFrom(paths: DerivedPaths, id: string, locale: string): AnalysisBrief {
  try {
    const payload = analysisPayload(paths, locale);
    if (payload.kind !== "ok") return { kind: payload.status === 409 ? "pending" : "unreadable" };
    const { data } = payload;
    const config = data.countryConfig as { name?: string; languages?: string[] } | null;
    const first = (data.targets as { country?: string }[] | undefined)?.[0];
    const countryName = config?.name || first?.country || "";
    const source: BriefSource = {
      ...buildBriefSource({ countryId: "", countryName, data, locale }),
      analysisId: id,
      languages: config?.languages ?? [],
    };
    return { kind: "ready", source, data };
  } catch (err) {
    // Results there but malformed: the plain notice, never an error page.
    console.error("An analysis's results could not be read:", err instanceof Error ? err.message : err);
    return { kind: "unreadable" };
  }
}

export function analysisBrief(id: string, locale: string): AnalysisBrief {
  const derived = derivePaths(id, null);
  if (derived.kind !== "analysis") return { kind: "missing" };
  return analysisBriefFrom(derived.paths, id, locale);
}

/** What the waiting page says about an analysis before its brief exists. */
export interface AnalysisFacts {
  country: string;
  documents: number;
  targets: number;
  /** Target pairs from two different documents: one dot each. */
  pairs: number;
}

export function analysisFactsFrom(paths: DerivedPaths): AnalysisFacts | null {
  const targets = readJson<{ sourceDocument?: string; country?: string }[]>(join(paths.dataDir, "targets.json"));
  if (!Array.isArray(targets)) return null;
  const config = readJson<{ name?: string }>(join(paths.dataDir, "country-config.json"));
  const perDocument = new Map<string, number>();
  for (const t of targets) perDocument.set(String(t.sourceDocument), (perDocument.get(String(t.sourceDocument)) ?? 0) + 1);
  return {
    country: config?.name || targets[0]?.country || "",
    documents: perDocument.size,
    targets: targets.length,
    pairs: pairCount([...perDocument.values()]),
  };
}

export function analysisFacts(id: string): AnalysisFacts | null {
  const derived = derivePaths(id, null);
  return derived.kind === "analysis" ? analysisFactsFrom(derived.paths) : null;
}

/** Where an upload's brief opened in a language the upload was not started
 *  in sends the reader: the same brief and choices in English, or null. */
export function analysisInEnglish(id: string, languages: string[], locale: string, searchParams: Params): string | null {
  const offered = languages.filter(
    (l): l is Exclude<Locale, "en"> => l !== "en" && (routing.locales as readonly string[]).includes(l),
  );
  // The gate builds `/en/<id>/<path>`: "analysis" and the run's id make the
  // analysis's own address.
  return briefInEnglish({ id: "analysis", languages: offered }, locale, id, searchParams);
}
