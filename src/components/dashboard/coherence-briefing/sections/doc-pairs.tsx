"use client";

/**
 * Document pairs — answers "how do specific documents relate?" by listing
 * EVERY scored document pairing (ranked by signal), each with its
 * synthesised storyline, a reinforce/clash excerpt, a balance bar, and
 * counts. The matrix in the sticky right column is the at-a-glance view of
 * the same set; the ranked list is the detail. The two are synced: hovering
 * a row highlights its matrix cell and vice versa (via the shared
 * hoveredKey), and clicking either opens the same pair drawer.
 *
 * Earlier this slide capped at the top 4 cards, which hid every lower-ranked
 * pairing behind the matrix. The full ranked list (revived from the round-2
 * relationships view) brings them all back.
 */

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { SlideFrame } from "../slide-frame";
import { TourButton } from "../tour/tour-button";
import { computeDocPairBalance, getDocPairKey } from "@/lib/coherence-briefing";
import { ALIGNMENT_COLORS, getDocMediumLabel } from "@/lib/utils";
import type {
  CountryConfig,
  DocPairSynthesis,
  PolicyDocumentType,
} from "@/types";

export const DOC_PAIRS_SECTION_ID = "doc-pairs";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";
const HIGHLIGHT_MS = 2400;
/** Lead the row excerpt with the clash once flagged climbs past this share of aligned. */
const CLASH_EXCERPT_RATIO = 0.25;

export function DocPairsSection({
  docPairSyntheses,
  countryConfig,
  onOpenDocPair,
  onHoverDocPair,
  hoveredKey,
  focusedDocPair,
  onClearFocusedDocPair,
}: {
  docPairSyntheses: DocPairSynthesis[];
  countryConfig: CountryConfig | null;
  onOpenDocPair: (dp: DocPairSynthesis) => void;
  /** Emits the hovered pair key so the host can light the matching matrix cell. */
  onHoverDocPair?: (key: string | null) => void;
  /** Pair key (from the matrix or another row) to emphasise in the list. */
  hoveredKey?: string | null;
  /**
   * Pair handed over from the Direction-slide ribbon click. The matching
   * row scrolls into view and pulses briefly so the user sees the entry the
   * wheel ribbon represents; clicking the row opens the drawer.
   */
  focusedDocPair?: { docA: PolicyDocumentType; docB: PolicyDocumentType } | null;
  /** Fires after the highlight decays so the host can drop its pending state. */
  onClearFocusedDocPair?: () => void;
}) {
  const t = useTranslations("briefing.docPairs");
  const ranked = useMemo(
    () =>
      [...docPairSyntheses]
        .filter((dp) => dp.aligned_count + dp.flagged_count > 0)
        .sort(
          (a, b) =>
            b.aligned_count +
            b.flagged_count -
            (a.aligned_count + a.flagged_count),
        ),
    [docPairSyntheses],
  );
  const headline = composeHeadline(ranked, countryConfig, t);
  const body = composeBody(ranked, t);
  const maxTotal = ranked.reduce(
    (m, dp) => Math.max(m, dp.aligned_count + dp.flagged_count),
    1,
  );

  // Highlight is derived directly from the prop so we never need to call
  // setState inside an effect — when the host clears `focusedDocPair`
  // after the highlight decays, the ring drops away naturally.
  const focusedKey = focusedDocPair
    ? getDocPairKey(focusedDocPair.docA, focusedDocPair.docB)
    : null;
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // Side effect only: scroll the focused row into view, then ask the host
  // to clear its pending state after the highlight window so the ring fades
  // on the next render.
  useEffect(() => {
    if (!focusedKey) return;
    const el = rowRefs.current.get(focusedKey);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const timer = window.setTimeout(() => {
      onClearFocusedDocPair?.();
    }, HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [focusedKey, onClearFocusedDocPair]);

  return (
    <SlideFrame
      id={DOC_PAIRS_SECTION_ID}
      headline={headline}
      body={body}
      tourButton={
        ranked.length > 0 ? (
          <TourButton tourId="docPairs" scopeId={DOC_PAIRS_SECTION_ID} />
        ) : undefined
      }
      evidence={
        ranked.length === 0 ? (
          <p className="text-sm italic text-[var(--undp-gray)]">
            {t("empty")}
          </p>
        ) : (
          <DocPairRanking
            docPairs={ranked}
            maxTotal={maxTotal}
            countryConfig={countryConfig}
            onOpen={onOpenDocPair}
            onHover={onHoverDocPair}
            hoveredKey={hoveredKey ?? null}
            focusedKey={focusedKey}
            registerRowRef={(key, el) => {
              if (el) rowRefs.current.set(key, el);
              else rowRefs.current.delete(key);
            }}
          />
        )
      }
    />
  );
}

function composeHeadline(
  ranked: DocPairSynthesis[],
  countryConfig: CountryConfig | null,
  t: ReturnType<typeof useTranslations<"briefing.docPairs">>,
): string {
  if (ranked.length === 0) return t("headline.empty");
  const top = ranked.slice(0, 2);
  const names = top
    .map(
      (p) =>
        `${docLabel(p.doc_a as PolicyDocumentType, countryConfig)} ↔ ${docLabel(p.doc_b as PolicyDocumentType, countryConfig)}`,
    )
    .join(t("headline.joiner"));
  return t("headline.template", { names, count: top.length });
}

function composeBody(
  ranked: DocPairSynthesis[],
  t: ReturnType<typeof useTranslations<"briefing.docPairs">>,
): string {
  const pairCount = ranked.length;
  const total = ranked.reduce(
    (s, dp) => s + dp.aligned_count + dp.flagged_count,
    0,
  );
  if (pairCount === 0) return t("body.empty");
  return t("body.summary", { total, pairCount });
}

function docLabel(
  doc: PolicyDocumentType,
  countryConfig: CountryConfig | null,
): string {
  return getDocMediumLabel(countryConfig, doc);
}

function DocPairRanking({
  docPairs,
  maxTotal,
  countryConfig,
  onOpen,
  onHover,
  hoveredKey,
  focusedKey,
  registerRowRef,
}: {
  docPairs: DocPairSynthesis[];
  maxTotal: number;
  countryConfig: CountryConfig | null;
  onOpen: (dp: DocPairSynthesis) => void;
  onHover?: (key: string | null) => void;
  hoveredKey: string | null;
  focusedKey: string | null;
  registerRowRef: (key: string, el: HTMLLIElement | null) => void;
}) {
  const t = useTranslations("briefing.docPairs");
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--undp-gray)] mb-1">
        {t("allPairings", { count: docPairs.length })}
      </p>
      <ol
        className="divide-y divide-gray-200 border-y border-gray-200"
        data-tour="pair-list"
      >
        {docPairs.map((dp) => {
          const key = getDocPairKey(dp.doc_a, dp.doc_b);
          return (
            <DocPairRow
              key={`${dp.doc_a}__${dp.doc_b}`}
              dp={dp}
              maxTotal={maxTotal}
              countryConfig={countryConfig}
              onOpen={() => onOpen(dp)}
              onHover={onHover}
              highlighted={key === hoveredKey}
              pulsing={key === focusedKey}
              registerRef={(el) => registerRowRef(key, el)}
            />
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-[var(--undp-gray)] leading-relaxed">
        {t("aiDisclaimer")}
      </p>
    </div>
  );
}

function DocPairRow({
  dp,
  maxTotal,
  countryConfig,
  onOpen,
  onHover,
  highlighted,
  pulsing,
  registerRef,
}: {
  dp: DocPairSynthesis;
  maxTotal: number;
  countryConfig: CountryConfig | null;
  onOpen: () => void;
  onHover?: (key: string | null) => void;
  highlighted: boolean;
  pulsing: boolean;
  registerRef: (el: HTMLLIElement | null) => void;
}) {
  const t = useTranslations("briefing.docPairs");
  const labelA = getDocMediumLabel(countryConfig, dp.doc_a as PolicyDocumentType);
  const labelB = getDocMediumLabel(countryConfig, dp.doc_b as PolicyDocumentType);
  const balance = computeDocPairBalance(dp);
  const totalWidthPct = maxTotal > 0 ? (balance.total / maxTotal) * 100 : 0;
  const hoverKey = getDocPairKey(dp.doc_a, dp.doc_b);
  const failed = dp.synthesis_error !== null;
  // Pick the excerpt side: lead with the clash once friction is meaningfully
  // present (flagged past CLASH_EXCERPT_RATIO of aligned), else reinforce.
  const showClash =
    !failed && dp.flagged_count > dp.aligned_count * CLASH_EXCERPT_RATIO;
  const excerptText = failed
    ? null
    : showClash
      ? dp.synthesis.clash
      : dp.synthesis.reinforce;
  const excerptPrefix = showClash ? t("excerpt.flagged") : t("excerpt.aligned");
  const excerptColor = showClash
    ? ALIGNMENT_COLORS.flagged
    : ALIGNMENT_COLORS.high;
  return (
    <li
      ref={registerRef}
      className={
        pulsing
          ? "ring-2 ring-[var(--undp-black)] ring-offset-2 ring-offset-[#fbfaf7] rounded transition-all"
          : undefined
      }
    >
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={() => onHover?.(hoverKey)}
        onMouseLeave={() => onHover?.(null)}
        onFocus={() => onHover?.(hoverKey)}
        onBlur={() => onHover?.(null)}
        className={`w-full text-left py-3 px-1 rounded transition-colors ${
          highlighted ? "bg-gray-100" : "hover:bg-gray-50"
        }`}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span
              className="text-[13px] font-medium text-[var(--undp-black)] shrink-0"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {labelA} ↔ {labelB}
            </span>
            <span
              className="text-[12px] text-[var(--undp-gray)] leading-snug truncate"
              style={{ fontFamily: HEADLINE_SERIF }}
            >
              {failed ? t("synthesisFailed") : dp.synthesis.storyline_name}
            </span>
          </div>
        </div>
        {excerptText && (
          <p
            className="text-[11.5px] italic text-[var(--undp-gray)] leading-snug mb-2 max-w-prose overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            <span
              className="not-italic font-semibold uppercase tracking-wider text-[11px] mr-1.5"
              style={{ color: excerptColor }}
            >
              {excerptPrefix} ·
            </span>
            {excerptText}
          </p>
        )}
        {/* Every row carries the anchor; the tour spotlights the first match. */}
        <div
          className="grid grid-cols-[1fr_auto] items-center gap-3"
          data-tour="pair-balance"
        >
          <div
            className="relative h-2.5 rounded-full overflow-hidden bg-gray-100"
            style={{ width: `${Math.max(totalWidthPct, 6)}%` }}
            aria-hidden="true"
          >
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: `${balance.alignedShare * 100}%`,
                backgroundColor: ALIGNMENT_COLORS.high,
                opacity: failed ? 0.4 : 0.9,
              }}
            />
            <div
              className="absolute inset-y-0"
              style={{
                left: `${balance.alignedShare * 100}%`,
                width: `${balance.flaggedShare * 100}%`,
                backgroundColor: ALIGNMENT_COLORS.flagged,
                opacity: failed ? 0.4 : 0.95,
              }}
            />
          </div>
          <p className="text-[12px] text-[var(--undp-black)] tabular-nums font-medium whitespace-nowrap">
            <span style={{ color: ALIGNMENT_COLORS.high }}>
              {t("countAligned", { count: dp.aligned_count })}
            </span>
            <span className="text-[var(--undp-gray)] mx-1">·</span>
            <span style={{ color: ALIGNMENT_COLORS.flagged }}>
              {t("countFlagged", { count: dp.flagged_count })}
            </span>
          </p>
        </div>
      </button>
    </li>
  );
}
