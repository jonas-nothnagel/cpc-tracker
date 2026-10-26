import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { UploadPage } from "@/components/upload/upload-page";
import { freshDraft } from "@/lib/upload/reading";
import { queueLength } from "@/lib/upload/queue";
import { serviceFacts, serviceSpeed } from "@/lib/upload/service";
import { STEPS, type StepId } from "@/lib/upload/steps";

// A draft changes while its documents are read.
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "upload" });
  return { title: t("metaTitle") };
}

/** An upload in progress, kept on the server under its analysis id. Once
 *  started, the address of its analysis takes over. */
export default async function DraftPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const draft = freshDraft(id);
  if (!draft) notFound();
  if (draft.started) redirect(`${locale === routing.defaultLocale ? "" : `/${locale}`}/analysis/${id}`);
  const asked = (await searchParams).step;
  const step = STEPS.find((s) => s === asked) as StepId | undefined;
  return <UploadPage initialDraft={draft} initialStep={step} facts={serviceFacts()} speed={serviceSpeed()} ahead={queueLength()} />;
}
