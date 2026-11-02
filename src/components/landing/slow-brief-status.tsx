"use client";

/**
 * "Loading the Mongolia brief…", placed inside a link to a brief and shown
 * only when that brief is slow to open. A brief normally opens in a second or
 * two, and a line on every click would only flicker; past SLOW_BRIEF_MS the
 * reader needs to know the click was taken.
 */

import { useEffect, useState } from "react";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";

export const SLOW_BRIEF_MS = 2000;

export function SlowBriefStatus({ name, className }: { name: string; className?: string }) {
  const t = useTranslations("landing");
  const { pending } = useLinkStatus();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => setSlow(true), SLOW_BRIEF_MS);
    return () => {
      clearTimeout(id);
      setSlow(false);
    };
  }, [pending]);

  if (!slow) return null;
  return (
    <span role="status" className={className}>
      {t("loadingBrief", { name })}
    </span>
  );
}
