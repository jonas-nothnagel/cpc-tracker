"use client";

import { useParams } from "next/navigation";
import { getCountry, isValidCountryId } from "@/config/countries";
import { UploadWizard } from "@/components/upload/upload-wizard";

export default function StandaloneUploadPage() {
  const params = useParams<{ country: string }>();
  const lower = params.country?.toLowerCase() ?? "";

  if (!isValidCountryId(lower)) return null;
  const entry = getCountry(lower);
  if (!entry?.visible) return null;

  return (
    <UploadWizard
      lockedCountry={entry.name}
      basePath={`/${entry.id}`}
    />
  );
}
