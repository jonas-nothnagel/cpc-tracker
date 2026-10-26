import { getTranslations } from "next-intl/server";
import { UploadPage } from "@/components/upload/upload-page";
import { queueLength } from "@/lib/upload/queue";
import { serviceFacts, serviceSpeed } from "@/lib/upload/service";

// The notice names this deployment's model and provider, read at request time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "upload" });
  return { title: t("metaTitle") };
}

/** A new upload. The first file gives it its own address, /upload/{id}. */
export default function NewUploadPage() {
  return <UploadPage initialDraft={null} facts={serviceFacts()} speed={serviceSpeed()} ahead={queueLength()} />;
}
