"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DrawerHeader, DrawerShell } from "@/components/ui/drawer-shell";
import { FeedbackControl } from "@/components/dashboard/coherence-briefing/feedback-control";
import { findDocPair, partnersOf, strongestAligned, toneCounts, toneOf, type ToneCounts } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import type { FoundPair } from "@/lib/brief/pair";
import { docCodeSegments, firstSentence } from "@/lib/brief/text";
import type { BriefCommitment, BriefDocument, BriefSource } from "@/lib/brief/source";
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

/** The AI's own confidence in a reading, as the app words it. */
function confidenceLabel(tc: (key: "high" | "medium" | "low") => string, value?: string | null): string | null {
  return value === "high" || value === "medium" || value === "low" ? tc(value) : null;
}

/** An AI section's heading, with the AI's confidence beside it. */
function AiHeading({ label, confidence }: { label: string; confidence: string | null }) {
  return (
    <h3 className="brief-panel-h">
      {label}
      {confidence && (
        <>
          <span className="brief-panel-sep" aria-hidden="true">
            {" · "}
          </span>
          <span className="brief-panel-conf">{confidence}</span>
        </>
      )}
    </h3>
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

/** A document's name with its colour from the builder. */
function DocMark({ doc }: { doc: BriefDocument }) {
  return (
    <span className="brief-panel-docmark">
      <span className="brief-panel-swatch" style={{ background: doc.color }} aria-hidden="true" />
      {doc.name}
    </span>
  );
}

/**
 * Target pairs between two documents as a table: the first document's
 * target on the left, the second's on the right, under their names, each
 * row marked with the rating's ink (solid green, dashed red).
 */
function PairRows({
  rows,
  tone,
  docs,
  testId,
  mechanismOf,
  onOpen,
}: {
  rows: LinkRow[];
  tone: "reinforce" | "apart";
  docs: [BriefDocument, BriefDocument];
  testId: string;
  mechanismOf?: (m: string) => string;
  onOpen: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, PAIR_PREVIEW);
  if (rows.length === 0) return null;
  return (
    <>
      <p className="brief-panel-cols" data-testid="brief-docpair-cols" aria-hidden="true">
        <span />
        <DocMark doc={docs[0]} />
        <DocMark doc={docs[1]} />
      </p>
      <ol className="brief-panel-rows brief-panel-pairrows">
        {shown.map((r) => {
          const [left, right] = r.a.doc === docs[0].id ? [r.a, r.b] : [r.b, r.a];
          return (
            <li key={r.key} className="brief-panel-row" data-testid={testId}>
              <button type="button" onClick={() => onOpen(r.a.id, r.b.id)}>
                <span className={`brief-panel-mark brief-panel-mark-${tone}`} aria-hidden="true" />
                <span className="brief-panel-cell" data-testid="brief-docpair-cell">
                  <span className="brief-sr-only">{docs[0].name}: </span>
                  {commitmentLine(left)}
                </span>
                <span className="brief-panel-cell" data-testid="brief-docpair-cell">
                  <span className="brief-sr-only">{docs[1].name}: </span>
                  {commitmentLine(right)}
                </span>
                {r.mechanism && mechanismOf && <span className="brief-panel-row-type">{mechanismOf(r.mechanism)}</span>}
              </button>
            </li>
          );
        })}
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
  const tc = useTranslations("labels.confidence");
  const td = useTranslations("briefing.drawer.pair");
  const { pct } = useNumbers();
  const stat = findDocPair(data.pairs, a, b);
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
  const docA = data.scope.docs.find((d) => d.id === a);
  const docB = data.scope.docs.find((d) => d.id === b);
  const docs = docA && docB ? ([docA, docB] as [BriefDocument, BriefDocument]) : null;
  return (
    <>
      <DrawerHeader>
        {/* Two documents compared: one name per line, each with its colour. */}
        <h2 className="brief-panel-title brief-panel-title-pair">
          {docs ? (
            <>
              <span className="brief-panel-pairdoc" data-testid="brief-docpair-doc">
                <span className="brief-panel-swatch" style={{ background: docs[0].color }} aria-hidden="true" />
                {docs[0].name}
              </span>
              <span className="brief-sr-only"> {t("and")} </span>
              <span className="brief-panel-pairdoc" data-testid="brief-docpair-doc">
                <span className="brief-panel-swatch" style={{ background: docs[1].color }} aria-hidden="true" />
                {docs[1].name}
              </span>
            </>
          ) : (
            title
          )}
        </h2>
        {stat && <ResultStrip label={title} counts={stat.counts} />}
        {stat && (
          <p className="brief-panel-sub">
            {t("docPairCounts", {
              total: stat.counts.total,
              aligned: pct(stat.counts.total > 0 ? stat.counts.reinforce / stat.counts.total : 0),
              partial: pct(stat.counts.total > 0 ? stat.counts.partial / stat.counts.total : 0),
              apart: pct(stat.counts.total > 0 ? stat.counts.apart / stat.counts.total : 0),
            })}
          </p>
        )}
      </DrawerHeader>
      <div className="brief-panel-body">
        {note && (
          <section>
            <AiHeading label={t("aiReading")} confidence={confidenceLabel(tc, note.confidence)} />
            <p className="brief-panel-lead">
              <AiText text={note.title} docs={source.documents} />
            </p>
            <NoteLine label={t("whereAlign")} text={note.align} docs={source.documents} />
            <NoteLine label={t("whereDiverge")} text={note.diverge} docs={source.documents} />
            <p className="brief-panel-caveat">{td("aiDisclaimer")}</p>
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
          {docs && (
            <PairRows
              tone="reinforce"
              testId="brief-aligned-pair-row"
              docs={docs}
              onOpen={onOpenPair}
              rows={aligned.map((x) => ({ key: `${x.a.id}__${x.b.id}`, a: x.a, b: x.b }))}
            />
          )}
        </section>
        <section>
          <h3 className="brief-panel-h">{t("docPairLead", { count: strands.length })}</h3>
          {docs && (
            <PairRows
              tone="apart"
              testId="brief-strand-row"
              docs={docs}
              onOpen={onOpenPair}
              mechanismOf={(m) => tm(m)}
              rows={strands.flatMap((s) => {
                const x = byId.get(s.pair.targetAId);
                const y = byId.get(s.pair.targetBId);
                return x && y ? [{ key: s.pairKey, a: x, b: y, mechanism: s.pair.mechanism ?? undefined }] : [];
              })}
            />
          )}
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
  const tc = useTranslations("labels.confidence");
  const td = useTranslations("briefing.drawer.theme");
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
        <PanelTitle
          title={name}
          sub={
            <>
              <span className="brief-panel-sub-line">{tt(`count.${tone}`, { count: row.count })}</span>
              <span className="brief-panel-sub-line">{t(`themeKind.${type}`)}</span>
            </>
          }
        />
      </DrawerHeader>
      <div className="brief-panel-body">
        <section>
          <AiHeading label={t("themeSummary")} confidence={confidenceLabel(tc, row.storyline.confidence)} />
          <p className="brief-panel-text">
            <AiText text={row.storyline.description} docs={docNames} />
          </p>
          {resources && <p className="brief-panel-meta">{resources}</p>}
          {!section.exact && <p className="brief-panel-caveat">{tt("notExact")}</p>}
          <p className="brief-panel-caveat">{td("aiDisclaimer")}</p>
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
