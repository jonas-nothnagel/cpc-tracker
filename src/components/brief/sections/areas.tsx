"use client";

import { useTranslations } from "next-intl";
import type { BriefData } from "@/lib/brief/data";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

const MAX_ROWS = 9;

export function AreasSection({ data, lensName }: { data: BriefData; lensName: string | null }) {
  const t = useTranslations("brief");
  const { pct } = useNumbers();
  const areas = data.areas;
  if (!areas) return null;
  const top = areas.rows.find((r) => r.share !== null);
  const headline = top
    ? t("areas.headline", { area: top.name, pct: pct(top.share ?? 0) })
    : t("areas.headlineEmpty");
  const scale = Math.max(areas.max, areas.average, 0.01);
  const x = (v: number) => `${((v / scale) * 100).toFixed(2)}%`;
  return (
    <SectionFrame
      id="areas"
      headline={headline}
      sub={lensName ? t("sheet.lensScope", { lens: lensName }) : undefined}
      note={t("areas.average", { pct: pct(areas.average) })}
    >
      <ol className="brief-areas">
        {areas.rows.slice(0, MAX_ROWS).map((r) => (
          <li key={r.id} className="brief-area">
            <p className="brief-area-name">
              <span>{r.name}</span>
              <span className="brief-area-meta">{t("areas.commitmentsCount", { count: r.commitments })}</span>
            </p>
            {r.share === null ? (
              <p className="brief-area-few">{t("areas.tooFew")}</p>
            ) : (
              <p className="brief-area-bar-row">
                <span
                  className="brief-area-bar"
                  role="img"
                  aria-label={t("areas.row", { area: r.name, pct: pct(r.share), reviewed: r.reviewed })}
                >
                  <span className="brief-area-fill" style={{ width: x(r.share) }} />
                  <span className="brief-area-avg" style={{ left: x(areas.average) }} />
                </span>
                <span className="brief-area-value">{pct(r.share)}</span>
              </p>
            )}
          </li>
        ))}
      </ol>
    </SectionFrame>
  );
}
