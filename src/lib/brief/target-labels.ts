/**
 * A country's targets and reported actions in a language their documents
 * do not give, kept beside its targets in
 * python/data/{country}-target-labels.json: each target's title, and a
 * reported action's title and text, by id and language. Machine
 * translations, shown under the page's machine-translation note. Display
 * only: the pipeline never reads them, and an id the file does not name
 * keeps its own.
 */

import { existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

type ByLanguage = Record<string, Record<string, string>>;

export interface TargetLabels {
  /** id → language → title. */
  labels: ByLanguage;
  /** id → language → text (reported actions only). */
  texts: ByLanguage;
}

function byLanguage(raw: unknown): ByLanguage {
  const out: ByLanguage = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const kept: Record<string, string> = {};
    for (const [locale, text] of Object.entries(value as Record<string, unknown>)) {
      if (typeof text === "string" && text) kept[locale] = text;
    }
    if (Object.keys(kept).length > 0) out[id] = kept;
  }
  return out;
}

export function parseTargetLabels(raw: unknown): TargetLabels | null {
  const file = raw as { labels?: unknown; texts?: unknown } | null;
  if (!file?.labels || typeof file.labels !== "object") return null;
  return { labels: byLanguage(file.labels), texts: byLanguage(file.texts) };
}

function inLanguage(table: ByLanguage | undefined, locale: string): Record<string, string> | undefined {
  if (!table) return undefined;
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(table)) {
    if (value[locale]) out[id] = value[locale];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The titles in one language, by id; nothing where the file holds none. */
export function labelsIn(labels: TargetLabels | null, locale: string): Record<string, string> | undefined {
  return inLanguage(labels?.labels, locale);
}

/** The texts in one language, by id; nothing where the file holds none. */
export function textsIn(labels: TargetLabels | null, locale: string): Record<string, string> | undefined {
  return inLanguage(labels?.texts, locale);
}

const cache = new Map<string, { mtime: number; value: TargetLabels | null }>();

/** Server side only: the country's file, re-read when it changes. */
export function loadTargetLabels(countryId: string): TargetLabels | null {
  const path = join(process.cwd(), "python", "data", `${countryId}-target-labels.json`);
  if (!existsSync(path)) return null;
  const mtime = statSync(path).mtimeMs;
  const hit = cache.get(path);
  if (hit && hit.mtime === mtime) return hit.value;
  const value = parseTargetLabels(JSON.parse(readFileSync(path, "utf8")));
  cache.set(path, { mtime, value });
  return value;
}
