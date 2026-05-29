import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { Header } from "@/components/ui/header";
import { getCountry, isValidCountryId } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";

// Next.js searchParams returns string | string[] | undefined when a key
// appears multiple times in the URL (e.g. ?country=a&country=b). Without
// this, the .toLowerCase() call below would throw on the array shape.
type SearchParam = string | string[] | undefined;
interface DashboardPageProps {
  searchParams: Promise<{ analysisId?: SearchParam; country?: SearchParam }>;
}

function firstValue(v: SearchParam): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export async function generateMetadata({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const analysisId = firstValue(params.analysisId);
  const country = firstValue(params.country);
  if (analysisId) {
    return { title: `Analysis ${analysisId} | CPC Tracker` };
  }
  const countryLower = country?.toLowerCase();
  const entry = countryLower ? getCountry(countryLower) : undefined;
  return {
    title: entry ? `${entry.name} Dashboard | CPC Tracker` : "Dashboard | CPC Tracker",
  };
}

function UnavailableState() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header subtitle="Dashboard" />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-medium text-[var(--undp-black)] mb-3">
          This country is not yet available
        </h1>
        <p className="text-sm text-[var(--undp-gray)] mb-8">
          Select a country from the homepage to explore the dashboard.
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

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const analysisId = firstValue(params.analysisId);
  const country = firstValue(params.country);

  // analysisId wins when both are present — it's the upload flow and is
  // orthogonal to the country registry. The `key` makes React fully remount
  // the client when the target changes, so stale error/data state from a
  // previous country never leaks into the next one.
  if (analysisId) {
    return <DashboardClient key={`a:${analysisId}`} analysisId={analysisId} />;
  }

  // Country-addressed path. Empty string is treated as missing.
  const countryLower = country?.toLowerCase();
  if (!countryLower) {
    redirect("/");
  }

  // Format gate + registry gate. Invalid or unknown countries land on the
  // "not yet available" error state rather than hitting the API.
  if (!isValidCountryId(countryLower)) {
    return <UnavailableState />;
  }
  const entry = getCountry(countryLower);
  if (!entry || !entry.visible) {
    return <UnavailableState />;
  }

  // Assemble the payload on the server so the client island renders from
  // inlined data instead of making a ~10 MB post-hydration round trip. The
  // payload is cached per country for the container's lifetime. On any error
  // (e.g. pipeline output missing) we omit initialData and let the client fall
  // back to its own fetch + error handling.
  const payload = getCountryDashboardPayload(entry.id);
  const initialData = payload.kind === "ok" ? payload.payload.data : undefined;

  return (
    <DashboardClient key={`c:${entry.id}`} country={entry.id} initialData={initialData} />
  );
}
