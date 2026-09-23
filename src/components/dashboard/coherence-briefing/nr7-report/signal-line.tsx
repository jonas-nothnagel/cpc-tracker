"use client";

import { useTranslations } from "next-intl";
import type { Nr7Signal } from "./nr7-self-report";

/** One cross-check as a sentence: the report's own numbers and words, from
 *  the `briefing.nr7Report.signals.*` copy. */
export function SignalLine({ signal }: { signal: Nr7Signal }) {
  const t = useTranslations("briefing.nr7Report.signals");
  return <>{t(signal.rule, signal.params)}</>;
}
