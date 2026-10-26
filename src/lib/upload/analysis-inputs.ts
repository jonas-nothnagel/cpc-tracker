import { copyFileSync, writeFileSync } from "fs";
import { join } from "path";
import { OWN_LENS_TYPE } from "@/lib/own-lens";
import type { DocumentTypeEntry, TargetSource, TextCleanup } from "@/types";
import { KNOWN, cleanText as clean, documentColors, documentIds, promptLabel } from "./documents";
import { OWN_AREA_LIMITS, ownLensProblem as areasProblem, type OwnLensInput } from "./own-areas";

export { documentIds };
export type { OwnLensInput };

/**
 * An upload's inputs for the pipeline, built and checked before anything is
 * spent: the targets, the published category lists, a country config that
 * names and colours the documents, and the policy areas the upload brings.
 * Pure apart from `writeAnalysisInputs`, so every rule is tested without
 * Python.
 */

/** Targets and BTR mitigation measures together: every measure is compared
 *  with every target, so it costs what a target costs. */
export const MAX_ITEMS = 150;

/** One target as the wizard sends it, with the extraction's provenance. */
export interface TargetInput {
  text: string;
  /** The document's code: a framework code from the wizard ("NDC"), or any
   *  name a spreadsheet of targets brings. */
  sourceDocument: string;
  sourceLabel: string;
  activities?: string;
  actions?: string;
  textOriginal?: string;
  sourceLabelOriginal?: string;
  language?: string;
  textOriginalSource?: "source" | "machine";
  sources?: TargetSource[];
  textCleanup?: TextCleanup;
  pageNumbers?: number[];
  _provenanceFlag?: string;
}

export interface AnalyzeBody {
  country?: string;
  /** The language the wizard ran in. */
  locale?: string;
  /** Each document's name as the page shows it, by its code. Without it a
   *  name comes from the code (a framework's full name, or the code). */
  documents?: { code: string; name: string }[];
  targets: TargetInput[];
  btrData?: Record<string, unknown>;
  ownLens?: OwnLensInput;
  initialFootprint?: Record<string, unknown>;
}

export type CheckCode = "noCountry" | "noTargets" | "oneDocument" | "tooMany" | "ownLens";

export interface AnalysisInputs {
  targets: Record<string, unknown>[];
  countryConfig: { name: string; languages: string[]; documentTypes: DocumentTypeEntry[] };
  taxonomies: { _source: string; taxonomies: Record<string, unknown>[] } | null;
}

const COUNTRY_MAX = 80;

const UPLOAD_LANGUAGES = new Set(["es", "mn"]);

const SOURCE_NOTE = "Provided by the user with the upload; never drafted by the tool.";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function measureCount(btrData: AnalyzeBody["btrData"]): number {
  const measures = btrData?.mitigationMeasures;
  return Array.isArray(measures) ? measures.length : 0;
}

/** The API's English sentence for the first problem with the own areas. */
function ownLensProblem(lens: OwnLensInput): string | null {
  const problem = areasProblem(lens);
  const L = OWN_AREA_LIMITS;
  switch (problem?.code) {
    case undefined:
      return null;
    case "name":
      return `The policy areas need a name of at most ${L.name} characters.`;
    case "source":
      return `The source line holds at most ${L.source} characters.`;
    case "count":
      return `Between 1 and ${L.areas} policy areas are needed.`;
    case "areaName":
      return `Each policy area needs a name of at most ${L.areaName} characters.`;
    case "description":
      return `"${problem.area}" needs a description of at most ${L.description} characters.`;
    case "duplicate":
      return `"${problem.area}" appears twice.`;
  }
}

/** What stops a run before anything is spent. */
export function checkAnalyzeBody(
  body: AnalyzeBody,
): { ok: true } | { ok: false; code: CheckCode; error: string } {
  const fail = (code: CheckCode, error: string) => ({ ok: false as const, code, error });
  const country = clean(body.country);
  if (!country || country.length > COUNTRY_MAX) {
    return fail("noCountry", `A country name of at most ${COUNTRY_MAX} characters is needed.`);
  }
  const targets = Array.isArray(body.targets) ? body.targets : [];
  if (targets.length === 0) return fail("noTargets", "No targets were provided.");
  if (new Set(targets.map((t) => String(t.sourceDocument ?? ""))).size < 2) {
    return fail("oneDocument", "A comparison needs targets from at least two documents.");
  }
  const items = targets.length + measureCount(body.btrData);
  if (items > MAX_ITEMS) {
    return fail(
      "tooMany",
      `An analysis holds at most ${MAX_ITEMS} targets and reported actions together; this one has ${items}.`,
    );
  }
  if (body.ownLens) {
    const problem = ownLensProblem(body.ownLens);
    if (problem) return fail("ownLens", problem);
  }
  return { ok: true };
}

/** The analysis's input files, for a body that passed `checkAnalyzeBody`. */
export function buildAnalysisInputs(body: AnalyzeBody): AnalysisInputs {
  const country = clean(body.country);
  const codes = body.targets.map((t) => String(t.sourceDocument ?? ""));
  const ids = documentIds(codes);
  const names = new Map((body.documents ?? []).map((d) => [String(d.code ?? ""), clean(d.name)]));

  const colors = documentColors([...ids.keys()]);
  const documentTypes: DocumentTypeEntry[] = [...ids].map(([code, id], i) => {
    const known = KNOWN[code];
    const name = names.get(code);
    return {
      id,
      shortLabel: known ? code : code.length <= 12 && clean(code) === code ? code : id,
      mediumLabel: known ? known.prompt : promptLabel(name || code) || id,
      fullLabel: name || (known ? known.full : clean(code) || id),
      color: colors[i],
    };
  });
  const shortOf = new Map(documentTypes.map((d) => [d.id, d.shortLabel]));

  const counters = new Map<string, number>();
  const targets = body.targets.map((t, i) => {
    const doc = ids.get(codes[i])!;
    const n = (counters.get(doc) ?? 0) + 1;
    counters.set(doc, n);
    return {
      id: `${doc}_${n}`,
      text: t.text,
      sourceDocument: doc,
      sourceLabel: t.sourceLabel || `${shortOf.get(doc)} ${n}`,
      country,
      ...(t.activities ? { activities: t.activities } : {}),
      ...(t.actions ? { actions: t.actions } : {}),
      ...(t.textOriginal ? { textOriginal: t.textOriginal } : {}),
      ...(t.sourceLabelOriginal ? { sourceLabelOriginal: t.sourceLabelOriginal } : {}),
      ...(t.language ? { language: t.language } : {}),
      ...(t.textOriginalSource ? { textOriginalSource: t.textOriginalSource } : {}),
      ...(t.sources?.length ? { sources: t.sources } : {}),
      ...(t.textCleanup ? { textCleanup: t.textCleanup } : {}),
      ...(t.pageNumbers?.length ? { pageNumbers: t.pageNumbers } : {}),
      ...(t._provenanceFlag ? { _provenanceFlag: t._provenanceFlag } : {}),
    };
  });

  const lens = body.ownLens;
  const source = clean(lens?.source);
  const taxonomies = lens
    ? {
        _source: SOURCE_NOTE,
        taxonomies: [
          {
            taxonomyType: OWN_LENS_TYPE,
            name: clean(lens.name),
            ...(source ? { tooltip: source } : {}),
            _source: SOURCE_NOTE,
            categories: lens.areas.map((a, i) => ({
              id: `${OWN_LENS_TYPE}_${i + 1}`,
              name: clean(a.name),
              description: clean(a.description),
            })),
          },
        ],
      }
    : null;

  const locale = body.locale ?? "en";
  return {
    targets,
    countryConfig: { name: country, languages: UPLOAD_LANGUAGES.has(locale) ? [locale] : [], documentTypes },
    taxonomies,
  };
}

/** Write the inputs where the pipeline reads them: targets, the published
 *  category lists as they are, the country config, the policy areas, and the
 *  BTR tables and extraction footprint when the upload has them. */
export function writeAnalysisInputs(
  dirs: { input: string; output: string },
  inputs: AnalysisInputs,
  files: { categories: string; btrData?: unknown; initialFootprint?: unknown },
): void {
  const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value, null, 2));
  json(join(dirs.input, "targets.json"), inputs.targets);
  copyFileSync(files.categories, join(dirs.input, "categories.json"));
  json(join(dirs.input, "country-config.json"), inputs.countryConfig);
  if (inputs.taxonomies) json(join(dirs.input, "taxonomies.json"), inputs.taxonomies);
  // Only an object of tables: anything else would fail the run at its BTR
  // step, after every earlier step was paid for.
  if (isObject(files.btrData)) json(join(dirs.output, "btr_data.json"), files.btrData);
  if (files.initialFootprint !== undefined) json(join(dirs.input, "initial_footprint.json"), files.initialFootprint);
}
