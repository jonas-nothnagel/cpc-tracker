"use client";

/**
 * Figures for the landing's preview of a country's brief.
 *
 * One small request per country (`/api/brief/overview`: its standard
 * documents, targets and how every target pair reads), cached in memory for
 * the life of the mounted landing so switching back to a country is instant.
 * Once the first figures are on screen the remaining countries are fetched
 * during idle time, so every later switch is a cache hit; the prefetch is
 * skipped when the browser signals a data-saver preference.
 *
 * The hook derives `data` from the cache for the *currently* selected country
 * only: the moment the selection changes, the previous country's figures are
 * gone and the caller shows its loading state, instead of leaving the old
 * picture on screen until the new answer lands. A country whose last attempt
 * failed is retried the next time it is selected, so a transient error (a
 * container restart, a brief offline moment during the idle prefetch) does
 * not stick for the life of the page.
 *
 * The figures do not depend on the language (the page formats them), so the
 * request carries the country only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { BriefOverview } from "@/lib/brief/overview";
import { saveDataRequested } from "./save-data";

type CacheEntry = { kind: "ok"; data: BriefOverview } | { kind: "failed" };

export function overviewUrl(country: string): string {
  return `/api/brief/overview?country=${encodeURIComponent(country)}`;
}

function isOverview(value: unknown): value is BriefOverview {
  const v = value as Partial<BriefOverview> | null;
  const counts = v?.counts;
  return (
    typeof v?.documents === "number" &&
    typeof v.targets === "number" &&
    typeof v.lead === "string" &&
    typeof counts?.total === "number" &&
    typeof counts.reinforce === "number" &&
    typeof counts.partial === "number" &&
    typeof counts.apart === "number" &&
    typeof counts.none === "number"
  );
}

async function loadOverview(country: string): Promise<CacheEntry> {
  try {
    const r = await fetch(overviewUrl(country));
    if (!r.ok) return { kind: "failed" };
    const d: unknown = await r.json();
    return isOverview(d) ? { kind: "ok", data: d } : { kind: "failed" };
  } catch {
    return { kind: "failed" };
  }
}

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Run `cb` when the browser is idle (setTimeout fallback); returns a cancel. */
function scheduleIdle(cb: () => void): () => void {
  const w = globalThis as unknown as IdleWindow;
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(cb, { timeout: 4000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 1500);
  return () => clearTimeout(id);
}

export function useBriefOverview({
  countries,
  selected,
  prefetch = true,
}: {
  /** Every country the switch can select; prefetched after the first load.
   *  Callers keep the array identity stable (memoised) between renders. */
  countries: string[];
  selected: string | null;
  prefetch?: boolean;
}): { data: BriefOverview | null; failed: boolean } {
  const [cache, setCache] = useState<ReadonlyMap<string, CacheEntry>>(() => new Map());
  // Mirror of `cache` for effects and callbacks, so they can read the latest
  // entries without re-running on every insert. Written only via `commit`.
  const cacheRef = useRef(cache);
  // Requests in flight; only touched from effects and callbacks.
  const inflight = useRef(new Set<string>());

  const commit = useCallback((mutate: (next: Map<string, CacheEntry>) => void) => {
    const next = new Map(cacheRef.current);
    mutate(next);
    cacheRef.current = next;
    setCache(next);
  }, []);

  const load = useCallback(
    async (country: string) => {
      if (inflight.current.has(country)) return;
      inflight.current.add(country);
      const entry = await loadOverview(country);
      inflight.current.delete(country);
      commit((next) => {
        next.set(country, entry);
      });
    },
    [commit],
  );

  useEffect(() => {
    if (!selected) return;
    const entry = cacheRef.current.get(selected);
    if (entry?.kind === "ok") return;
    if (entry?.kind === "failed") {
      // Retry on re-selection: clear the stale failure so the caller shows the
      // loading state while the new attempt runs.
      commit((next) => {
        next.delete(selected);
      });
    }
    void load(selected);
  }, [selected, load, commit]);

  const selectedEntry = selected ? cache.get(selected) : undefined;
  const selectedReady = selectedEntry?.kind === "ok";

  useEffect(() => {
    if (!prefetch || !selectedReady || saveDataRequested()) return;
    const rest = countries.filter(
      (c) => !cacheRef.current.has(c) && !inflight.current.has(c),
    );
    if (rest.length === 0) return;
    return scheduleIdle(() => {
      for (const c of rest) void load(c);
    });
  }, [prefetch, selectedReady, countries, load]);

  return {
    data: selectedEntry?.kind === "ok" ? selectedEntry.data : null,
    failed: selectedEntry?.kind === "failed",
  };
}
