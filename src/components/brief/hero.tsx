"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MovingText } from "./moving-text";

export function Hero({
  countryName,
  commitments,
  documents,
  comparisons,
  lines,
  translation = null,
  onRead,
  onCustomize,
}: {
  countryName: string;
  commitments: number;
  documents: number;
  comparisons: number;
  lines: string[];
  /** Said whenever the targets are not in the documents' own wording. */
  translation?: "machine" | "source" | null;
  onRead: () => void;
  onCustomize: () => void;
}) {
  const t = useTranslations("brief.hero");
  const ts = useTranslations("brief.sheet");
  // WCAG 2.2.2: moving content that runs on gets a pause control.
  const [paused, setPaused] = useState(false);
  return (
    <section className="brief-hero" data-screen-only>
      <MovingText lines={lines} paused={paused} />
      <div className="brief-hero-veil" aria-hidden="true" />
      <div className="brief-hero-content">
        <p className="brief-hero-kicker">{t("kicker", { country: countryName })}</p>
        <h1 className="brief-hero-statement">
          <span>{t("documents", { count: documents })}</span>
          <span>{t("commitments", { count: commitments })}</span>
          <span>{t("comparisons", { count: comparisons })}</span>
        </h1>
        <p className="brief-hero-lead">{t("lead")}</p>
        {translation && (
          <p className="brief-hero-note">
            {ts(translation === "machine" ? "translatedMachine" : "translatedSource")}
          </p>
        )}
        <div className="brief-hero-actions">
          <button type="button" className="brief-button-primary" onClick={onRead}>
            {t("read")}
          </button>
          <button type="button" className="brief-button-quiet" onClick={onCustomize}>
            {t("customize")}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="brief-hero-pause"
        aria-label={paused ? t("play") : t("pause")}
        title={paused ? t("play") : t("pause")}
        onClick={() => setPaused((p) => !p)}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          {paused ? (
            <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
          ) : (
            <path d="M2.5 1.5h2.5v9H2.5zM7 1.5h2.5v9H7z" fill="currentColor" />
          )}
        </svg>
      </button>
    </section>
  );
}
