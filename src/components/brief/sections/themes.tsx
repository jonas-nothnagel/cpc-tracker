"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { shareOf } from "@/lib/brief/compute";
import type { BriefData, ThemeItem } from "@/lib/brief/data";
import type { BriefDocument } from "@/lib/brief/source";
import { ExamplePairView } from "../example-pair";
import { useNumbers } from "../ink";
import { SectionFrame } from "./frame";

/** Most themes listed; the pipeline writes three of each kind. */
const MAX_THEMES = 3;
/** Most contested resources named for one theme. */
const MAX_RESOURCES = 3;
/** Documents named for one theme; the rest are counted. */
const MAX_DOCS = 3;

/** "A, B and C": UNDP style has no comma before the final conjunction. */
function joinList(items: string[], and: string): string {
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

/** "What works well together" (reinforce) and "Where policies may pull
 *  apart" (apart): the leading pair of documents as the finding, then the
 *  recurring themes as a plain list (what, how often, which documents, and
 *  for potential misalignment what is contested). Selecting a theme shows
 *  one of its comparisons; the first theme's example prints. */
export function ThemeSectionView({
  data,
  tone,
  onOpenPair,
  onOpenTheme,
}: {
  data: BriefData;
  tone: "reinforce" | "apart";
  countryId?: string;
  onOpenPair?: (aId: string, bId: string) => void;
  onOpenTheme?: (type: "reinforcement" | "friction", name: string) => void;
}) {
  const t = useTranslations("brief");
  const tr = useTranslations("brief.resources");
  const locale = useLocale();
  const { pct } = useNumbers();
  // The pipeline names resources in English; other languages show only the
  // words the glossary translates rather than mix languages in one line.
  const resourceLabel = (word: string): string | null =>
    tr.has(word) ? tr(word) : locale === "en" ? word : null;
  const docLine = (row: ThemeItem): string => {
    const names = docsTakingPart(row, data.scope.docs).map((d) => d.name);
    const shown = names.slice(0, MAX_DOCS);
    const rest = names.length - shown.length;
    return joinList(rest > 0 ? [...shown, t("themes.moreDocs", { count: rest })] : shown, t("and"));
  };
  const [picked, setPicked] = useState<string | null>(null);
  const key = tone === "reinforce" ? "together" : "apart";
  const type = tone === "reinforce" ? "reinforcement" : "friction";
  const section = data[key];
  const rows = section.rows.slice(0, MAX_THEMES);
  const pickedIndex = rows.findIndex((r) => r.storyline.name === picked);
  const selectedIndex = pickedIndex >= 0 ? pickedIndex : Math.max(0, rows.findIndex((r) => r.example));
  const selected = rows[selectedIndex] ?? null;
  const example = selected ? selected.example : section.example;
  const lead = data.leading[tone];
  const headline = lead
    ? t(`${key}.headline`, {
        docA: lead.a.name,
        docB: lead.b.name,
        pct: pct(shareOf(lead.counts, tone)),
      })
    : t(`${key}.headlineFallback`, {
        pct: pct(data.counts.total > 0 ? data.counts[tone] / data.counts.total : 0),
      });
  const largest = Math.max(1, ...rows.map((r) => r.count));

  return (
    <SectionFrame id={key} headline={headline}>
      {rows.length > 0 ? (
        <>
          <p className="brief-themes-title">
            {section.exact ? t("themes.title") : t("themes.titleAllDocuments")}
          </p>
          <ol className="brief-themes" data-tour="brief-themes">
            {rows.map((row, i) => {
              const resources =
                tone === "apart"
                  ? [
                      ...new Set(
                        (row.storyline.aggregates?.contested_resources ?? [])
                          .map((r) => resourceLabel(r.resource))
                          .filter((w): w is string => Boolean(w)),
                      ),
                    ].slice(0, MAX_RESOURCES)
                  : [];
              const on = i === selectedIndex;
              return (
                <li
                  key={row.storyline.name}
                  className="brief-theme"
                  data-testid="brief-theme-row"
                  data-selected={on ? "true" : undefined}
                >
                  <button
                    type="button"
                    className="brief-theme-button"
                    aria-pressed={on}
                    onClick={() => setPicked(row.storyline.name)}
                  >
                    <span className="brief-theme-n" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="brief-theme-main">
                      <span className="brief-theme-name">{row.storyline.name}</span>
                      {resources.length > 0 && (
                        <span className="brief-theme-meta brief-theme-resources">
                          {t("themes.contested", { list: joinList(resources, t("and")) })}
                        </span>
                      )}
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
      ) : (
        <p className="brief-sec-empty">{t(`${key}.themesEmpty`)}</p>
      )}
      {example && (
        <ExamplePairView
          example={example}
          tone={tone}
          docs={data.scope.docs}
          themeName={selected?.storyline.name}
          onOpenPair={onOpenPair}
          onOpenTheme={selected ? () => onOpenTheme?.(type, selected.storyline.name) : undefined}
        />
      )}
    </SectionFrame>
  );
}
