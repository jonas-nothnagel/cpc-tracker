import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getCountry, isValidCountryId } from "@/config/countries";

interface StandalonePageProps {
  params: Promise<{ country: string }>;
}

export async function generateMetadata({ params }: StandalonePageProps) {
  const { country } = await params;
  const lower = country.toLowerCase();
  const entry = isValidCountryId(lower) ? getCountry(lower) : undefined;
  if (!entry?.visible) return { title: "CPC Tracker" };
  return { title: `${entry.name} | CPC Tracker` };
}

export default async function StandaloneCountryPage({ params }: StandalonePageProps) {
  const { country } = await params;
  const lower = country.toLowerCase();

  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  return (
    <DashboardClient
      key={`standalone:${entry.id}`}
      country={entry.id}
      basePath={`/${entry.id}`}
    />
  );
}
