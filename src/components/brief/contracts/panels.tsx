"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { DrawerHeader, DrawerShell } from "@/components/ui/drawer-shell";
import { routing } from "@/i18n/routing";
import { misalignedRows } from "@/lib/brief/contracts/misaligned";
import type { Contract, ContractRecord, LensKey } from "@/lib/brief/contracts/model";
import type { ContractsSetup } from "@/lib/brief/contracts/setup";
import { targetLine } from "@/lib/brief/text";
import { FirstSentence } from "../ai-text";
import type { PanelState } from "./contracts-page";
import { ContractTitle } from "./contract-title";
import { useMoney } from "./money";

/** Contracts a target's panel lists before "Show all". */
const LIST_MAX = 12;
/** Strongly matching targets a contract's panel names before "Show all". */
const STRONG_SHOWN = 5;

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
  const [state, setState] = useState<{
    status: "loading" | "ok" | "error";
    record?: ContractRecord;
  }>({ status: "loading" });
  const [allTargets, setAllTargets] = useState(false);

  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({
      country: setup.countryId,
      contract: id,
    });
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

  const date = (iso: string) =>
    format.dateTime(new Date(`${iso}T00:00:00Z`), {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const placeName = (code: string | null | undefined) =>
    !code ? t("noPlace") : code === "several" ? t("several") : (placeNames[code] ?? code);
  const areas = contract
    ? (Object.entries(contract.areas) as [LensKey, string][])
        .map(([lens, area]) => {
          const name = setup.lenses.find((l) => l.id === lens)?.categories.find((c) => c.id === area)?.name;
          return name ? { lens, name } : null;
        })
        .filter((x): x is { lens: LensKey; name: string } => x !== null)
    : [];
  const value = contract?.value ?? 0;
  // The targets the page holds: in the brief, those in its documents.
  const misaligned = record.misaligned.filter((x) => targets.has(x.target));
  const strong = record.strong.map((x) => x.target).filter((x) => targets.has(x));
  const shownStrong = allTargets ? strong : strong.slice(0, STRONG_SHOWN);
  const targetButton = (id: string) => {
    const x = targets.get(id);
    return (
      <button type="button" className="ct-panel-target-name" onClick={() => onTarget(id)}>
        {x ? `${docs.get(x.doc)?.code ?? x.doc} · ${targetLine(x, 110)}` : id}
      </button>
    );
  };

  return (
    <>
      <DrawerHeader>
        <p className="ct-panel-kind">{t("kind")}</p>
        <h2 className="brief-panel-title">{record.english ?? record.original}</h2>
        <p className="brief-panel-sub">{record.english ? t("titleNote") : t("untranslated")}</p>
      </DrawerHeader>
      <div className="brief-panel-body">
        <p className="ct-panel-value">
          <span>{m.amount(value)}</span>
          {m.other(value) !== m.amount(value) && <span className="ct-panel-value-other">{t("about", { other: m.other(value) })}</span>}
        </p>
        <dl className="ct-facts">
          {contract && <Fact label={t("year")}>{contract.year}</Fact>}
          {record.start && record.end && (
            <Fact label={t("dates")}>
              {t("datesRange", {
                start: date(record.start),
                end: date(record.end),
              })}
            </Fact>
          )}
          {record.buyerEnglish && <Fact label={t("buyer")}>{record.buyerEnglish}</Fact>}
          <Fact label={t("type")}>{t(`types.${record.type}` as "types.other")}</Fact>
          <Fact label={t("stage")}>{t(`stages.${record.stage}` as "stages.other")}</Fact>
          <Fact label={t("place")}>{placeName(contract?.place)}</Fact>
          {record.lots > 1 && <Fact label={t("tender")}>{t("lotsLine", { count: record.lots })}</Fact>}
        </dl>

        <section className="ct-reading" aria-label={t("readingHead")}>
          <h3 className="brief-panel-h">{t("readingHead")}</h3>
          <dl className="ct-facts">
            {contract && (
              <Fact label={t("purpose")}>
                <span className="ct-reading-tier">
                  <i aria-hidden="true" data-tier={contract.tier} />
                  {t(`tier.${contract.tier}`)}
                </span>
                {record.reasonEnglish && <span className="ct-reading-reason">{record.reasonEnglish}</span>}
              </Fact>
            )}
            {areas.length > 0 && (
              <Fact label={t("areas")}>
                <ul className="ct-reading-areas">
                  {areas.map((a) => (
                    <li key={a.lens}>
                      <span className="ct-reading-lens">{tl(a.lens)}</span> <span>{a.name}</span>
                    </li>
                  ))}
                </ul>
              </Fact>
            )}
            <Fact label={t("targets")}>
              <span className="ct-reading-counts">
                <span>{t("strongCount", { count: strong.length })}</span>
                {misaligned.length > 0 && <span className="ct-reading-mis">{t("misCount", { count: misaligned.length })}</span>}
              </span>
            </Fact>
          </dl>

          {misaligned.length > 0 && (
            <ul className="ct-panel-targets">
              {misaligned.map((x) => (
                <li key={x.target} className="ct-panel-target">
                  <span className="brief-panel-mark brief-panel-mark-apart" aria-hidden="true" />
                  <div className="ct-panel-target-main">
                    {targetButton(x.target)}
                    <div className="brief-panel-text">
                      <FirstSentence text={x.text} />
                    </div>
                    <span className="brief-panel-row-type">
                      {[x.mechanism ? tm(x.mechanism) : null, x.confidence ? t(`confidence.${x.confidence}` as "confidence.high") : null].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {strong.length > 0 && (
            <>
              <ul className="ct-panel-strong">
                {shownStrong.map((id) => (
                  <li key={id}>
                    <span className="brief-panel-mark brief-panel-mark-reinforce" aria-hidden="true" />
                    {targetButton(id)}
                  </li>
                ))}
              </ul>
              {strong.length > STRONG_SHOWN && (
                <button type="button" className="ct-back" onClick={() => setAllTargets((v) => !v)}>
                  {allTargets ? t("fewerTargets") : t("allTargets", { count: strong.length })}
                </button>
              )}
            </>
          )}
        </section>

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

function TargetPanel({
  id,
  setup,
  onContract,
  onExplore,
}: {
  id: string;
  setup: ContractsSetup;
  onContract: (id: string) => void;
  /** Puts the target in the centre of the ring on the same page (the brief). */
  onExplore?: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts.panel");
  const m = useMoney();
  const locale = useLocale();
  const { targets, docs, docOf } = useLookups(setup);
  const [all, setAll] = useState(false);
  const target = targets.get(id);
  const matching = useMemo(
    () =>
      setup.file.contracts
        .filter((c) => c.matches.includes(id))
        .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)),
    [setup, id],
  );
  const tenders = useMemo(
    () => misalignedRows(setup.file.contracts, docOf).rows.find((r) => r.target === id)?.tenders ?? [],
    [setup, docOf, id],
  );
  const value = matching.reduce((s, c) => s + c.value, 0);
  const shown = all ? matching : matching.slice(0, LIST_MAX);

  const contractRow = (key: string, contract: Contract, meta: string, tone: "reinforce" | "apart") => (
    <li key={key} className="brief-panel-row">
      <button type="button" onClick={() => onContract(contract.id)}>
        <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
        <span className="brief-panel-row-main">
          <ContractTitle contract={contract} className="brief-panel-row-line" />
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
            {matching.length > 0
              ? t("targetCounts", {
                  count: matching.length,
                  value: m.amount(value),
                })
              : t("noContracts")}
          </p>
          {tenders.length > 0 && (
            <p className="brief-panel-meta">{t("misalignedTenders", { count: tenders.length })}</p>
          )}
          {matching.length > 1 && <p className="brief-panel-caveat">{t("targetValueNote")}</p>}
        </section>

        {matching.length > 0 && (
          <section>
            <h3 className="brief-panel-h">{t("contracts")}</h3>
            <ul className="brief-panel-rows">
              {shown.map((c) => contractRow(c.id, c, `${m.amount(c.value)} · ${c.year}`, "reinforce"))}
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
                  g.lead,
                  t("tenderLine", {
                    count: g.contracts.length,
                    value: m.amount(g.value),
                    year: g.lead.year,
                  }),
                  "apart",
                ),
              )}
            </ul>
          </section>
        )}

        {onExplore ? (
          <button type="button" className="ct-link" onClick={() => onExplore(id)}>
            {t("explore")}
            <span aria-hidden="true"> ›</span>
          </button>
        ) : (
          // As the brief's other links: English URLs carry no locale prefix.
          <a
            className="ct-link"
            href={`${locale === routing.defaultLocale ? "" : `/${locale}`}/${setup.countryId}/brief/explore?focus=${encodeURIComponent(id)}`}
          >
            {t("explore")}
            <span aria-hidden="true"> ›</span>
          </a>
        )}
      </div>
    </>
  );
}

/** Contracts a list panel shows at first, and adds per "Show more". */
const LIST_PAGE = 20;

/** A place's or a policy area's contracts (in focus), largest first. */
function ListPanel({
  title,
  ids,
  setup,
  onContract,
}: {
  title: string;
  ids: string[];
  setup: ContractsSetup;
  onContract: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts.panel.list");
  const m = useMoney();
  const { contracts } = useLookups(setup);
  const [shown, setShown] = useState(LIST_PAGE);
  const list = ids
    .map((id) => contracts.get(id))
    .filter((c): c is Contract => c !== undefined)
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const total = list.reduce((s, c) => s + c.value, 0);
  return (
    <>
      <DrawerHeader>
        <h2 className="brief-panel-title">{title}</h2>
        <p className="brief-panel-sub">{t("count", { count: list.length, value: m.amount(total) })}</p>
      </DrawerHeader>
      <div className="brief-panel-body">
        <ul className="ct-list">
          {list.slice(0, shown).map((c) => (
            <li key={c.id}>
              <button type="button" className="ct-list-row" onClick={() => onContract(c.id)}>
                <ContractTitle contract={c} />
                <span className="ct-list-meta">
                  {m.amount(c.value)} · {c.year}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {shown < list.length && (
          <button type="button" className="ct-link" onClick={() => setShown((v) => v + LIST_PAGE)}>
            {t("more", { count: Math.min(LIST_PAGE, list.length - shown) })}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * The contracts page's drill-downs in one drawer with a back trail: a
 * contract in full (its record, the AI's readings, its source), a target
 * with its contracts, and a list of contracts. Opening one from inside
 * another pushes onto the trail.
 */
export function ContractsPanels({
  stack,
  setup,
  placeNames = {},
  onPush,
  onBack,
  onClose,
  onExplore,
}: {
  stack: PanelState[];
  setup: ContractsSetup;
  /** Place codes to names (from the map's outlines). */
  placeNames?: Record<string, string>;
  onPush: (next: PanelState) => void;
  onBack: () => void;
  onClose: () => void;
  /** Where the page has the ring (the brief): a target goes to its centre
   *  there, rather than to the ring's own page. */
  onExplore?: (id: string) => void;
}) {
  const t = useTranslations("brief.contracts.panel");
  const top = stack[stack.length - 1];
  if (!top) return null;
  const contract = top.kind === "contract" ? setup.file.contracts.find((c) => c.id === top.id) : undefined;
  const target = top.kind === "target" ? setup.targets.find((x) => x.id === top.id) : undefined;
  const dialogLabel =
    top.kind === "list"
      ? t("list.dialog", { title: top.title })
      : top.kind === "contract"
        ? t("contractDialog", { title: contract?.title ?? top.id })
        : t("targetDialog", { label: target ? targetLine(target, 60) : top.id });
  const key = top.kind === "list" ? `list:${top.title}` : `${top.kind}:${top.id}`;
  return (
    <DrawerShell
      open
      onClose={onClose}
      onBack={stack.length > 1 ? onBack : undefined}
      backLabel={t("back")}
      dialogLabel={dialogLabel}
      panelKey={key}
      scrim="light"
    >
      {top.kind === "list" ? (
        <ListPanel key={key} title={top.title} ids={top.ids} setup={setup} onContract={(id) => onPush({ kind: "contract", id })} />
      ) : top.kind === "contract" ? (
        <ContractPanel
          key={top.id}
          id={top.id}
          setup={setup}
          placeNames={placeNames}
          onTarget={(id) => onPush({ kind: "target", id })}
        />
      ) : (
        <TargetPanel
          key={top.id}
          id={top.id}
          setup={setup}
          onContract={(id) => onPush({ kind: "contract", id })}
          onExplore={onExplore}
        />
      )}
    </DrawerShell>
  );
}
