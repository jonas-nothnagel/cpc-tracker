"use client";

/**
 * "Inside the analysis" landing section. A single client island so the country
 * toggle, the body copy's CTA, the live coherence wheel, and the teaching
 * spotlight card all share one selected-country state.
 *
 * It reuses the prototype's own Centerpiece so the home page and the dashboard
 * read as one product. Country-agnostic: every visible pilot is an equal toggle
 * and the starting country is picked at random on mount, so the landing never
 * structurally favours one country. Sits below the fold, so it fetches
 * client-side (the dashboard payload is large; keeping it out of the
 * server-rendered HTML keeps the hero fast). On failure it renders nothing.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Centerpiece,
  WheelLegend,
} from "@/components/dashboard/coherence-briefing/centerpiece";
import type { WheelState } from "@/components/dashboard/coherence-briefing/centerpiece/wheel";
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

// Group by document, no focus/filter, and ask the wheel to spotlight one real
// flagged document pair as a teaching example.
const WHEEL_STATE: WheelState = {
  groupBy: "document",
  focus: null,
  filter: "all",
  spotlightFlagged: true,
};

interface WheelData {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig: CountryConfig | null;
}

interface Spotlight {
  aLabel: string;
  bLabel: string;
  count: number;
}

export interface PreviewCountry {
  id: string;
  name: string;
}

export function InsideAnalysis({ countries }: { countries: PreviewCountry[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<WheelData | null>(null);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const [failed, setFailed] = useState(false);

  // Pick the starting country at random on mount (client-only) so neither pilot
  // is structurally favoured. SSR renders the skeleton.
  useEffect(() => {
    if (countries.length === 0) return;
    const pick = countries[Math.floor(Math.random() * countries.length)].id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(pick);
  }, [countries]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    // Clear any prior error and stale spotlight when the country changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false);
    setSpotlight(null);
    fetch(`/api/dashboard?country=${selected}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Record<string, unknown>) => {
        if (!active) return;
        setData({
          targets: (d.targets ?? []) as Target[],
          alignments: (d.alignment ?? []) as AlignmentResult[],
          classifications: (d.classifications ?? []) as ThematicClassification[],
          countryConfig: (d.countryConfig ?? null) as CountryConfig | null,
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [selected]);

  // Stable reference so the wheel only re-fires when the chosen pair changes.
  const handleSpotlight = useCallback((s: Spotlight | null) => {
    setSpotlight(s);
  }, []);

  if (failed) return null;

  const selectedName = countries.find((c) => c.id === selected)?.name;

  return (
    <section className="bg-[var(--undp-paper)] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        {countries.length > 1 ? (
          <div
            className="mb-10 flex items-center justify-center gap-1.5"
            role="group"
            aria-label="Choose a country to preview"
          >
            {countries.map((c) => {
              const isActive = c.id === selected;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  aria-pressed={isActive}
                  className={`rounded-full border px-3.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "border-[var(--undp-black)] bg-[var(--undp-black)] text-white"
                      : "border-gray-300 bg-white/70 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="grid items-start gap-12 md:grid-cols-[4fr_5fr] md:gap-16">
          {/* Left column: copy, legend, disclaimer, CTA */}
          <div>
            <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-[var(--undp-blue)]">
              Inside the analysis
            </p>
            <h2 className="font-display mb-5 text-3xl font-semibold leading-tight text-[var(--undp-black)] md:text-4xl">
              Every policy target, mapped against every other
            </h2>
            <p className="mb-6 max-w-md text-base leading-relaxed text-[var(--undp-gray)] md:text-lg">
              Each ribbon links two national policy documents. Green shows where
              their targets are in strong alignment; red threads mark a potential
              misalignment worth a closer look.
            </p>

            <WheelLegend justify="start" />

            <p className="mt-6 max-w-sm text-xs leading-relaxed text-[var(--undp-gray)]/70">
              AI-generated analysis. Treat as a prompt to review, not a settled
              finding.
            </p>

            {selected ? (
              <div className="mt-8">
                <Link
                  href={`/dashboard?country=${selected}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--undp-blue)] transition-colors hover:text-[var(--undp-blue-dark)]"
                >
                  Open the {selectedName ?? "full"} dashboard
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            ) : null}
          </div>

          {/* Right column: the wheel + one teaching spotlight card */}
          <div className="relative">
            {!data ? (
              <div className="mx-auto aspect-square w-full max-w-[560px] animate-pulse rounded-full bg-[var(--undp-black)]/[0.04]" />
            ) : (
              <div
                className="wheel-enter"
                role="img"
                aria-label={`Live preview of the policy coherence wheel${
                  selectedName ? ` for ${selectedName}` : ""
                }: aligned and potentially misaligned target pairs across national policy documents.`}
              >
                <div className="wheel-breathe mx-auto w-full max-w-[620px]">
                  <Centerpiece
                    targets={data.targets}
                    alignments={data.alignments}
                    classifications={data.classifications}
                    countryConfig={data.countryConfig}
                    state={WHEEL_STATE}
                    showPicker={false}
                    showLegend={false}
                    onSpotlight={handleSpotlight}
                  />
                </div>
              </div>
            )}

            {data && spotlight ? (
              <div className="mt-4 rounded-lg bg-white p-3.5 shadow-sm ring-1 ring-black/5 md:absolute md:bottom-6 md:right-0 md:mt-0 md:max-w-[240px]">
                <p className="text-xs font-semibold text-[var(--undp-black)]">
                  {spotlight.aLabel} &harr; {spotlight.bLabel}
                </p>
                <p className="mt-1 text-xs leading-snug text-[var(--undp-gray)]">
                  {spotlight.count}{" "}
                  {spotlight.count === 1 ? "target" : "targets"} may pull in
                  different directions
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
