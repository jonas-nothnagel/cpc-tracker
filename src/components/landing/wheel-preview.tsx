"use client";

/**
 * Live, non-interactive preview of the policy coherence wheel for the landing
 * page. Reuses the prototype's own Centerpiece so the home page and the
 * dashboard read as one product. It is a thin adapter on purpose: it is the
 * only thing that breaks if the (still-evolving) prototype wheel API changes.
 *
 * Country-agnostic: it offers every visible pilot country as an equal toggle
 * and picks the starting country at random on mount, so the landing never
 * structurally favours one country over another. Sits below the fold, so it
 * fetches client-side (the dashboard payload is large; keeping it out of the
 * server-rendered HTML keeps the hero fast). On failure it renders nothing and
 * the surrounding section copy still stands on its own.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Centerpiece } from "@/components/prototypes/coherence-briefing/centerpiece";
import type { WheelState } from "@/components/prototypes/coherence-briefing/centerpiece/wheel";
import type {
  AlignmentResult,
  CountryConfig,
  Target,
  ThematicClassification,
} from "@/types";

const WHEEL_STATE: WheelState = { groupBy: "document", focus: null, filter: "all" };

interface WheelData {
  targets: Target[];
  alignments: AlignmentResult[];
  classifications: ThematicClassification[];
  countryConfig: CountryConfig | null;
}

export interface PreviewCountry {
  id: string;
  name: string;
}

export function WheelPreview({ countries }: { countries: PreviewCountry[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<WheelData | null>(null);
  const [failed, setFailed] = useState(false);

  // Pick the starting country at random on mount (client-only) so neither
  // pilot is structurally favoured. SSR renders the skeleton.
  useEffect(() => {
    if (countries.length === 0) return;
    const pick = countries[Math.floor(Math.random() * countries.length)].id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(pick);
  }, [countries]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    // Clear any prior error when the selected country changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFailed(false);
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

  if (failed) return null;

  const selectedName = countries.find((c) => c.id === selected)?.name;

  return (
    <div>
      {countries.length > 1 ? (
        <div
          className="mb-5 flex items-center justify-center gap-1.5"
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

      {!data ? (
        <div className="mx-auto aspect-square w-full max-w-[520px] animate-pulse rounded-full bg-[var(--undp-black)]/[0.04]" />
      ) : (
        <div
          className="wheel-enter"
          role="img"
          aria-label={`Live preview of the policy coherence wheel${
            selectedName ? ` for ${selectedName}` : ""
          }: aligned and potentially misaligned target pairs across national policy documents.`}
        >
          <div className="wheel-breathe mx-auto w-full max-w-[560px]">
            <Centerpiece
              targets={data.targets}
              alignments={data.alignments}
              classifications={data.classifications}
              countryConfig={data.countryConfig}
              state={WHEEL_STATE}
              showPicker={false}
            />
          </div>
        </div>
      )}

      {selected ? (
        <div className="mt-6 text-center">
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
  );
}
