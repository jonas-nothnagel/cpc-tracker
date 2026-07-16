"use client";

/**
 * DocCoherenceMatrix — a compact document-by-document coherence grid.
 *
 * Each off-diagonal cell is one document-pair. The fill is a diverging scale
 * anchored to the corpus's own cross-doc flagged share: a pair that clashes
 * MORE than that norm reads red, one that clashes LESS reads green, and a pair
 * near the norm stays pale — so a typical pair no longer saturates like a
 * severe one (the old fixed 12% cutoff reddened almost everything). Click a
 * cell to open the same doc-pair gaps drawer the ranked list uses. The diagonal
 * (a document with itself) is blank and inert. Sits above the ranked list as
 * the pattern overview; the list stays the detail view.
 */

import { Fragment, useMemo } from "react";
import { useTranslations } from "next-intl";
import { buildDocCoherenceGraph, getDocPairKey } from "@/lib/coherence-briefing";
import { getDocLabel, getDocMediumLabel } from "@/lib/utils";
import type {
  AlignmentResult,
  CountryConfig,
  PolicyDocumentType,
  Target,
} from "@/types";

const CELL = 40;
const HEADER_HEIGHT = 44;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Diverging cell fill anchored to the corpus norm (`mid` = overall cross-doc
 * flagged share). Pairs below the norm read green, above read red, and a pair
 * near the norm stays pale. Intensity scales with distance from the norm; the
 * most-contested pair (`maxShare`) anchors full red. Reserving saturation for
 * genuine outliers stops a typical pair from reading as a severe one.
 */
export function cellColor(share: number, mid: number, maxShare: number): string {
  if (share <= mid) {
    const k = mid > 0 ? clamp01((mid - share) / mid) : 0; // 1 at 0, 0 at the norm
    return `rgba(25, 97, 39, ${(0.1 + 0.55 * k).toFixed(3)})`; // #196127
  }
  const span = maxShare - mid;
  const k = span > 0 ? clamp01((share - mid) / span) : 1; // 0 at norm, 1 at worst
  return `rgba(220, 38, 38, ${(0.1 + 0.6 * k).toFixed(3)})`; // #dc2626
}

export function DocCoherenceMatrix({
  targets,
  alignment,
  countryConfig,
  onCellClick,
  highlightedKey,
  onHoverPair,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  countryConfig: CountryConfig | null;
  onCellClick?: (a: PolicyDocumentType, b: PolicyDocumentType) => void;
  /** Canonical pair key (getDocPairKey) to emphasise, synced with the list. */
  highlightedKey?: string | null;
  /** Emits the hovered pair key so the host can light the matching list row. */
  onHoverPair?: (key: string | null) => void;
}) {
  const t = useTranslations("briefing.docMatrix");
  const { ordered, edgeMap, mid, maxShare } = useMemo(() => {
    const { nodes, edges } = buildDocCoherenceGraph(
      alignment,
      targets,
      countryConfig,
    );
    const edgeMap = new Map<string, (typeof edges)[number]>();
    let totalFlagged = 0;
    let totalScored = 0;
    let maxShare = 0;
    for (const e of edges) {
      edgeMap.set(`${e.a}__${e.b}`, e);
      totalFlagged += e.flaggedCount;
      totalScored += e.totalScored;
      if (e.flaggedShare > maxShare) maxShare = e.flaggedShare;
    }
    // Neutral anchor: the corpus-wide cross-doc flagged share.
    const mid = totalScored > 0 ? totalFlagged / totalScored : 0;
    // Alphabetical order so red no longer clusters in one corner.
    const ordered = [...nodes].sort((x, y) => x.label.localeCompare(y.label));
    return { ordered, edgeMap, mid, maxShare };
  }, [alignment, targets, countryConfig]);

  if (ordered.length < 2) return null;

  const lookup = (a: string, b: string) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return edgeMap.get(`${lo}__${hi}`) ?? null;
  };
  const n = ordered.length;

  return (
    <div className="mb-8">
      <style>{`
        @keyframes dcmCell { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
      `}</style>
      <div className="overflow-x-auto pb-1">
        <div
          className="inline-grid gap-1"
          data-tour="matrix-grid"
          style={{
            gridTemplateColumns: `minmax(64px, auto) repeat(${n}, ${CELL}px)`,
          }}
        >
          {/* Header row: empty corner + horizontal column labels, line-broken */}
          <div />
          {ordered.map((d) => {
            const label = getDocLabel(countryConfig, d.docType);
            return (
              <div
                key={`h-${d.docType}`}
                className="flex items-end justify-center pb-1.5"
                style={{ height: HEADER_HEIGHT }}
              >
                <span
                  className="text-[10px] leading-tight text-center text-[var(--undp-gray)]"
                  style={{ wordSpacing: "-1px" }}
                  title={getDocMediumLabel(countryConfig, d.docType)}
                >
                  {label.split(" ").map((part, i, arr) => (
                    <span key={i}>
                      {part}
                      {i < arr.length - 1 && <br />}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}

          {/* Rows */}
          {ordered.map((rowDoc, ri) => (
            <Fragment key={`r-${rowDoc.docType}`}>
              <div
                className="flex items-center justify-end pr-2 text-[10px] text-[var(--undp-gray)] truncate"
                style={{ maxWidth: 140 }}
                title={getDocMediumLabel(countryConfig, rowDoc.docType)}
              >
                {getDocLabel(countryConfig, rowDoc.docType)}
              </div>
              {ordered.map((colDoc, ci) => {
                const cellKey = `c-${rowDoc.docType}-${colDoc.docType}`;
                const anim = {
                  animation: `dcmCell 320ms ease-out ${(ri + ci) * 20}ms both`,
                };
                // Diagonal: a document with itself — blank and inert.
                if (rowDoc.docType === colDoc.docType) {
                  return (
                    <div
                      key={cellKey}
                      // First diagonal cell anchors the guided-tour step.
                      data-tour={ri === 0 && ci === 0 ? "matrix-diagonal" : undefined}
                      className="rounded-md border border-dashed border-gray-200"
                      style={{ height: CELL, backgroundColor: "#faf9f6", ...anim }}
                    />
                  );
                }
                const e = lookup(rowDoc.docType, colDoc.docType);
                const rowLabel = getDocMediumLabel(countryConfig, rowDoc.docType);
                const colLabel = getDocMediumLabel(countryConfig, colDoc.docType);
                if (!e) {
                  return (
                    <div
                      key={cellKey}
                      className="rounded-md bg-gray-100"
                      style={{ height: CELL, ...anim }}
                      title={t("noScoredTitle", { a: rowLabel, b: colLabel })}
                    />
                  );
                }
                const pairKey = getDocPairKey(
                  rowDoc.docType,
                  colDoc.docType,
                );
                const isHighlighted = pairKey === highlightedKey;
                return (
                  <button
                    key={cellKey}
                    type="button"
                    data-track="Doc matrix: cell"
                    onClick={() => onCellClick?.(rowDoc.docType, colDoc.docType)}
                    onMouseEnter={() => onHoverPair?.(pairKey)}
                    onMouseLeave={() => onHoverPair?.(null)}
                    onFocus={() => onHoverPair?.(pairKey)}
                    onBlur={() => onHoverPair?.(null)}
                    title={t("cellTitle", {
                      a: rowLabel,
                      b: colLabel,
                      aligned: e.alignedCount,
                      flagged: e.flaggedCount,
                    })}
                    className={`rounded-md cursor-pointer transition-transform hover:scale-110 hover:ring-2 hover:ring-[var(--undp-black)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--undp-black)]/50 ${
                      isHighlighted
                        ? "scale-110 ring-2 ring-[var(--undp-black)]/60 relative z-10"
                        : ""
                    }`}
                    style={{
                      height: CELL,
                      backgroundColor: cellColor(e.flaggedShare, mid, maxShare),
                      ...anim,
                    }}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Legend: grouped, quiet labels — colours (alignment meaning) and
          intensity (distance from the corpus norm). No boxes. */}
      <div className="mt-3 mx-auto max-w-[440px] text-[11px] text-[var(--undp-gray)]">
        {/* 2-col grid: the label column auto-sizes to the widest label across
            locales, so a longer label can't overflow into the text. */}
        <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
          <span className="uppercase tracking-wider text-[9px] leading-relaxed text-[var(--undp-gray)]/55 whitespace-nowrap">
            {t("groupColours")}
          </span>
          <div
            className="flex flex-wrap items-center gap-x-3 gap-y-0.5"
            data-tour="matrix-legend-colours"
          >
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: "rgba(25, 97, 39, 0.85)" }}
              />
              {t("aligned")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: "rgba(220, 38, 38, 0.85)" }}
              />
              {t("flagged")}
            </span>
          </div>
          <span className="uppercase tracking-wider text-[9px] leading-relaxed text-[var(--undp-gray)]/55 whitespace-nowrap">
            {t("groupIntensity")}
          </span>
          <div
            className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
            data-tour="matrix-legend-intensity"
          >
            <span
              aria-hidden="true"
              className="inline-block h-3 w-8 rounded-sm shrink-0"
              style={{
                // Diverging intensity scale, mirroring cellColor(): deep green
                // far below the norm, pale near it, deep red far above.
                background:
                  "linear-gradient(90deg, rgba(25,97,39,0.85), rgba(25,97,39,0.12) 45%, rgba(220,38,38,0.12) 55%, rgba(220,38,38,0.85))",
              }}
            />
            <span className="text-[var(--undp-gray)]/80">{t("legendHint")}</span>
          </div>
        </div>
        <p className="text-[10px] text-[var(--undp-gray)]/60 text-center mt-1">
          ({t("clickHint")})
        </p>
      </div>
    </div>
  );
}
