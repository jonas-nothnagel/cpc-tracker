import { routing, type Locale } from "@/i18n/routing";
import { derivePaths, type DerivedPaths } from "@/lib/dashboard-data";
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
}

export function analysisBrief(id: string, locale: string): AnalysisBrief {
  const derived = derivePaths(id, null);
  if (derived.kind !== "analysis") return { kind: "missing" };
  return analysisBriefFrom(derived.paths, id, locale);
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
