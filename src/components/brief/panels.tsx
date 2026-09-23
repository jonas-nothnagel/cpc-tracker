"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DrawerHeader, DrawerShell } from "@/components/ui/drawer-shell";
import { PairDrawer } from "@/components/dashboard/coherence-briefing/pair-drawer";
import { partnersOf, strongestAligned } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import type { FoundPair } from "@/lib/brief/pair";
import type { BriefSource } from "@/lib/brief/source";
import { strandsByPathway } from "@/lib/pulse/strands";
import type { CountryConfig } from "@/types";
import { commitmentLine, useNumbers } from "./ink";

export type PanelState =
  | { kind: "pair"; a: string; b: string }
  | { kind: "docPair"; a: string; b: string }
  | { kind: "commitment"; id: string }
  | { kind: "theme"; type: "reinforcement" | "friction"; name: string };

/** Commitment lists show this many before "Show all". */
const LIST_PREVIEW = 12;
/** Target-pair lists in a document pair show this many before "Show all". */
const PAIR_PREVIEW = 5;

function keyOf(p: PanelState): string {
  switch (p.kind) {
    case "pair":
      return `pair:${p.a}:${p.b}`;
    case "docPair":
      return `docs:${p.a}:${p.b}`;
    case "commitment":
      return `c:${p.id}`;
    default:
      return `theme:${p.type}:${p.name}`;
  }
}

/** The pair drawer reads document labels and colours from a country config;
 *  the brief's own document list carries all of them. */
function configFrom(source: BriefSource): CountryConfig {
  return {
    documentTypes: source.documents.map((d) => ({
      id: d.id,
      shortLabel: d.code,
      mediumLabel: d.name,
      fullLabel: d.full,
      color: d.color,
    })),
  } as unknown as CountryConfig;
}

function PairPanel({
  a,
  b,
  countryId,
  config,
}: {
  a: string;
  b: string;
  countryId: string;
  config: CountryConfig;
}) {
  const t = useTranslations("brief.panel");
  const locale = useLocale();
  const [state, setState] = useState<{ status: "loading" | "error" | "ok"; found?: FoundPair }>({
    status: "loading",
  });
  // Mounted once per comparison (keyed by the caller), so it starts loading.
  useEffect(() => {
    let alive = true;
    const query = new URLSearchParams({ country: countryId, a, b, locale });
    fetch(`/api/brief/pair?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<FoundPair>) : Promise.reject(new Error())))
      .then((found) => alive && setState({ status: "ok", found }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
    };
  }, [a, b, countryId, locale]);

  if (state.status !== "ok" || !state.found) {
    return (
      <>
        <DrawerHeader>
          <h2 className="font-display text-[1.25rem] leading-snug text-[var(--undp-black)]">
            {t("pairDialog")}
          </h2>
        </DrawerHeader>
        <p className="px-6 py-4 text-body text-[var(--undp-gray)]">
          {state.status === "error" ? t("error") : t("loading")}
        </p>
      </>
    );
  }
  const { pair, targetA, targetB } = state.found;
  return (
    <PairDrawer
      data={{ mode: "target-pair", pair, targetA, targetB }}
      countryConfig={config}
      countryId={countryId}
      onOpenTargetPair={() => {}}
    />
  );
}

/** Split an AI paragraph into its first sentence and the rest. */
function firstSentence(text: string): { first: string; rest: string } {
  const m = text.match(/^([\s\S]+?[.!?])(\s+)([\s\S]*)$/);
  return m ? { first: m[1], rest: m[3] } : { first: text, rest: "" };
}

/** One labelled AI line: the first sentence, the rest on request. */
function NoteLine({ label, text }: { label: string; text: string }) {
  const t = useTranslations("brief.panel");
  const [more, setMore] = useState(false);
  const { first, rest } = firstSentence(text);
  return (
    <div>
      <h3 className="text-data font-semibold text-[var(--undp-black)]">{label}</h3>
      <p className="mt-1 text-body leading-relaxed text-[var(--undp-black)]">
        {more ? text : first}
        {rest && !more && (
          <>
            {" "}
            <button
              type="button"
              className="text-caption font-medium text-[var(--undp-blue)] underline underline-offset-2"
              onClick={() => setMore(true)}
            >
              {t("more")}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

/** Rows of target pairs between two documents: both targets, one line each. */
function PairRows({
  rows,
  docName,
  testId,
  mechanismOf,
  onOpen,
}: {
  rows: { key: string; a: { doc: string; label: string; text: string; id: string }; b: { doc: string; label: string; text: string; id: string }; mechanism?: string }[];
  docName: (id: string) => string;
  testId: string;
  mechanismOf?: (m: string) => string;
  onOpen: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PAIR_PREVIEW);
  return (
    <>
      <ol className="mt-3 border-t border-line">
        {shown.map((r) => (
          <li key={r.key} className="border-b border-line" data-testid={testId}>
            <button
              type="button"
              className="block w-full py-2.5 text-left hover:bg-[var(--undp-light-gray,#f7f7f7)]"
              onClick={() => onOpen(r.a.id, r.b.id)}
            >
              <span className="block text-data text-[var(--undp-black)]">
                <span className="text-[var(--undp-gray)]">{docName(r.a.doc)} · </span>
                {commitmentLine(r.a)}
              </span>
              <span className="block text-data text-[var(--undp-black)]">
                <span className="text-[var(--undp-gray)]">{docName(r.b.doc)} · </span>
                {commitmentLine(r.b)}
              </span>
              {r.mechanism && mechanismOf && (
                <span className="mt-0.5 block text-caption text-[var(--undp-gray)]">{mechanismOf(r.mechanism)}</span>
              )}
            </button>
          </li>
        ))}
      </ol>
      {!all && rows.length > PAIR_PREVIEW && (
        <button
          type="button"
          className="mt-2 text-caption font-medium text-[var(--undp-blue)] underline underline-offset-2"
          onClick={() => setAll(true)}
        >
          {t("showAll", { count: rows.length })}
        </button>
      )}
    </>
  );
}

/**
 * A pair of documents, after the dashboard's pair panel: the result bar, the
 * pipeline's AI reading (first sentences, the rest on request), a hedged
 * starting point, then the strongest aligned pairs and the potential
 * misalignments, most frequent targets first.
 */
function DocPairPanel({
  data,
  source,
  a,
  b,
  onOpenPair,
}: {
  data: BriefData;
  source: BriefSource;
  a: string;
  b: string;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const tm = useTranslations("labels.contradictionType");
  const { pct } = useNumbers();
  const stat = data.pairs.find((p) => (p.a.id === a && p.b.id === b) || (p.a.id === b && p.b.id === a));
  const note =
    (source.pairNotes ?? []).find((n) => (n.a === a && n.b === b) || (n.a === b && n.b === a)) ?? null;
  const strands = useMemo(
    () =>
      strandsByPathway(
        data.scope.alignment,
        data.scope.targets,
        source.documents.map((d) => d.id),
      ).get(`${a}~${b}`) ??
      strandsByPathway(
        data.scope.alignment,
        data.scope.targets,
        source.documents.map((d) => d.id),
      ).get(`${b}~${a}`) ??
      [],
    [data.scope, source.documents, a, b],
  );
  const aligned = useMemo(() => strongestAligned(data.scope, a, b), [data.scope, a, b]);
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  const c = stat?.counts;
  const share = (v: number) => pct(c && c.total > 0 ? v / c.total : 0);
  const byId = new Map(data.scope.commitments.map((x) => [x.id, x]));
  return (
    <>
      <DrawerHeader>
        <h2 className="font-display text-[1.25rem] leading-snug text-[var(--undp-black)]">
          {t("docPairDialog", { docA: docName(a), docB: docName(b) })}
        </h2>
        {c && (
          <p className="mt-1 text-caption text-[var(--undp-gray)]">
            {t("docPairCounts", {
              total: c.total,
              aligned: share(c.reinforce),
              partial: share(c.partial),
              apart: share(c.apart),
            })}
          </p>
        )}
      </DrawerHeader>
      <div className="space-y-6 px-6 py-4">
        {note && (
          <section className="space-y-3">
            <p className="text-caption text-[var(--undp-gray)]">{t("aiReading")}</p>
            <p className="font-display text-[1.125rem] leading-snug text-[var(--undp-black)]">{note.title}</p>
            <NoteLine label={t("whereAlign")} text={note.align} />
            <NoteLine label={t("whereDiverge")} text={note.diverge} />
          </section>
        )}
        {note?.hint && (
          <section>
            <h3 className="text-data font-semibold text-[var(--undp-black)]">{t("pathwayTitle")}</h3>
            <p className="mt-1 text-body leading-relaxed text-[var(--undp-black)]">{note.hint}</p>
            <p className="mt-1 text-caption text-[var(--undp-gray)]">{t("pathwayCaveat")}</p>
          </section>
        )}
        <section>
          <h3 className="text-data font-semibold text-[var(--undp-black)]">
            {t("alignedPairs", { count: aligned.length })}
          </h3>
          <PairRows
            testId="brief-aligned-pair-row"
            docName={docName}
            onOpen={onOpenPair}
            rows={aligned.map((x) => ({ key: `${x.a.id}__${x.b.id}`, a: x.a, b: x.b }))}
          />
        </section>
        <section>
          <h3 className="text-data font-semibold text-[var(--undp-black)]">
            {t("docPairLead", { count: strands.length })}
          </h3>
          <PairRows
            testId="brief-strand-row"
            docName={docName}
            onOpen={onOpenPair}
            mechanismOf={(m) => tm(m)}
            rows={strands.flatMap((s) => {
              const x = byId.get(s.pair.targetAId);
              const y = byId.get(s.pair.targetBId);
              return x && y ? [{ key: s.pairKey, a: x, b: y, mechanism: s.pair.mechanism ?? undefined }] : [];
            })}
          />
        </section>
      </div>
    </>
  );
}

function CommitmentList({
  items,
  docName,
  onOpen,
}: {
  items: { id: string; doc: string; label: string; text: string }[];
  docName: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIST_PREVIEW);
  return (
    <>
      <ul className="mt-2 border-t border-line">
        {shown.map((p) => (
          <li key={p.id} className="border-b border-line">
            <button
              type="button"
              className="block w-full py-2 text-left text-data text-[var(--undp-black)] hover:underline"
              onClick={() => onOpen(p.id)}
            >
              <span className="text-[var(--undp-gray)]">{docName(p.doc)} · </span>
              {commitmentLine(p)}
            </button>
          </li>
        ))}
      </ul>
      {!all && items.length > LIST_PREVIEW && (
        <button
          type="button"
          className="mt-2 text-caption font-medium text-[var(--undp-blue)] underline underline-offset-2"
          onClick={() => setAll(true)}
        >
          {t("showAll", { count: items.length })}
        </button>
      )}
    </>
  );
}

function CommitmentPanel({
  data,
  id,
  onOpenPair,
}: {
  data: BriefData;
  id: string;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const commitment = data.scope.commitments.find((c) => c.id === id);
  const partners = useMemo(() => partnersOf(data.scope, id), [data.scope, id]);
  const docName = (doc: string) => data.scope.docs.find((d) => d.id === doc)?.name ?? doc;
  if (!commitment) return null;
  return (
    <>
      <DrawerHeader>
        <p className="text-caption text-[var(--undp-gray)]">{docName(commitment.doc)}</p>
        <h2 className="font-display text-[1.25rem] leading-snug text-[var(--undp-black)]">
          {commitment.label}
        </h2>
      </DrawerHeader>
      <div className="space-y-6 px-6 py-4">
        <p className="font-display text-body leading-relaxed text-[var(--undp-black)]">{commitment.text}</p>
        <section>
          <h3 className="text-data font-semibold text-[var(--undp-black)]">
            {t("worksAgainst", { count: partners.apart.length })}
          </h3>
          <CommitmentList items={partners.apart} docName={docName} onOpen={(p) => onOpenPair(id, p)} />
        </section>
        <section>
          <h3 className="text-data font-semibold text-[var(--undp-black)]">
            {t("worksWith", { count: partners.reinforce.length })}
          </h3>
          <CommitmentList items={partners.reinforce} docName={docName} onOpen={(p) => onOpenPair(id, p)} />
        </section>
      </div>
    </>
  );
}

function ThemePanel({
  data,
  type,
  name,
}: {
  data: BriefData;
  type: "reinforcement" | "friction";
  name: string;
}) {
  const t = useTranslations("brief.panel");
  const tt = useTranslations("brief.themes");
  const { pct } = useNumbers();
  const section = type === "reinforcement" ? data.together : data.apart;
  const row = section.rows.find((r) => r.storyline.name === name);
  if (!row) return null;
  const docs = data.scope.docs
    .map((d) => ({ doc: d, share: row.docShares[d.id] ?? 0 }))
    .filter((x) => x.share > 0)
    .sort((x, y) => y.share - x.share);
  return (
    <>
      <DrawerHeader>
        <p className="text-caption text-[var(--undp-gray)]">{t(`themeKind.${type}`)}</p>
        <h2 className="font-display text-[1.25rem] leading-snug text-[var(--undp-black)]">{name}</h2>
      </DrawerHeader>
      <div className="space-y-6 px-6 py-4">
        <section>
          <h3 className="text-data font-semibold text-[var(--undp-black)]">{t("themeSummary")}</h3>
          <p className="mt-1 text-body leading-relaxed text-[var(--undp-black)]">{row.storyline.description}</p>
          {!section.exact && <p className="mt-1 text-caption text-[var(--undp-gray)]">{tt("notExact")}</p>}
        </section>
        {row.storyline.pathway && (
          <section>
            <h3 className="text-data font-semibold text-[var(--undp-black)]">{t("pathwayTitle")}</h3>
            <p className="mt-1 text-body leading-relaxed text-[var(--undp-black)]">{row.storyline.pathway}</p>
            <p className="mt-1 text-caption text-[var(--undp-gray)]">{t("pathwayCaveat")}</p>
          </section>
        )}
        <section>
          <h3 className="text-data font-semibold text-[var(--undp-black)]">{t("themeDocs")}</h3>
          <ul className="mt-2 border-t border-line">
            {docs.map(({ doc, share }) => (
              <li key={doc.id} className="flex justify-between gap-4 border-b border-line py-2 text-data">
                <span title={doc.full}>{doc.name}</span>
                <span className="tabular-nums text-[var(--undp-gray)]">{pct(share)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

/**
 * The brief's drill-downs in one drawer with a back trail: a single
 * comparison (with its AI reading), a pair of documents, a commitment and
 * its partners, a recurring theme. Opening something from inside a panel
 * pushes onto the trail; Escape or Back steps out.
 */
export function BriefPanels({
  stack,
  source,
  data,
  onPush,
  onBack,
  onClose,
}: {
  stack: PanelState[];
  source: BriefSource;
  data: BriefData;
  onPush: (next: PanelState) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("brief.panel");
  const config = useMemo(() => configFrom(source), [source]);
  const top = stack[stack.length - 1];
  if (!top) return null;
  const openPair = (a: string, b: string) => onPush({ kind: "pair", a, b });
  const dialogLabel =
    top.kind === "pair"
      ? t("pairDialog")
      : top.kind === "theme"
        ? t("themeDialog", { name: top.name })
        : top.kind === "commitment"
          ? t("commitmentDialog", {
              label: data.scope.commitments.find((c) => c.id === top.id)?.label ?? top.id,
            })
          : t("docPairDialog", {
              docA: data.scope.docs.find((d) => d.id === top.a)?.name ?? top.a,
              docB: data.scope.docs.find((d) => d.id === top.b)?.name ?? top.b,
            });
  return (
    <DrawerShell
      open
      onClose={onClose}
      onBack={stack.length > 1 ? onBack : undefined}
      backLabel={t("back")}
      dialogLabel={dialogLabel}
      panelKey={keyOf(top)}
    >
      {top.kind === "pair" && (
        <PairPanel
          key={keyOf(top)}
          a={top.a}
          b={top.b}
          countryId={source.countryId}
          config={config}
        />
      )}
      {top.kind === "docPair" && (
        <DocPairPanel data={data} source={source} a={top.a} b={top.b} onOpenPair={openPair} />
      )}
      {top.kind === "commitment" && <CommitmentPanel data={data} id={top.id} onOpenPair={openPair} />}
      {top.kind === "theme" && <ThemePanel data={data} type={top.type} name={top.name} />}
    </DrawerShell>
  );
}
