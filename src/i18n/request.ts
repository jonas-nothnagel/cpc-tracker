import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  let messages: Record<string, unknown>;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch {
    notFound();
  }

  return {
    locale,
    messages,
    // Visible breadcrumb in the UI when a key is missing, instead of a silent
    // empty string. Wrapped in [[…]] so reviewers spot regressions instantly.
    getMessageFallback: ({ key, namespace }) =>
      `[[${[namespace, key].filter(Boolean).join(".")}]]`,
    onError: (error) => {
      if (process.env.NODE_ENV === "development") {
        throw error;
      }
      console.error(error);
    },
  };
});
