"use client";

import { useTranslations } from "next-intl";

export function PrototypeBadge({ tone = "light" }: { tone?: "light" | "dark" }) {
  const t = useTranslations("common.prototype");
  const pill =
    tone === "dark"
      ? "bg-white/20 text-white ring-1 ring-white/40"
      : "bg-[var(--undp-blue)]/10 text-[var(--undp-blue)] ring-1 ring-[var(--undp-blue)]/30";
  const caption =
    tone === "dark" ? "text-white/90" : "text-[var(--undp-black)]/70";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`${pill} px-2.5 py-1 rounded-full text-xs uppercase tracking-wide font-semibold`}
      >
        {t("badge")}
      </span>
      <span className={`${caption} text-sm font-medium`}>{t("caption")}</span>
    </span>
  );
}
