"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { MIN_DOCS, synergy } from "@/lib/brief/contracts/synergy";
import { targetLine } from "@/lib/brief/text";
import { useMoney } from "./money";

/** Contracts listed at first, and added per "Show more". */
const PAGE = 8;

/**
 * What works well: contracts that strongly match targets in several
 * documents at once. How many contracts serve how many documents, the ones
 * serving the most (documents named in words), what the policy analysis says
 * about the pairs of targets they serve, and the contracts that serve two
 * targets rated potentially misaligned.
 */
export function SynergyBlock({ setup, onContract }: { setup: ContractsSetup; onContract: (id: string) => void }) {
  const t = useTranslations("brief.contracts.deep.synergy");
  const m = useMoney();
  const [shown, setShown] = useState(PAGE);
  const [faultOpen, setFaultOpen] = useState(false);
  const docOrder = useMemo(() => setup.documents.map((d) => d.id), [setup]);
  const docOf = useMemo(() => new Map(setup.targets.map((x) => [x.id, x.doc])), [setup]);
  const s = useMemo(() => synergy(setup.file.contracts, docOf, docOrder), [setup, docOf, docOrder]);
  const contracts = useMemo(() => new Map(setup.file.contracts.map((c) => [c.id, c])), [setup]);
  const targets = useMemo(() => new Map(setup.targets.map((x) => [x.id, x])), [setup]);
  const docName = (id: string) => setup.documents.find((d) => d.id === id)?.name ?? id;
  const tallest = Math.max(1, ...s.distribution);
  const agreement = setup.file.agreement;
  const faultline = setup.file.faultline;

  if (s.count === 0) return null;
  return (
    <section className="ct-deep" data-deep="synergy">
      <p className="brief-hub-kicker">{t("kicker")}</p>
      <h2 className="brief-hub-headline">{t("headline", { count: s.count, value: m.tugrik(s.value), min: MIN_DOCS })}</h2>

      <figure className="ct-dist" aria-hidden="true">
        <div className="ct-dist-bars">
          {s.distribution.slice(1).map((count, i) => (
            <div key={i} className="ct-dist-col" data-on={i + 1 >= MIN_DOCS ? "" : undefined}>
              <span className="ct-dist-count">{m.n(count)}</span>
              <span className="ct-dist-bar" style={{ height: `${(count / tallest) * 100}%` }} />
              <span className="ct-dist-x">{i + 1}</span>
            </div>
          ))}
        </div>
        <figcaption className="ct-dist-axis">{t("axis")}</figcaption>
      </figure>

      {agreement.total > 0 && (
        <p className="brief-hub-second">
          {t("agreement", { total: m.n(agreement.total), high: m.n(agreement.high), misaligned: m.n(agreement.flagged) })}
        </p>
      )}

      <ul className="ct-list">
        {s.rows.slice(0, shown).map(({ contract: c, docs }) => (
          <li key={c.id}>
            <button type="button" className="ct-list-row" onClick={() => onContract(c.id)}>
              <span className="ct-list-title">{c.title}</span>
              <span className="ct-list-meta">
                {m.tugrik(c.value)} · {c.year}
              </span>
              <span className="ct-list-meta">{t("docs", { count: docs.length, names: docs.map(docName).join(", ") })}</span>
            </button>
          </li>
        ))}
      </ul>
      {shown < s.rows.length && (
        <button type="button" className="ct-link" onClick={() => setShown((v) => v + PAGE * 2)}>
          {t("more", { count: Math.min(PAGE * 2, s.rows.length - shown) })}
        </button>
      )}

      {faultline.length > 0 && (
        <div className="ct-disclosure">
          <button type="button" className="ct-link" aria-expanded={faultOpen} onClick={() => setFaultOpen((v) => !v)}>
            {t("faultline", { count: faultline.length })}
            <span aria-hidden="true"> {faultOpen ? "‹" : "›"}</span>
          </button>
          {faultOpen && (
            <ul className="ct-list">
              {faultline.slice(0, 12).map((f) => {
                const c = contracts.get(f.contract);
                const [a, b] = f.pairs[0];
                const line = (id: string) => {
                  const x = targets.get(id);
                  return x ? `${docName(x.doc)}: ${targetLine(x, 70)}` : id;
                };
                return (
                  <li key={f.contract}>
                    <button type="button" className="ct-list-row" onClick={() => onContract(f.contract)}>
                      <span className="ct-list-title">{c?.title ?? f.contract}</span>
                      <span className="ct-list-meta">{line(a)}</span>
                      <span className="ct-list-meta">{line(b)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
