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
 * client-side through `useWheelPreview` (a slim per-country wheel slice, cached
 * and prefetched; see that hook). While a country loads the wheel column shows
 * its skeleton; if a country's data is unavailable the band stays, with a short
 * caption in place of the wheel, so the other pills keep working.
 *
 * Documents a country soft-hides by default (countryConfig.defaultHiddenDocTypes,
 * e.g. Panama's ENR) are filtered out here too, so the landing wheel matches the
 * dashboard's default view rather than showing a document the dashboard omits.
 */

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Centerpiece,
  WheelLegend,
} from "@/components/dashboard/coherence-briefing/centerpiece";
import type { WheelState } from "@/components/dashboard/coherence-briefing/centerpiece/wheel";
import { useWheelPreview } from "./use-wheel-preview";

// Group by document, no focus/filter.
const WHEEL_STATE: WheelState = {
  groupBy: "document",
  focus: null,
  filter: "all",
};

export interface PreviewCountry {
  id: string;
  name: string;
}

export function InsideAnalysis({ countries }: { countries: PreviewCountry[] }) {
  const t = useTranslations("landing.inside");
  const locale = useLocale();
  const [selected, setSelected] = useState<string | null>(null);

  // Pick the starting country at random on mount (client-only) so neither pilot
  // is structurally favoured. SSR renders the skeleton.
  useEffect(() => {
    if (countries.length === 0) return;
    const pick = countries[Math.floor(Math.random() * countries.length)].id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(pick);
  }, [countries]);

  const countryIds = useMemo(() => countries.map((c) => c.id), [countries]);
  const { data, failed } = useWheelPreview({ countries: countryIds, selected, locale });

  // Drop documents the country soft-hides by default so the landing wheel
  // matches the briefing's default view: the briefing seeds its hidden set
  // from countryConfig.defaultHiddenDocTypes plus secondaryDocTypes (e.g.
  // Panama's ENR and its tier-2 documents); the landing has no toggle, so it
  // honours the same default set.
  const visible = useMemo(() => {
    if (!data) return null;
    const hidden = new Set([
      ...(data.countryConfig?.defaultHiddenDocTypes ?? []),
      ...(data.countryConfig?.secondaryDocTypes ?? []),
    ]);
    if (hidden.size === 0) return data;
    const targets = data.targets.filter((t) => !hidden.has(t.sourceDocument));
    const ids = new Set(targets.map((t) => t.id));
    const alignments = data.alignments.filter(
      (a) => ids.has(a.targetAId) && ids.has(a.targetBId),
    );
    return { ...data, targets, alignments };
  }, [data]);

  const selectedName = countries.find((c) => c.id === selected)?.name;

  return (
    <section className="border-t border-line bg-white py-20 md:py-28">
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
                  className={`rounded-full border px-3.5 py-1 text-caption font-medium transition-colors ${
                    isActive
                      ? "border-[var(--undp-black)] bg-[var(--undp-black)] text-white"
                      : "border-gray-300 bg-white text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
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
            <p className="mb-4 text-data font-medium text-[var(--undp-gray)]">
              {t("eyebrow")}
            </p>
            <h2 className="font-display mb-5 text-headline font-semibold leading-tight text-[var(--undp-black)] md:text-headline-lg">
              {t("title")}
            </h2>
            <p className="mb-6 max-w-md text-base leading-relaxed text-[var(--undp-gray)] md:text-lg">
              {t("body")}
            </p>

            <WheelLegend justify="start" />

            <p className="mt-6 max-w-sm text-caption leading-relaxed text-[var(--undp-gray)]/70">
              {t("disclaimer")}
            </p>

            {selected ? (
              <div className="mt-8">
                <Link
                  href={`/dashboard?country=${selected}`}
                  className="inline-flex items-center gap-2 text-body font-medium text-[var(--undp-blue)] transition-colors hover:text-[var(--undp-blue-dark)]"
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
              <div aria-busy={!failed}>
                <div
                  className={`mx-auto aspect-square w-full max-w-[560px] rounded-full bg-[var(--undp-black)]/[0.04] ${failed ? "" : "animate-pulse"}`}
                />
                {failed && selectedName ? (
                  <p
                    role="status"
                    className="mt-6 text-center text-caption text-[var(--undp-gray)]"
                  >
                    {t("preview.unavailable", { name: selectedName })}
                  </p>
                ) : null}
              </div>
            ) : (
              <div
                // Keyed by country so the enter animation replays on a switch.
                key={selected ?? "none"}
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
                    // The landing groups by document, which reads no classifications.
                    classifications={[]}
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
