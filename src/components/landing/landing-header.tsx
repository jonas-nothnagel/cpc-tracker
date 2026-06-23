"use client";

/**
 * Landing header. Sits transparent over the dark cinematic hero (white logo +
 * nav), then turns into a solid white bar once the user scrolls past the top of
 * the hero. Bespoke to the home page so it does not affect the shared Header
 * used on /dashboard and /prototypes.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export function LandingHeader() {
  const t = useTranslations("header");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${
        scrolled
          ? "border-b border-gray-100 bg-white/95 backdrop-blur"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          {/* The UNDP logo is a self-contained blue lockup, so it reads on both
              the dark hero and the white scrolled header without recolouring. */}
          <Image
            src="/undp-logo.png"
            alt="UNDP"
            width={48}
            height={72}
            priority
            className="h-11 w-auto"
          />
          <span
            className={`hidden text-sm font-medium tracking-wide transition-colors duration-300 sm:block ${
              scrolled ? "text-[var(--undp-black)]" : "text-white"
            }`}
          >
            {t("brand")}
          </span>
        </Link>
        <nav className="flex items-center gap-8 text-sm">
          <Link
            href="/methodology"
            className={`transition-colors duration-300 ${
              scrolled
                ? "text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
                : "text-white/90 hover:text-white"
            }`}
          >
            {t("nav.howItWorks")}
          </Link>
          <Link
            href="/upload"
            className={`transition-colors duration-300 ${
              scrolled
                ? "text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
                : "text-white/90 hover:text-white"
            }`}
          >
            {t("nav.uploadData")}
          </Link>
          <LanguageSwitcher onDark={!scrolled} />
        </nav>
      </div>
    </header>
  );
}
