"use client";

import { useTranslations } from "next-intl";
import { MIN_PAIR_COMPARISONS, shareOf, type DocPairStat } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import { RED_HATCH, useNumbers } from "../ink";
import { SectionFrame } from "./frame";

/** Rows that fit a half page. */
const MAX_ROWS = 9;

function ranked(pairs: DocPairStat[]): DocPairStat[] {
  const enough = pairs.filter((p) => p.counts.total >= MIN_PAIR_COMPARISONS);
  const few = pairs.filter((p) => p.counts.total < MIN_PAIR_COMPARISONS);
  return [
    ...enough.sort(
      (x, y) =>
        shareOf(y.counts, "apart") - shareOf(x.counts, "apart") || y.counts.total - x.counts.total,
    ),
    ...few.sort((x, y) => y.counts.total - x.counts.total),
  ];
}

/**
 * One result bar per pair of documents. Potential misalignment is anchored
 * at the left (hatched red) and reinforcement at the right (green), so both
 * shares compare along a common baseline; the tick marks the average share
 * of potential misalignment across all comparisons.
 */
export function DocumentsSection({
  data,
  onOpenDocPair,
}: {
  data: BriefData;
  onOpenDocPair?: (a: string, b: string) => void;
}) {
  const t = useTranslations("brief");
  const { n, pct } = useNumbers();
  const rows = ranked(data.pairs);
  const shares = rows
    .filter((p) => p.counts.total >= MIN_PAIR_COMPARISONS)
    .map((p) => shareOf(p.counts, "apart"));
  const average = data.counts.total > 0 ? data.counts.apart / data.counts.total : 0;
  const headline =
    shares.length >= 2
      ? t("documents.headline", { low: pct(Math.min(...shares)), high: pct(Math.max(...shares)) })
      : t("documents.headlineFallback", { pct: pct(average) });
  const shown = rows.slice(0, MAX_ROWS);
  const width = (v: number) => `${(v * 100).toFixed(2)}%`;
  const basis = (v: number) => ({ flexBasis: width(v) });

  return (
    <SectionFrame
      id="documents"
      headline={headline}
      note={rows.length > shown.length ? t("documents.more", { count: rows.length - shown.length }) : undefined}
    >
      <p className="brief-legend">
        <span className="brief-legend-key" style={{ background: RED_HATCH }} aria-hidden="true" />
        <span>{t("tone.apart")}</span>
        <span className="brief-legend-key brief-key-partial" aria-hidden="true" />
        <span>{t("tone.partial")}</span>
        <span className="brief-legend-key brief-key-reinforce" aria-hidden="true" />
        <span>{t("tone.reinforce")}</span>
        <span className="brief-legend-tick" aria-hidden="true" />
        <span>{t("documents.average", { pct: pct(average) })}</span>
      </p>
      <ol className="brief-pairs">
        {shown.map((p) => {
          const c = p.counts;
          const few = c.total < MIN_PAIR_COMPARISONS;
          const share = (v: number) => (c.total > 0 ? v / c.total : 0);
          return (
            <li key={`${p.a.id}~${p.b.id}`} data-testid="brief-pair-row" data-pair={`${p.a.id}~${p.b.id}`}>
              <button
                type="button"
                className="brief-pair"
                onClick={() => onOpenDocPair?.(p.a.id, p.b.id)}
                aria-label={t("documents.row", {
                  docA: p.a.name,
                  docB: p.b.name,
                  apart: pct(share(c.apart)),
                  partial: pct(share(c.partial)),
                  reinforce: pct(share(c.reinforce)),
                  total: c.total,
                })}
              >
                <span className="brief-pair-name" title={`${p.a.full} · ${p.b.full}`}>
                  {p.a.name} · {p.b.name}
                  {few && <span className="brief-pair-few"> ({t("documents.few")})</span>}
                </span>
                <span className="brief-pair-bar-row">
                  <span className="brief-pair-value">{pct(share(c.apart))}</span>
                  <span className="brief-pair-bar">
                    {c.apart > 0 && (
                      <span className="brief-seg" style={{ ...basis(share(c.apart)), background: RED_HATCH }} />
                    )}
                    {c.partial > 0 && (
                      <span className="brief-seg brief-seg-partial" style={basis(share(c.partial))} />
                    )}
                    {c.none > 0 && (
                      <span className="brief-seg brief-seg-none" style={basis(share(c.none))} />
                    )}
                    {c.reinforce > 0 && (
                      <span className="brief-seg brief-seg-reinforce" style={basis(share(c.reinforce))} />
                    )}
                    <span className="brief-pair-avg" style={{ left: width(average) }} />
                  </span>
                  <span className="brief-pair-value brief-pair-value-end">{pct(share(c.reinforce))}</span>
                </span>
                <span className="sr-only">{n(c.total)}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </SectionFrame>
  );
}
