"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { coverage, targetStats, type TargetStat } from "@/lib/brief/contracts/targets";
import { targetLine } from "@/lib/brief/text";
import { useMoney } from "./money";

/**
 * The targets: which have a strongly matching contract and which have none,
 * document by document, the gaps named first. Beside each target without a
 * contract, what else is behind it (a budget line, a reported action, or
 * neither).
 */
export function TargetsBlock({ setup, onTarget }: { setup: ContractsSetup; onTarget: (id: string) => void }) {
  const t = useTranslations("brief.contracts.deep.targets");
  const { n } = useMoney();
  const [showThin, setShowThin] = useState(false);
  const stats = useMemo(
    () => targetStats(setup.file.contracts, setup.targets, new Set(setup.budget), new Set(setup.action)),
    [setup],
  );
  const cov = useMemo(() => coverage(stats, setup.documents.map((d) => d.id)), [stats, setup]);
  const docs = useMemo(
    () => [...cov.docs].sort((a, b) => b.none.length - a.none.length || a.covered / a.total - b.covered / b.total),
    [cov],
  );
  const targets = useMemo(() => new Map(setup.targets.map((x) => [x.id, x])), [setup]);
  const docName = (id: string) => setup.documents.find((d) => d.id === id)?.name ?? id;
  const backing = (s: TargetStat) =>
    s.budget && s.action ? t("both") : s.budget ? t("budget") : s.action ? t("action") : t("neither");
  const thin = docs.flatMap((d) => d.thin);

  const targetButton = (s: TargetStat, meta: string) => {
    const x = targets.get(s.id);
    return (
      <li key={s.id}>
        <button type="button" className="ct-target-row" onClick={() => onTarget(s.id)}>
          <span className="ct-target-text">{x ? targetLine(x, 140) : s.id}</span>
          <span className="ct-target-meta" data-neither={!s.budget && !s.action ? "" : undefined}>
            {meta}
          </span>
        </button>
      </li>
    );
  };

  return (
    <section className="ct-deep" data-deep="targets">
      <p className="brief-hub-kicker">{t("kicker")}</p>
      <h2 className="brief-hub-headline">
        {cov.none > 0
          ? t("headline", { covered: n(cov.covered), total: n(cov.total), none: cov.none })
          : t("headlineAll", { total: n(cov.total) })}
      </h2>
      {cov.none > 0 && cov.noneOfThree > 0 && (
        <p className="brief-hub-second">
          {t.rich("second", {
            count: cov.noneOfThree,
            ber: (chunks) => <abbr title={t("ber")}>{chunks}</abbr>,
            btr: (chunks) => <abbr title={t("btr")}>{chunks}</abbr>,
          })}
        </p>
      )}
      <ul className="ct-docs">
        {docs.map((d) => (
          <li key={d.doc} className="ct-doc" data-testid={`targets-doc-${d.doc}`}>
            <div className="ct-doc-row">
              <span className="ct-doc-name">{docName(d.doc)}</span>
              <span className="ct-cover" aria-hidden="true">
                <span className="brief-seg brief-seg-reinforce" style={{ width: `${(d.covered / Math.max(1, d.total)) * 100}%` }} />
              </span>
              <span className="ct-doc-count">{t("of", { covered: n(d.covered), total: n(d.total) })}</span>
            </div>
            {d.none.length > 0 && <ul className="ct-target-list">{d.none.map((s) => targetButton(s, backing(s)))}</ul>}
          </li>
        ))}
      </ul>
      {thin.length > 0 && (
        <div className="ct-disclosure">
          <button type="button" className="ct-link" aria-expanded={showThin} onClick={() => setShowThin((v) => !v)}>
            {t("thin", { count: thin.length })}
            <span aria-hidden="true"> {showThin ? "‹" : "›"}</span>
          </button>
          {showThin && (
            <ul className="ct-target-list">{thin.map((s) => targetButton(s, `${docName(s.doc)} · ${t("contracts", { count: s.matching })}`))}</ul>
          )}
        </div>
      )}
    </section>
  );
}
