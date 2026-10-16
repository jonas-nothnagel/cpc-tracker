"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { per100 } from "@/lib/brief/contracts/money";
import type { BriefSource } from "@/lib/brief/source";
import {
  percentLabel,
  spendingAreas,
  spendingRecord,
  type SpendingArea,
  type SpendingSetup,
} from "@/lib/brief/spending";
import "./spending.css";

/** Squares in the record's field: one per unit of every hundred. */
const FIELD = 100;
/** Budget lines listed under an opened area. */
const LINES_MAX = 8;

/**
 * Reviewed public biodiversity spending in the brief, in two readings: the
 * record (the reviewed lines out of all public spending, as squares of every
 * hundred) and what it is for (each biodiversity area's share of the
 * targets beside its share of the spending). An area opens to its budget
 * lines and goes on to the ring with its budget lines shown.
 */
export function SpendingSection({
  setup,
  source,
  docs,
  onExploreArea,
}: {
  setup: SpendingSetup;
  source: BriefSource;
  /** The brief's documents: the targets are read from these. */
  docs: string[];
  /** Puts a biodiversity area in the centre of the ring, budget lines on. */
  onExploreArea?: (areaId: string) => void;
}) {
  const t = useTranslations("brief.spending");
  const format = useFormatter();
  const record = useMemo(() => spendingRecord(setup), [setup]);
  const areas = useMemo(() => spendingAreas(setup, source, docs), [setup, source, docs]);
  const [open, setOpen] = useState<string | null>(null);

  // Amounts in the record's unit (millions): billions from a thousand up, the
  // unit and digits chosen for the rounded figure, and two decimals below one
  // so a small line never reads as none.
  const money = (value: number) => {
    const billions = setup.unit === "million" && value >= 999.95;
    const amount = billions ? value / 1000 : value;
    const digits = amount >= 99.95 ? 0 : amount >= 0.995 ? 1 : 2;
    return t("money", {
      currency: setup.currency,
      amount: format.number(amount, { maximumFractionDigits: digits, minimumFractionDigits: digits }),
      unit: billions ? "billion" : setup.unit,
    });
  };
  const years = setup.years.length > 1 ? `${setup.years[0]}–${setup.years[setup.years.length - 1]}` : setup.years[0];
  const every = per100(record.share);
  const lead = [...areas].sort((a, b) => b.spendShare - a.spendShare)[0];
  const maxShare = Math.max(...areas.flatMap((a) => [a.targetShare, a.spendShare]), 0.01);

  return (
    <div className="sp-brief" data-testid="brief-spending">
      <header className="sp-head">
        <h2 id="brief-spending-title" className="sp-title" tabIndex={-1}>
          {t("title")}
        </h2>
        <p className="sp-source">
          {t("source", { years })}
          {setup.illustrative && <span className="sp-illustrative">{t("illustrative")}</span>}
        </p>
      </header>

      <section className="sp-step" aria-labelledby="sp-record-headline">
        <Field filled={every} label={t("fieldLabel", { currency: setup.currency, every: format.number(every) })} />
        <div className="sp-side">
          <p className="brief-hub-kicker">{t("record.kicker")}</p>
          <h3 id="sp-record-headline" className="brief-hub-headline">
            {t("record.headline", { currency: setup.currency, every: format.number(every) })}
          </h3>
          <dl className="sp-figures">
            <div>
              <dt>{t("record.reviewed", { years })}</dt>
              <dd className="sp-figure" data-ink="blue">{money(record.reviewed)}</dd>
            </div>
            <div>
              <dt>{t("record.public", { years })}</dt>
              <dd className="sp-figure">{money(record.public)}</dd>
            </div>
          </dl>
          {new Set(record.byYear.map((y) => per100(y.share))).size > 1 && (
            <p className="sp-years">
              {record.byYear
                .map((y) => t("record.year", { year: y.year, currency: setup.currency, every: format.number(per100(y.share)) }))
                .join(" · ")}
            </p>
          )}
        </div>
      </section>

      <section className="sp-step sp-step-areas" aria-labelledby="sp-areas-headline">
        <div className="sp-areas-intro">
          {/* Each line's and target's area is the AI's classification, not the review's. */}
          <p className="brief-hub-kicker">
            {t("areas.kicker")} <span className="sp-ai">{t("areas.ai")}</span>
          </p>
          {lead && (
            <h3 id="sp-areas-headline" className="brief-hub-headline">
              {t("areas.headline", {
                area: lead.name,
                spend: percentLabel(lead.spendShare),
                targets: percentLabel(lead.targetShare),
              })}
            </h3>
          )}
        </div>
        <div className="sp-row sp-row-head" aria-hidden="true">
          <span>{t("areas.colArea")}</span>
          <span>{t("areas.colTargets")}</span>
          <span>{t("areas.colSpend")}</span>
        </div>
        <ol className="sp-areas" aria-label={t("areas.listLabel")}>
          {areas.map((a) => (
            <AreaRow
              key={a.id}
              area={a}
              maxShare={maxShare}
              open={open === a.id}
              onToggle={() => setOpen((cur) => (cur === a.id ? null : a.id))}
              money={money}
              // The ring centres an area on its targets: none here, nothing to centre.
              onExplore={onExploreArea && a.targets.length > 0 ? () => onExploreArea(a.id) : undefined}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The record as a hundred squares, the reviewed share in blue: whole
 *  squares, then the part of one. */
function Field({ filled, label }: { filled: number; label: string }) {
  return (
    <div className="sp-field" role="img" aria-label={label}>
      {Array.from({ length: FIELD }, (_, i) => {
        const part = Math.max(0, Math.min(1, filled - i));
        return (
          <span key={i} className="sp-square">
            {part > 0 && <span className="sp-square-fill" style={{ width: `${part * 100}%` }} />}
          </span>
        );
      })}
    </div>
  );
}

function AreaRow({
  area,
  maxShare,
  open,
  onToggle,
  money,
  onExplore,
}: {
  area: SpendingArea;
  maxShare: number;
  open: boolean;
  onToggle: () => void;
  money: (value: number) => string;
  onExplore?: () => void;
}) {
  const t = useTranslations("brief.spending");
  const panel = `sp-area-${area.id}`;
  return (
    <li className="sp-area" data-open={open ? "true" : undefined}>
      <button type="button" className="sp-row" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <span className="sp-area-name">{area.name}</span>
        <Bar share={area.targetShare} max={maxShare} ink="targets" label={percentLabel(area.targetShare)} />
        <Bar
          share={area.spendShare}
          max={maxShare}
          ink="spend"
          label={area.spend > 0 ? percentLabel(area.spendShare) : t("areas.noSpend")}
        />
        <span className="brief-sr-only">
          {t("areas.rowLabel", { targets: percentLabel(area.targetShare), spend: percentLabel(area.spendShare) })}
        </span>
      </button>
      {open && (
        <div className="sp-open" id={panel}>
          <p className="sp-open-line">
            {t("areas.targetsLine", { count: area.targets.length })}
            {area.targets.length > 0 && (
              <>
                {" "}
                {t("areas.matched", { matched: area.matched.length, total: area.targets.length })}{" "}
                <span className="sp-ai">{t("areas.ai")}</span>
              </>
            )}
          </p>
          {area.lines.length > 0 ? (
            <ul className="sp-lines" aria-label={t("areas.linesLabel")}>
              {area.lines.slice(0, LINES_MAX).map((l) => (
                <li key={l.id} className="sp-line">
                  <span className="sp-line-name">{l.name}</span>
                  <span className="sp-line-amount">{money(l.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sp-open-line">{t("areas.noLines")}</p>
          )}
          {onExplore && (
            <button type="button" className="brief-av-link" onClick={onExplore}>
              {t("areas.explore")}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function Bar({ share, max, ink, label }: { share: number; max: number; ink: "targets" | "spend"; label: string }) {
  return (
    <span className="sp-cell" aria-hidden="true">
      <span className="sp-bar" data-ink={ink}>
        <span style={{ width: `${Math.min(100, (share / max) * 100)}%` }} />
      </span>
      <span className="sp-pct" data-ink={ink}>
        {label}
      </span>
    </span>
  );
}
