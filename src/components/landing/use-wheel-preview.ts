"use client";

/**
 * Data for the landing page's live coherence wheel.
 *
 * One slim request per country (`/api/dashboard?slice=wheel`: target ids and
 * documents, drawable pairs, the country config), cached in memory for the
 * life of the mounted landing so switching back to a country is instant. Once
 * the first wheel is on screen the remaining pilots are fetched during idle
 * time, so every later pill click is a cache hit; the prefetch is skipped when
 * the browser signals a data-saver preference.
 *
 * The hook derives `data` from the cache for the *currently* selected country
 * only: the moment the selection changes, the previous country's wheel is
 * gone and the caller shows its loading state, instead of leaving the old
 * wheel on screen until the new payload lands. A country whose last attempt
 * failed is retried the next time it is selected, so a transient error (a
 * container restart, a brief offline moment during the idle prefetch) does
 * not stick for the life of the page.
 *
 * The locale is fixed for a mounted landing (a language switch navigates to a
 * new `[locale]` segment and remounts), so the cache is keyed by country only.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CountryConfig, WheelAlignment, WheelTarget } from "@/types";
import { saveDataRequested } from "./save-data";

export interface WheelPreviewData {
  targets: WheelTarget[];
  alignments: WheelAlignment[];
  countryConfig: CountryConfig | null;
}

type CacheEntry = { kind: "ok"; data: WheelPreviewData } | { kind: "failed" };

export function wheelSliceUrl(country: string, locale: string): string {
  const localeQuery =
    locale && locale !== "en" ? `&locale=${encodeURIComponent(locale)}` : "";
  return `/api/dashboard?country=${encodeURIComponent(country)}&slice=wheel${localeQuery}`;
}

async function loadSlice(country: string, locale: string): Promise<CacheEntry> {
  try {
    const r = await fetch(wheelSliceUrl(country, locale));
    if (!r.ok) return { kind: "failed" };
    const d = (await r.json()) as Record<string, unknown>;
    return {
      kind: "ok",
      data: {
        targets: (d.targets ?? []) as WheelTarget[],
        alignments: (d.alignment ?? []) as WheelAlignment[],
        countryConfig: (d.countryConfig ?? null) as CountryConfig | null,
      },
    };
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

export function useWheelPreview({
  countries,
  selected,
  locale,
  prefetch = true,
}: {
  /** Every country the pills can select; prefetched after the first load.
   *  Callers keep the array identity stable (memoised) between renders. */
  countries: string[];
  selected: string | null;
  locale: string;
  prefetch?: boolean;
}): { data: WheelPreviewData | null; failed: boolean } {
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
      const entry = await loadSlice(country, locale);
      inflight.current.delete(country);
      commit((next) => {
        next.set(country, entry);
      });
    },
    [locale, commit],
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
