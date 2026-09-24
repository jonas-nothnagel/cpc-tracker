"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DrawerHeader, DrawerShell } from "@/components/ui/drawer-shell";
import { FeedbackControl } from "@/components/dashboard/coherence-briefing/feedback-control";
import { partnersOf, strongestAligned, toneCounts, toneOf, type ToneCounts } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import type { FoundPair } from "@/lib/brief/pair";
import { docCodeSegments, firstSentence } from "@/lib/brief/text";
import type { BriefCommitment, BriefSource } from "@/lib/brief/source";
import { slugifyAnchorId } from "@/lib/feedback/anchor";
import { strandsByPathway } from "@/lib/pulse/strands";
import type { AlignmentLevel } from "@/types";
import { ExamplePairView } from "./example-pair";
import { commitmentLine, useNumbers } from "./ink";
import { ResultBar } from "./sections/documents";
import { useResourceLine } from "./sections/themes";

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

/** The ink of a rating: the line between two quotes, the mark on a row. */
function inkOf(level: AlignmentLevel): "reinforce" | "partial" | "apart" | "none" {
  return toneOf(level);
}

type DocNames = { id: string; name: string }[];

/** An AI text as written, with each document code it uses explained in a
 *  tooltip ("FSS": Food Supply and Security Measures). */
function AiText({ text, docs }: { text: string; docs: DocNames }) {
  return (
    <>
      {docCodeSegments(text, docs).map((seg, i) =>
        typeof seg === "string" ? (
          seg
        ) : (
          <abbr key={i} title={seg.name}>
            {seg.code}
          </abbr>
        ),
      )}
    </>
  );
}

/** The panel's title: the finding in serif, and one plain line under it. */
function PanelTitle({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <>
      <h2 className="brief-panel-title">{title}</h2>
      {sub && <p className="brief-panel-sub">{sub}</p>}
      {children}
    </>
  );
}

/** Target pairs by rating as the brief's result bar: potential
 *  misalignment from the left, alignment from the right. */
function ResultStrip({ label, counts }: { label: string; counts: ToneCounts }) {
  const t = useTranslations("brief.documents");
  const { pct } = useNumbers();
  const share = (v: number) => pct(counts.total > 0 ? v / counts.total : 0);
  return (
    <div
      className="brief-panel-result"
      role="img"
      aria-label={t("docRow", {
        doc: label,
        aligned: share(counts.reinforce),
        apart: share(counts.apart),
        total: counts.total,
      })}
    >
      <ResultBar counts={counts} />
    </div>
  );
}

function PanelQuote({ c, docName }: { c: BriefCommitment; docName: string }) {
  return (
    <blockquote className="brief-panel-quote">
      <p className="brief-panel-quote-source">
        {docName} · <span className="brief-panel-quote-label">{c.label}</span>
      </p>
      <p className="brief-panel-quote-text">{c.text}</p>
    </blockquote>
  );
}

function PairPanel({
  data,
  docs,
  a,
  b,
  countryId,
}: {
  data: BriefData;
  docs: DocNames;
  a: string;
  b: string;
  countryId: string;
}) {
  const t = useTranslations("brief.panel");
  const tp = useTranslations("briefing.drawer.pair");
  const tm = useTranslations("labels.contradictionType");
  const locale = useLocale();
  const resourceLine = useResourceLine();
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
          <PanelTitle title={t("pairDialog")} />
        </DrawerHeader>
        <div className="brief-panel-body">
          <p className="brief-panel-caveat">{state.status === "error" ? t("error") : t("loading")}</p>
        </div>
      </>
    );
  }
  const { pair, targetA, targetB } = state.found;
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  // The brief's own texts (and translation flags); the stored ones if absent.
  const commitmentOf = (target: FoundPair["targetA"]): BriefCommitment =>
    data.scope.commitments.find((c) => c.id === target.id) ?? {
      id: target.id,
      doc: target.sourceDocument,
      label: target.sourceLabel ?? target.id,
      text: target.text,
    };
  const x = commitmentOf(targetA);
  const y = commitmentOf(targetB);
  const flagged = pair.alignment === "flagged";
  const resources =
    flagged && pair.mechanism === "resource_competition" ? resourceLine(pair.contestedResources ?? []) : null;
  return (
    <>
      <DrawerHeader>
        <PanelTitle
          title={t(`rating.${pair.alignment}`)}
          sub={flagged && pair.mechanism ? tm(pair.mechanism) : undefined}
        />
      </DrawerHeader>
      <div className="brief-panel-body">
        <div className="brief-panel-pair">
          <PanelQuote c={x} docName={docName(x.doc)} />
          <span className={`brief-panel-link brief-panel-link-${inkOf(pair.alignment)}`} aria-hidden="true" />
          <PanelQuote c={y} docName={docName(y.doc)} />
        </div>
        {pair.description && (
          <section>
            <h3 className="brief-panel-h">{t("aiExplanation")}</h3>
            <p className="brief-panel-text">
              <AiText text={pair.description} docs={docs} />
            </p>
            {resources && <p className="brief-panel-meta">{resources}</p>}
            {pair.descriptionTranslationPending && (
              <p className="brief-panel-caveat">{tp("rationaleTranslationPending")}</p>
            )}
            <p className="brief-panel-caveat">{tp("aiRationaleDisclaimer")}</p>
          </section>
        )}
      </div>
      {pair.description && (
        <FeedbackControl
          variant="bar"
          countryId={countryId}
          surface="target_pair_rationale"
          anchorIds={[pair.targetAId, pair.targetBId]}
          contentText={pair.description}
          context={{
            alignment: pair.alignment,
            mechanism: pair.mechanism,
            confidence: pair.confidence,
            manageability: pair.manageability,
          }}
        />
      )}
    </>
  );
}

/** One labelled AI line: the first sentence, the rest on request. */
function NoteLine({ label, text, docs }: { label: string; text: string; docs: DocNames }) {
  const t = useTranslations("brief.panel");
  const [more, setMore] = useState(false);
  const { first, rest } = firstSentence(text);
  return (
    <div className="brief-panel-note">
      <h4 className="brief-panel-note-label">{label}</h4>
      <p className="brief-panel-text">
        <AiText text={more ? text : first} docs={docs} />
        {rest && !more && (
          <>
            {" "}
            <button type="button" className="brief-panel-more" onClick={() => setMore(true)}>
              {t("more")}
            </button>
          </>
        )}
      </p>
    </div>
  );
}

interface LinkRow {
  key: string;
  a: BriefCommitment;
  b: BriefCommitment;
  mechanism?: string;
}

/** Target pairs as rows: both targets, one line each, marked with the
 *  rating's ink (solid green, dashed red). */
function PairRows({
  rows,
  tone,
  docName,
  testId,
  mechanismOf,
  onOpen,
}: {
  rows: LinkRow[];
  tone: "reinforce" | "apart";
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
      <ol className="brief-panel-rows">
        {shown.map((r) => (
          <li key={r.key} className="brief-panel-row" data-testid={testId}>
            <button type="button" onClick={() => onOpen(r.a.id, r.b.id)}>
              <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
              <span className="brief-panel-row-main">
                <span className="brief-panel-row-line">
                  <span className="brief-panel-row-doc">{docName(r.a.doc)} · </span>
                  {commitmentLine(r.a)}
                </span>
                <span className="brief-panel-row-line">
                  <span className="brief-panel-row-doc">{docName(r.b.doc)} · </span>
                  {commitmentLine(r.b)}
                </span>
                {r.mechanism && mechanismOf && <span className="brief-panel-row-type">{mechanismOf(r.mechanism)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      {!all && rows.length > PAIR_PREVIEW && (
        <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
          {t("showAll", { count: rows.length })}
        </button>
      )}
    </>
  );
}

/**
 * A pair of documents: the result bar, the pipeline's AI reading (first
 * sentences, the rest on request), a hedged starting point, then the
 * strongest aligned pairs and the potential misalignments, most frequent
 * targets first.
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
  const stat = data.pairs.find((p) => (p.a.id === a && p.b.id === b) || (p.a.id === b && p.b.id === a));
  const note =
    (source.pairNotes ?? []).find((n) => (n.a === a && n.b === b) || (n.a === b && n.b === a)) ?? null;
  const strands = useMemo(() => {
    const byPathway = strandsByPathway(
      data.scope.alignment,
      data.scope.targets,
      source.documents.map((d) => d.id),
    );
    return byPathway.get(`${a}~${b}`) ?? byPathway.get(`${b}~${a}`) ?? [];
  }, [data.scope, source.documents, a, b]);
  const aligned = useMemo(() => strongestAligned(data.scope, a, b), [data.scope, a, b]);
  const docName = (id: string) => data.scope.docs.find((d) => d.id === id)?.name ?? id;
  const title = t("docPairDialog", { docA: docName(a), docB: docName(b) });
  const byId = new Map(data.scope.commitments.map((x) => [x.id, x]));
  return (
    <>
      <DrawerHeader>
        <PanelTitle title={title}>{stat && <ResultStrip label={title} counts={stat.counts} />}</PanelTitle>
      </DrawerHeader>
      <div className="brief-panel-body">
        {note && (
          <section>
            <h3 className="brief-panel-h">{t("aiReading")}</h3>
            <p className="brief-panel-lead">
              <AiText text={note.title} docs={source.documents} />
            </p>
            <NoteLine label={t("whereAlign")} text={note.align} docs={source.documents} />
            <NoteLine label={t("whereDiverge")} text={note.diverge} docs={source.documents} />
          </section>
        )}
        {note?.hint && (
          <section>
            <h3 className="brief-panel-h">{t("pathwayTitle")}</h3>
            <p className="brief-panel-text">
              <AiText text={note.hint} docs={source.documents} />
            </p>
            <p className="brief-panel-caveat">{t("pathwayCaveat")}</p>
          </section>
        )}
        <section>
          <h3 className="brief-panel-h">{t("alignedPairs", { count: aligned.length })}</h3>
          <PairRows
            tone="reinforce"
            testId="brief-aligned-pair-row"
            docName={docName}
            onOpen={onOpenPair}
            rows={aligned.map((x) => ({ key: `${x.a.id}__${x.b.id}`, a: x.a, b: x.b }))}
          />
        </section>
        <section>
          <h3 className="brief-panel-h">{t("docPairLead", { count: strands.length })}</h3>
          <PairRows
            tone="apart"
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
      {/* One control for the whole AI reading, as on the dashboard: the
          reading is a single output and a single verdict to rate. */}
      {note && (
        <FeedbackControl
          variant="bar"
          countryId={source.countryId}
          surface="doc_pair_synthesis"
          anchorIds={[note.a, note.b]}
          contentText={[note.title, note.align, note.diverge, note.hint].join("\n")}
          context={note.confidence ? { synthesisConfidence: note.confidence } : undefined}
        />
      )}
    </>
  );
}

function CommitmentList({
  items,
  tone,
  docName,
  onOpen,
}: {
  items: { id: string; doc: string; label: string; text: string }[];
  tone: "reinforce" | "apart";
  docName: (id: string) => string;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIST_PREVIEW);
  return (
    <>
      <ul className="brief-panel-rows">
        {shown.map((p) => (
          <li key={p.id} className="brief-panel-row">
            <button type="button" onClick={() => onOpen(p.id)}>
              <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
              <span className="brief-panel-row-line">
                <span className="brief-panel-row-doc">{docName(p.doc)} · </span>
                {commitmentLine(p)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!all && items.length > LIST_PREVIEW && (
        <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
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
  const counts = useMemo(
    () => toneCounts(data.scope.comparisons.filter((c) => c.a.id === id || c.b.id === id)),
    [data.scope, id],
  );
  const docName = (doc: string) => data.scope.docs.find((d) => d.id === doc)?.name ?? doc;
  if (!commitment) return null;
  return (
    <>
      <DrawerHeader>
        <PanelTitle title={commitment.label} sub={docName(commitment.doc)} />
      </DrawerHeader>
      <div className="brief-panel-body">
        <p className="brief-panel-quote-text">{commitment.text}</p>
        {counts.total > 0 && <ResultStrip label={commitment.label} counts={counts} />}
        <section>
          <h3 className="brief-panel-h">{t("worksAgainst", { count: partners.apart.length })}</h3>
          <CommitmentList
            items={partners.apart}
            tone="apart"
            docName={docName}
            onOpen={(p) => onOpenPair(id, p)}
          />
        </section>
        <section>
          <h3 className="brief-panel-h">{t("worksWith", { count: partners.reinforce.length })}</h3>
          <CommitmentList
            items={partners.reinforce}
            tone="reinforce"
            docName={docName}
            onOpen={(p) => onOpenPair(id, p)}
          />
        </section>
      </div>
    </>
  );
}

function ThemePanel({
  data,
  docs: docNames,
  countryId,
  type,
  name,
  onOpenPair,
}: {
  data: BriefData;
  docs: DocNames;
  countryId: string;
  type: "reinforcement" | "friction";
  name: string;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const tt = useTranslations("brief.themes");
  const { pct } = useNumbers();
  const resourceLine = useResourceLine();
  const tone = type === "reinforcement" ? "reinforce" : "apart";
  const section = type === "reinforcement" ? data.together : data.apart;
  const row = section.rows.find((r) => r.storyline.name === name);
  if (!row) return null;
  const docs = data.scope.docs
    .map((d) => ({ doc: d, share: row.docShares[d.id] ?? 0 }))
    .filter((x) => x.share > 0)
    .sort((x, y) => y.share - x.share);
  const largest = Math.max(0.0001, ...docs.map((d) => d.share));
  const resources =
    tone === "apart" ? resourceLine((row.storyline.aggregates?.contested_resources ?? []).map((r) => r.resource)) : null;
  const anchor = slugifyAnchorId(name);
  return (
    <>
      <DrawerHeader>
        <PanelTitle title={name} sub={tt(`count.${tone}`, { count: row.count })} />
      </DrawerHeader>
      <div className="brief-panel-body">
        <section>
          <h3 className="brief-panel-h">{t("themeSummary")}</h3>
          <p className="brief-panel-text">
            <AiText text={row.storyline.description} docs={docNames} />
          </p>
          {resources && <p className="brief-panel-meta">{resources}</p>}
          {!section.exact && <p className="brief-panel-caveat">{tt("notExact")}</p>}
        </section>
        {row.example && (
          <ExamplePairView example={row.example} tone={tone} docs={data.scope.docs} onOpenPair={onOpenPair} />
        )}
        {row.storyline.pathway && (
          <section>
            <h3 className="brief-panel-h">{t("pathwayTitle")}</h3>
            <p className="brief-panel-text">
              <AiText text={row.storyline.pathway} docs={docNames} />
            </p>
            <p className="brief-panel-caveat">{t("pathwayCaveat")}</p>
          </section>
        )}
        <section>
          <h3 className="brief-panel-h">{t("themeDocs")}</h3>
          <ul className="brief-panel-rows">
            {docs.map(({ doc, share }) => (
              <li key={doc.id} className="brief-panel-share">
                <span title={doc.full}>{doc.name}</span>
                <span className={`brief-panel-share-bar brief-screen-${tone}`} aria-hidden="true">
                  <span style={{ width: `${((share / largest) * 100).toFixed(1)}%` }} />
                </span>
                <span className="brief-panel-share-value">{pct(share)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {/* Themes are named by the AI, so the anchor is the name's slug: a
          renamed theme starts fresh and the ledger keeps the old feedback. */}
      {anchor && (
        <FeedbackControl
          variant="bar"
          countryId={countryId}
          surface="corpus_storyline"
          anchorIds={[anchor]}
          contentText={row.storyline.description}
          context={{ storylineType: row.storyline.type, confidence: row.storyline.confidence }}
        />
      )}
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
          data={data}
          docs={source.documents}
          a={top.a}
          b={top.b}
          countryId={source.countryId}
        />
      )}
      {top.kind === "docPair" && (
        <DocPairPanel data={data} source={source} a={top.a} b={top.b} onOpenPair={openPair} />
      )}
      {top.kind === "commitment" && <CommitmentPanel data={data} id={top.id} onOpenPair={openPair} />}
      {top.kind === "theme" && (
        <ThemePanel
          key={keyOf(top)}
          data={data}
          docs={source.documents}
          countryId={source.countryId}
          type={top.type}
          name={top.name}
          onOpenPair={openPair}
        />
      )}
    </DrawerShell>
  );
}
