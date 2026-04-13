"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// "Home" covers the country index — the landing page is the country picker.
// A separate "Dashboard" link without a country id would redirect back to "/",
// so we intentionally omit it.
const DEFAULT_NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/upload", label: "Upload Data" },
];

interface HeaderProps {
  subtitle?: string;
  /** When provided with countries, renders the subtitle as a country switcher */
  currentCountryId?: string;
  countries?: { id: string; name: string }[];
  /** When set, scopes nav links to this path (e.g. "/mongolia") so standalone
   *  country routes never expose navigation to other countries. */
  basePath?: string;
}

export function Header({ subtitle, currentCountryId, countries, basePath }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const showSwitcher = currentCountryId && countries && countries.length > 1;

  const navItems = basePath
    ? [
        { href: basePath, label: "Home" },
        { href: `${basePath}/upload`, label: "Upload Data" },
      ]
    : DEFAULT_NAV_ITEMS;

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
            <Link href={basePath ?? "/"} className="text-sm font-medium text-[var(--undp-black)] hover:text-[var(--undp-blue)] transition-colors">
              Policy Coherence Tracker
            </Link>
            {showSwitcher ? (
              <select
                value={currentCountryId}
                onChange={(e) => router.push(`/dashboard?country=${e.target.value}`)}
                className="block text-xs text-[var(--undp-gray)] bg-transparent border-none cursor-pointer focus:outline-none hover:text-[var(--undp-blue)]"
              >
                {countries.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
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
        </nav>
      </div>
    </header>
  );
}
