import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { listVisibleCountries } from "@/config/countries";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroVideo } from "@/components/landing/hero-video";
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
          <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-white/85 sm:text-sm">
            {t("hero.eyebrow")}
          </p>
          <h1 className="font-display mb-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
            {t("hero.title")}
          </h1>
          <p className="mb-9 max-w-xl text-lg leading-relaxed text-white/90 md:text-xl">
            {t("hero.subtitle")}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {visibleCountries.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard?country=${c.id}`}
                className="bg-[var(--undp-blue)] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--undp-blue-dark)]"
              >
                {t("hero.exploreCountry", { name: c.name })}
              </Link>
            ))}
            <Link
              href="/upload"
              className="text-base font-medium text-white underline decoration-white/50 underline-offset-4 transition-colors hover:decoration-white"
            >
              {t("hero.analyseCta")}
            </Link>
          </div>
        </div>
      </HeroVideo>

      {/* Inside the analysis — live coherence wheel on warm paper ground */}
      <InsideAnalysis
        countries={visibleCountries.map((c) => ({ id: c.id, name: c.name }))}
      />

      {/* How it works */}
      <section className="bg-white py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display mb-12 text-2xl font-semibold text-[var(--undp-black)] md:text-3xl">
            {t("howItWorks.title")}
          </h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-12">
            <div>
              <span className="font-display text-3xl font-semibold text-[var(--undp-blue)]/80">
                1
              </span>
              <h3 className="mb-2 mt-3 font-medium text-[var(--undp-black)]">
                {t("howItWorks.step1.title")}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--undp-gray)]">
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
              <span className="font-display text-3xl font-semibold text-[var(--undp-blue)]/80">
                2
              </span>
              <h3 className="mb-2 mt-3 font-medium text-[var(--undp-black)]">
                {t("howItWorks.step2.title")}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--undp-gray)]">
                {t("howItWorks.step2.body")}
              </p>
            </div>
            <div>
              <span className="font-display text-3xl font-semibold text-[var(--undp-blue)]/80">
                3
              </span>
              <h3 className="mb-2 mt-3 font-medium text-[var(--undp-black)]">
                {t("howItWorks.step3.title")}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--undp-gray)]">
                {t("howItWorks.step3.body")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-gray-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8">
          <div className="flex items-center gap-3">
            <Image
              src="/undp-logo.png"
              alt="UNDP"
              width={44}
              height={68}
              className="h-10 w-auto"
            />
            <span className="text-sm text-[var(--undp-gray)]">
              {t("footer.undp")}
            </span>
          </div>
          <span className="text-xs text-[var(--undp-gray)]/60">
            {t("footer.initiative")}
          </span>
        </div>
      </footer>
    </div>
  );
}
