import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — dark backdrop strip for logo visibility on any image */}
      <header className="absolute top-0 left-0 right-0 z-10">
        <div className="bg-gradient-to-b from-black/50 to-transparent">
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white/90 rounded p-0.5">
                <Image
                  src="/undp-logo.png"
                  alt="UNDP"
                  width={40}
                  height={60}
                  className="h-10 w-auto"
                />
              </div>
              <span className="text-sm font-medium text-white tracking-wide hidden sm:block">
                Policy Coherence Tracker
              </span>
            </div>
            <nav className="flex gap-6 text-sm text-white/90">
              <Link href="/dashboard" className="hover:text-white transition-colors">
                Dashboard
              </Link>
              <Link href="/upload" className="hover:text-white transition-colors">
                Upload Data
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero with background image — use bolatbek (steppe/mountain) photo */}
      <section className="relative h-[60vh] min-h-[420px] flex items-center">
        <Image
          src="/bolatbek-gabiden-dsL_tvf1Z-E-unsplash.jpg"
          alt="Mongolia steppe landscape"
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[var(--undp-black)]/85 via-[var(--undp-black)]/50 to-transparent" />
        <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
          <p className="text-sm uppercase tracking-widest text-[var(--undp-blue-light)] mb-3">
            UNDP AI Sprint Initiative
          </p>
          <h1 className="text-4xl md:text-5xl font-light text-white mb-6 leading-tight max-w-2xl">
            Nature-Climate Policy Coherence Tracker
          </h1>
          <p className="text-lg text-white/70 mb-10 max-w-xl leading-relaxed">
            Upload national policy targets. Run AI-powered alignment analysis.
            Explore interactive coherence insights across climate, biodiversity,
            and sectoral policies.
          </p>
          <div className="flex gap-4">
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-[var(--undp-blue)] text-white text-sm font-medium rounded hover:bg-[var(--undp-blue-dark)] transition-colors"
            >
              View Mongolia Pilot
            </Link>
            <Link
              href="/upload"
              className="px-6 py-3 border border-white/30 text-white text-sm font-medium rounded hover:bg-white/10 transition-colors"
            >
              Upload Targets
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-light text-[var(--undp-black)] mb-12 text-center">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] flex items-center justify-center text-xl font-light mx-auto mb-4">
                1
              </div>
              <h3 className="font-medium text-[var(--undp-black)] mb-2">
                Upload Targets
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Enter policy targets from NDC, NBSAP, NAP, LDN, and sectoral
                documents. Paste, type, or upload a CSV.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] flex items-center justify-center text-xl font-light mx-auto mb-4">
                2
              </div>
              <h3 className="font-medium text-[var(--undp-black)] mb-2">
                AI Analysis
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Multi-agent LLM pipeline classifies targets against NBS
                categories, cross-cutting themes, and assesses pairwise
                alignment.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] flex items-center justify-center text-xl font-light mx-auto mb-4">
                3
              </div>
              <h3 className="font-medium text-[var(--undp-black)] mb-2">
                Explore Results
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Interactive dashboard with NBS breakdown, theme coverage,
                alignment heatmaps, and exportable insights.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pilot countries */}
      <section className="py-16 bg-[var(--undp-light)]">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-lg font-medium text-[var(--undp-black)] mb-8 text-center">
            Pilot Countries
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Link
              href="/dashboard"
              className="group relative h-56 rounded-lg overflow-hidden"
            >
              <Image
                src="/vince-gx-yhbanN00pb8-unsplash.jpg"
                alt="Mongolia"
                fill
                className="object-cover object-bottom group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5 text-white">
                <p className="text-lg font-medium">🇲🇳 Mongolia</p>
                <p className="text-xs text-white/70">59 targets analysed</p>
              </div>
            </Link>
            <div className="relative h-56 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
              <div className="text-center">
                <p className="text-lg text-[var(--undp-gray)]">🇵🇦 Panama</p>
                <p className="text-xs text-[var(--undp-gray)]/60 mt-1">
                  Coming soon
                </p>
              </div>
            </div>
            <div className="relative h-56 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
              <div className="text-center">
                <p className="text-lg text-[var(--undp-gray)]">🇲🇦 Morocco</p>
                <p className="text-xs text-[var(--undp-gray)]/60 mt-1">
                  Coming soon
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/undp-logo.png"
              alt="UNDP"
              width={45}
              height={72}
              className="h-12 w-auto"
            />
            <span className="text-sm text-[var(--undp-gray)]">
              United Nations Development Programme
            </span>
          </div>
          <span className="text-xs text-[var(--undp-gray)]/50">
            AI Sprint Initiative · Prototype
          </span>
        </div>
      </footer>
    </div>
  );
}
