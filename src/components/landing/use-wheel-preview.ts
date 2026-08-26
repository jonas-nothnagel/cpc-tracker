"use client";

/**
 * Data for the landing page's live coherence wheel.
 *
 * One slim request per country (`/api/dashboard?slice=wheel`: target ids and
 * documents, drawable pairs, the country config), cached in memory for the
 * life of the page so switching back to a country is instant. Once the first
 * wheel is on screen the remaining pilots are fetched during idle time, so
 * every later pill click is a cache hit; the prefetch is skipped when the
 * browser signals a data-saver preference.
 *
 * The hook derives `data` from the cache for the *currently* selected country
 * only: the moment the selection changes, the previous country's wheel is
 * gone and the caller shows its loading state, instead of leaving the old
 * wheel on screen until the new payload lands.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CountryConfig,
  ThematicClassification,
  WheelAlignment,
  WheelTarget,
} from "@/types";

export interface WheelPreviewData {
  targets: WheelTarget[];
  alignments: WheelAlignment[];
  classifications: ThematicClassification[];
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
        classifications: (d.classifications ?? []) as ThematicClassification[],
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

function saveDataRequested(): boolean {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } })
    .connection;
  return conn?.saveData === true;
}

export function useWheelPreview({
  countries,
  selected,
  locale,
  prefetch = true,
}: {
  /** Every country the pills can select; prefetched after the first load. */
  countries: string[];
  selected: string | null;
  locale: string;
  prefetch?: boolean;
}): { data: WheelPreviewData | null; failed: boolean } {
  const [cache, setCache] = useState<ReadonlyMap<string, CacheEntry>>(() => new Map());
  // Requests in flight; only touched from effects and callbacks.
  const inflight = useRef(new Set<string>());

  const keyFor = useCallback((country: string) => `${locale}:${country}`, [locale]);

  const load = useCallback(
    async (country: string) => {
      const key = keyFor(country);
      if (inflight.current.has(key)) return;
      inflight.current.add(key);
      const entry = await loadSlice(country, locale);
      inflight.current.delete(key);
      setCache((prev) => (prev.has(key) ? prev : new Map(prev).set(key, entry)));
    },
    [keyFor, locale],
  );

  useEffect(() => {
    // `load` only sets state after its fetch resolves, never synchronously in
    // the effect; the lint rule cannot see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected && !cache.has(keyFor(selected))) void load(selected);
  }, [selected, cache, keyFor, load]);

  const selectedEntry = selected ? cache.get(keyFor(selected)) : undefined;
  const selectedReady = selectedEntry?.kind === "ok";

  // A stable key so a freshly mapped `countries` array does not restart the
  // idle timer on every render.
  const countryKey = countries.join("|");
  useEffect(() => {
    if (!prefetch || !selectedReady || saveDataRequested()) return;
    const rest = countryKey
      .split("|")
      .filter((c) => c && !cache.has(keyFor(c)) && !inflight.current.has(keyFor(c)));
    if (rest.length === 0) return;
    return scheduleIdle(() => {
      for (const c of rest) void load(c);
    });
  }, [prefetch, selectedReady, countryKey, cache, keyFor, load]);

  return {
    data: selectedEntry?.kind === "ok" ? selectedEntry.data : null,
    failed: selectedEntry?.kind === "failed",
  };
}
