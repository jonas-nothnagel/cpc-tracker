import Image from "next/image";
import Link from "next/link";
import { listVisibleCountries } from "@/config/countries";
import { LandingHeader } from "@/components/landing/landing-header";
import { HeroVideo } from "@/components/landing/hero-video";
import { InsideAnalysis } from "@/components/landing/inside-analysis";
import { PrototypeBadge } from "@/components/ui/prototype-badge";

export default function Home() {
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
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-white/85 sm:text-sm">
            UNDP AI Sprint Initiative
          </p>
          <div className="mb-5">
            <PrototypeBadge tone="dark" />
          </div>
          <h1 className="font-display mb-6 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl md:text-6xl">
            Nature-Climate Policy Coherence Tracker
          </h1>
          <p className="mb-9 max-w-xl text-lg leading-relaxed text-white/90 md:text-xl">
            See where your national climate, biodiversity, and land-use targets
            align, overlap, or may pull in different directions.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            {visibleCountries.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard?country=${c.id}`}
                className="bg-[var(--undp-blue)] px-6 py-3 text-base font-medium text-white transition-colors hover:bg-[var(--undp-blue-dark)]"
              >
                Explore {c.name}
              </Link>
            ))}
            <Link
              href="/upload"
              className="text-base font-medium text-white underline decoration-white/50 underline-offset-4 transition-colors hover:decoration-white"
            >
              Analyse your policies
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
            How it works
          </h2>
          <div className="grid gap-10 md:grid-cols-3 md:gap-12">
            <div>
              <span className="font-display text-3xl font-semibold text-[var(--undp-blue)]/80">
                1
              </span>
              <h3 className="mb-2 mt-3 font-medium text-[var(--undp-black)]">
                Upload targets
              </h3>
              <p className="text-sm leading-relaxed text-[var(--undp-gray)]">
                Enter targets from your{" "}
                <abbr title="Nationally Determined Contribution" className="no-underline">
                  NDC
                </abbr>
                ,{" "}
                <abbr
                  title="National Biodiversity Strategy and Action Plan"
                  className="no-underline"
                >
                  NBSAP
                </abbr>
                ,{" "}
                <abbr title="National Adaptation Plan" className="no-underline">
                  NAP
                </abbr>
                , and other national policy documents. Upload files directly or
                type them in.
              </p>
            </div>
            <div>
              <span className="font-display text-3xl font-semibold text-[var(--undp-blue)]/80">
                2
              </span>
              <h3 className="mb-2 mt-3 font-medium text-[var(--undp-black)]">
                Automated analysis
              </h3>
              <p className="text-sm leading-relaxed text-[var(--undp-gray)]">
                AI classifies each target by theme and sector, then assesses how
                well targets across different policies align with each other.
              </p>
            </div>
            <div>
              <span className="font-display text-3xl font-semibold text-[var(--undp-blue)]/80">
                3
              </span>
              <h3 className="mb-2 mt-3 font-medium text-[var(--undp-black)]">
                Explore results
              </h3>
              <p className="text-sm leading-relaxed text-[var(--undp-gray)]">
                Interactive dashboard showing policy coverage, alignment
                patterns, and areas where coordination could be strengthened.
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
              United Nations Development Programme
            </span>
          </div>
          <span className="text-xs text-[var(--undp-gray)]/60">
            AI Sprint Initiative
          </span>
        </div>
      </footer>
    </div>
  );
}
