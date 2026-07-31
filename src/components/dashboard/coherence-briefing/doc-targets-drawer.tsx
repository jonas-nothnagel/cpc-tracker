"use client";

/**
 * DocTargetsDrawer — the targets a single policy document actually contains.
 *
 * The briefing compares documents against each other everywhere else; this is
 * the one place a reader can ask the prior question, "what does this instrument
 * commit to?", without leaving the tool for the source PDF. Each row also
 * carries how many potentially misaligned pairs that target sits in, so the
 * list doubles as a way into the comparison rather than being a flat index.
 *
 * Documents range from 4 targets (Sri Lanka's land degradation targets) to 206
 * (Panama's REDD+ strategy), so the list has to work at both ends: rows are
 * compact and in document order, search and filters narrow, and the list
 * reveals in batches instead of laying 206 expandable rows down at once.
 *
 * Chrome (scrim, dialog, keys, scroll lock, focus trap, close) belongs to
 * DrawerShell; this file renders a DrawerHeader and a body.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { DrawerHeader } from "@/components/ui/drawer-shell";
import { getDocFullLabel, getDocMediumLabel } from "@/lib/utils";
import {
  ActivitiesActions,
  OriginalLanguageChip,
  TargetTextWithHighlights,
} from "@/components/viz/target-text";
import {
  buildDocTargetHaystacks,
  countDocTargetFilters,
  DOC_TARGET_FILTER_IDS,
  filterDocTargets,
  type DocTargetFilterId,
} from "./doc-targets-filter";
import type { CountryConfig, PolicyDocumentType, Target } from "@/types";

const HEADLINE_SERIF = "var(--font-display)";

/** Rows revealed at a time. One press covers most documents; the two large
 *  outliers stay responsive because the first paint is bounded. */
const BATCH = 30;

/** What the reader has set up in this panel. Held by the host so stepping back
 *  from a target returns to the list as it was left, not to a reset one. */
export interface DocTargetsView {
  query: string;
  filters: DocTargetFilterId[];
  shown: number;
}

export const DEFAULT_DOC_TARGETS_VIEW: DocTargetsView = {
  query: "",
  filters: [],
  shown: BATCH,
};

const FILTER_LABEL_KEY: Record<DocTargetFilterId, string> = {
  quantitative: "filter.quantitative",
  timeBound: "filter.timeBound",
  inMisalignments: "filter.inMisalignments",
};

export function DocTargetsDrawer({
  doc,
  targets,
  flaggedCountByTargetId,
  isDocExcluded,
  countryConfig,
  view,
  onViewChange,
  onOpenTargetProfile,
}: {
  doc: PolicyDocumentType;
  /** The full corpus; this panel takes the slice belonging to `doc`. */
  targets: Target[];
  flaggedCountByTargetId: Map<string, number>;
  /** True when the reader has excluded this document from the analysis, in
   *  which case none of its pairs are counted. */
  isDocExcluded: boolean;
  countryConfig: CountryConfig | null;
  view: DocTargetsView;
  onViewChange: (next: DocTargetsView) => void;
  onOpenTargetProfile: (targetId: string) => void;
}) {
  const t = useTranslations("briefing.docTargets");
  const listRef = useRef<HTMLUListElement>(null);
  // Index of the first row of a newly revealed batch, consumed once so the
  // keyboard lands on the new rows rather than being pulled to the top.
  const pendingFocusRow = useRef<number | null>(null);

  const docTargets = useMemo(
    () => targets.filter((target) => target.sourceDocument === doc),
    [targets, doc],
  );
  // Normalising a couple of hundred multi-sentence targets is the only part of
  // searching that costs anything, so it happens once per document rather than
  // once per keystroke.
  const haystacks = useMemo(
    () => buildDocTargetHaystacks(docTargets),
    [docTargets],
  );
  const counts = useMemo(
    () => countDocTargetFilters(docTargets, flaggedCountByTargetId),
    [docTargets, flaggedCountByTargetId],
  );
  const matches = useMemo(
    () =>
      filterDocTargets({
        targets: docTargets,
        query: view.query,
        activeFilters: view.filters,
        flaggedCountByTargetId,
        haystacks,
      }),
    [docTargets, view.query, view.filters, flaggedCountByTargetId, haystacks],
  );

  const visibleRows = matches.slice(0, view.shown);
  const remaining = matches.length - visibleRows.length;
  const isNarrowed = view.query.trim() !== "" || view.filters.length > 0;

  // A filter that would only ever empty the list is not a control worth
  // offering, so a dimension the document does not use simply does not appear.
  const availableFilters = DOC_TARGET_FILTER_IDS.filter(
    (id) => counts[id] > 0,
  );

  useLayoutEffect(() => {
    const row = pendingFocusRow.current;
    if (row === null) return;
    pendingFocusRow.current = null;
    const buttons =
      listRef.current?.querySelectorAll<HTMLButtonElement>("[data-row-toggle]");
    buttons?.[row]?.focus();
  });

  const setQuery = (query: string) =>
    onViewChange({ ...view, query, shown: BATCH });
  const toggleFilter = (id: DocTargetFilterId) =>
    onViewChange({
      ...view,
      filters: view.filters.includes(id)
        ? view.filters.filter((f) => f !== id)
        : [...view.filters, id],
      shown: BATCH,
    });
  const showMore = () => {
    pendingFocusRow.current = visibleRows.length;
    onViewChange({ ...view, shown: view.shown + BATCH });
  };
  const clearAll = () => onViewChange(DEFAULT_DOC_TARGETS_VIEW);

  const hasTargets = docTargets.length > 0;

  return (
    <>
      <DrawerHeader
        toolbar={
          hasTargets ? (
            <div className="space-y-2.5">
              <input
                type="search"
                value={view.query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  // Escape clears the field first and closes the panel only
                  // once it is empty, the usual contract for a search box.
                  if (e.key === "Escape" && view.query !== "") {
                    e.preventDefault();
                    setQuery("");
                  }
                }}
                aria-label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
                className="w-full rounded-md border border-line bg-white px-3 py-1.5 text-data text-[var(--undp-black)] placeholder:text-[var(--undp-gray)] focus:outline-none focus:ring-2 focus:ring-[var(--undp-blue)] focus:border-[var(--undp-blue)]"
              />
              {availableFilters.length > 0 && (
                <div
                  role="group"
                  aria-label={t("filterGroupAria")}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  {availableFilters.map((id) => {
                    const active = view.filters.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleFilter(id)}
                        aria-pressed={active}
                        className={`text-caption px-2.5 py-0.5 rounded-full border transition-colors ${
                          active
                            ? "bg-[var(--undp-blue)] text-white border-[var(--undp-blue)]"
                            : "text-[var(--undp-gray)] border-gray-300 hover:text-[var(--undp-black)]"
                        }`}
                      >
                        {t(FILTER_LABEL_KEY[id], { count: counts[id] })}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : undefined
        }
      >
        <p className="text-caption font-medium text-[var(--undp-gray)] mb-1">
          {t("eyebrow")}
        </p>
        <h3
          className="text-xl text-[var(--undp-black)] font-medium leading-tight"
          style={{ fontFamily: HEADLINE_SERIF }}
        >
          {getDocFullLabel(countryConfig, doc)}
        </h3>
        <p className="mt-1 text-caption text-[var(--undp-gray)] tabular-nums">
          {getDocMediumLabel(countryConfig, doc)}
          {" · "}
          {t("subtitle", { count: docTargets.length })}
        </p>
      </DrawerHeader>

      <div className="px-6 py-5">
        {isDocExcluded && (
          <p className="mb-4 text-caption text-[var(--undp-gray)] leading-relaxed">
            {t("excludedNote")}
          </p>
        )}

        {!hasTargets ? (
          <p className="text-body text-[var(--undp-gray)]">
            {t("empty.noTargets")}
          </p>
        ) : matches.length === 0 ? (
          <>
            <StatusLine empty>
              {view.query.trim() !== ""
                ? t("empty.noMatches")
                : t("empty.noFilterMatches")}
            </StatusLine>
            <button
              type="button"
              onClick={clearAll}
              className="mt-3 text-caption text-[var(--undp-blue)] hover:underline"
            >
              {view.query.trim() !== ""
                ? t("clearSearch")
                : t("clearFilters")}
            </button>
          </>
        ) : (
          <>
            <StatusLine>
              {t("showingCount", {
                shown: visibleRows.length,
                total: matches.length,
              })}
            </StatusLine>
            <ul
              ref={listRef}
              className="border-y border-gray-200 divide-y divide-gray-200"
            >
              {visibleRows.map((target) => (
                <TargetRow
                  key={target.id}
                  target={target}
                  flaggedCount={flaggedCountByTargetId.get(target.id) ?? 0}
                  onOpenProfile={() => onOpenTargetProfile(target.id)}
                />
              ))}
            </ul>
            {(remaining > 0 || isNarrowed) && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={showMore}
                    className="text-caption text-[var(--undp-blue)] hover:underline"
                  >
                    {t("showMore", { count: Math.min(BATCH, remaining) })}
                  </button>
                )}
                {isNarrowed && (
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-caption text-[var(--undp-gray)] underline underline-offset-2 hover:text-[var(--undp-black)]"
                  >
                    {t("clearAll")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

/**
 * How many targets are showing, or why none are. One element for both states so
 * the live region stays mounted: rendering the count and the empty message as
 * separate branches means the region unmounts at the exact moment a search
 * empties the list, and a reader hears nothing.
 */
function StatusLine({
  children,
  empty = false,
}: {
  children: ReactNode;
  empty?: boolean;
}) {
  return (
    <p
      aria-live="polite"
      className={
        empty
          ? "text-body text-[var(--undp-gray)]"
          : "mb-2 text-caption text-[var(--undp-gray)] tabular-nums"
      }
    >
      {children}
    </p>
  );
}

function TargetRow({
  target,
  flaggedCount,
  onOpenProfile,
}: {
  target: Target;
  flaggedCount: number;
  onOpenProfile: () => void;
}) {
  const t = useTranslations("briefing.docTargets");
  const tBadge = useTranslations("briefing.drawer.pair.badge");
  const [open, setOpen] = useState(false);
  const panelId = `doc-target-${target.id}`;

  const flags = [
    target.isQuantitative ? tBadge("quantitative") : null,
    target.isTimeBound ? tBadge("timeBound") : null,
  ].filter(Boolean);

  const source = target.sources?.[0];
  // A quote that repeats the target text verbatim adds nothing; only show it
  // where the pipeline cleaned or condensed the wording.
  const quote =
    source?.sourceText && source.sourceText.trim() !== target.text.trim()
      ? source.sourceText
      : null;

  return (
    <li>
      <button
        type="button"
        data-row-toggle
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          open
            ? t("collapseRowAria", { name: target.sourceLabel })
            : t("expandRowAria", { name: target.sourceLabel })
        }
        className="w-full text-left py-2.5 px-1 -mx-1 rounded hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-start justify-between gap-3">
          <span className="flex items-start gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="mt-[3px] inline-block text-caption leading-none text-[var(--undp-gray)] transition-transform shrink-0"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
            >
              &#9654;
            </span>
            <span className="text-data font-medium text-[var(--undp-black)]">
              {target.sourceLabel}
            </span>
          </span>
          {flaggedCount > 0 && (
            <span className="text-caption text-[var(--undp-gray)] tabular-nums shrink-0">
              {t("misalignmentCount", { count: flaggedCount })}
            </span>
          )}
        </span>
        {!open && (
          <span className="mt-1 block pl-4 text-data text-[var(--undp-gray)] leading-snug line-clamp-2">
            {target.text}
          </span>
        )}
        {!open && flags.length > 0 && (
          <span className="mt-1 block pl-4 text-caption text-[var(--undp-gray)]">
            {flags.join(" · ")}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          className="pb-4 pl-4 pr-1 space-y-2 border-l border-line ml-1"
        >
          <p className="text-data text-[var(--undp-black)] leading-relaxed">
            <TargetTextWithHighlights target={target} />
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {flags.length > 0 && (
              <span className="text-caption text-[var(--undp-gray)]">
                {flags.join(" · ")}
              </span>
            )}
            <OriginalLanguageChip target={target} />
          </div>
          <ActivitiesActions target={target} />
          {source?.section && (
            <p className="text-caption text-[var(--undp-gray)]">
              {t("sourceSection", { name: source.section })}
            </p>
          )}
          {quote && (
            <div>
              <p className="text-caption font-medium text-[var(--undp-gray)]">
                {t("sourceQuote")}
              </p>
              <p className="text-caption italic text-[var(--undp-gray)] leading-relaxed">
                {quote}
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">
            {source?.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption font-medium text-[var(--undp-blue)] hover:underline"
              >
                {t("openSource")}
                <span aria-hidden="true"> ↗</span>
              </a>
            )}
            {flaggedCount > 0 && (
              <button
                type="button"
                onClick={onOpenProfile}
                className="text-caption font-medium text-[var(--undp-blue)] hover:underline"
              >
                {t("openProfile")}
                <span aria-hidden="true"> →</span>
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
