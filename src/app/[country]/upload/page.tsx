"use client";

import { useParams, notFound } from "next/navigation";
import { getCountry, isValidCountryId } from "@/config/countries";
import { UploadWizard } from "@/components/upload/upload-wizard";

export default function StandaloneUploadPage() {
  const params = useParams<{ country: string }>();
  const lower = params.country?.toLowerCase() ?? "";

  if (!isValidCountryId(lower)) notFound();
  const entry = getCountry(lower);
  if (!entry?.visible) notFound();

  return (
    <UploadWizard
      lockedCountry={entry.name}
      basePath={`/${entry.id}`}
    />
  );
}
