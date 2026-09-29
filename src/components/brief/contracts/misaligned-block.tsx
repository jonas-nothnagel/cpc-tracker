"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { MisalignedReading } from "@/lib/brief/contracts/load";
import { misalignedRows } from "@/lib/brief/contracts/misaligned";
import { isGreen } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { targetLine } from "@/lib/brief/text";
import { FirstSentence } from "../ai-text";
import { ContractTitle } from "./contract-title";
import { useMoney } from "./money";

/**
 * Where to look closer: contracts potentially misaligned with a target,
 * counted as tenders (framework agreements are listed lot by lot). One row
 * per target, as the brief's result bar: its potentially misaligned tenders
 * to the left (red dots), its strongly matching tenders to the right (green
 * dots). A row opens its tenders.
 */
export function MisalignedBlock({
  setup,
  onContract,
  onTarget,
}: {
  setup: ContractsSetup;
  onContract: (id: string) => void;
  onTarget: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts.deep.misaligned");
  const tk = useTranslations("labels.contradictionType");
  const tc = useTranslations("brief.contracts.panel.confidence");
  const m = useMoney();
  const [open, setOpen] = useState<string | null>(null);
  // Why each tender was raised: the explanations for the open target,
  // fetched when its row opens (they stay on the server until asked for).
  const [readings, setReadings] = useState<{
    target: string;
    byContract: Map<string, MisalignedReading>;
  } | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const query = new URLSearchParams({
      country: setup.countryId,
      target: open,
    });
    fetch(`/api/brief/contracts?${query}`)
      .then((res) =>
        res.ok ? (res.json() as Promise<{ misaligned: MisalignedReading[] }>) : Promise.reject(new Error()),
      )
      .then((body) => {
        if (alive)
          setReadings({
            target: open,
            byContract: new Map(body.misaligned.map((r) => [r.contract, r])),
          });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open, setup.countryId]);
  const readingOf = (target: string, contracts: { id: string }[]) => {
    if (!readings || readings.target !== target) return null;
    for (const c of contracts) {
      const r = readings.byContract.get(c.id);
      if (r) return r;
    }
    return null;
  };
  const docOf = useMemo(() => new Map(setup.targets.map((x) => [x.id, x.doc])), [setup]);
  const result = useMemo(() => misalignedRows(setup.file.contracts, docOf), [setup, docOf]);
  const targets = useMemo(() => new Map(setup.targets.map((x) => [x.id, x])), [setup]);
  const docName = (id: string) => setup.documents.find((d) => d.id === id)?.name ?? id;
  const green = setup.file.contracts.filter(isGreen).length;
  const scale = Math.max(1, ...result.rows.map((r) => Math.max(r.tenders.length, r.matchingTenders)));

  const headline =
    result.tenders === 0
      ? t("headlineNone")
      : result.topDoc
        ? t("headline", {
            tenders: result.tenders,
            pct: m.pct(result.topDoc.share),
            doc: docName(result.topDoc.doc),
          })
        : t("headlineOne", { tenders: result.tenders });

  return (
    <section className="ct-deep" data-deep="misaligned">
      <p className="brief-hub-kicker">{t("kicker")}</p>
      <h2 className="brief-hub-headline">{headline}</h2>
      {result.tenders > 0 && (
        <>
          <p className="brief-hub-second">{t("second", { contracts: result.contracts })}</p>
          <p className="ct-source">
            {t("compared", {
              green: m.n(green),
              others: m.n(setup.file.source.comparedOthers),
            })}
          </p>
          <div className="ct-flow-head">
            <span />
            <span className="ct-flow-bars">
              <span className="ct-flow-label ct-flow-label-left">{t("left")}</span>
              <span className="ct-flow-label">{t("right")}</span>
            </span>
          </div>
          <ul className="ct-flows">
            {result.rows.map((row) => {
              const x = targets.get(row.target);
              const isOpen = open === row.target;
              return (
                <li key={row.target} className="ct-flow" data-testid={`misaligned-${row.target}`}>
                  <button
                    type="button"
                    className="ct-flow-row"
                    aria-expanded={isOpen}
                    onClick={() => setOpen((cur) => (cur === row.target ? null : row.target))}
                  >
                    <span className="ct-flow-name">
                      <span className="ct-flow-text">{x ? targetLine(x, 110) : row.target}</span>
                      <span className="ct-flow-doc">{docName(row.doc)}</span>
                    </span>
                    <span className="ct-flow-bars" aria-hidden="true">
                      <span className="ct-flow-value">{row.tenders.length}</span>
                      <span className="ct-flow-side ct-flow-left">
                        <span
                          className="brief-seg brief-seg-apart"
                          style={{
                            width: `${(row.tenders.length / scale) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="ct-flow-side">
                        <span
                          className="brief-seg brief-seg-reinforce"
                          style={{
                            width: `${(row.matchingTenders / scale) * 100}%`,
                          }}
                        />
                      </span>
                      <span className="ct-flow-value ct-flow-value-end">{row.matchingTenders}</span>
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ct-flow-open">
                      <ul className="ct-list">
                        {row.tenders.map((g) => {
                          const reading = readingOf(row.target, g.contracts);
                          return (
                            <li key={g.tender} className="ct-tender">
                              <button type="button" className="ct-list-row" onClick={() => onContract(g.lead.id)}>
                                <ContractTitle contract={g.lead} />
                                <span className="ct-list-meta">
                                  {t("tender", {
                                    count: g.contracts.length,
                                    value: m.amount(g.value),
                                    year: g.lead.year,
                                  })}
                                </span>
                              </button>
                              {reading && (
                                <div className="ct-tender-why">
                                  <FirstSentence text={reading.text} />
                                  <span className="ct-list-meta">
                                    {[
                                      reading.mechanism ? tk(reading.mechanism) : null,
                                      reading.confidence ? tc(reading.confidence as "high") : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                      <p className="ct-tag">{t("tag")}</p>
                      <button type="button" className="ct-link" onClick={() => onTarget(row.target)}>
                        {x ? targetLine(x, 60) : row.target}
                        <span aria-hidden="true"> ›</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
