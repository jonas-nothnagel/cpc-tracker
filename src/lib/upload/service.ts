import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { readLedger } from "@/lib/footprint/ledger";
import { analysesDir } from "./draft";
import { DEFAULT_GRAMS_PER_CALL, DEFAULT_PAIRS_PER_MINUTE, pairsPerMinute, type Speed } from "./estimate";
import { readJson } from "./files";

/**
 * What this deployment tells the upload page about itself, from its own
 * settings and history: which model reads the documents, on which provider, and whether
 * only public documents may be added (UNDP's hosted service), and how fast
 * and with what footprint its analyses run. A government running its own
 * copy with its own model sees its own names and its own measurements.
 * Server-only.
 */

export interface ServiceFacts {
  model: string;
  provider: string;
  /** "Only public documents can be added." */
  publicOnly: boolean;
}

type Env = Record<string, string | undefined>;

function host(url: string | undefined): string | null {
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

export function serviceFacts(env: Env = process.env): ServiceFacts {
  const model = (env.LLM_MODEL || "openai/gpt-4o-mini").split("/").pop() || "the configured model";
  const base = host(env.LLM_BASE_URL);
  let provider: string;
  if (env.AZURE_OPENAI_ENDPOINT || base?.endsWith("openai.azure.com")) provider = "Azure OpenAI";
  else if (!base || base === "openrouter.ai" || base.endsWith(".openrouter.ai")) provider = "OpenRouter";
  else provider = base;
  const flag = env.CPC_PUBLIC_DOCUMENTS_ONLY;
  const publicOnly = flag === "1" || (env.NODE_ENV === "production" && flag !== "0");
  return { model, provider, publicOnly };
}

const RECENT_RUNS = 10;
const KEEP_MS = 10 * 60_000;
let kept: { at: number; speed: Speed } | null = null;

/** This service's completed analyses, newest first: target pairs and
 *  seconds. A resumed run's time covers its second attempt only, so it is
 *  left out. */
export function runHistory(): { pairs: number; seconds: number }[] {
  const root = analysesDir();
  if (!existsSync(root)) return [];
  type Summary = { totalPairs?: unknown; elapsedSeconds?: unknown; resumed?: unknown };
  const runs: { at: number; pairs: number; seconds: number }[] = [];
  for (const id of readdirSync(root)) {
    const status = readJson<{ status?: string; completedAt?: string; summary?: Summary }>(
      join(root, id, "output", "status.json"),
    );
    const s = status?.summary;
    if (status?.status !== "completed" || !s || s.resumed) continue;
    if (typeof s.totalPairs !== "number" || typeof s.elapsedSeconds !== "number") continue;
    runs.push({ at: Date.parse(status.completedAt ?? "") || 0, pairs: s.totalPairs, seconds: s.elapsedSeconds });
  }
  return runs
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_RUNS)
    .map(({ pairs, seconds }) => ({ pairs, seconds }));
}

/** Grams of CO2e per call made (not served from the cache), over the
 *  pipeline's rows in this service's footprint ledger. */
export function gramsPerCall(): number {
  let grams = 0;
  let calls = 0;
  for (const row of readLedger()) {
    if (row.component !== "user_pipeline" && row.component !== "dev_pipeline") continue;
    const live = (row.call_count ?? 0) - (row.cached_call_count ?? 0);
    if (live <= 0 || !(row.co2_geq > 0)) continue;
    grams += row.co2_geq;
    calls += live;
  }
  return calls > 0 ? grams / calls : DEFAULT_GRAMS_PER_CALL;
}

/** The pace and footprint the start's estimate uses, read at most every
 *  10 minutes. */
export function serviceSpeed(now = Date.now()): Speed {
  if (kept && now - kept.at < KEEP_MS) return kept.speed;
  let speed: Speed;
  try {
    speed = { pairsPerMinute: pairsPerMinute(runHistory()), gramsPerCall: gramsPerCall() };
  } catch {
    speed = { pairsPerMinute: DEFAULT_PAIRS_PER_MINUTE, gramsPerCall: DEFAULT_GRAMS_PER_CALL };
  }
  kept = { at: now, speed };
  return speed;
}
