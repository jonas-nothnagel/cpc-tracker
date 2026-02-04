import Image from "next/image";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <Image
            src="/undp-logo.png"
            alt="UNDP"
            width={50}
            height={80}
            className="h-12 w-auto"
          />
          <span className="text-sm text-[var(--undp-gray)]">AI Sprint Initiative</span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center px-6">
        <div className="max-w-2xl text-center py-20">
          <p className="text-sm uppercase tracking-widest text-[var(--undp-blue)] mb-4">
            Coming Soon
          </p>
          <h1 className="text-4xl md:text-5xl font-light text-[var(--undp-black)] mb-6 leading-tight">
            Policy Coherence<br />Progress Tracker
          </h1>
          <p className="text-lg text-[var(--undp-gray)] mb-12 leading-relaxed">
            Visualizing alignment across climate, biodiversity, and sectoral policies
            to support integrated implementation.
          </p>
          <div className="flex justify-center gap-8 text-sm text-[var(--undp-gray)]">
            <span>🇲🇳 Mongolia</span>
            <span>🇵🇦 Panama</span>
            <span>🇲🇦 Morocco</span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-sm text-[var(--undp-gray)]">
          United Nations Development Programme
        </div>
      </footer>
    </div>
  );
}
