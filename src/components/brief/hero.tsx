"use client";

import { useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { listVisibleCountries } from "@/config/countries";
import { routing } from "@/i18n/routing";
import { LOCALE_LABELS, MACHINE_TRANSLATED } from "@/i18n/locale-labels";
import { MovingText } from "./moving-text";

/** A country's brief in a language; English carries no prefix. */
function briefPath(locale: string, countryId: string): string {
  return `${locale === routing.defaultLocale ? "" : `/${locale}`}/${countryId}/brief`;
}

/** Splits a message at its country, so the name can be a control. */
const AT_COUNTRY = "";

/**
 * The brief in each language, the current one marked. The reader's choices
 * live in the address, so a link takes them along at the moment of the
 * click (without script it opens the standard brief).
 */
function Languages({ countryId }: { countryId: string }) {
  const locale = useLocale();
  const t = useTranslations("common.languageSwitcher");
  const keepChoices = (target: string) => (e: MouseEvent<HTMLAnchorElement>) =>
    e.currentTarget.setAttribute("href", `${briefPath(target, countryId)}${window.location.search}`);
  return (
    <nav className="brief-hero-languages" aria-label={t("aria")}>
      {routing.locales.map((l) =>
        l === locale ? (
          <span key={l} aria-current="true">
            {LOCALE_LABELS[l] ?? l}
          </span>
        ) : (
          <a key={l} href={briefPath(l, countryId)} lang={l} onClick={keepChoices(l)}>
            {LOCALE_LABELS[l] ?? l}
          </a>
        ),
      )}
      {MACHINE_TRANSLATED.has(locale) && <span className="brief-hero-mt">{t("machineTranslatedNote")}</span>}
    </nav>
  );
}

export function Hero({
  countryId,
  countryName,
  commitments,
  documents,
  comparisons,
  lines,
  translation = null,
  onRead,
  onCustomize,
}: {
  countryId: string;
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
  const brand = useTranslations("header")("brand");
  const locale = useLocale();
  // WCAG 2.2.2: moving content that runs on gets a pause control.
  const [paused, setPaused] = useState(false);
  // The country's name opens the other countries' briefs.
  const [choosing, setChoosing] = useState(false);
  const nameRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const others = listVisibleCountries().filter((c) => c.id !== countryId);
  const closeOnEscape = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !choosing) return;
    setChoosing(false);
    nameRef.current?.focus();
  };
  const kicker = t("kicker", { country: AT_COUNTRY }).split(AT_COUNTRY);
  const name = (
    <button
      ref={nameRef}
      type="button"
      className="brief-hero-country"
      aria-expanded={choosing}
      aria-controls={listId}
      title={t("otherCountries")}
      onClick={() => setChoosing((v) => !v)}
    >
      {countryName}
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
  return (
    <section className="brief-hero" data-screen-only>
      <MovingText lines={lines} paused={paused} />
      <div className="brief-hero-veil" aria-hidden="true" />
      <div className="brief-hero-top">
        <a className="brief-hero-brand" href={locale === "en" ? "/" : `/${locale}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the app's own lockup, small and static */}
          <img src="/undp-logo.png" alt="UNDP" width={22} height={44} />{" "}
          <span>{brand}</span>
        </a>
        <Languages countryId={countryId} />
      </div>
      <div className="brief-hero-content" onKeyDown={closeOnEscape}>
        <p className="brief-hero-kicker">
          {kicker.length === 2 ? (
            <>
              {kicker[0]}
              {name}
              {kicker[1]}
            </>
          ) : (
            t("kicker", { country: countryName })
          )}
        </p>
        {choosing && others.length > 0 && (
          <ul id={listId} className="brief-hero-countries" aria-label={t("otherCountries")}>
            {others.map((c) => (
              <li key={c.id}>
                <a href={briefPath(locale, c.id)}>{c.name}</a>
              </li>
            ))}
          </ul>
        )}
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
