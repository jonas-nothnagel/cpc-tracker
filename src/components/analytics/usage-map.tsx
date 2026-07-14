"use client";

import { useState } from "react";

import type { AnalyticsSummary, SectionUsage } from "@/lib/analytics/types";

import { SectionMiniature } from "./miniatures";

/**
 * "What gets used" — the usage map. A vertical schematic mirroring the real
 * coherence dashboard top-to-bottom: one row per section, shaded darker the
 * more it is used, with plain-language callouts and a click-to-drill list of
 * the controls people actually used inside each section. Audience is
 * non-technical staff; no analytics jargon anywhere.
 *
 * Color: sequential single-hue UNDP-blue ramp (light → dark = low → high),
 * bucketed by share of interactions. Text always in ink colors, never on
 * the ramp. Zero-usage rows use a neutral dashed treatment, not the ramp.
 *
 * REMOVABLE SYSTEM: see src/lib/analytics/README.md.
 */

/** Lightness-monotonic UNDP-blue steps, low → high usage. */
const RAMP = ["#eaf2f9", "#c6dcef", "#93bfe0", "#4f97c9", "#0468b1"];
const ZERO_FILL = "#f1f5f9";

export function UsageMap({
  sectionUsage,
  elementsBySection,
  regionsBySection,
}: {
  sectionUsage: SectionUsage[];
  elementsBySection: AnalyticsSummary["elementsBySection"];
  regionsBySection: AnalyticsSummary["regionsBySection"];
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const maxShare = Math.max(...sectionUsage.map((s) => s.shareOfInteractions));
  const allZero = sectionUsage.every(
    (s) => s.interactions === 0 && s.views === 0,
  );
  const mostUsed =
    maxShare > 0
      ? sectionUsage.reduce((a, b) =>
          b.shareOfInteractions > a.shareOfInteractions ? b : a,
        ).section
      : null;

  return (
    <section>
      <p className="mb-4 max-w-3xl text-sm text-slate-500">
        Each row is one part of the country dashboard, in the order it appears
        on the page. Darker = used more. Click a row to see a sketch of that
        part, shaded by what people used inside it.
      </p>

      {allZero ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          Nothing measured yet — section-level tracking started recently, so
          give it a little time after people visit the dashboard. The Traffic
          tab still shows overall visits.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {sectionUsage.map((s) => (
            <UsageRow
              key={s.section}
              usage={s}
              maxShare={maxShare}
              isMostUsed={s.section === mostUsed}
              open={openSection === s.section}
              onToggle={() =>
                setOpenSection(openSection === s.section ? null : s.section)
              }
              elements={elementsBySection[s.section] ?? []}
              regions={regionsBySection[s.section] ?? []}
            />
          ))}
        </ol>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Counting since section tracking was added (July 2026); earlier visits
        appear only under Traffic. Time spent is approximate.
      </p>
    </section>
  );
}

function UsageRow({
  usage,
  maxShare,
  isMostUsed,
  open,
  onToggle,
  elements,
  regions,
}: {
  usage: SectionUsage;
  maxShare: number;
  isMostUsed: boolean;
  open: boolean;
  onToggle: () => void;
  elements: { label: string; count: number }[];
  regions: { region: string; count: number }[];
}) {
  const neverUsed = usage.interactions === 0 && usage.views === 0;
  const rarelyUsed = !neverUsed && usage.shareOfInteractions < 0.05;
  const rel = maxShare > 0 ? usage.shareOfInteractions / maxShare : 0;
  const fill = neverUsed
    ? ZERO_FILL
    : RAMP[Math.min(RAMP.length - 1, Math.floor(rel * (RAMP.length - 1) + 0.5))];
  const barWidth = neverUsed ? 0 : Math.max(4, Math.round(rel * 100));

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full rounded-lg border px-4 py-3 text-left transition-colors hover:border-slate-400 ${
          neverUsed ? "border-dashed border-slate-300" : "border-slate-200"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-5 text-xs tabular-nums text-slate-400">
            {usage.order}.
          </span>
          <span className="min-w-40 font-medium text-slate-800">
            {usage.name}
          </span>
          <span className="hidden text-xs text-slate-400 sm:inline">
            {usage.blurb}
          </span>
          <span className="ml-auto flex items-center gap-2">
            {isMostUsed && <Chip tone="dark">Most used</Chip>}
            {rarelyUsed && <Chip tone="light">Rarely used</Chip>}
            {neverUsed && <Chip tone="muted">Never used yet</Chip>}
          </span>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="block h-4 rounded"
            style={{
              width: `${barWidth}%`,
              backgroundColor: fill,
              minWidth: neverUsed ? 0 : "0.5rem",
            }}
          />
          <span className="whitespace-nowrap text-xs tabular-nums text-slate-600">
            {Math.round(usage.shareOfInteractions * 100)}% of activity
            {" · "}
            {usage.viewers} {usage.viewers === 1 ? "person" : "people"} saw it
            {usage.medianDwellMs > 0 &&
              ` · ~${fmtShort(usage.medianDwellMs)} spent here`}
          </span>
        </div>
        {usage.conditional && (
          <p className="mt-1 text-[11px] text-slate-400">
            Only shown for countries with this data.
          </p>
        )}
      </button>

      {open && (
        <div className="mx-4 rounded-b-lg border border-t-0 border-slate-200 bg-slate-50 px-4 py-4">
          <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Where people interact — hover for details
              </h3>
              {elements.length === 0 && (
                <p className="mb-2 text-sm text-slate-400">
                  No one has used this part yet — here is what it looks like.
                </p>
              )}
              <SectionMiniature
                section={usage.section}
                sectionName={usage.name}
                regionCounts={regions}
                elements={elements}
              />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Most-used controls
              </h3>
              {elements.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {elements.slice(0, 8).map((el) => (
                      <tr
                        key={el.label}
                        className="border-b border-slate-200/70 last:border-0"
                      >
                        <td className="py-1 pr-4 text-slate-700">{el.label}</td>
                        <td className="py-1 text-right tabular-nums text-slate-600">
                          {el.count} {el.count === 1 ? "time" : "times"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "dark" | "light" | "muted";
  children: React.ReactNode;
}) {
  const styles = {
    dark: "bg-[#0468b1] text-white",
    light: "bg-[#eaf2f9] text-[#0468b1]",
    muted: "bg-slate-100 text-slate-500",
  }[tone];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {children}
    </span>
  );
}

function fmtShort(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)} min`;
}
