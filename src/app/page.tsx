import Image from "next/image";
import Link from "next/link";
import { listVisibleCountries } from "@/config/countries";

export default function Home() {
  const visibleCountries = listVisibleCountries();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white z-20">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/undp-logo.png"
                alt="UNDP"
                width={48}
                height={72}
                className="h-12 w-auto"
              />
              <span className="text-sm font-medium text-[var(--undp-black)] tracking-wide hidden sm:block">
                Policy Coherence Tracker
              </span>
            </Link>
          </div>
          <nav className="flex gap-8 text-sm text-[var(--undp-gray)]">
            <Link href="/upload" className="hover:text-[var(--undp-blue)] transition-colors">
              Upload Data
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — image spans full viewport width, text constrained */}
      <section className="relative min-h-[380px] md:min-h-[440px] flex items-center">
        {/* Background image — full bleed */}
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="/biodiversity.jpg"
            alt="Dense forest canopy over a misty valley"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-transparent" />
        </div>
        {/* Content on top */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
          <div className="max-w-xl py-16 md:py-20">
            <p className="text-sm uppercase tracking-widest text-[var(--undp-blue)] mb-3 font-medium">
              UNDP AI Sprint Initiative
            </p>
            <h1 className="text-4xl md:text-5xl font-normal text-[var(--undp-black)] mb-5 leading-tight tracking-tight">
              Nature-Climate Policy Coherence Tracker
            </h1>
            <p className="text-lg text-[var(--undp-black)] mb-8 leading-relaxed max-w-md">
              See where your national climate, biodiversity, and land-use targets
              align, overlap, or contradict each other.
            </p>
            <div className="flex flex-wrap gap-3">
              {visibleCountries.map((c) => (
                <Link
                  key={c.id}
                  href={`/dashboard?country=${c.id}`}
                  className="px-6 py-3 bg-[var(--undp-blue)] text-white text-base font-medium hover:bg-[var(--undp-blue-dark)] transition-colors"
                >
                  Explore {c.name}
                </Link>
              ))}
              <Link
                href="/upload"
                className="px-6 py-3 border border-[var(--undp-blue)] text-[var(--undp-blue)] text-base font-medium hover:bg-[var(--undp-blue)]/5 transition-colors"
              >
                Analyse Your Policies
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard teaser */}
      <section className="py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl font-medium text-[var(--undp-black)] mb-3">
            What the dashboard reveals
          </h2>
          <p className="text-sm text-[var(--undp-gray)] mb-10 max-w-lg">
            Explore pilot analyses of national policy targets across participating countries.
          </p>
          <div className="grid md:grid-cols-2 gap-5">
            <Link href="/dashboard?country=mongolia" className="group block overflow-hidden rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src="/teaser-chord-overview.png"
                  alt="Chord diagram showing alignment connections between policy targets across climate, biodiversity, adaptation, and sectoral policies"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-[var(--undp-black)]">Policy Coherence Explorer</p>
                <p className="text-xs text-[var(--undp-gray)] mt-0.5">Cross-policy alignment and contradictions at a glance</p>
              </div>
            </Link>
            <Link href="/dashboard?country=mongolia" className="group block overflow-hidden rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src="/teaser-classification.png"
                  alt="Stacked bar chart showing targets mapped across nature-based solution categories"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-[var(--undp-black)]">Thematic Classification</p>
                <p className="text-xs text-[var(--undp-gray)] mt-0.5">Targets mapped to Nature-Based Solutions and IPCC sectors</p>
              </div>
            </Link>
            <Link href="/dashboard?country=mongolia" className="group block overflow-hidden rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src="/teaser-coherence-explorer.png"
                  alt="Target detail view showing alignment connections, rationale, and conflict indicators for a selected biodiversity target"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-[var(--undp-black)]">Target-Level Detail</p>
                <p className="text-xs text-[var(--undp-gray)] mt-0.5">Drill into individual targets to see connections and rationale</p>
              </div>
            </Link>
            <Link href="/dashboard?country=mongolia" className="group block overflow-hidden rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
              <div className="relative aspect-[16/10] overflow-hidden">
                <Image
                  src="/teaser-implementation.png"
                  alt="Implementation scorecard showing sector-level targets, reported actions, emissions trends, and status"
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover object-top group-hover:scale-[1.02] transition-transform duration-300"
                />
              </div>
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-[var(--undp-black)]">Implementation Tracking</p>
                <p className="text-xs text-[var(--undp-gray)] mt-0.5">Reported actions and emissions trends by sector</p>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-20 bg-[var(--undp-light)]">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl font-medium text-[var(--undp-black)] mb-10">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div>
              <span className="w-7 h-7 rounded-full bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] flex items-center justify-center text-sm font-semibold">1</span>
              <h3 className="font-medium text-[var(--undp-black)] mt-2 mb-2">
                Upload Targets
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Enter targets from your{" "}
                <abbr title="Nationally Determined Contribution" className="no-underline">NDC</abbr>,{" "}
                <abbr title="National Biodiversity Strategy and Action Plan" className="no-underline">NBSAP</abbr>,{" "}
                <abbr title="National Adaptation Plan" className="no-underline">NAP</abbr>,{" "}
                and other national policy documents. Upload files directly or type them in.
              </p>
            </div>
            <div>
              <span className="w-7 h-7 rounded-full bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] flex items-center justify-center text-sm font-semibold">2</span>
              <h3 className="font-medium text-[var(--undp-black)] mt-2 mb-2">
                Automated Analysis
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                AI classifies each target by theme and sector, then assesses
                how well targets across different policies align with each
                other.
              </p>
            </div>
            <div>
              <span className="w-7 h-7 rounded-full bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] flex items-center justify-center text-sm font-semibold">3</span>
              <h3 className="font-medium text-[var(--undp-black)] mt-2 mb-2">
                Explore Results
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Interactive dashboard showing policy coverage, alignment
                patterns, and areas where coordination could be strengthened.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
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
