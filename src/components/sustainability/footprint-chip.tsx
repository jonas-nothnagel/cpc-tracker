"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

import type { FootprintRollup } from "@/lib/footprint/types";

function fmtCarbon(g: number): string {
  return g >= 1000
    ? `${(g / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`
    : `${Math.round(g)} g`;
}

/**
 * Small always-on chip linking to /sustainability, showing the cumulative AI
 * carbon footprint. Shown on every page (including the landing) and suppressed
 * only on the sustainability page itself, where it would be a redundant
 * self-link. Hidden until something is recorded.
 */
export function FootprintChip() {
  const pathname = usePathname();
  const t = useTranslations("sustainability");
  const [co2, setCo2] = useState<number | null>(null);
  // Fold-safe: at the top of a scrollable page the chip stays out of the way
  // (it overlapped the briefing's corpus chips at laptop sizes). It appears
  // once the reader scrolls; on pages too short to scroll it shows directly,
  // so the link is never unreachable.
  const [pastFold, setPastFold] = useState(false);

  const suppressed = pathname === "/sustainability";

  useEffect(() => {
    const update = () =>
      setPastFold(
        window.scrollY > 120 ||
          document.documentElement.scrollHeight <=
            window.innerHeight + 40,
      );
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    // The page grows after mount (data arrives, sections render) — without
    // this, a short loading state would latch the chip visible at the top.
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (suppressed) return;
    let cancelled = false;
    fetch("/api/sustainability")
      .then((r) => (r.ok ? (r.json() as Promise<FootprintRollup>) : null))
      .then((data) => {
        if (!cancelled && data) setCo2(data.totals.co2_geq);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [suppressed]);

  if (suppressed || co2 === null || co2 <= 0 || !pastFold) return null;

  // Anchored bottom-right on every page (the landing hero's WCAG pause/play
  // control sits bottom-left so they never overlap), so the link lives in the
  // same spot across landing and dashboard.
  return (
    <Link
      href="/sustainability"
      title={t("chip.title")}
      className="group fixed bottom-3 right-3 z-40 text-xs text-[var(--undp-gray)] bg-white/95 backdrop-blur border border-gray-200 rounded-full px-3.5 py-1.5 shadow-md hover:text-[var(--undp-blue)] hover:border-[var(--undp-blue)]/40 transition-colors"
    >
      {t.rich("chip.label", {
        value: fmtCarbon(co2),
        b: (chunks) => (
          <span className="font-semibold text-[var(--undp-black)] group-hover:text-[var(--undp-blue)] transition-colors">
            {chunks}
          </span>
        ),
      })}
    </Link>
  );
}
