"use client";

/**
 * "Inside the analysis" landing section. A single client island so the country
 * toggle, the body copy's CTA, and the live coherence wheel share one
 * selected-country state.
 *
 * It reuses the prototype's own Centerpiece so the home page and the dashboard
 * read as one product. Country-agnostic: every visible pilot is an equal toggle
 * and the starting country is picked at random on mount, so the landing never
 * structurally favours one country. Sits below the fold, so it fetches
 * client-side (the dashboard payload is large; keeping it out of the
 * server-rendered HTML keeps the hero fast). On failure it renders nothing.
 *
 * Documents a country soft-hides by default (countryConfig.defaultHiddenDocTypes,
 * e.g. Panama's ENR) are filtered out here too, so the landing wheel matches the
 * dashboard's default view rather than showing a document the dashboard omits.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
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

// Group by document, no focus/filter.
const WHEEL_STATE: WheelState = {
  groupBy: "document",
  focus: null,
  filter: "all",
};

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

export function InsideAnalysis({ countries }: { countries: PreviewCountry[] }) {
  const t = useTranslations("landing.inside");
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<WheelData | null>(null);
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
    // Clear any prior error when the country changes.
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

  // Drop documents the country soft-hides by default (e.g. Panama's ENR) so the
  // landing wheel matches the dashboard's default view. The dashboard applies the
  // same filter from countryConfig.defaultHiddenDocTypes; the landing has no
  // toggle, so it just honours the default hidden set.
  const visible = useMemo(() => {
    if (!data) return null;
    const hidden = new Set(data.countryConfig?.defaultHiddenDocTypes ?? []);
    if (hidden.size === 0) return data;
    const targets = data.targets.filter((t) => !hidden.has(t.sourceDocument));
    const ids = new Set(targets.map((t) => t.id));
    const alignments = data.alignments.filter(
      (a) => ids.has(a.targetAId) && ids.has(a.targetBId),
    );
    const classifications = data.classifications.filter((c) =>
      ids.has(c.targetId),
    );
    return { ...data, targets, alignments, classifications };
  }, [data]);

  if (failed) return null;

  const selectedName = countries.find((c) => c.id === selected)?.name;

  return (
    <section className="bg-[var(--undp-paper)] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        {countries.length > 1 ? (
          <div
            className="mb-10 flex items-center justify-center gap-1.5"
            role="group"
            aria-label={t("preview.countrySwitcherAria")}
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
              {t("eyebrow")}
            </p>
            <h2 className="font-display mb-5 text-3xl font-semibold leading-tight text-[var(--undp-black)] md:text-4xl">
              {t("title")}
            </h2>
            <p className="mb-6 max-w-md text-base leading-relaxed text-[var(--undp-gray)] md:text-lg">
              {t("body")}
            </p>

            <WheelLegend justify="start" />

            <p className="mt-6 max-w-sm text-xs leading-relaxed text-[var(--undp-gray)]/70">
              {t("disclaimer")}
            </p>

            {selected ? (
              <div className="mt-8">
                <Link
                  href={`/dashboard?country=${selected}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-[var(--undp-blue)] transition-colors hover:text-[var(--undp-blue-dark)]"
                >
                  {selectedName
                    ? t("preview.openDashboardWithCountry", { name: selectedName })
                    : t("preview.openDashboard")}
                  <span aria-hidden="true">&rarr;</span>
                </Link>
              </div>
            ) : null}
          </div>

          {/* Right column: the wheel */}
          <div>
            {!visible ? (
              <div className="mx-auto aspect-square w-full max-w-[560px] animate-pulse rounded-full bg-[var(--undp-black)]/[0.04]" />
            ) : (
              <div
                className="wheel-enter"
                role="img"
                aria-label={
                  selectedName
                    ? t("preview.wheelAriaWithCountry", { name: selectedName })
                    : t("preview.wheelAria")
                }
              >
                <div className="wheel-breathe mx-auto w-full max-w-[620px]">
                  <Centerpiece
                    targets={visible.targets}
                    alignments={visible.alignments}
                    classifications={visible.classifications}
                    countryConfig={visible.countryConfig}
                    state={WHEEL_STATE}
                    showPicker={false}
                    showLegend={false}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
