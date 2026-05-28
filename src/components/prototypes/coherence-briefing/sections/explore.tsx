"use client";

/**
 * Explore section — Section 4 of the findings home.
 *
 * The user takes the data further: filter by document, focus a sector, or
 * ask anything. Two chip rows (documents, sectors) drive the wheel's
 * `focus` axis; a chat panel handles open-ended questions the home cannot
 * pre-compute.
 */

import { ChatPanel } from "../chat-panel";
import { type SectorTension } from "@/lib/coherence-briefing";
import { getDocMediumLabel } from "@/lib/utils";
import type { LensId, LensOption } from "../lens";
import type {
  AlignmentResult,
  CountryConfig,
  GlobeCategory,
  IpccSector,
  PolicyDocumentType,
  Target,
  ThematicClassification,
} from "@/types";

export const EXPLORE_SECTION_ID = "explore";

const HEADLINE_SERIF =
  "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif";

export type ExploreFilter = "all" | "alignments" | "tensions";

export interface ExploreSectorSelection {
  categoryId: string;
  categoryName: string;
  taxonomyType: string;
}

export function ExploreSection({
  targets,
  alignment,
  classifications,
  sectors,
  globeCategories,
  countryConfig,
  availableDocs,
  sectorRows,
  lensTaxonomyType,
  availableLenses,
  activeLensId,
  onLensChange,
  filter,
  onFilter,
  activeDoc,
  onDoc,
  activeSector,
  onSector,
  onOpenSectorDrawer,
}: {
  targets: Target[];
  alignment: AlignmentResult[];
  classifications: ThematicClassification[];
  sectors: IpccSector[];
  globeCategories: GlobeCategory[];
  countryConfig: CountryConfig | null;
  availableDocs: PolicyDocumentType[];
  sectorRows: SectorTension[];
  lensTaxonomyType: string;
  availableLenses: LensOption[];
  activeLensId: LensId | null;
  onLensChange: (id: LensId) => void;
  filter: ExploreFilter;
  onFilter: (f: ExploreFilter) => void;
  activeDoc: PolicyDocumentType | null;
  onDoc: (doc: PolicyDocumentType | null) => void;
  activeSector: ExploreSectorSelection | null;
  onSector: (s: ExploreSectorSelection | null) => void;
  onOpenSectorDrawer: (s: ExploreSectorSelection) => void;
}) {
  const populatedSectors = sectorRows.filter((r) => r.targetCount > 0);
  return (
    <section
      id={EXPLORE_SECTION_ID}
      className="scroll-mt-24 pt-2"
      aria-labelledby={`${EXPLORE_SECTION_ID}-heading`}
    >
      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--undp-gray)] mb-2">
        Explore the data
      </p>
      <h2
        id={`${EXPLORE_SECTION_ID}-heading`}
        className="text-[28px] sm:text-[32px] leading-[1.15] text-[var(--undp-black)] font-medium mb-4"
        style={{ fontFamily: HEADLINE_SERIF }}
      >
        Drill into the corpus on your own terms.
      </h2>
      <p className="text-[14px] leading-relaxed text-[var(--undp-black)] max-w-prose mb-6">
        Switch the lens, focus a document, pick a sector, or change the
        filter. The wheel follows what you choose. Anything the chips cannot
        answer, ask in the chat.
      </p>

      <div className="space-y-3 mb-6">
        {availableLenses.length > 1 && (
          <LensChipRow
            availableLenses={availableLenses}
            activeLensId={activeLensId}
            onLensChange={onLensChange}
          />
        )}
        <FilterRow filter={filter} onFilter={onFilter} />
        {availableDocs.length > 0 && (
          <DocChipRow
            docs={availableDocs}
            active={activeDoc}
            onChange={onDoc}
            countryConfig={countryConfig}
          />
        )}
        {populatedSectors.length > 0 && (
          <SectorChipRow
            sectors={populatedSectors}
            active={activeSector}
            taxonomyType={lensTaxonomyType}
            onChange={onSector}
            onOpenFull={onOpenSectorDrawer}
          />
        )}
      </div>

      <div className="border-t border-gray-200 pt-5">
        <ChatPanel
          targets={targets}
          alignment={alignment}
          classifications={classifications}
          sectors={sectors.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
          }))}
          globeCategories={globeCategories.map((g) => ({
            id: g.id,
            name: g.name,
            description: g.description,
          }))}
          countryConfig={countryConfig}
          availableDocs={availableDocs}
          starterPrompts={[
            "Which two documents disagree the most?",
            "Which target appears in the most flagged pairs?",
            "Which sector has the strongest cross-document alignment?",
          ]}
        />
      </div>
    </section>
  );
}

function LensChipRow({
  availableLenses,
  activeLensId,
  onLensChange,
}: {
  availableLenses: LensOption[];
  activeLensId: LensId | null;
  onLensChange: (id: LensId) => void;
}) {
  const activeLens = activeLensId ?? availableLenses[0]?.id;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1.5">
        Group by
      </p>
      <div className="flex flex-wrap gap-1.5">
        {availableLenses.map((opt) => {
          const isActive = activeLens === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onLensChange(opt.id)}
              aria-pressed={isActive}
              className={chip(isActive)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterRow({
  filter,
  onFilter,
}: {
  filter: ExploreFilter;
  onFilter: (f: ExploreFilter) => void;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1.5">
        Show
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { id: "all", label: "Both" },
            { id: "alignments", label: "Alignments only" },
            { id: "tensions", label: "Flagged only" },
          ] as const
        ).map((opt) => {
          const isActive = filter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onFilter(opt.id)}
              aria-pressed={isActive}
              className={chip(isActive)}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DocChipRow({
  docs,
  active,
  onChange,
  countryConfig,
}: {
  docs: PolicyDocumentType[];
  active: PolicyDocumentType | null;
  onChange: (d: PolicyDocumentType | null) => void;
  countryConfig: CountryConfig | null;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1.5">
        Focus a document
      </p>
      <div className="flex flex-wrap gap-1.5">
        {docs.map((d) => {
          const isActive = active === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onChange(isActive ? null : d)}
              aria-pressed={isActive}
              className={chip(isActive)}
              title={getDocMediumLabel(countryConfig, d)}
            >
              {getDocMediumLabel(countryConfig, d)}
            </button>
          );
        })}
        {active && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-2.5 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function SectorChipRow({
  sectors,
  active,
  taxonomyType,
  onChange,
  onOpenFull,
}: {
  sectors: SectorTension[];
  active: ExploreSectorSelection | null;
  taxonomyType: string;
  onChange: (s: ExploreSectorSelection | null) => void;
  onOpenFull: (s: ExploreSectorSelection) => void;
}) {
  const visible = sectors.slice(0, 8);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-[var(--undp-gray)] mb-1.5">
        Focus a sector
      </p>
      <div className="flex flex-wrap gap-1.5">
        {visible.map((s) => {
          const isActive = active?.categoryId === s.categoryId;
          return (
            <button
              key={s.categoryId}
              type="button"
              onClick={() =>
                onChange(
                  isActive
                    ? null
                    : {
                        categoryId: s.categoryId,
                        categoryName: s.categoryName,
                        taxonomyType,
                      },
                )
              }
              aria-pressed={isActive}
              className={chip(isActive)}
              title={`${s.categoryName} · ${s.tensionCount} flagged pair${s.tensionCount === 1 ? "" : "s"}`}
            >
              {s.categoryName}{" "}
              <span className="opacity-60 ml-1">{s.tensionCount}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            const target = active ??
              (sectors[0]
                ? {
                    categoryId: sectors[0].categoryId,
                    categoryName: sectors[0].categoryName,
                    taxonomyType,
                  }
                : null);
            if (target) onOpenFull(target);
          }}
          className="px-3 py-1.5 rounded-full text-xs font-medium border border-dashed border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)] transition-colors"
          title="Open the sector view drawer"
        >
          + Open sector
        </button>
      </div>
    </div>
  );
}

function chip(active: boolean) {
  return `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
    active
      ? "bg-[var(--undp-black)] border-[var(--undp-black)] text-white"
      : "bg-white border-gray-300 text-[var(--undp-gray)] hover:border-[var(--undp-black)] hover:text-[var(--undp-black)]"
  }`;
}
