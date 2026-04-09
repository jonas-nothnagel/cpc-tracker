"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

// "Home" covers the country index — the landing page is the country picker.
// A separate "Dashboard" link without a country id would redirect back to "/",
// so we intentionally omit it.
const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/upload", label: "Upload Data" },
];

interface HeaderProps {
  subtitle?: string;
}

export function Header({ subtitle }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-100 sticky top-0 bg-white z-10">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-4">
          <Image
            src="/undp-logo.png"
            alt="UNDP"
            width={48}
            height={72}
            className="h-12 w-auto"
          />
          <div>
            <p className="text-sm font-medium text-[var(--undp-black)]">
              Policy Coherence Tracker
            </p>
            {subtitle && (
              <p className="text-xs text-[var(--undp-gray)]">{subtitle}</p>
            )}
          </div>
        </Link>
        <nav className="flex items-center gap-6 text-sm">
          {NAV_ITEMS.map((item) => (
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
