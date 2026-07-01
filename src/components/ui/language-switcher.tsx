"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { routing, type Locale } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";

// Friendly display label per locale; falls back to the code itself for
// locales that haven't had a label assigned yet.
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  mn: "Монгол",
};

// Locales whose UI strings are machine-translated and not yet human-reviewed.
// Surfaced as a caveat beside the switcher so users read them with the right
// confidence. Remove a code here once a native speaker has reviewed it.
const MACHINE_TRANSLATED = new Set(["es", "mn"]);

export function LanguageSwitcher({ onDark = false }: { onDark?: boolean }) {
  const locale = useLocale();
  const t = useTranslations("common.languageSwitcher");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A switcher with one option reads as broken UX. The day a second locale
  // is added to `routing.locales`, the switcher appears automatically.
  if (routing.locales.length < 2) return null;

  // `onDark` matches the white nav over the cinematic hero; the default light
  // tone is used in the scrolled header and the shared in-app header.
  const tone = onDark
    ? "text-white border-white/40 hover:border-white/80 focus:border-white"
    : "text-[var(--undp-gray)] border-gray-200 hover:text-[var(--undp-blue)] focus:border-[var(--undp-blue)]";

  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`relative inline-flex items-center ${
          onDark ? "text-white" : "text-[var(--undp-gray)]"
        }`}
      >
        <select
          value={locale}
          onChange={(e) => {
            const next = e.target.value as Locale;
            // Preserve the query string (e.g. the dashboard's ?country=panama);
            // `usePathname()` drops it, which otherwise sends the user to an
            // empty dashboard that bounces to the landing page. Read
            // window.location.search in the handler rather than via
            // useSearchParams() during render, so this shared header component
            // doesn't opt static pages out of prerendering.
            const search =
              typeof window !== "undefined" ? window.location.search : "";
            startTransition(() => {
              router.replace(`${pathname}${search}`, { locale: next });
            });
          }}
          disabled={isPending}
          aria-label={t("aria")}
          className={`appearance-none cursor-pointer rounded border bg-transparent py-1 pl-2 pr-7 text-xs transition-colors focus:outline-none ${tone}`}
        >
          {routing.locales.map((l) => (
            // Force readable option colours so the open menu stays dark-on-white
            // even when the closed control shows white text over the hero.
            <option key={l} value={l} style={{ color: "#232e3d", backgroundColor: "#fff" }}>
              {LOCALE_LABELS[l] ?? l}
            </option>
          ))}
        </select>
        {/* Custom chevron: the native select arrow renders nearly invisible on
            the dark hero, so draw our own in the current text colour. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute right-2 h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {MACHINE_TRANSLATED.has(locale) && (
        <span
          className={`text-[10px] uppercase tracking-wider whitespace-nowrap ${
            onDark ? "text-white/75" : "text-[var(--undp-gray)]/70"
          }`}
        >
          {t("machineTranslatedNote")}
        </span>
      )}
    </span>
  );
}
