"use client";

/**
 * FindingCard — one target-pair claim as a complete, standalone read.
 *
 * The shareable unit of the product: headline states the claim in plain words
 * (template-composed server-side, see src/lib/finding/headline.ts), followed
 * by the two verbatim commitments, the shared human-authored mechanism
 * explanation, and the AI rationale under the standard disclaimer. Everything
 * shown is a stored pipeline field; nothing is generated at render time.
 *
 * Reuses the drawer vocabulary (SubFieldChip, FrictionDimensionChip,
 * FeedbackControl, the connector divider) so a pair reads identically here
 * and inside the dashboard, and thumbs land on the same ledger anchor.
 */

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { isContradiction } from "@/types";
import type { AlignmentResult, CountryConfig, Target } from "@/types";
import { ALIGNMENT_COLORS, getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import { useAlignmentLabels, useContradictionTypeDescriptions } from "@/lib/labels";
import { normalizeTarget } from "@/lib/normalize-target";
import {
  FrictionDimensionChip,
  SubFieldChip,
} from "@/components/dashboard/coherence-briefing/theme-drawer";
import { FeedbackControl } from "@/components/dashboard/coherence-briefing/feedback-control";
import { OriginalLanguageChip } from "@/components/viz/target-text";
import { CopyLinkButton } from "./copy-link-button";

const HEADLINE_SERIF = "var(--font-display)";

export function FindingCard({
  pair,
  targetA,
  targetB,
  countryConfig,
  countryId,
  countryName,
  headline,
}: {
  pair: AlignmentResult;
  targetA: Target;
  targetB: Target;
  countryConfig: CountryConfig | null;
  countryId: string;
  /** Localized country display name for the kicker line; omitted in tests. */
  countryName?: string;
  /** Pre-translated claim sentence; byte-identical to the page title. */
  headline: string;
}) {
  const locale = useLocale();
  const t = useTranslations("finding.card");
  const tp = useTranslations("briefing.drawer.pair");
  const alignmentLabels = useAlignmentLabels();
  const mechanismDescriptions = useContradictionTypeDescriptions();

  // Same locale text swap the dashboard applies (mn locale shows sourced
  // Mongolian wording); normalization lives here so the server page stays
  // free of client-module imports.
  const a = useMemo(
    () => normalizeTarget(targetA as unknown as Record<string, unknown>, locale),
    [targetA, locale],
  );
  const b = useMemo(
    () => normalizeTarget(targetB as unknown as Record<string, unknown>, locale),
    [targetB, locale],
  );

  const contra = isContradiction(pair.alignment);
  const color = ALIGNMENT_COLORS[pair.alignment];

  return (
    <article>
      {/* One-viewport artifact: header spans, then evidence left, assessment
          right on desktop. Regular-weight serif so a two-line claim reads as
          a statement, not a shout. */}
      <header className="mb-5">
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">
          {countryName ? `${t("kicker")} · ${countryName}` : t("kicker")}
        </p>
        <h1
          className="text-headline font-normal leading-[1.25] text-[var(--undp-black)] [text-wrap:balance] max-w-[56rem]"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {headline}
        </h1>
      </header>

      <div className="lg:grid lg:grid-cols-2 lg:gap-x-12">
        <section aria-label={t("targetsLabel")}>
          <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
            {t("targetsLabel")}
          </p>
          <div className="space-y-3">
            <TargetBlock target={a} countryConfig={countryConfig} color={color} />
            <div className="flex items-center gap-3" aria-hidden="true">
              <span
                className="block h-px flex-1"
                style={{
                  backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                }}
              />
              <span className="text-caption font-medium" style={{ color }}>
                {contra ? tp("connector.flagged") : tp("connector.aligned")}
              </span>
              <span
                className="block h-px flex-1"
                style={{
                  backgroundImage: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                }}
              />
            </div>
            <TargetBlock target={b} countryConfig={countryConfig} color={color} />
          </div>
        </section>

        <div className="mt-6 lg:mt-0">
          <section aria-label={t("assessmentLabel")}>
            <p className="text-caption font-medium text-[var(--undp-gray)] mb-2">
              {t("assessmentLabel")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body font-semibold" style={{ color }}>
                {alignmentLabels[pair.alignment]}
              </span>
              {pair.mechanism && (
                <SubFieldChip variant="mechanism" value={pair.mechanism} />
              )}
              {pair.manageability && (
                <SubFieldChip variant="manageability" value={pair.manageability} />
              )}
              {pair.confidence && (
                <SubFieldChip variant="confidence" value={pair.confidence} />
              )}
            </div>
          </section>

          {contra && pair.mechanism && (
            <section className="border-t border-line pt-3 mt-4">
              <p className="text-caption font-medium text-[var(--undp-gray)] mb-1.5">
                {t("mechanismLabel")}
              </p>
              <p className="text-body text-[var(--undp-black)] leading-relaxed">
                {mechanismDescriptions[pair.mechanism]}
              </p>
            </section>
          )}

          {pair.description && (
            <section className="border-t border-line pt-3 mt-4">
              <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                <p className="text-caption font-medium text-[var(--undp-gray)]">
                  {tp("aiRationaleLabel")}
                </p>
                <FrictionDimensionChip
                  mechanism={pair.mechanism}
                  contestedResources={pair.contestedResources}
                  sharedContext={pair.sharedContext}
                />
              </div>
              <p className="text-data text-[var(--undp-black)] leading-relaxed">
                {pair.description}
              </p>
              <p className="mt-2 text-caption text-[var(--undp-gray)] leading-relaxed">
                {tp("aiRationaleDisclaimer")}
              </p>
              <div className="mt-3">
                <FeedbackControl
                  variant="inline"
                  countryId={countryId}
                  surface="target_pair_rationale"
                  anchorIds={[pair.targetAId, pair.targetBId]}
                  contentText={pair.description}
                  context={{
                    alignment: pair.alignment,
                    mechanism: pair.mechanism,
                    confidence: pair.confidence,
                    manageability: pair.manageability,
                  }}
                />
              </div>
            </section>
          )}

          <footer className="border-t border-line pt-3 mt-4 flex items-baseline justify-between gap-4 flex-wrap">
            <CopyLinkButton />
            <Link
              href={`/${countryId}`}
              className="text-data font-medium text-[var(--undp-gray)] hover:text-[var(--undp-blue)]"
            >
              {t("backToDashboard")}
            </Link>
          </footer>
        </div>
      </div>
    </article>
  );
}

function TargetBlock({
  target,
  countryConfig,
  color,
}: {
  target: Target;
  countryConfig: CountryConfig | null;
  color: string;
}) {
  const tp = useTranslations("briefing.drawer.pair");
  const docLabel = getDocMediumLabel(countryConfig, target.sourceDocument);
  const docFull = getDocFullLabel(countryConfig, target.sourceDocument);
  return (
    <div className="rounded-md border border-line bg-white p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <p className="text-caption font-medium" style={{ color }}>
          {`${docLabel} · ${target.sourceLabel}`}
        </p>
        <OriginalLanguageChip target={target} />
      </div>
      <p className="text-body text-[var(--undp-black)] leading-relaxed">
        {target.text}
      </p>
      {(target.isQuantitative || target.isTimeBound) && (
        <p className="mt-2 text-caption font-medium text-[var(--undp-gray)]">
          {[
            target.isQuantitative ? tp("badge.quantitative") : null,
            target.isTimeBound ? tp("badge.timeBound") : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="mt-2 text-caption text-[var(--undp-gray)]">
        {tp("sourceLabel", { name: docFull })}
      </p>
    </div>
  );
}
