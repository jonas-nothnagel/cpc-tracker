import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import "../globals.css";
import { AnalyticsProvider } from "@/components/analytics/analytics-provider";
import { FootprintChip } from "@/components/sustainability/footprint-chip";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata.root" });
  return {
    title: t("title"),
    description: t("description"),
    icons: {
      icon: "/undp-logo.png",
    },
    openGraph: {
      title: t("title"),
      description: t("description"),
      type: "website",
    },
    alternates: {
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}`]),
      ),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  return (
    <html lang={locale}>
      <body style={{ margin: 0, minHeight: "100vh" }}>
        <NextIntlClientProvider>
          {children}
          <FootprintChip />
          {/* Removable usage analytics: see src/lib/analytics/README.md. */}
          <Suspense fallback={null}>
            <AnalyticsProvider />
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
