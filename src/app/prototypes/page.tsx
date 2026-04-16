import Link from "next/link";
import { redirect } from "next/navigation";
import { PrototypesClient } from "@/components/prototypes/prototypes-client";
import { Header } from "@/components/ui/header";
import { getCountry, isValidCountryId } from "@/config/countries";

// Follows the same search-param conventions as /dashboard so URLs can be
// swapped ("/dashboard?country=..." ↔ "/prototypes?country=...") without
// further thought.
type SearchParam = string | string[] | undefined;
interface PrototypesPageProps {
  searchParams: Promise<{ analysisId?: SearchParam; country?: SearchParam }>;
}

function firstValue(v: SearchParam): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export async function generateMetadata({ searchParams }: PrototypesPageProps) {
  const params = await searchParams;
  const analysisId = firstValue(params.analysisId);
  const country = firstValue(params.country);
  if (analysisId) {
    return { title: `Prototypes · Analysis ${analysisId} | CPC Tracker` };
  }
  const countryLower = country?.toLowerCase();
  const entry = countryLower ? getCountry(countryLower) : undefined;
  return {
    title: entry
      ? `${entry.name} Prototypes | CPC Tracker`
      : "Prototypes | CPC Tracker",
  };
}

function UnavailableState() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header subtitle="Prototypes" />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-medium text-[var(--undp-black)] mb-3">
          Pick a country
        </h1>
        <p className="text-sm text-[var(--undp-gray)] mb-8">
          Prototypes render against an existing country dataset. Start from
          the homepage and choose one.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[var(--undp-blue)] hover:bg-[var(--undp-blue-dark)] transition-colors"
        >
          Back to home
        </Link>
      </main>
    </div>
  );
}

export default async function PrototypesPage({ searchParams }: PrototypesPageProps) {
  const params = await searchParams;
  const analysisId = firstValue(params.analysisId);
  const country = firstValue(params.country);

  if (analysisId) {
    return <PrototypesClient key={`a:${analysisId}`} analysisId={analysisId} />;
  }

  const countryLower = country?.toLowerCase();
  if (!countryLower) {
    redirect("/");
  }
  if (!isValidCountryId(countryLower)) {
    return <UnavailableState />;
  }
  const entry = getCountry(countryLower);
  if (!entry || !entry.visible) {
    return <UnavailableState />;
  }

  return <PrototypesClient key={`c:${entry.id}`} country={entry.id} />;
}
