import { notFound } from "next/navigation";
import { CoherenceDashboard } from "@/components/dashboard/coherence-dashboard";
import { getCountry, isValidCountryId } from "@/config/countries";

interface StandalonePageProps {
  params: Promise<{ country: string }>;
}

export async function generateMetadata({ params }: StandalonePageProps) {
  const { country } = await params;
  const lower = country.toLowerCase();
  const entry = isValidCountryId(lower) ? getCountry(lower) : undefined;
  if (!entry?.visible) return { title: "CPC Analyzer" };
  return { title: `${entry.name} | CPC Analyzer` };
}

export default async function StandaloneCountryPage({ params }: StandalonePageProps) {
  const { country } = await params;
  const lower = country.toLowerCase();

  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  // Render a shell and let the client fetch /api/dashboard (pre-gzipped, cached)
  // instead of inlining the full ~40 MB payload into the no-store HTML, which
  // dominated server TTFB on Azure. See src/app/dashboard/page.tsx.
  return (
    <CoherenceDashboard
      key={`standalone:${entry.id}`}
      country={entry.id}
      basePath={`/${entry.id}`}
    />
  );
}
