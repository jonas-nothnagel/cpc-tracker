import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { SustainabilityClient } from "@/components/sustainability/sustainability-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.sustainability");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default function SustainabilityPage() {
  return <SustainabilityClient />;
}
