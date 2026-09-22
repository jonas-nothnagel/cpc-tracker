"use client";

/**
 * ModelSelector — chooses which LLM-run outputs the dashboard renders.
 *
 * Shows only when the country has more than one per-model output subdir on
 * disk (currently Mongolia, where the four-model comparison has been run).
 * State lives in the URL (?model=<slug>) so the choice is shareable and
 * survives reload; the parent dashboard refetches on change.
 *
 * Deliberately quiet: one right-aligned attribution line, not a bar. The
 * fold's usability review found the old full-width strip ("flagship
 * proprietary", "not the production result") read as internal jargon in the
 * page's most valuable position. The AI-labelling guardrail (CLAUDE.md)
 * needs the producing model visibly attributed — this line is that
 * attribution; the tier vocabulary stays on the comparison page.
 */

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
// Removable usage analytics: see src/lib/analytics/README.md.
import { track } from "@/lib/analytics/client";

const DEFAULT_LABEL_BY_SLUG: Record<string, { label: string; tier: string }> = {
  "gpt-5-4": { label: "GPT-5.4", tier: "flagship proprietary" },
  "gpt-5-4-mini": { label: "GPT-5.4 mini", tier: "proprietary mini" },
  "deepseek-v4-pro": { label: "DeepSeek V4 Pro", tier: "flagship open-source" },
  "llama-4-maverick-17b-128e-instruct-fp8": {
    label: "Llama 4 Maverick 17B",
    tier: "open-source mid (MoE)",
  },
};

function prettifySlug(slug: string): { label: string; tier: string } {
  if (DEFAULT_LABEL_BY_SLUG[slug]) return DEFAULT_LABEL_BY_SLUG[slug];
  // Unknown slug: capitalize first letter of each hyphen-separated chunk and
  // give it a neutral tier label rather than guessing wrong.
  const label = slug
    .split("-")
    .map((s) => (s.length <= 2 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1)))
    .join(" ");
  return { label, tier: "comparison run" };
}

export function ModelSelector({
  availableModels,
  selectedModel,
  onChange,
  comparisonHref,
}: {
  availableModels: string[];
  selectedModel: string | null;
  onChange: (next: string) => void;
  /** Locale-aware href of the side-by-side comparison page, when one exists
   *  for this country (today only Mongolia). Omit to hide the link. */
  comparisonHref?: string;
}) {
  const t = useTranslations("dashboard.modelSelector");
  if (availableModels.length < 2) return null;
  const active = selectedModel ?? availableModels[0];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-end gap-x-2 gap-y-1 px-6 pt-3 text-xs text-[var(--undp-gray)]">
      <label htmlFor="model-selector">{t("attribution")}</label>
      <select
        id="model-selector"
        value={active}
        onChange={(e) => (track("model_switched", { model: e.target.value }), onChange(e.target.value))}
        className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)]"
      >
        {availableModels.map((slug) => (
          <option key={slug} value={slug}>
            {prettifySlug(slug).label}
          </option>
        ))}
      </select>
      {comparisonHref && (
        <Link
          href={comparisonHref}
          className="text-[var(--undp-blue)] hover:underline whitespace-nowrap"
        >
          {t("compareLink")}
        </Link>
      )}
    </div>
  );
}
