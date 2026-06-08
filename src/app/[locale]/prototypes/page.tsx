import { getLocale, getTranslations } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
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
  const t = await getTranslations("metadata.prototypes");
  const analysisId = firstValue(params.analysisId);
  const country = firstValue(params.country);
  if (analysisId) {
    return { title: t("analysisTitle", { id: analysisId }) };
  }
  const countryLower = country?.toLowerCase();
  const entry = countryLower ? getCountry(countryLower) : undefined;
  return {
    title: entry ? t("countryTitle", { name: entry.name }) : t("title"),
  };
}

async function UnavailableState() {
  const t = await getTranslations("prototypes.unavailable");
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header subtitle={t("subtitle")} />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 text-center">
        <h1 className="text-xl font-medium text-[var(--undp-black)] mb-3">
          {t("heading")}
        </h1>
        <p className="text-sm text-[var(--undp-gray)] mb-8">
          {t("body")}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-[var(--undp-blue)] hover:bg-[var(--undp-blue-dark)] transition-colors"
        >
          {t("backToHome")}
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
    return (
      <DashboardClient
        key={`a:${analysisId}`}
        analysisId={analysisId}
        switcherPath="/prototypes"
      />
    );
  }

  const locale = await getLocale();
  const countryLower = country?.toLowerCase();
  if (!countryLower) {
    return redirect({ href: "/", locale });
  }
  if (!isValidCountryId(countryLower)) {
    return <UnavailableState />;
  }
  const entry = getCountry(countryLower);
  if (!entry || !entry.visible) {
    return <UnavailableState />;
  }

  // Let the client fetch /api/dashboard (pre-gzipped, cached) instead of inlining
  // the full ~40 MB payload into the no-store HTML, matching the live /dashboard
  // route. See src/app/dashboard/page.tsx.
  return (
    <DashboardClient
      key={`c:${entry.id}`}
      country={entry.id}
      switcherPath="/prototypes"
    />
  );
}
