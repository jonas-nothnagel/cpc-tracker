"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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
  const [co2, setCo2] = useState<number | null>(null);

  const suppressed = pathname === "/sustainability";

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

  if (suppressed || co2 === null || co2 <= 0) return null;

  // On the landing page the hero's WCAG pause/play control sits bottom-right,
  // so anchor the chip bottom-left there to avoid overlapping it.
  const corner = pathname === "/" ? "left-3" : "right-3";

  return (
    <Link
      href="/sustainability"
      title="AI sustainability footprint of this tool"
      className={`fixed bottom-3 ${corner} z-40 text-[11px] text-[var(--undp-gray)] bg-white/90 backdrop-blur border border-gray-200 rounded-full px-3 py-1 shadow-sm hover:text-[var(--undp-blue)] hover:border-[var(--undp-blue)]/40 transition-colors`}
    >
      AI footprint: {fmtCarbon(co2)} CO2e
    </Link>
  );
}
