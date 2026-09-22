"use client";

/**
 * Overview band — the top fold's "before you dive in" strip.
 *
 * Usability feedback asked for the Explore workbench at the top of the page;
 * the underlying need was orientation ("thrown in the deep end"), not section
 * order. This band answers that need where readers arrive: a row of factual
 * headline tiles — corpus scale, strong-alignment share, potential
 * misalignments, plus the financing / implementation facts when a country has
 * that data — each deep-linking to the section that explains it, closed by an
 * "Ask a question" shortcut to the Explore workbench's ask dock. The tiles
 * are the fold's ONLY statement of these numbers (the header verdict stays
 * qualitative; the focus sentence below the band carries the concentration
 * insight), so nothing above the fold is said twice.
 *
 * This is a static surface, so every tile is a hard fact: the doc-filter-aware
 * counts the header verdict already uses (never the workbench's deliberately
 * full-corpus stat line), the BER's summed expenditure, the BTR's
 * reported-action count. Never AI-estimated coverage, never suggestions.
 *
 * Removal recipe: delete this file (+ test), then grep `OverviewBand` and
 * `guided-overview` for the mount, the corpus-row anchor id, the tour step,
 * and the `briefing.overview` message namespace.
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { track } from "@/lib/analytics/client";
import type { HeadlineVerdict } from "@/lib/coherence-briefing";
import {
  formatBerMoney,
  type FinancingCoherenceSummary,
} from "@/lib/financing-coherence";
import type { ImplementationCoverage } from "@/lib/implementation-coherence";
import { DIRECTION_SECTION_ID } from "./sections/direction";
import { FRICTION_TYPES_SECTION_ID } from "./sections/friction-types";
import { FINANCING_SECTION_ID } from "./sections/financing";
import { IMPLEMENTATION_SECTION_ID } from "./sections/implementation";
import { EXPLORE_SECTION_ID } from "./sections/explore";

/** Anchor id the corpus tile jumps to (the browse bar + document filter row). */
export const CORPUS_ANCHOR_ID = "corpus";

export interface OverviewTile {
  id: "corpus" | "strong" | "flagged" | "finance" | "implementation";
  href: string;
  /** Count tiles (flagged / implementation). */
  count?: number;
  /** The strong tile's share, mirroring the synthesis sentence's percentage. */
  pct?: number;
  /** The finance tile's preformatted figure, e.g. "890 billion MNT". */
  money?: string;
}

/**
 * Pure tile model. Presence mirrors the section gating exactly (finance needs
 * a Biodiversity Expenditure Review, implementation a Biennial Transparency
 * Report), so a tile never links to a section that is not rendered.
 */
export function buildOverviewTiles({
  verdict,
  financing,
  implementationCoverage,
}: {
  verdict: HeadlineVerdict;
  financing: FinancingCoherenceSummary | null;
  implementationCoverage: ImplementationCoverage | null;
}): OverviewTile[] {
  // Same share the synthesis sentence prints ("{pct}% reach strong
  // alignment"); the raw strong-pair count appears nowhere in the header, so
  // surfacing it here would hand the reader a number they cannot reconcile.
  const denom = verdict.alignmentPairs + verdict.tensionPairs;
  const tiles: OverviewTile[] = [
    { id: "corpus", href: `#${CORPUS_ANCHOR_ID}` },
    {
      id: "strong",
      href: `#${DIRECTION_SECTION_ID}`,
      pct: denom > 0 ? Math.round((verdict.alignmentPairs / denom) * 100) : 0,
    },
    {
      id: "flagged",
      href: `#${FRICTION_TYPES_SECTION_ID}`,
      count: verdict.tensionPairs,
    },
  ];
  if (financing) {
    tiles.push({
      id: "finance",
      href: `#${FINANCING_SECTION_ID}`,
      money: formatBerMoney(
        financing.totalTrackedExpenditure,
        financing.unit,
        financing.currency,
      ),
    });
  }
  if (implementationCoverage) {
    tiles.push({
      id: "implementation",
      href: `#${IMPLEMENTATION_SECTION_ID}`,
      count: implementationCoverage.totalActions,
    });
  }
  return tiles;
}

function Num({ children }: { children: ReactNode }) {
  return (
    <span className="text-lg font-semibold leading-none tabular-nums text-[var(--undp-black)]">
      {children}
    </span>
  );
}

/** After the hash jump lands the workbench, put the caret in the ask bar.
 *  Progressive enhancement: if the selector misses, the plain anchor still
 *  landed the section. The ask bar is the rail's footer at the bottom of a
 *  content-sized stage, which can sit below the fold on a laptop, so focus is
 *  allowed its minimal scroll rather than landing on an off-screen input. */
function focusAskDock() {
  track("overview_tile_click", { tile: "ask" });
  window.setTimeout(() => {
    document
      .querySelector<HTMLInputElement>('[data-tour="explore-ask"] input')
      ?.focus();
  }, 600);
}

/**
 * The "Ask a question" shortcut to the Explore workbench's ask dock. Flows
 * as the last item of the tile row — never `ml-auto`, never mounted off on
 * its own: pushed to the container's right edge it aligned with nothing at
 * wide viewports (the sentence far left, the tile row ending short of it)
 * and read as floating. In flow it is always anchored to real content —
 * inline after the last tile when the row has room, first on the next line
 * when it does not.
 */
function AskExploreLink() {
  const t = useTranslations("briefing.overview");
  return (
    <a
      href={`#${EXPLORE_SECTION_ID}`}
      onClick={focusAskDock}
      className="flex h-full items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-[var(--undp-blue)] transition-colors hover:border-[var(--undp-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--undp-blue)] focus-visible:ring-offset-1"
    >
      {t("ask")} <span aria-hidden="true">→</span>
    </a>
  );
}

const TILE_CLASS =
  "group flex h-full max-w-[17rem] flex-col justify-center rounded-lg border border-line bg-white px-3 py-1.5 transition-colors hover:border-[var(--undp-blue)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--undp-blue)] focus-visible:ring-offset-1";

export function OverviewBand({
  targetCount,
  documentCount,
  tiles,
}: {
  targetCount: number;
  documentCount: number;
  tiles: OverviewTile[];
}) {
  const t = useTranslations("briefing.overview");

  const lead = (tile: OverviewTile): ReactNode => {
    switch (tile.id) {
      case "corpus":
        return (
          <>
            <Num>{targetCount.toLocaleString()}</Num>{" "}
            {t("corpusTargets", { count: targetCount })}{" "}
            <span aria-hidden="true">·</span>{" "}
            <Num>{documentCount.toLocaleString()}</Num>{" "}
            {t("corpusDocs", { count: documentCount })}
          </>
        );
      case "strong":
        return (
          <>
            <Num>{tile.pct}%</Num> {t("strong")}
          </>
        );
      case "finance":
        return <Num>{tile.money}</Num>;
      default:
        return (
          <>
            <Num>{(tile.count ?? 0).toLocaleString()}</Num>{" "}
            {t(tile.id, { count: tile.count ?? 0 })}
          </>
        );
    }
  };

  return (
    <div data-tour="guided-overview" className="mt-4">
      <ul
        aria-label={t("listAria")}
        className="flex list-none flex-wrap items-stretch gap-2 p-0"
      >
        {tiles.map((tile) => (
          <li key={tile.id}>
            <a
              href={tile.href}
              onClick={() => track("overview_tile_click", { tile: tile.id })}
              className={TILE_CLASS}
            >
              <span className="text-sm text-[var(--undp-black)]">
                {lead(tile)}
              </span>
              {/* The ↓ says "this jumps down the page" — the caption doubles
                  as the tile's link affordance. */}
              <span className="mt-0.5 text-caption text-[var(--undp-gray)] transition-colors group-hover:text-[var(--undp-blue)]">
                {t(`${tile.id}Caption`)}{" "}
                <span aria-hidden="true">↓</span>
              </span>
            </a>
          </li>
        ))}
        <li>
          <AskExploreLink />
        </li>
      </ul>
    </div>
  );
}
