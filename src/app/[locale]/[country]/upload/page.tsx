import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCountry, isStandaloneCountry, isValidCountryId } from "@/config/countries";
import { UploadPage } from "@/components/upload/upload-page";
import { queueLength } from "@/lib/upload/queue";
import { serviceFacts, serviceSpeed } from "@/lib/upload/service";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; country: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "upload" });
  return { title: t("metaTitle") };
}

/** A new upload from a country's pages: the country is filled in. A country
 *  shared on its own (Country X) takes no uploads. */
export default async function CountryUploadPage({ params }: Props) {
  const { country } = await params;
  const id = country.toLowerCase();
  if (!isValidCountryId(id) || isStandaloneCountry(id)) notFound();
  const entry = getCountry(id);
  if (!entry?.visible) notFound();
  return <UploadPage initialDraft={null} lockedCountry={entry.name} facts={serviceFacts()} speed={serviceSpeed()} ahead={queueLength()} />;
}
