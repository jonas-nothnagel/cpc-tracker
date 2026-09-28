"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { DrawerHeader, DrawerShell } from "@/components/ui/drawer-shell";
import { Link } from "@/i18n/navigation";
import { misalignedRows } from "@/lib/brief/contracts/misaligned";
import type { ContractRecord, LensKey } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { targetLine } from "@/lib/brief/text";
import { FirstSentence } from "../ai-text";
import type { PanelState } from "./contracts-page";
import { useMoney } from "./money";

/** Contracts a target's panel lists before "Show all". */
const LIST_MAX = 12;

function useLookups(setup: ContractsSetup) {
  return useMemo(() => {
    const targets = new Map(setup.targets.map((x) => [x.id, x]));
    const docs = new Map(setup.documents.map((d) => [d.id, d]));
    const contracts = new Map(setup.file.contracts.map((c) => [c.id, c]));
    const docOf = new Map(setup.targets.map((x) => [x.id, x.doc]));
    return { targets, docs, contracts, docOf };
  }, [setup]);
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="ct-fact-label">{label}</dt>
      <dd className="ct-fact-value">{children}</dd>
    </>
  );
}

function ContractPanel({
  id,
  setup,
  placeNames,
  onTarget,
}: {
  id: string;
  setup: ContractsSetup;
  placeNames: Record<string, string>;
  onTarget: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts.panel");
  const tl = useTranslations("briefing.lens");
  const tm = useTranslations("labels.contradictionType");
  const format = useFormatter();
  const m = useMoney();
  const { targets, docs, contracts } = useLookups(setup);
  const [state, setState] = useState<{ status: "loading" | "ok" | "error"; record?: ContractRecord }>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    setState({ status: "loading" });
    const query = new URLSearchParams({ country: setup.countryId, contract: id });
    fetch(`/api/brief/contracts?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<ContractRecord>) : Promise.reject(new Error())))
      .then((record) => alive && setState({ status: "ok", record }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [id, setup.countryId]);

  const contract = contracts.get(id);
  const record = state.record;
  if (state.status !== "ok" || !record) {
    return (
      <>
        <DrawerHeader>
          <h2 className="brief-panel-title">{contract?.title ?? id}</h2>
        </DrawerHeader>
        <div className="brief-panel-body">
          <p className="brief-panel-caveat">{state.status === "error" ? t("error") : t("loading")}</p>
        </div>
      </>
    );
  }

  const date = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const placeName = (code: string | null | undefined) =>
    !code ? t("noPlace") : code === "several" ? t("several") : (placeNames[code] ?? code);
  const areas = contract
    ? (Object.entries(contract.areas) as [LensKey, string][])
        .map(([lens, area]) => {
          const name = setup.lenses.find((l) => l.id === lens)?.categories.find((c) => c.id === area)?.name;
          return name ? `${tl(lens)}: ${name}` : null;
        })
        .filter((x): x is string => x !== null)
    : [];
  const targetRow = (target: string, text: string, tone: "reinforce" | "apart", extra?: ReactNode) => {
    const x = targets.get(target);
    return (
      <li key={target} className="ct-panel-target">
        <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
        <div className="ct-panel-target-main">
          <button type="button" className="ct-panel-target-name" onClick={() => onTarget(target)}>
            {x ? targetLine(x, 120) : target}
          </button>
          <span className="brief-panel-row-doc">{x ? (docs.get(x.doc)?.name ?? x.doc) : ""}</span>
          {extra}
          <div className="brief-panel-text">
            <FirstSentence text={text} />
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <DrawerHeader>
        <h2 className="brief-panel-title">{record.english ?? record.original}</h2>
        <p className="brief-panel-sub">
          <span className="brief-panel-sub-line">{record.english ? t("machine") : t("untranslated")}</span>
          {record.english && <span className="brief-panel-sub-line">{t("original", { text: record.original })}</span>}
        </p>
      </DrawerHeader>
      <div className="brief-panel-body">
        <dl className="ct-facts">
          <Fact label={t("value")}>
            {t("valueUsd", { value: m.tugrik(contract?.value ?? 0), usd: m.usd(contract?.value ?? 0, setup.file.source.usdRate) })}
          </Fact>
          {contract && <Fact label={t("year")}>{contract.year}</Fact>}
          {record.start && record.end && <Fact label={t("dates")}>{t("datesRange", { start: date(record.start), end: date(record.end) })}</Fact>}
          <Fact label={t("type")}>{t(`types.${record.type}` as "types.other")}</Fact>
          <Fact label={t("stage")}>{t(`stages.${record.stage}` as "stages.other")}</Fact>
          <Fact label={t("place")}>{placeName(contract?.place)}</Fact>
          <Fact label={t("buyer")}>{record.buyer}</Fact>
          {record.lots > 1 && <Fact label={t("tender")}>{t("lotsLine", { count: record.lots })}</Fact>}
        </dl>

        <section>
          <h3 className="brief-panel-h">{t("reading")}</h3>
          {contract && <p className="brief-panel-text">{t(`tier.${contract.tier}`)}</p>}
          {record.reason && (
            <p className="brief-panel-caveat">
              {t("reason")}: {record.reason}
            </p>
          )}
          {areas.length > 0 && (
            <p className="brief-panel-meta">
              {t("areas")}: {areas.join(" · ")}
            </p>
          )}
        </section>

        {record.strong.length > 0 && (
          <section>
            <h3 className="brief-panel-h">{t("matches", { count: record.strong.length })}</h3>
            <ul className="ct-panel-targets">{record.strong.map((s) => targetRow(s.target, s.text, "reinforce"))}</ul>
          </section>
        )}

        {record.misaligned.length > 0 && (
          <section>
            <h3 className="brief-panel-h">{t("misaligned", { count: record.misaligned.length })}</h3>
            <ul className="ct-panel-targets">
              {record.misaligned.map((s) =>
                targetRow(
                  s.target,
                  s.text,
                  "apart",
                  <span className="brief-panel-row-type">
                    {[s.mechanism ? tm(s.mechanism) : null, s.confidence ? t(`confidence.${s.confidence}` as "confidence.high") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>,
                ),
              )}
            </ul>
          </section>
        )}

        <p className="brief-panel-caveat">{t("caveat")}</p>
        {record.url && (
          <a className="ct-link" href={record.url} target="_blank" rel="noopener noreferrer">
            {t("source", { name: setup.file.source.name })}
            <span aria-hidden="true"> ↗</span>
          </a>
        )}
      </div>
    </>
  );
}

function TargetPanel({ id, setup, onContract }: { id: string; setup: ContractsSetup; onContract: (id: string) => void }) {
  const t = useTranslations("brief.contracts.panel");
  const m = useMoney();
  const { targets, docs, docOf } = useLookups(setup);
  const [all, setAll] = useState(false);
  const target = targets.get(id);
  const matching = useMemo(
    () => setup.file.contracts.filter((c) => c.matches.includes(id)).sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)),
    [setup, id],
  );
  const tenders = useMemo(() => misalignedRows(setup.file.contracts, docOf).rows.find((r) => r.target === id)?.tenders ?? [], [setup, docOf, id]);
  const backing = setup.backing[id] ?? { budget: [], action: [] };
  const value = matching.reduce((s, c) => s + c.value, 0);
  const shown = all ? matching : matching.slice(0, LIST_MAX);

  const contractRow = (key: string, contractId: string, title: string, meta: string, tone: "reinforce" | "apart") => (
    <li key={key} className="brief-panel-row">
      <button type="button" onClick={() => onContract(contractId)}>
        <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
        <span className="brief-panel-row-main">
          <span className="brief-panel-row-line">{title}</span>
          <span className="brief-panel-row-type">{meta}</span>
        </span>
      </button>
    </li>
  );

  return (
    <>
      <DrawerHeader>
        <h2 className="brief-panel-title">{target ? targetLine(target, 160) : id}</h2>
        {target && <p className="brief-panel-sub">{docs.get(target.doc)?.name ?? target.doc}</p>}
      </DrawerHeader>
      <div className="brief-panel-body">
        <section>
          <p className="brief-panel-lead">
            {matching.length > 0 ? t("targetCounts", { count: matching.length, value: m.tugrik(value) }) : t("noContracts")}
          </p>
          {tenders.length > 0 && <p className="brief-panel-meta">{t("misalignedTenders", { count: tenders.length })}</p>}
          {matching.length > 1 && <p className="brief-panel-caveat">{t("targetValueNote")}</p>}
        </section>

        {matching.length > 0 && (
          <section>
            <h3 className="brief-panel-h">{t("contracts")}</h3>
            <ul className="brief-panel-rows">
              {shown.map((c) => contractRow(c.id, c.id, c.title, `${m.tugrik(c.value)} · ${c.year}`, "reinforce"))}
            </ul>
            {!all && matching.length > LIST_MAX && (
              <button type="button" className="brief-panel-more" onClick={() => setAll(true)}>
                {t("showAll", { count: matching.length })}
              </button>
            )}
          </section>
        )}

        {tenders.length > 0 && (
          <section>
            <h3 className="brief-panel-h">{t("tenders")}</h3>
            <ul className="brief-panel-rows">
              {tenders.map((g) =>
                contractRow(
                  g.tender,
                  g.lead.id,
                  g.lead.title,
                  t("tenderLine", { count: g.contracts.length, value: m.tugrik(g.value), year: g.lead.year }),
                  "apart",
                ),
              )}
            </ul>
          </section>
        )}

        <section>
          <h3 className="brief-panel-h">{t("backing")}</h3>
          {backing.budget.length === 0 && backing.action.length === 0 ? (
            <p className="brief-panel-text">{t("noBacking")}</p>
          ) : (
            <>
              {backing.budget.length > 0 && (
                <div className="ct-backing">
                  <p className="brief-panel-note-label">{t("budget")}</p>
                  <ul className="ct-backing-list">
                    {backing.budget.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
              {backing.action.length > 0 && (
                <div className="ct-backing">
                  <p className="brief-panel-note-label">{t("action")}</p>
                  <ul className="ct-backing-list">
                    {backing.action.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        <Link className="ct-link" href={`/${setup.countryId}/brief/explore?focus=${encodeURIComponent(id)}`}>
          {t("explore")}
          <span aria-hidden="true"> ›</span>
        </Link>
      </div>
    </>
  );
}

/**
 * The contracts page's drill-downs in one drawer with a back trail: a
 * contract in full (its record, the AI's readings, its source) and a target
 * with its contracts. Opening one from inside the other pushes onto the trail.
 */
export function ContractsPanels({
  stack,
  setup,
  placeNames = {},
  onPush,
  onBack,
  onClose,
}: {
  stack: PanelState[];
  setup: ContractsSetup;
  /** Place codes to names (from the map's outlines). */
  placeNames?: Record<string, string>;
  onPush: (next: PanelState) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("brief.contracts.panel");
  const top = stack[stack.length - 1];
  if (!top) return null;
  const contract = top.kind === "contract" ? setup.file.contracts.find((c) => c.id === top.id) : undefined;
  const target = top.kind === "target" ? setup.targets.find((x) => x.id === top.id) : undefined;
  const dialogLabel =
    top.kind === "contract"
      ? t("contractDialog", { title: contract?.title ?? top.id })
      : t("targetDialog", { label: target ? targetLine(target, 60) : top.id });
  return (
    <DrawerShell
      open
      onClose={onClose}
      onBack={stack.length > 1 ? onBack : undefined}
      backLabel={t("back")}
      dialogLabel={dialogLabel}
      panelKey={`${top.kind}:${top.id}`}
      scrim="light"
    >
      {top.kind === "contract" ? (
        <ContractPanel key={top.id} id={top.id} setup={setup} placeNames={placeNames} onTarget={(id) => onPush({ kind: "target", id })} />
      ) : (
        <TargetPanel key={top.id} id={top.id} setup={setup} onContract={(id) => onPush({ kind: "contract", id })} />
      )}
    </DrawerShell>
  );
}
