import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { getCountry, isValidCountryId } from "@/config/countries";

/**
 * GET /api/storyline-state?country=<id>&hidden=<canonicalKey>
 *
 * On-demand corpus storyline regeneration for an OFF-PATH document subset (a
 * hidden-doc combination the pipeline did not precompute). The numbers and the
 * doc-pair storylines are already exact client-side; this fills in the one
 * whole-set layer (the corpus summary + storylines) so an arbitrary selection
 * still reads consistently.
 *
 * It does NOT run the analysis pipeline: it spawns the existing
 * `synthesize_corpus --hidden <key>`, which filters the already-computed
 * doc-pair summaries and makes a single synthesis LLM call. That call hits and
 * populates the same `.cache/corpus_themes` namespace (persistent on Azure), so
 * each subset costs an LLM call at most once, ever.
 *
 * Guarded so casual toggling can't spam Azure: the client debounces and only
 * calls for off-path subsets, and this route de-dupes concurrent identical
 * requests and caches results for the container lifetime.
 *
 * Requires Python + uv (Azure App Service); returns 501 on serverless (Vercel),
 * where the client falls back to the full-set prose + caveat.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROJECT_ROOT = process.cwd();
const IS_SERVERLESS =
  !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const SPAWN_TIMEOUT_MS = 60_000;
const MAX_DOCS_IN_KEY = 12;

// Container-lifetime cache of in-flight + resolved results, keyed by
// `${countryId}:${hiddenKey}`. De-dupes concurrent requests and avoids
// re-spawning Python for a subset already computed this session.
const stateCache = new Map<string, Promise<Record<string, unknown>>>();

/** Re-canonicalise a hidden-doc key: split on '+', validate each id, sort,
 *  rejoin. Mirrors the client/Python `canonicalHiddenKey` and rejects junk. */
function canonicaliseHiddenKey(raw: string): string | null {
  const parts = raw
    .split("+")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_DOCS_IN_KEY) return null;
  for (const p of parts) {
    if (!/^[A-Za-z0-9_]{1,32}$/.test(p)) return null;
  }
  return Array.from(new Set(parts)).sort().join("+");
}

function runSynthesis(
  countryId: string,
  hiddenKey: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "uv",
      [
        "run",
        "python",
        "-m",
        "src.synthesize_corpus",
        "--country",
        countryId,
        "--hidden",
        hiddenKey,
      ],
      { cwd: join(PROJECT_ROOT, "python"), env: { ...process.env } },
    );

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("synthesis timed out"));
    }, SPAWN_TIMEOUT_MS);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(`synthesis exited ${code}: ${stderr.slice(-500)}`),
        );
        return;
      }
      try {
        // stdout carries only the JSON; logging goes to stderr.
        resolve(JSON.parse(stdout.trim()) as Record<string, unknown>);
      } catch {
        reject(new Error("could not parse synthesis output"));
      }
    });
  });
}

export async function GET(req: NextRequest) {
  if (IS_SERVERLESS) {
    return NextResponse.json(
      { error: "On-demand synthesis is not available on this deployment." },
      { status: 501 },
    );
  }

  const { searchParams } = new URL(req.url);
  const rawCountry = searchParams.get("country")?.toLowerCase() ?? "";
  const rawHidden = searchParams.get("hidden") ?? "";

  if (!isValidCountryId(rawCountry) || !getCountry(rawCountry)) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }
  const countryId = getCountry(rawCountry)!.id;

  const hiddenKey = canonicaliseHiddenKey(rawHidden);
  if (!hiddenKey) {
    // Empty/invalid: the full-corpus state ("") is shipped with the dashboard,
    // so there is nothing to regenerate.
    return NextResponse.json({ error: "Invalid hidden set" }, { status: 400 });
  }

  const cacheKey = `${countryId}:${hiddenKey}`;
  let pending = stateCache.get(cacheKey);
  if (!pending) {
    pending = runSynthesis(countryId, hiddenKey);
    stateCache.set(cacheKey, pending);
    // Drop a failed attempt so a later request can retry.
    pending.catch(() => stateCache.delete(cacheKey));
  }

  try {
    const corpusThemes = await pending;
    return NextResponse.json({ hidden: hiddenKey, corpusThemes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "synthesis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
