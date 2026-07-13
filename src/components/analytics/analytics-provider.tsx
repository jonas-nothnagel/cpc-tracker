"use client";

import { useEffect, useRef } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";

import { usePathname } from "@/i18n/navigation";
import {
  beginPageView,
  flushQueue,
  isEnabled,
  recordClick,
  reportPageLeave,
  resumeViewClock,
  updatePageContext,
} from "@/lib/analytics/client";
import { clickRole, sanitizeLabel } from "@/lib/analytics/labels";
import { countryFromPath, toRoutePattern } from "@/lib/analytics/route-pattern";

/**
 * Invisible usage-analytics hook point: page views on SPA navigation,
 * auto-captured clicks on interactive elements, and flush-on-hide. Renders
 * nothing; mounted once in src/app/[locale]/layout.tsx inside <Suspense>
 * (useSearchParams would otherwise bail static pages out to CSR).
 *
 * Opt out per element with data-track-ignore; label overrides via
 * data-track. Disabled entirely by DNT/GPC or NEXT_PUBLIC_ANALYTICS_DISABLED.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

const FORM_CONTROLS = "input,textarea,select,[contenteditable]";

export function AnalyticsProvider() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const country = searchParams.get("country");
  const analysisId = searchParams.get("analysisId");
  const lastViewKey = useRef<string | null>(null);

  useEffect(() => {
    if (!isEnabled()) return;
    const route = toRoutePattern(pathname);
    const viewCountry =
      countryFromPath(pathname) ?? country?.toLowerCase() ?? null;
    const viewKey = `${pathname}|${viewCountry}|${analysisId ?? ""}`;
    if (viewKey === lastViewKey.current) {
      // Same view, changed attribution (e.g. locale switch): no new view.
      updatePageContext({ locale });
      return;
    }
    lastViewKey.current = viewKey;
    beginPageView({ route, country: viewCountry, locale, analysisId });
  }, [pathname, country, analysisId, locale]);

  useEffect(() => {
    if (!isEnabled()) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const el = target.closest(
        '[data-track],a,button,[role="button"],[role="tab"]',
      );
      if (!el || el.closest("[data-track-ignore]")) return;
      const containsInput =
        el.matches(FORM_CONTROLS) || el.querySelector(FORM_CONTROLS) !== null;
      const label = sanitizeLabel({
        dataTrack: el.getAttribute("data-track"),
        ariaLabel: el.getAttribute("aria-label"),
        text: el.textContent,
        containsInput,
      });
      if (!label) return;
      let href: string | null = null;
      if (el instanceof HTMLAnchorElement && el.href) {
        href =
          el.origin === window.location.origin ? el.pathname : "external";
      }
      // Section attribution: section wrappers carry data-section-id, and the
      // sticky centerpiece/expand modal mirror the active section's id.
      const section =
        el.closest("[data-section-id]")?.getAttribute("data-section-id") ??
        null;
      recordClick({
        label,
        role: clickRole(el.tagName, el.getAttribute("role")),
        href,
        section,
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        reportPageLeave();
        flushQueue();
      } else {
        resumeViewClock();
      }
    };

    const onPageHide = () => {
      reportPageLeave();
      flushQueue();
    };

    document.addEventListener("click", onClick, {
      capture: true,
      passive: true,
    });
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  return null;
}
