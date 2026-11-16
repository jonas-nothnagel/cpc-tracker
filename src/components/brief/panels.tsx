"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DrawerHeader, DrawerShell } from "@/components/ui/drawer-shell";
import { FeedbackControl } from "@/components/dashboard/coherence-briefing/feedback-control";
import { areaPairDetail, lensAreas, OTHER_AREA, type AreaSide } from "@/lib/brief/areas";
import { findDocPair, partnersOf, strongestAligned, toneCounts, toneOf, type ToneCounts } from "@/lib/brief/compute";
import type { BriefData } from "@/lib/brief/data";
import type { FoundPair } from "@/lib/brief/pair";
import type { BriefCommitment, BriefDocument, BriefSource, LensId } from "@/lib/brief/source";
import { slugifyAnchorId } from "@/lib/feedback/anchor";
import { strandsByPathway } from "@/lib/pulse/strands";
import { AiHeading, AiText, confidenceLabel, Explanation, FirstSentence, HeadingTag, type DocNames } from "./ai-text";
import { Comparison, type ComparisonSide } from "./comparison";
import { BothContracts } from "./both-contracts";
import { briefQuery, type BriefOrigin } from "@/lib/brief/origin";
import { ExamplePairView } from "./example-pair";
import { commitmentLine, useNumbers } from "./ink";
import { ResultBar } from "./sections/documents";
import { useResourceLine } from "./sections/themes";

export type PanelState =
  | { kind: "pair"; a: string; b: string }
  | { kind: "docPair"; a: string; b: string }
  | { kind: "commitment"; id: string }
  | { kind: "theme"; type: "reinforcement" | "friction"; name: string }
  | { kind: "areaPair"; lens: LensId; key: string; side: AreaSide };

/** Commitment lists show this many before "Show all". */
const LIST_PREVIEW = 12;
/** Target-pair lists in a document pair show this many before "Show all". */
const PAIR_PREVIEW = 5;
/** A comparison that takes longer than this to load says so. */
const SLOW_MS = 2000;

function keyOf(p: PanelState): string {
  switch (p.kind) {
    case "pair":
      return `pair:${p.a}:${p.b}`;
    case "docPair":
      return `docs:${p.a}:${p.b}`;
    case "commitment":
      return `c:${p.id}`;
    case "areaPair":
      return `area:${p.lens}:${p.side}:${p.key}`;
    default:
      return `theme:${p.type}:${p.name}`;
  }
}

/** Every panel opens the same way: what it belongs to in a plain grey line
 *  (a document, the kind of theme), its title in serif, and one plain line
 *  of figures under it. */
function PanelTitle({ context, title, sub }: { context?: ReactNode; title: ReactNode; sub?: ReactNode }) {
  return (
    <>
      {context && <p className="brief-panel-context">{context}</p>}
      <h2 className="brief-panel-title">{title}</h2>
      {sub && <p className="brief-panel-sub">{sub}</p>}
    </>
  );
}

/** Target pairs by rating as the brief's result bar, named in place: its
 *  unit above it, each side's share in words under its own end (potential
 *  misalignment from the left, alignment from the right). The words are what
 *  a screen reader reads; the bar itself is for the eye. */
function PanelResult({ unit, counts }: { unit: string; counts: ToneCounts }) {
  const tt = useTranslations("brief.tone");
  const { pct } = useNumbers();
  const share = (v: number) => pct(counts.total > 0 ? v / counts.total : 0);
  const part = (tone: "apart" | "partial" | "reinforce") => (
    <li key={tone}>
      <span className="brief-panel-result-n">{share(counts[tone])}</span> {tt(tone)}
    </li>
  );
  return (
    <div className="brief-panel-result" data-testid="brief-panel-result">
      <p className="brief-panel-result-unit">{unit}</p>
      <ResultBar counts={counts} ends={false} />
      <ul className="brief-panel-result-key">
        {part("apart")}
        {counts.partial > 0 && part("partial")}
        {part("reinforce")}
      </ul>
    </div>
  );
}

/** The AI's hedged starting point inside its reading: its own heading, with
 *  the caveat beside it. */
function Pathway({ text, docs }: { text: string; docs: DocNames }) {
  const t = useTranslations("brief.panel");
  return (
    <div className="brief-panel-pathway">
      <h4 className="brief-panel-note-label">
        <HeadingTag label={t("pathwayTitle")} tag={t("pathwayTag")} />
      </h4>
      <p className="brief-panel-text">
        <AiText text={text} docs={docs} />
      </p>
    </div>
  );
}

/** The line that joins two targets in a row, in the rating's ink: solid
 *  green aligned, dashed red potential misalignment (the dash carries the
 *  difference without colour), as between the two texts of a comparison. */
function PairLine({ tone }: { tone: "reinforce" | "apart" }) {
  return <span className={`brief-panel-link brief-panel-link-${tone}`} aria-hidden="true" />;
}

function PairPanel({
  data,
  docs,
  a,
  b,
  origin,
}: {
  data: BriefData;
  docs: DocNames;
  a: string;
  b: string;
  origin: BriefOrigin;
}) {
  const countryId = origin.countryId;
  const t = useTranslations("brief.panel");
  const tp = useTranslations("briefing.drawer.pair");
  const tm = useTranslations("labels.contradictionType");
  const locale = useLocale();
  const resourceLine = useResourceLine();
  const [state, setState] = useState<{ status: "loading" | "error" | "ok"; found?: FoundPair }>({
    status: "loading",
  });
  // The loading line only once the wait is noticeable, never on every click.
  const [slow, setSlow] = useState(false);
  const query = briefQuery(origin, { a, b, locale }).toString();
  // Mounted once per comparison (keyed by the caller), so it starts loading.
  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    fetch(`/api/brief/pair?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<FoundPair>) : Promise.reject(new Error())))
      .then((found) => alive && setState({ status: "ok", found }))
      .catch(() => alive && setState({ status: "error" }));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);

  if (state.status !== "ok" || !state.found) {
    return (
      <>
        <DrawerHeader>
          <PanelTitle title={t("pairDialog")} />
        </DrawerHeader>
        <div className="brief-panel-body">
          {/* Mounted from the start, so a screen reader announces the text when it appears. */}
          <p className="brief-panel-caveat" role="status">
            {state.status === "error" ? t("error") : slow ? t("loading") : null}
          </p>
        </div>
      </>
    );
  }
  const { pair, targetA, targetB } = state.found;
  const docOf = (id: string) => data.scope.docs.find((d) => d.id === id);
  // The brief's own texts (and translation flags); the stored ones if absent.
  const commitmentOf = (target: FoundPair["targetA"]): BriefCommitment =>
    data.scope.commitments.find((c) => c.id === target.id) ?? {
      id: target.id,
      doc: target.sourceDocument,
      label: target.sourceLabel ?? target.id,
      text: target.text,
    };
  const sideOf = (c: BriefCommitment): ComparisonSide => ({
    label: c.label,
    text: c.text,
    docName: docOf(c.doc)?.name ?? c.doc,
    color: docOf(c.doc)?.color ?? "#94a3b8",
  });
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
        <Comparison first={sideOf(commitmentOf(targetA))} second={sideOf(commitmentOf(targetB))} tone={toneOf(pair.alignment)} />
        {pair.description && (
          <Explanation text={pair.description} docs={docs} confidence={pair.confidence} className="brief-panel-ai">
            {resources && <p className="brief-panel-meta">{resources}</p>}
            {pair.descriptionTranslationPending && (
              <p className="brief-panel-caveat">{tp("rationaleTranslationPending")}</p>
            )}
            <p className="brief-panel-caveat">{tp("aiRationaleDisclaimer")}</p>
          </Explanation>
        )}
        {state.found.both && <BothContracts both={state.found.both} countryId={countryId} />}
      </div>
      {pair.description && (
        <FeedbackControl
          variant="bar"
          look="brief"
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
  return (
    <div className="brief-panel-note">
      <h4 className="brief-panel-note-label">{label}</h4>
      <FirstSentence text={text} docs={docs} />
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
 * target on the left, the second's on the right, under their names, the two
 * joined by the rating's line (solid green, dashed red).
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
        <DocMark doc={docs[0]} />
        <span />
        <DocMark doc={docs[1]} />
      </p>
      <ol className="brief-panel-rows brief-panel-pairrows">
        {shown.map((r) => {
          const [left, right] = r.a.doc === docs[0].id ? [r.a, r.b] : [r.b, r.a];
          return (
            <li key={r.key} className="brief-panel-row" data-testid={testId}>
              <button type="button" onClick={() => onOpen(r.a.id, r.b.id)}>
                <span className="brief-panel-cell" data-testid="brief-docpair-cell">
                  <span className="brief-sr-only">{docs[0].name}: </span>
                  {commitmentLine(left)}
                </span>
                <PairLine tone={tone} />
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
 * A pair of documents: the result bar, the pipeline's AI reading as one
 * block (first sentences, the rest on request, the hedged starting point and
 * the caveat), then the strongest aligned pairs and the potential
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
  const th = useTranslations("brief.hub");
  const tm = useTranslations("labels.contradictionType");
  const tc = useTranslations("labels.confidence");
  const td = useTranslations("briefing.drawer.pair");
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
      </DrawerHeader>
      <div className="brief-panel-body">
        {stat && (
          <PanelResult unit={th("centerPairs", { count: stat.counts.total })} counts={stat.counts} />
        )}
        {note && (
          <section className="brief-panel-ai">
            <AiHeading label={t("aiReading")} confidence={confidenceLabel(tc, note.confidence)} />
            <p className="brief-panel-lead">
              <AiText text={note.title} docs={source.documents} />
            </p>
            <NoteLine label={t("whereAlign")} text={note.align} docs={source.documents} />
            <NoteLine label={t("whereDiverge")} text={note.diverge} docs={source.documents} />
            {note.hint && <Pathway text={note.hint} docs={source.documents} />}
            <p className="brief-panel-caveat">{td("aiDisclaimer")}</p>
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
          look="brief"
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
      <ul className="brief-panel-rows brief-panel-linkrows">
        {shown.map((p) => (
          <li key={p.id} className="brief-panel-row">
            <button type="button" onClick={() => onOpen(p.id)}>
              <PairLine tone={tone} />
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
  const te = useTranslations("brief.explore");
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
        <PanelTitle context={docName(commitment.doc)} title={commitment.label} />
      </DrawerHeader>
      <div className="brief-panel-body">
        {commitment.text.trim() !== commitment.label.trim() && (
          <p className="brief-panel-quote-text">{commitment.text}</p>
        )}
        {counts.total > 0 && (
          <PanelResult unit={te("targetFigures", { pairs: counts.total })} counts={counts} />
        )}
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
          context={t(`themeKind.${type}`)}
          title={name}
          sub={tt(`count.${tone}`, { count: row.count })}
        />
      </DrawerHeader>
      <div className="brief-panel-body">
        <section className="brief-panel-ai">
          <AiHeading label={t("themeSummary")} confidence={confidenceLabel(tc, row.storyline.confidence)} />
          <p className="brief-panel-text">
            <AiText text={row.storyline.description} docs={docNames} />
          </p>
          {resources && <p className="brief-panel-meta">{resources}</p>}
          {!section.exact && <p className="brief-panel-caveat">{tt("notExact")}</p>}
          {row.storyline.pathway && <Pathway text={row.storyline.pathway} docs={docNames} />}
          <p className="brief-panel-caveat">{td("aiDisclaimer")}</p>
        </section>
        {row.example && (
          <ExamplePairView example={row.example} tone={tone} docs={data.scope.docs} onOpenPair={onOpenPair} />
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
          look="brief"
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

/** A pair of policy areas: the side's target pairs between them, those of
 *  the most involved targets first, each a way to its comparison. The
 *  area's own target stands on the left. */
function AreaPairPanel({
  data,
  source,
  lens,
  pairKey,
  side,
  onOpenPair,
}: {
  data: BriefData;
  source: BriefSource;
  lens: LensId;
  pairKey: string;
  side: AreaSide;
  onOpenPair: (aId: string, bId: string) => void;
}) {
  const t = useTranslations("brief.areaView");
  const tp = useTranslations("brief.panel");
  const [all, setAll] = useState(false);
  const areas = useMemo(() => lensAreas(source, data.scope, lens), [source, data.scope, lens]);
  const detail = useMemo(() => areaPairDetail(areas, data.scope, side, pairKey), [areas, data.scope, side, pairKey]);
  const areaOf = useMemo(
    () => new Map(areas.areas.flatMap((x) => x.targets.map((id) => [id, x.id] as [string, string]))),
    [areas],
  );
  const [a, b] = pairKey.split("|");
  const nameOf = (id: string) => areas.areas.find((x) => x.id === id)?.name ?? id;
  const docName = (doc: string) => data.scope.docs.find((d) => d.id === doc)?.name ?? doc;
  const shown = all ? detail.rows : detail.rows.slice(0, LIST_PREVIEW);
  const cell = (c: BriefCommitment) => (
    <span className="brief-panel-cell">
      <span className="brief-panel-row-doc">{docName(c.doc)} · </span>
      {commitmentLine(c)}
    </span>
  );
  return (
    <>
      <DrawerHeader>
        <h2 className="brief-panel-title brief-panel-title-pair">
          {a === b ? (
            t("within", { area: nameOf(a) })
          ) : (
            <>
              <span className="brief-panel-pairdoc" data-testid="brief-areapair-area">
                {nameOf(a)}
              </span>
              <span className="brief-sr-only"> {tp("and")} </span>
              <span className="brief-panel-pairdoc" data-testid="brief-areapair-area">
                {b === OTHER_AREA ? t("outsideShort") : nameOf(b)}
              </span>
            </>
          )}
        </h2>
        <p className="brief-panel-sub">{t("panelSub", { count: detail.rows.length, pairs: detail.pairs, side })}</p>
      </DrawerHeader>
      <div className="brief-panel-body">
        <ol className="brief-panel-rows brief-panel-pairrows">
          {shown.map((c) => {
            const [left, right] = areaOf.get(c.a.id) === a ? [c.a, c.b] : [c.b, c.a];
            return (
              <li key={`${c.a.id}__${c.b.id}`} className="brief-panel-row" data-testid="brief-areapair-row">
                <button type="button" onClick={() => onOpenPair(c.a.id, c.b.id)}>
                  {cell(left)}
                  <PairLine tone={side} />
                  {cell(right)}
                </button>
              </li>
            );
          })}
        </ol>
        {!all && detail.rows.length > LIST_PREVIEW && (
          <button type="button" className="brief-panel-more brief-panel-show-all" onClick={() => setAll(true)}>
            {tp("showAll", { count: detail.rows.length })}
          </button>
        )}
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
  const ta = useTranslations("brief.areaView");
  const top = stack[stack.length - 1];
  if (!top) return null;
  const openPair = (a: string, b: string) => onPush({ kind: "pair", a, b });
  const dialogLabel =
    top.kind === "pair"
      ? t("pairDialog")
      : top.kind === "areaPair"
        ? ta("panelDialog")
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
      scrim="light"
    >
      {top.kind === "pair" && (
        <PairPanel
          key={keyOf(top)}
          data={data}
          docs={source.documents}
          a={top.a}
          b={top.b}
          origin={source}
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
      {top.kind === "areaPair" && (
        <AreaPairPanel
          key={keyOf(top)}
          data={data}
          source={source}
          lens={top.lens}
          pairKey={top.key}
          side={top.side}
          onOpenPair={openPair}
        />
      )}
    </DrawerShell>
  );
}
