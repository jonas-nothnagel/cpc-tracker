import { notFound } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getCountry, isValidCountryId } from "@/config/countries";
import { getCountryDashboardPayload } from "@/lib/dashboard-data";

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

  // Server-assemble the payload (cached per country) so the dashboard renders
  // from inlined data instead of a ~10 MB post-hydration fetch. Falls back to
  // the client fetch if assembly fails.
  const payload = getCountryDashboardPayload(entry.id);
  const initialData = payload.kind === "ok" ? payload.payload.data : undefined;

  return (
    <DashboardClient
      key={`standalone:${entry.id}`}
      country={entry.id}
      basePath={`/${entry.id}`}
      initialData={initialData}
    />
  );
}
