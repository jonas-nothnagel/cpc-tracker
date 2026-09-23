"use client";

import { useTranslations } from "next-intl";
import { shareStep, type ThemeRow } from "@/lib/brief/compute";
import type { BriefDocument } from "@/lib/brief/source";
import { INK, useNumbers } from "./ink";

/** Most themes a grid shows; the pipeline writes three of each kind. */
const MAX_ROWS = 3;

/**
 * Recurring themes against the selected documents: a square where a document
 * takes part, darker the more of the theme it carries. A real table, so the
 * values are reachable without the squares.
 */
export function ThemeGrid({
  rows,
  docs,
  tone,
  onOpenTheme,
}: {
  rows: ThemeRow[];
  docs: BriefDocument[];
  tone: "reinforce" | "apart";
  onOpenTheme?: (name: string) => void;
}) {
  const t = useTranslations("brief.themes");
  const tp = useTranslations("brief.panel");
  const { n, pct } = useNumbers();
  const ramp = tone === "reinforce" ? INK.greenSteps : INK.redSteps;
  return (
    <div className="brief-grid-wrap">
      <table className="brief-grid">
        <thead>
          <tr>
            <th scope="col" className="brief-grid-theme">
              {t("headerTheme")}
            </th>
            {docs.map((d) => (
              <th key={d.id} scope="col" className="brief-grid-doc" title={d.full}>
                {d.code}
              </th>
            ))}
            <th scope="col" className="brief-grid-count">
              {t("headerCount")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, MAX_ROWS).map((row) => (
            <tr key={row.storyline.name}>
              <th scope="row" className="brief-grid-theme">
                <button
                  type="button"
                  className="brief-grid-open"
                  onClick={() => onOpenTheme?.(row.storyline.name)}
                  aria-label={tp("openTheme", { name: row.storyline.name })}
                >
                  <span className="brief-clamp-2" title={row.storyline.name}>
                    {row.storyline.name}
                  </span>
                </button>
              </th>
              {docs.map((d) => {
                const share = row.docShares[d.id] ?? 0;
                const step = shareStep(share);
                const label = step
                  ? t("share", { doc: d.name, pct: pct(share) })
                  : t("noPart", { doc: d.name });
                return (
                  <td key={d.id} className="brief-grid-doc" title={label}>
                    <span
                      className={step ? "brief-mark" : "brief-mark brief-mark-none"}
                      style={step ? { background: ramp[step - 1] } : undefined}
                      aria-hidden="true"
                    />
                    <span className="sr-only">{label}</span>
                  </td>
                );
              })}
              <td className="brief-grid-count">{n(row.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="brief-grid-legend">
        {ramp.map((c) => (
          <span key={c} className="brief-mark" style={{ background: c }} aria-hidden="true" />
        ))}
        <span>{t("legend")}</span>
      </p>
    </div>
  );
}
