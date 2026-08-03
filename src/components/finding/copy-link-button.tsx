"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Quiet text affordance that puts the page URL on the clipboard. The finding
 * page is built to be sent; this is the sending gesture. Falls back to a
 * hidden textarea + execCommand where the async clipboard is unavailable
 * (non-secure contexts), and simply stays quiet if both fail.
 */
export function CopyLinkButton() {
  const t = useTranslations("finding.card");
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    const url = window.location.href;
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = url;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="text-data font-medium text-[var(--undp-blue)] underline underline-offset-2 decoration-[var(--undp-blue-light)] hover:text-[var(--undp-blue-dark)] focus-visible:outline-2 focus-visible:outline-[var(--undp-blue)] focus-visible:outline-offset-2"
      aria-live="polite"
    >
      {copied ? t("copied") : t("copyLink")}
    </button>
  );
}
