"use client";

/**
 * The landing's preview of a country's brief: the finding it opens with, its
 * figures, the dot field of every target pair, and the way in. A single
 * client island so the country choice, the copy and the field share one
 * selected-country state.
 *
 * It reuses the brief's own headline, figures and dot field, and the brief's
 * own counts (`/api/brief/overview`), so the landing and the brief always
 * read the same. Country-agnostic: every visible country is an equal choice
 * and the starting country is picked at random on mount, so the landing never
 * structurally favours one. One country at a time: shares depend on each
 * country's documents, so they are not set side by side. Sits below the fold,
 * so it fetches client-side through `useBriefOverview` (cached and
 * prefetched; see that hook). If a country's figures are unavailable, the
 * section says so and still links to the brief.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DotField } from "@/components/brief/dot-field";
import { useNumbers } from "@/components/brief/ink";
import type { BriefOverview } from "@/lib/brief/overview";
import { useBriefOverview } from "./use-brief-overview";
import "@/components/brief/brief.css";
import "./landing.css";

export interface PreviewCountry {
  id: string;
  name: string;
}

function useFinding(country: string, data: BriefOverview) {
  const t = useTranslations("brief");
  const { pct } = useNumbers();
  const { counts } = data;
  const share = (v: number) => pct(counts.total > 0 ? v / counts.total : 0);
  return {
    headline: t(`overall.headline.${data.lead}`, {
      country,
      aligned: share(counts.reinforce),
      partial: share(counts.partial),
      apart: share(counts.apart),
    }),
    figures: [
      t("hero.documents", { count: data.documents }),
      t("hero.commitments", { count: data.targets }),
      t("hero.comparisons", { count: counts.total }),
    ].join(" "),
  };
}

function Finding({ country, data }: { country: string; data: BriefOverview }) {
  const { headline, figures } = useFinding(country, data);
  return (
    <>
      <h2 className="font-display text-headline font-semibold leading-tight text-[var(--undp-black)] md:text-headline-lg">
        {headline}
      </h2>
      <p className="mt-4 text-body text-[var(--undp-gray)]">{figures}</p>
    </>
  );
}

export function InsideAnalysis({ countries }: { countries: PreviewCountry[] }) {
  const t = useTranslations("landing.inside");
  const [selected, setSelected] = useState<string | null>(null);

  // Pick the starting country at random on mount (client-only) so no country
  // is structurally favoured. SSR renders the loading state.
  useEffect(() => {
    if (countries.length === 0) return;
    const pick = countries[Math.floor(Math.random() * countries.length)].id;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(pick);
  }, [countries]);

  const countryIds = useMemo(() => countries.map((c) => c.id), [countries]);
  const { data, failed } = useBriefOverview({ countries: countryIds, selected });
  const selectedName = countries.find((c) => c.id === selected)?.name;

  return (
    <section className="border-t border-line bg-white py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 md:grid-cols-[5fr_6fr] md:gap-16">
        <div>
          {countries.length > 1 ? (
            <div
              className="mb-8 flex flex-wrap gap-x-6 gap-y-2"
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
                    className={`text-body transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--undp-blue)] ${
                      isActive
                        ? "font-semibold text-[var(--undp-black)] underline decoration-2 underline-offset-[6px]"
                        : "text-[var(--undp-gray)] hover:text-[var(--undp-black)]"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="min-h-[10rem]" aria-live="polite">
            {data && selectedName ? (
              <Finding country={selectedName} data={data} />
            ) : failed && selectedName ? (
              <p role="status" className="text-body text-[var(--undp-gray)]">
                {t("preview.unavailable", { name: selectedName })}
              </p>
            ) : (
              <div aria-hidden="true" className="space-y-3">
                <div className="h-8 w-full animate-pulse bg-[var(--undp-black)]/[0.05]" />
                <div className="h-8 w-4/5 animate-pulse bg-[var(--undp-black)]/[0.05]" />
              </div>
            )}
          </div>

          {selected && selectedName ? (
            <Link
              href={`/${selected}/brief`}
              className="mt-8 inline-flex items-center gap-2 text-body font-medium text-[var(--undp-blue)] transition-colors hover:text-[var(--undp-blue-dark)]"
            >
              {t("preview.readBrief", { name: selectedName })}
              <span aria-hidden="true">&rarr;</span>
            </Link>
          ) : null}

          <p className="mt-6 text-caption text-[var(--undp-gray)]">{t("aiTag")}</p>
        </div>

        <div data-brief className="landing-field">
          {data ? (
            // Keyed by country, so on a switch the field starts mixed again
            // and sorts itself.
            <DotField key={selected} counts={data.counts} shares entrance="mixed" />
          ) : (
            <div
              aria-hidden="true"
              className={`mt-[30px] h-[clamp(200px,24vw,290px)] bg-[var(--undp-black)]/[0.04] ${failed ? "" : "animate-pulse"}`}
            />
          )}
        </div>
      </div>
    </section>
  );
}
