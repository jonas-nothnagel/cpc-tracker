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
const MACHINE_TRANSLATED = new Set(["es"]);

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("common.languageSwitcher");
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // A switcher with one option reads as broken UX. The day a second locale
  // is added to `routing.locales`, the switcher appears automatically.
  if (routing.locales.length < 2) return null;

  return (
    <span className="inline-flex items-center gap-2">
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          startTransition(() => {
            router.replace(pathname, { locale: next });
          });
        }}
        disabled={isPending}
        aria-label={t("aria")}
        className="text-xs text-[var(--undp-gray)] bg-transparent border border-gray-200 rounded px-2 py-1 cursor-pointer focus:outline-none hover:text-[var(--undp-blue)] focus:border-[var(--undp-blue)]"
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l] ?? l}
          </option>
        ))}
      </select>
      {MACHINE_TRANSLATED.has(locale) && (
        <span className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)]/70 whitespace-nowrap">
          {t("machineTranslatedNote")}
        </span>
      )}
    </span>
  );
}
