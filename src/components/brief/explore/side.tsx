"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ToneCounts } from "@/lib/brief/compute";
import type { BriefCommitment } from "@/lib/brief/source";
import { commitmentLine } from "../ink";
import { ResultBar } from "../sections/documents";
import { Expandable, GroupRow, MarkRows, RankRows, TargetLine, TargetRows, ToneKey } from "./rows";

export interface RankedRow {
  commitment: BriefCommitment;
  value: number;
}

export interface BrowseRow {
  /** Focus key of the group the row stands for. */
  key: string;
  name: string;
  meta: string;
  counts: ToneCounts;
  /** Its targets, in document order. */
  targets: BriefCommitment[];
}

/** A document (or policy area) to open: its name puts it in the centre, the
 *  chevron lists its targets, each of which can take the centre. */
function BrowseGroup({
  row,
  countsOf,
  onFocus,
  onHover,
  onHoverGroup,
}: {
  row: BrowseRow;
  countsOf: (id: string) => ToneCounts;
  onFocus: (key: string) => void;
  onHover: (id: string | null) => void;
  onHoverGroup: (key: string | null) => void;
}) {
  const t = useTranslations("brief.explore");
  const [open, setOpen] = useState(false);
  return (
    <li
      className="ex-browse-row"
      data-testid="explore-browse-row"
      data-open={open ? "true" : undefined}
      onPointerEnter={() => onHoverGroup(row.key)}
      onPointerLeave={() => onHoverGroup(null)}
    >
      <div className="ex-browse-head">
        <button
          type="button"
          className="ex-browse-toggle"
          aria-expanded={open}
          aria-label={t("showTargets", { name: row.name })}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="ex-chevron" aria-hidden="true" />
        </button>
        <button type="button" className="ex-browse-main" onClick={() => onFocus(row.key)}>
          <span className="ex-group-row-name">
            {row.name}
            <span className="ex-group-row-meta"> {row.meta}</span>
          </span>
        </button>
        {row.counts.total > 0 && (
          <span className="ex-group-row-bar" aria-hidden="true">
            <ResultBar counts={row.counts} />
          </span>
        )}
      </div>
      {open && (
        <TargetRows
          items={row.targets}
          countsOf={countsOf}
          onOpen={onFocus}
          onHover={onHover}
          testId="explore-browse-target"
        />
      )}
    </li>
  );
}

/** The column beside the resting ring: where potential misalignment
 *  concentrates, the targets to review first, the strongest alignments, and
 *  the documents (or policy areas) to open. */
export function RestColumn({
  headline,
  review,
  strongest,
  browseTitle,
  browse,
  countsOf,
  docName,
  onFocus,
  onHover,
  onHoverGroup,
}: {
  headline: string;
  review: RankedRow[];
  strongest: RankedRow[];
  browseTitle: string;
  browse: BrowseRow[];
  countsOf: (id: string) => ToneCounts;
  docName: (id: string) => string;
  onFocus: (key: string) => void;
  onHover: (id: string | null) => void;
  onHoverGroup: (key: string | null) => void;
}) {
  const t = useTranslations("brief.explore");
  return (
    <>
      <h2 className="ex-headline">{headline}</h2>
      {review.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("reviewFirst")}</h3>
          <Expandable
            items={review}
            render={(rows) => (
              <RankRows
                rows={rows}
                tone="apart"
                docName={docName}
                onOpen={onFocus}
                onHover={onHover}
                testId="explore-review-row"
              />
            )}
          />
        </section>
      )}
      {strongest.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("strongest")}</h3>
          <Expandable
            items={strongest}
            render={(rows) => (
              <RankRows
                rows={rows}
                tone="reinforce"
                docName={docName}
                onOpen={onFocus}
                onHover={onHover}
                testId="explore-strong-row"
              />
            )}
          />
        </section>
      )}
      {browse.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{browseTitle}</h3>
          <ol className="ex-group-rows">
            {browse.map((row) => (
              <BrowseGroup
                key={row.key}
                row={row}
                countsOf={countsOf}
                onFocus={onFocus}
                onHover={onHover}
                onHoverGroup={onHoverGroup}
              />
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function Nav({
  canGoBack,
  onBack,
  onClear,
  previous,
  next,
}: {
  canGoBack: boolean;
  onBack: () => void;
  onClear: () => void;
  /** Step to the target before or after, in the same document. */
  previous?: () => void;
  next?: () => void;
}) {
  const t = useTranslations("brief.explore");
  return (
    <nav className="ex-nav">
      {canGoBack && (
        <button type="button" className="ex-link" onClick={onBack}>
          {t("back")}
        </button>
      )}
      <button type="button" className="ex-link" onClick={onClear}>
        {t("clear")}
      </button>
      {(previous || next) && (
        <span className="ex-step">
          <button type="button" className="ex-link" onClick={previous} disabled={!previous}>
            <span aria-hidden="true">‹ </span>
            {t("previous")}
          </button>
          <button type="button" className="ex-link" onClick={next} disabled={!next}>
            {t("next")}
            <span aria-hidden="true"> ›</span>
          </button>
        </span>
      )}
    </nav>
  );
}

export interface PartnerRow {
  id: string;
  commitment: BriefCommitment;
  type?: string;
}

/** The column for one target in the centre: its text, how it reads against
 *  the rest, its potential misalignments and strong alignments. */
export function TargetColumn({
  item,
  docName,
  finding,
  counts,
  apart,
  strong,
  selected,
  onSelect,
  onHover,
  canGoBack,
  onBack,
  onClear,
  previous,
  next,
  pair,
}: {
  item: BriefCommitment;
  docName: (id: string) => string;
  finding: ReactNode;
  counts: ToneCounts;
  apart: PartnerRow[];
  strong: PartnerRow[];
  selected: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  canGoBack: boolean;
  onBack: () => void;
  onClear: () => void;
  previous?: () => void;
  next?: () => void;
  pair: ReactNode;
}) {
  const t = useTranslations("brief.explore");
  const [open, setOpen] = useState(false);
  const long = item.text.length > 240;
  const rows = (list: PartnerRow[]) =>
    list.map((p) => ({
      key: p.id,
      hover: p.id,
      lines: [<TargetLine key="t" c={p.commitment} docName={docName} />],
      type: p.type,
    }));
  return (
    <>
      <Nav canGoBack={canGoBack} onBack={onBack} onClear={onClear} previous={previous} next={next} />
      <p className="ex-focus-doc">{docName(item.doc)}</p>
      <h2 className="ex-focus-title">{commitmentLine(item, 140)}</h2>
      <p className="ex-focus-text" data-clamped={long && !open ? "true" : undefined}>
        {item.text}
      </p>
      {long && (
        <button type="button" className="brief-panel-more" onClick={() => setOpen((v) => !v)}>
          {open ? t("less") : t("more")}
        </button>
      )}
      <p className="ex-focus-finding">{finding}</p>
      {counts.total > 0 && <ToneKey counts={counts} />}
      {pair}
      {apart.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("apartList", { count: apart.length })}</h3>
          <Expandable
            items={apart}
            preview={8}
            render={(list) => (
              <MarkRows
                rows={rows(list)}
                tone="apart"
                selected={selected}
                onOpen={onSelect}
                onHover={onHover}
                testId="explore-apart-row"
              />
            )}
          />
        </section>
      )}
      {strong.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("strongList", { count: strong.length })}</h3>
          <Expandable
            items={strong}
            preview={8}
            render={(list) => (
              <MarkRows
                rows={rows(list)}
                tone="reinforce"
                selected={selected}
                onOpen={onSelect}
                onHover={onHover}
                testId="explore-strong-partner-row"
              />
            )}
          />
        </section>
      )}
    </>
  );
}

export interface GroupPair {
  a: BriefCommitment;
  b: BriefCommitment;
  type?: string;
}

export interface ArcRow {
  key: string;
  name: string;
  counts: ToneCounts;
  apart: GroupPair[];
  strong: GroupPair[];
}

export interface SeatPairs {
  seat: BriefCommitment;
  pairs: (GroupPair & { rating: string; tone: "reinforce" | "apart" | "ink" })[];
}

/** The column for a document or policy area in the centre: its figures, its
 *  relations with every other arc of the ring, and its own targets to
 *  review first and strongest alignments. */
export function GroupColumn({
  kind,
  name,
  full,
  figures,
  counts,
  rowsTitle,
  rows,
  review,
  strongest,
  members,
  countsOf,
  seatPairs,
  docName,
  selectedPair,
  onPair,
  onFocus,
  onHover,
  onHoverArc,
  onCloseSeat,
  canGoBack,
  onBack,
  onClear,
  pair,
}: {
  kind: string;
  name: string;
  full?: string;
  figures: string;
  counts: ToneCounts;
  rowsTitle: string;
  rows: ArcRow[];
  review: RankedRow[];
  strongest: RankedRow[];
  /** The group's targets, in document order. */
  members: BriefCommitment[];
  countsOf: (id: string) => ToneCounts;
  seatPairs: SeatPairs | null;
  docName: (id: string) => string;
  selectedPair: string | null;
  onPair: (a: string, b: string) => void;
  onFocus: (key: string) => void;
  onHover: (id: string | null) => void;
  onHoverArc: (key: string | null) => void;
  onCloseSeat: () => void;
  canGoBack: boolean;
  onBack: () => void;
  onClear: () => void;
  pair: ReactNode;
}) {
  const t = useTranslations("brief.explore");
  const [open, setOpen] = useState<string | null>(null);
  const pairRows = (list: GroupPair[]) =>
    list.map((p) => ({
      key: `${p.a.id}~${p.b.id}`,
      hover: p.b.id,
      lines: [
        <TargetLine key="a" c={p.a} docName={docName} />,
        <TargetLine key="b" c={p.b} docName={docName} />,
      ],
      type: p.type,
    }));
  const openPair = (key: string) => {
    const [a, b] = key.split("~");
    onPair(a, b);
  };
  return (
    <>
      <Nav canGoBack={canGoBack} onBack={onBack} onClear={onClear} />
      <p className="ex-focus-doc">{kind}</p>
      <h2 className="ex-focus-title" title={full}>
        {name}
      </h2>
      <p className="ex-focus-finding">{figures}</p>
      {counts.total > 0 && <ToneKey counts={counts} />}
      {seatPairs && (
        <section className="ex-seat" data-testid="explore-seat-pairs">
          <div className="ex-pair-head">
            <h3 className="ex-sub ex-seat-title">
              {t("seatPairs", { count: seatPairs.pairs.length, target: commitmentLine(seatPairs.seat, 80) })}
            </h3>
            <button type="button" className="ex-close" onClick={onCloseSeat} aria-label={t("close")}>
              ×
            </button>
          </div>
          <MarkRows
            rows={seatPairs.pairs.map((p) => ({
              key: `${p.a.id}~${p.b.id}`,
              hover: p.b.id,
              lines: [<TargetLine key="a" c={p.a} docName={docName} />],
              type: p.type ? `${p.rating} · ${p.type}` : p.rating,
            }))}
            tone="ink"
            selected={selectedPair}
            onOpen={openPair}
            onHover={onHover}
            testId="explore-seat-pair-row"
          />
        </section>
      )}
      {pair}
      {rows.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{rowsTitle}</h3>
          <ol className="ex-group-rows">
            {rows.map((row) => (
              <GroupRow
                key={row.key}
                name={row.name}
                counts={row.counts}
                open={open === row.key}
                onOpen={() => setOpen((cur) => (cur === row.key ? null : row.key))}
                onHover={(on) => onHoverArc(on ? row.key : null)}
                testId="explore-arc-row"
              >
                {open === row.key && (
                  <div className="ex-group-row-pairs">
                    {row.apart.length > 0 && (
                      <>
                        <h4 className="ex-sub ex-sub-small">{t("apartList", { count: row.apart.length })}</h4>
                        <Expandable
                          items={row.apart}
                          preview={5}
                          render={(list) => (
                            <MarkRows
                              rows={pairRows(list)}
                              tone="apart"
                              selected={selectedPair}
                              onOpen={openPair}
                              onHover={onHover}
                              testId="explore-arc-apart-row"
                            />
                          )}
                        />
                      </>
                    )}
                    {row.strong.length > 0 && (
                      <>
                        <h4 className="ex-sub ex-sub-small">{t("strongList", { count: row.strong.length })}</h4>
                        <Expandable
                          items={row.strong}
                          preview={5}
                          render={(list) => (
                            <MarkRows
                              rows={pairRows(list)}
                              tone="reinforce"
                              selected={selectedPair}
                              onOpen={openPair}
                              onHover={onHover}
                              testId="explore-arc-strong-row"
                            />
                          )}
                        />
                      </>
                    )}
                  </div>
                )}
              </GroupRow>
            ))}
          </ol>
        </section>
      )}
      {review.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("reviewFirst")}</h3>
          <Expandable
            items={review}
            render={(list) => (
              <RankRows
                rows={list}
                tone="apart"
                docName={docName}
                onOpen={onFocus}
                onHover={onHover}
                testId="explore-group-review-row"
              />
            )}
          />
        </section>
      )}
      {strongest.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("strongest")}</h3>
          <Expandable
            items={strongest}
            render={(list) => (
              <RankRows
                rows={list}
                tone="reinforce"
                docName={docName}
                onOpen={onFocus}
                onHover={onHover}
                testId="explore-group-strong-row"
              />
            )}
          />
        </section>
      )}
      {members.length > 0 && (
        <section className="ex-section">
          <h3 className="ex-sub">{t("allTargetsOf", { count: members.length })}</h3>
          <Expandable
            items={members}
            preview={8}
            render={(list) => (
              <TargetRows
                items={list}
                countsOf={countsOf}
                onOpen={onFocus}
                onHover={onHover}
                testId="explore-group-target"
              />
            )}
          />
        </section>
      )}
    </>
  );
}

/** Targets matching the search. */
export function SearchColumn({
  items,
  docName,
  onFocus,
  onHover,
}: {
  items: BriefCommitment[];
  docName: (id: string) => string;
  onFocus: (key: string) => void;
  onHover: (id: string | null) => void;
}) {
  const t = useTranslations("brief.explore");
  return (
    <>
      <p className="ex-count" role="status">
        {t("searchCount", { count: items.length })}
      </p>
      <Expandable
        items={items}
        preview={24}
        render={(list) => (
          <MarkRows
            rows={list.map((c) => ({
              key: c.id,
              hover: c.id,
              lines: [<TargetLine key="t" c={c} docName={docName} />],
            }))}
            tone="ink"
            onOpen={onFocus}
            onHover={onHover}
            testId="explore-result-row"
          />
        )}
      />
    </>
  );
}
