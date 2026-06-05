/**
 * Locale-aware label hooks (client) and async getters (RSC).
 *
 * These replaced the plain `Record<EnumKey, string>` exports that used to live
 * in `src/lib/utils.ts`. The display labels are translation-driven now; only
 * the underlying enum keys, colors, and weights remain in `utils.ts`. Call
 * sites that previously did `ALIGNMENT_LABELS[level]` now do
 * `const labels = useAlignmentLabels(); labels[level]` (same shape).
 */
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type {
  AlignmentLevel,
  AlignmentMechanism,
  AlignmentManageability,
  AlignmentConfidence,
} from "@/types";

const ALIGNMENT_KEYS: AlignmentLevel[] = ["flagged", "none", "low", "medium", "high"];
const CONTRADICTION_KEYS: AlignmentMechanism[] = [
  "goal_conflict",
  "resource_competition",
  "delivery_friction",
];
const MANAGEABILITY_KEYS: AlignmentManageability[] = ["manageable", "fundamental"];
const CONFIDENCE_KEYS: AlignmentConfidence[] = ["high", "medium", "low"];

export type Nr7Status = "on_track" | "limited" | "no_progress" | "unknown";
const NR7_KEYS: Nr7Status[] = ["on_track", "limited", "no_progress", "unknown"];
const NR7_TRANSLATION_KEYS: Record<Nr7Status, string> = {
  on_track: "onTrack",
  limited: "limited",
  no_progress: "noProgress",
  unknown: "unknown",
};

// --- client hooks ---------------------------------------------------------

export function useAlignmentLabels(): Record<AlignmentLevel, string> {
  const t = useTranslations("labels.alignment");
  return useMemo(
    () =>
      Object.fromEntries(ALIGNMENT_KEYS.map((k) => [k, t(k)])) as Record<
        AlignmentLevel,
        string
      >,
    [t],
  );
}

export function useContradictionTypeLabels(): Record<AlignmentMechanism, string> {
  const t = useTranslations("labels.contradictionType");
  return useMemo(
    () =>
      Object.fromEntries(CONTRADICTION_KEYS.map((k) => [k, t(k)])) as Record<
        AlignmentMechanism,
        string
      >,
    [t],
  );
}

export function useContradictionTypeDescriptions(): Record<
  AlignmentMechanism,
  string
> {
  const t = useTranslations("labels.contradictionDescription");
  return useMemo(
    () =>
      Object.fromEntries(CONTRADICTION_KEYS.map((k) => [k, t(k)])) as Record<
        AlignmentMechanism,
        string
      >,
    [t],
  );
}

export function useManageabilityLabels(): Record<AlignmentManageability, string> {
  const t = useTranslations("labels.manageability");
  return useMemo(
    () =>
      Object.fromEntries(MANAGEABILITY_KEYS.map((k) => [k, t(k)])) as Record<
        AlignmentManageability,
        string
      >,
    [t],
  );
}

export function useConfidenceLabels(): Record<AlignmentConfidence, string> {
  const t = useTranslations("labels.confidence");
  return useMemo(
    () =>
      Object.fromEntries(CONFIDENCE_KEYS.map((k) => [k, t(k)])) as Record<
        AlignmentConfidence,
        string
      >,
    [t],
  );
}

export function useNr7BadgeLabels(): Record<Nr7Status, string> {
  const t = useTranslations("labels.nr7");
  return useMemo(
    () =>
      Object.fromEntries(
        NR7_KEYS.map((k) => [k, t(NR7_TRANSLATION_KEYS[k])]),
      ) as Record<Nr7Status, string>,
    [t],
  );
}

// --- RSC async getters ----------------------------------------------------

export async function getAlignmentLabels(
  locale: string,
): Promise<Record<AlignmentLevel, string>> {
  const t = await getTranslations({ locale, namespace: "labels.alignment" });
  return Object.fromEntries(ALIGNMENT_KEYS.map((k) => [k, t(k)])) as Record<
    AlignmentLevel,
    string
  >;
}

export async function getContradictionTypeLabels(
  locale: string,
): Promise<Record<AlignmentMechanism, string>> {
  const t = await getTranslations({
    locale,
    namespace: "labels.contradictionType",
  });
  return Object.fromEntries(CONTRADICTION_KEYS.map((k) => [k, t(k)])) as Record<
    AlignmentMechanism,
    string
  >;
}
