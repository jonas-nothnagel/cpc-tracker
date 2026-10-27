"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MovingText } from "@/components/brief/moving-text";
import { LOCALE_LABELS } from "@/i18n/locale-labels";
import { routing } from "@/i18n/routing";
import { heroLines } from "@/lib/upload/picture";
import type { Draft } from "@/lib/upload/types";
import { uploadPath } from "./use-draft";

/**
 * The brief's opening, shorter: the lockup and the page in each language,
 * the country as the title, and the targets read so far drifting behind it.
 */
export function UploadHero({ draft, country }: { draft: Draft | null; country: string }) {
  const locale = useLocale();
  const t = useTranslations("upload.hero");
  const th = useTranslations("brief.hero");
  const tl = useTranslations("common.languageSwitcher");
  const brand = useTranslations("header")("brand");
  // WCAG 2.2.2: moving content that runs on gets a pause control.
  const [paused, setPaused] = useState(false);
  const lines = useMemo(() => heroLines(draft), [draft]);
  return (
    <section className="brief-hero up-hero">
      {lines.length > 0 && (
        <>
          <MovingText lines={lines} rows={5} paused={paused} />
          <div className="brief-hero-veil" aria-hidden="true" />
        </>
      )}
      <div className="brief-hero-top">
        <a className="brief-hero-brand" href={locale === routing.defaultLocale ? "/" : `/${locale}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own lockup, small and static */}
          <img src="/undp-logo.png" alt="UNDP" width={22} height={44} /> <span>{brand}</span>
        </a>
        <nav className="brief-hero-languages" aria-label={tl("aria")}>
          {routing.locales.map((l) =>
            l === locale ? (
              <span key={l} aria-current="true">
                {LOCALE_LABELS[l] ?? l}
              </span>
            ) : (
              <a
                key={l}
                lang={l}
                href={uploadPath(l, draft?.id)}
                onClick={(e) => e.currentTarget.setAttribute("href", `${uploadPath(l, draft?.id)}${window.location.search}`)}
              >
                {LOCALE_LABELS[l] ?? l}
              </a>
            ),
          )}
        </nav>
      </div>
      <div className="brief-hero-content">
        {country && <p className="brief-hero-kicker">{t("title")}</p>}
        <h1 className="up-hero-title">{country || t("title")}</h1>
      </div>
      {lines.length > 0 && (
        <button
          type="button"
          className="brief-hero-pause"
          aria-label={paused ? th("play") : th("pause")}
          title={paused ? th("play") : th("pause")}
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
      )}
    </section>
  );
}
