import type { Metadata } from "next";
import { existsSync } from "fs";
import { join } from "path";
import { getTranslations, setRequestLocale } from "next-intl/server";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.methodology" });
  return {
    title: t("title"),
    description: t("description"),
  };
}

/**
 * "How it works" methodology page.
 *
 * Renders the self-contained interactive pipeline walkthrough
 * (public/methodology-experience.html) full-screen via an iframe. The
 * experience carries its own top bar (UNDP logo links back to home via
 * target="_top") and depth toggle, so the app Header is intentionally omitted
 * for an immersive, focused explainer. The experience is English-first; page
 * metadata is still localised. It links to the printable 2-page brief at
 * public/methodology-brief.html.
 */
export default async function MethodologyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("metadata.methodology");

  // Serve the per-locale walkthrough when a translated copy exists, else fall
  // back to the English original. (The brief it links to is resolved the same
  // way inside each localized HTML file.)
  const localizedFile = `methodology-experience.${locale}.html`;
  const src =
    locale !== "en" &&
    existsSync(join(process.cwd(), "public", localizedFile))
      ? `/${localizedFile}`
      : "/methodology-experience.html";

  return (
    <iframe
      src={src}
      title={t("title")}
      style={{
        position: "fixed",
        inset: 0,
        width: "100%",
        height: "100%",
        border: 0,
      }}
    />
  );
}
