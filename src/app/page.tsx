import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
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
            <Link href="/dashboard" className="hover:text-[var(--undp-blue)] transition-colors">
              Dashboard
            </Link>
            <Link href="/upload" className="hover:text-[var(--undp-blue)] transition-colors">
              Upload Data
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero — image spans full viewport width, text constrained */}
      <section className="relative min-h-[380px] md:min-h-[420px] flex items-center">
        {/* Background image — full bleed */}
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src="/biodiversity.jpg"
            alt="Mongolia steppe landscape"
            fill
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/60 to-transparent" />
        </div>
        {/* Content on top */}
        <div className="relative z-10 max-w-6xl mx-auto px-6 w-full">
          <div className="max-w-xl py-16 md:py-20">
            <p className="text-xs uppercase tracking-widest text-[var(--undp-blue-light)] mb-3">
              UNDP AI Sprint Initiative
            </p>
            <h1 className="text-3xl md:text-4xl font-light text-[var(--undp-black)] mb-4 leading-tight tracking-tight">
              Nature-Climate Policy Coherence Tracker
            </h1>
            <p className="text-base text-[var(--undp-gray)] mb-8 leading-relaxed">
              Upload national policy targets. Run AI-powered alignment analysis.
              Explore interactive coherence insights across climate, biodiversity,
              and sectoral policies.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="px-5 py-2.5 bg-[var(--undp-blue)] text-white text-sm font-medium hover:bg-[var(--undp-blue-dark)] transition-colors"
              >
                View Mongolia Pilot
              </Link>
              <Link
                href="/upload"
                className="px-5 py-2.5 border border-[var(--undp-blue)] text-[var(--undp-blue)] text-sm font-medium hover:bg-[var(--undp-blue)]/5 transition-colors"
              >
                Upload Targets
              </Link>
            </div>
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
              <span className="text-sm font-medium text-[var(--undp-blue)]">1</span>
              <h3 className="font-medium text-[var(--undp-black)] mt-2 mb-2">
                Upload Targets
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Enter policy targets from NDC, NBSAP, NAP, LDN, and sectoral
                documents. Paste, type, or upload a CSV.
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-[var(--undp-blue)]">2</span>
              <h3 className="font-medium text-[var(--undp-black)] mt-2 mb-2">
                AI Analysis
              </h3>
              <p className="text-sm text-[var(--undp-gray)] leading-relaxed">
                Multi-agent LLM pipeline classifies targets against NBS
                categories, cross-cutting themes, and assesses pairwise
                alignment.
              </p>
            </div>
            <div>
              <span className="text-sm font-medium text-[var(--undp-blue)]">3</span>
              <h3 className="font-medium text-[var(--undp-black)] mt-2 mb-2">
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

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
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
