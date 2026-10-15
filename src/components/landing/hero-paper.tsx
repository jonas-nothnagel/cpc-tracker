"use client";

/**
 * The landing's first screen in the brief's own hero (brief.css): a white
 * page, ink type at the brief's sizes, and verbatim targets from every
 * pilot country drifting across the whole hero, more than anyone could read.
 * The landing and every brief open on the same picture. Country-agnostic and
 * figure-free, so it holds as countries and documents are added.
 */

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { MovingText } from "@/components/brief/moving-text";
import "@/components/brief/brief.css";
import "./landing.css";

/** Rows enough to cover the tallest hero (860px at 44px a row), with spares. */
const ROWS = 22;

export function HeroPaper({ lines, children }: { lines: string[]; children: ReactNode }) {
  const t = useTranslations("brief.hero");
  // WCAG 2.2.2: moving content that runs on gets a pause control.
  const [paused, setPaused] = useState(false);
  return (
    <div data-brief className="landing-paper">
      <section className="brief-hero">
        <MovingText lines={lines} rows={ROWS} paused={paused} />
        <div className="brief-hero-veil" aria-hidden="true" />
        <div className="brief-hero-content">{children}</div>
        {lines.length > 0 ? (
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
        ) : null}
      </section>
    </div>
  );
}
