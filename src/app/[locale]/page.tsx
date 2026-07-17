import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  listVisibleCountries,
  listComingSoonCountries,
} from "@/config/countries";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroVideo } from "@/components/landing/hero-video";
import { HeroCta } from "@/components/landing/hero-cta";
import { InsideAnalysis } from "@/components/landing/inside-analysis";

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("landing");
  const visibleCountries = listVisibleCountries();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingHeader />

      {/* Cinematic hero */}
      <HeroVideo
        poster="/hero/coherence-hero-poster.jpg"
        mp4="/hero/coherence-hero.mp4"
      >
        <div className="max-w-3xl">
          <p className="mb-5 text-data font-medium text-white/85">
            {t("hero.eyebrow")}
          </p>
          <h1 className="font-display mb-6 text-display font-semibold tracking-[-0.02em] text-white">
            {t("hero.title")}
          </h1>
          <p className="mb-9 max-w-xl text-lg leading-relaxed text-white/90 md:text-xl">
            {t("hero.subtitle")}
          </p>
          <HeroCta
            countries={visibleCountries.map((c) => ({ id: c.id, name: c.name }))}
            comingSoon={listComingSoonCountries().map((c) => ({ name: c.name }))}
          />
        </div>
      </HeroVideo>

      {/* Inside the analysis — live coherence wheel on warm paper ground */}
      <InsideAnalysis
        countries={visibleCountries.map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* How it works */}
      <section className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display mb-12 text-headline font-semibold text-[var(--undp-black)] md:text-headline-lg">
            {t("howItWorks.title")}
          </h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-12">
            <div>
              <span className="font-display text-headline-lg font-semibold text-[var(--undp-blue)]/80">
                1
              </span>
              <h3 className="mb-2 mt-3 text-body font-semibold text-[var(--undp-black)]">
                {t("howItWorks.step1.title")}
              </h3>
              <p className="text-body text-[var(--undp-gray)]">
                {t("howItWorks.step1.bodyPrefix")}{" "}
                <abbr title={t("abbr.ndc")} className="no-underline">
                  NDC
                </abbr>
                ,{" "}
                <abbr title={t("abbr.nbsap")} className="no-underline">
                  NBSAP
                </abbr>
                ,{" "}
                <abbr title={t("abbr.nap")} className="no-underline">
                  NAP
                </abbr>
                {t("howItWorks.step1.bodySuffix")}
              </p>
            </div>
            <div>
              <span className="font-display text-headline-lg font-semibold text-[var(--undp-blue)]/80">
                2
              </span>
              <h3 className="mb-2 mt-3 text-body font-semibold text-[var(--undp-black)]">
                {t("howItWorks.step2.title")}
              </h3>
              <p className="text-body text-[var(--undp-gray)]">
                {t("howItWorks.step2.body")}
              </p>
            </div>
            <div>
              <span className="font-display text-headline-lg font-semibold text-[var(--undp-blue)]/80">
                3
              </span>
              <h3 className="mb-2 mt-3 text-body font-semibold text-[var(--undp-black)]">
                {t("howItWorks.step3.title")}
              </h3>
              <p className="text-body text-[var(--undp-gray)]">
                {t("howItWorks.step3.body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
          <div className="flex items-center gap-3">
            <Image
              src="/undp-logo.png"
              alt="UNDP"
              width={44}
              height={68}
              className="h-10 w-auto"
            />
            <span className="text-data text-[var(--undp-gray)]">
              {t("footer.undp")}
            </span>
          </div>
          <span className="text-caption text-[var(--undp-gray)]/60">
            {t("footer.initiative")}
          </span>
        </div>
      </footer>
    </div>
  );
}
