import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExplorePage } from "@/components/dashboard/explore-page";
import { getCountry, isValidCountryId } from "@/config/countries";

interface ExploreRouteProps {
  params: Promise<{ locale: string; country: string }>;
}

export async function generateMetadata({ params }: ExploreRouteProps) {
  const { locale, country } = await params;
  const lower = country.toLowerCase();
  const entry = isValidCountryId(lower) ? getCountry(lower) : undefined;
  if (!entry?.visible) return { title: "CPC Analyzer" };
  const t = await getTranslations({ locale, namespace: "header.nav" });
  return { title: `${entry.name} | ${t("explore")} | CPC Analyzer` };
}

export default async function ExploreRoute({ params }: ExploreRouteProps) {
  const { country } = await params;
  const lower = country.toLowerCase();

  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  // Same shape as the country page: render a shell and let the client fetch
  // the pre-gzipped, cached /api/dashboard payload.
  return (
    <ExplorePage key={`explore:${entry.id}`} country={entry.id} basePath={`/${entry.id}`} />
  );
}
