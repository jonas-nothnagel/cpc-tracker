"use client";

import { useTranslations } from "next-intl";
import { MovingText } from "./moving-text";

export function Hero({
  countryName,
  commitments,
  documents,
  comparisons,
  lines,
  onRead,
  onCustomize,
}: {
  countryName: string;
  commitments: number;
  documents: number;
  comparisons: number;
  lines: string[];
  onRead: () => void;
  onCustomize: () => void;
}) {
  const t = useTranslations("brief.hero");
  return (
    <section className="brief-hero" data-screen-only>
      <MovingText lines={lines} />
      <div className="brief-hero-veil" aria-hidden="true" />
      <div className="brief-hero-content">
        <p className="brief-hero-kicker">{t("kicker", { country: countryName })}</p>
        <h1 className="brief-hero-statement">
          <span>{t("commitments", { count: commitments })}</span>
          <span>{t("documents", { count: documents })}</span>
          <span>{t("comparisons", { count: comparisons })}</span>
        </h1>
        <p className="brief-hero-lead">{t("lead")}</p>
        <div className="brief-hero-actions">
          <button type="button" className="brief-button-primary" onClick={onRead}>
            {t("read")}
          </button>
          <button type="button" className="brief-button-quiet" onClick={onCustomize}>
            {t("customize")}
          </button>
        </div>
      </div>
      <p className="brief-hero-note">{t("quoted")}</p>
    </section>
  );
}
