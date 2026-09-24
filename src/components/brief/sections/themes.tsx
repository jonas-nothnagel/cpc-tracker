"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shareOf } from "@/lib/brief/compute";
import { MAX_THEMES, OTHER_THEME, themeDots, type BriefData, type ThemeItem } from "@/lib/brief/data";
import type { BriefDocument } from "@/lib/brief/source";
import { DOT_COLORS, DotCanvas, MAX_DOTS } from "../dot-field";
import { ExamplePairView } from "../example-pair";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

/** The pairs outside every theme, in a lighter ink of the same tone. */
const OTHER_INK = { reinforce: "#a8cbb2", apart: "#f1b1a4" } as const;
/** Most contested resources named for one theme. */
const MAX_RESOURCES = 3;
/** Documents named for one theme; the rest are counted. */
const MAX_DOCS = 3;

/** "A, B and C": UNDP style has no comma before the final conjunction. */
export function joinList(items: string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** Documents taking part in a theme, largest share first. */
function docsTakingPart(row: ThemeItem, docs: BriefDocument[]): BriefDocument[] {
  return docs
    .map((doc, order) => ({ doc, order, share: row.docShares[doc.id] ?? 0 }))
    .filter((x) => x.share > 0)
    .sort((x, y) => y.share - x.share || x.order - y.order)
    .map((x) => x.doc);
}

/** "Resources involved: water and land", in the reader's language. The
 *  pipeline names resources in English; other languages show only the words
 *  the glossary translates rather than mix languages in one line. */
export function useResourceLine(): (words: string[]) => string | null {
  const t = useTranslations("brief");
  const tr = useTranslations("brief.resources");
  const locale = useLocale();
  return (words) => {
    const labels = [
      ...new Set(
        words
          .map((w) => (tr.has(w) ? tr(w) : locale === "en" ? w : null))
          .filter((w): w is string => Boolean(w)),
      ),
    ].slice(0, MAX_RESOURCES);
    return labels.length > 0 ? t("themes.contested", { list: joinList(labels, t("and")) }) : null;
  };
}

/** The section's finding: the leading pair of documents, or the overall
 *  share when no pair has enough target pairs to lead. */
export function useThemeHeadline(data: BriefData, tone: "reinforce" | "apart"): string {
  const t = useTranslations("brief");
  const { pct } = useNumbers();
  const key = tone === "reinforce" ? "together" : "apart";
  const lead = data.leading[tone];
  return lead
    ? t(`${key}.headline`, {
        docA: lead.a.name,
        docB: lead.b.name,
        pct: pct(shareOf(lead.counts, tone)),
      })
    : t(`${key}.headlineFallback`, {
        pct: pct(data.counts.total > 0 ? data.counts[tone] / data.counts.total : 0),
      });
}

/**
 * The recurring themes as a plain list: what, how often, which documents
 * and, for potential misalignment, what is contested. With `selectedIndex`
 * the rows are toggles (the section shows the selected theme's example);
 * without it they are plain actions.
 */
export function ThemeList({
  data,
  tone,
  selectedIndex,
  hovered = null,
  onHover,
  onSelect,
  tour,
}: {
  data: BriefData;
  tone: "reinforce" | "apart";
  selectedIndex?: number;
  hovered?: string | null;
  onHover?: (name: string | null) => void;
  onSelect?: (name: string) => void;
  tour?: string;
}) {
  const t = useTranslations("brief");
  const resourceLine = useResourceLine();
  const docLine = (row: ThemeItem): string => {
    const names = docsTakingPart(row, data.scope.docs).map((d) => d.name);
    const shown = names.slice(0, MAX_DOCS);
    const rest = names.length - shown.length;
    return joinList(rest > 0 ? [...shown, t("themes.moreDocs", { count: rest })] : shown, t("and"));
  };
  const key = tone === "reinforce" ? "together" : "apart";
  const section = data[key];
  const rows = section.rows.slice(0, MAX_THEMES);
  const largest = Math.max(1, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="brief-sec-empty">{t(`${key}.themesEmpty`)}</p>;
  return (
    <>
      <p className="brief-themes-title">
        {section.exact ? t("themes.title") : t("themes.titleAllDocuments")}
      </p>
      <ol className="brief-themes" data-tour={tour}>
        {rows.map((row, i) => {
          const resources =
            tone === "apart"
              ? resourceLine((row.storyline.aggregates?.contested_resources ?? []).map((r) => r.resource))
              : null;
          const on = i === selectedIndex;
          return (
            <li
              key={row.storyline.name}
              className="brief-theme"
              data-testid="brief-theme-row"
              data-selected={on ? "true" : undefined}
              data-hovered={hovered === row.storyline.name ? "true" : undefined}
              onPointerEnter={() => onHover?.(row.storyline.name)}
              onPointerLeave={() => onHover?.(null)}
            >
              <button
                type="button"
                className="brief-theme-button"
                aria-pressed={selectedIndex === undefined ? undefined : on}
                onClick={() => onSelect?.(row.storyline.name)}
              >
                <span className="brief-theme-n" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="brief-theme-main">
                  <span className="brief-theme-name">{row.storyline.name}</span>
                  {resources && <span className="brief-theme-meta brief-theme-resources">{resources}</span>}
                  <span className="brief-theme-meta brief-theme-docs">{docLine(row)}</span>
                </span>
                <span className="brief-theme-size">
                  <span className="brief-theme-count">{t(`themes.count.${tone}`, { count: row.count })}</span>
                  <span className={`brief-theme-bar brief-screen-${tone}`} aria-hidden="true">
                    <span style={{ width: `${((row.count / largest) * 100).toFixed(1)}%` }} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** "What works well together" (reinforce) and "Where policies may pull
 *  apart" (apart): the leading pair of documents as the finding, then the
 *  recurring themes. Selecting a theme shows one of its comparisons; the
 *  first theme's example prints. */
export function ThemeSectionView({
  data,
  tone,
  variant = "screen",
  picked: pickedProp,
  replay = 0,
  onPick,
  onOpenPair,
  onOpenTheme,
}: {
  data: BriefData;
  tone: "reinforce" | "apart";
  countryId?: string;
  variant?: "screen" | "print";
  /** The selected theme when the brief holds the selection (screen and
   *  print show the same example); otherwise the section keeps its own. */
  picked?: string | null;
  /** Bumped to replay the dots' build, e.g. when arriving from the overall picture. */
  replay?: number;
  onPick?: (name: string) => void;
  onOpenPair?: (aId: string, bId: string) => void;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
}) {
  const t = useTranslations("brief");
  const headline = useThemeHeadline(data, tone);
  const [ownPick, setOwnPick] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const picked = onPick ? (pickedProp ?? null) : ownPick;
  const pick = (name: string) => (onPick ? onPick(name) : setOwnPick(name));
  const key = tone === "reinforce" ? "together" : "apart";
  const type = tone === "reinforce" ? "reinforcement" : "friction";
  const section = data[key];
  const rows = section.rows.slice(0, MAX_THEMES);
  const pickedIndex = rows.findIndex((r) => r.storyline.name === picked);
  const selectedIndex = pickedIndex >= 0 ? pickedIndex : Math.max(0, rows.findIndex((r) => r.example));
  const selected = rows[selectedIndex] ?? null;
  const example = selected ? selected.example : section.example;

  return (
    <SectionFrame id={key} headline={headline}>
      {variant === "screen" && rows.length > 0 && (
        <DotCanvas
          className="brief-theme-dots"
          labelled
          replay={replay}
          hovered={hovered}
          onHover={setHovered}
          onSelect={pick}
          unit={Math.max(1, Math.ceil(data.counts[tone] / MAX_DOTS))}
          groups={themeDots(data, tone).map((g, i) =>
            g.key === OTHER_THEME
              ? {
                  key: g.key,
                  count: g.count,
                  color: OTHER_INK[tone],
                  texture: tone === "apart",
                  label: t("themes.other"),
                  tip: t("themes.otherTip", { count: g.count }),
                }
              : {
                  key: g.key,
                  count: g.count,
                  color: DOT_COLORS[tone],
                  texture: tone === "apart",
                  label: String(i + 1),
                  selectable: true,
                  tip: (
                    <>
                      <strong>{g.key}</strong>
                      <br />
                      {t(`themes.count.${tone}`, { count: g.count })}
                    </>
                  ),
                },
          )}
        />
      )}
      <ThemeList
        data={data}
        tone={tone}
        selectedIndex={selectedIndex}
        hovered={hovered}
        onHover={setHovered}
        onSelect={pick}
        tour="brief-themes"
      />
      {example && (
        <ExamplePairView
          example={example}
          tone={tone}
          docs={data.scope.docs}
          fit={variant === "print"}
          themeName={selected?.storyline.name}
          onOpenPair={onOpenPair}
          onOpenTheme={selected ? () => onOpenTheme?.(type, selected.storyline.name) : undefined}
        />
      )}
    </SectionFrame>
  );
}
