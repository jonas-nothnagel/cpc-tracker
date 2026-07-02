"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

interface HeaderProps {
  subtitle?: string;
  /** When provided with countries, renders the subtitle as a country switcher */
  currentCountryId?: string;
  countries?: { id: string; name: string }[];
  /** When set, scopes nav links to this path (e.g. "/mongolia") so standalone
   *  country routes never expose navigation to other countries. */
  basePath?: string;
  /** Path the country switcher navigates to. Defaults to "/dashboard".
   *  Side pages (e.g. "/prototypes") pass their own so switching country
   *  keeps the user on the same view. */
  switcherPath?: string;
}

export function Header({
  subtitle,
  currentCountryId,
  countries,
  basePath,
  switcherPath = "/dashboard",
}: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("header");
  const showSwitcher = currentCountryId && countries && countries.length > 1;

  const navItems = basePath
    ? [
        { href: basePath, label: t("nav.home") },
        { href: "/methodology", label: t("nav.howItWorks") },
        { href: `${basePath}/upload`, label: t("nav.uploadData") },
      ]
    : [
        { href: "/", label: t("nav.home") },
        { href: "/methodology", label: t("nav.howItWorks") },
        { href: "/upload", label: t("nav.uploadData") },
      ];

  // Prototypes link preserves the active country when the caller gives us
  // one (dashboard and prototypes pages do). On pages without a country
  // context (home picker, upload wizard), it falls back to the bare
  // /prototypes route which redirects to the picker. Deliberately avoids
  // useSearchParams because that forces any page rendering Header to opt
  // out of Next.js static generation.
  const prototypesHref = currentCountryId
    ? `/prototypes?country=${currentCountryId}`
    : "/prototypes";

  return (
    <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={basePath ?? "/"}>
            <Image
              src="/undp-logo.png"
              alt="UNDP"
              width={48}
              height={72}
              className="h-12 w-auto"
            />
          </Link>
          <div>
            <Link
              href={basePath ?? "/"}
              className="text-sm font-medium text-[var(--undp-black)] hover:text-[var(--undp-blue)] transition-colors"
            >
              {t("brand")}
            </Link>
            {showSwitcher ? (
              <select
                value={currentCountryId}
                onChange={(e) =>
                  router.push(`${switcherPath}?country=${e.target.value}`)
                }
                className="block text-xs text-[var(--undp-gray)] bg-transparent border-none cursor-pointer focus:outline-none hover:text-[var(--undp-blue)]"
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ) : subtitle ? (
              <p className="text-xs text-[var(--undp-gray)]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`transition-colors ${
                pathname === item.href
                  ? "text-[var(--undp-blue)] font-medium"
                  : "text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {/* Quiet entry point for the prototypes scratchpad — intentionally
              subdued so it reads as "extra, internal" next to primary nav. */}
          {!basePath && (
            <Link
              href={prototypesHref}
              aria-current={pathname === "/prototypes" ? "page" : undefined}
              className={`text-[11px] italic tracking-wide transition-colors ${
                pathname === "/prototypes"
                  ? "text-[var(--undp-blue)]"
                  : "text-gray-400 hover:text-[var(--undp-gray)]"
              }`}
            >
              {t("nav.prototypes")}
            </Link>
          )}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
