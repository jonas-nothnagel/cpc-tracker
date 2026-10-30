import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { buildNr7Report, indicatorLabel } from "@/components/dashboard/coherence-briefing/nr7-report/nr7-self-report";
import { clip } from "./text";
import type { Nr7Data, Target } from "@/types";

/**
 * One national target's entry in the report, for the row that opens: the
 * report's words, each indicator with its series, the questionnaire answers,
 * and the reported actions read as strongly aligned. Read on the server, one
 * target at a time, so the report's text stays out of the page.
 *
 * Text filed in another language than the page's comes from a display overlay
 * (`python/data/external/nr7_{iso3}.{locale}.json`, machine translation); the
 * report's own wording stays beside it.
 */

const EXTERNAL_DIR = join(process.cwd(), "python", "data", "external");

export interface Nr7DetailSeries {
  label: string | null;
  unit: string | null;
  points: { year: number; value: number }[];
}

export interface Nr7DetailIndicator {
  id: string;
  label: string;
  /** On four targets or more: the report files it across its targets. */
  shared: boolean;
  series: Nr7DetailSeries[];
  /** The country's note where it gives one. */
  note: string | null;
}

export interface Nr7DetailAnswer {
  question: string;
  response: string;
  /** The answer's place on the standard scale; null outside it. */
  value: "yes" | "partially" | "under_development" | "no" | null;
}

export interface Nr7Detail {
  id: string;
  /** The report's own rating, word for word. */
  level: string | null;
  gbf: { code: string; title: string }[];
  words: {
    challenges: string | null;
    progress: string | null;
    actions: string | null;
    effectiveness: string | null;
  };
  /** The report's wording where the page shows a translation of it. */
  original?: Partial<Nr7Detail["words"]>;
  indicators: Nr7DetailIndicator[];
  answers: {
    mix: { yes: number; partially: number; underDevelopment: number; no: number; other: number };
    items: Nr7DetailAnswer[];
  };
  actions: { id: string; name: string; text: string }[];
}

/** A reported action's corpus label is its name cut at 60 characters, sometimes
 *  mid-word; such a name is clipped again at a word from the action's text. */
const ACTION_NAME_LENGTH = 90;

function actionName(target: Record<string, unknown>): string {
  const text = String(target.text ?? target.id);
  const label = target.sourceLabel ? String(target.sourceLabel) : null;
  return label && !label.endsWith("...") ? label : clip(text, ACTION_NAME_LENGTH);
}

const TOOL_CODE = /^[a-z]+(?:[A-Z][a-z]*)*$/;

/** The reporting tool files multiple-choice answers as its own codes,
 *  "forTerrestrialPlanning; climateChange": spelled out word by word, nothing
 *  added. A written answer stays as the country wrote it. */
export function readableResponse(response: string): string {
  const parts = response.split(";").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0 || !parts.every((p) => TOOL_CODE.test(p))) return response;
  return parts
    .map((p) => {
      const words = p.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`);
      return words[0].toUpperCase() + words.slice(1);
    })
    .join("; ");
}

interface Overlay {
  targets?: Record<string, Partial<Nr7Detail["words"]>>;
  indicators?: Record<string, { name?: string; comments?: string }>;
}

function loadOverlay(iso3: string, locale: string): Overlay {
  if (!/^[a-z]{3}$/.test(iso3) || !/^[a-z]{2}$/.test(locale)) return {};
  const path = join(EXTERNAL_DIR, `nr7_${iso3}.${locale}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as Overlay;
}

/** The entry of one national target, or null when the report has none. */
export function nr7Detail(data: Record<string, unknown>, id: string, locale: string): Nr7Detail | null {
  const nr7 = data.nr7Data as Nr7Data | null | undefined;
  const report = buildNr7Report(nr7, [], new Map<string, Target>());
  const row = report?.targets.find((t) => t.targetId === id);
  if (!report || !row || !nr7) return null;

  const overlay = loadOverlay(String(nr7.iso3 ?? "").toLowerCase(), locale);
  const shown = overlay.targets?.[id];
  const words: Nr7Detail["words"] = {
    challenges: shown?.challenges ?? row.keyChallengesSummary,
    progress: shown?.progress ?? row.progressSummary,
    actions: shown?.actions ?? row.mainActionsSummary,
    effectiveness: shown?.effectiveness ?? row.actionEffectivenessSummary,
  };

  const wanted = new Set([...row.specificIndicatorIds, ...row.sharedIndicatorIds]);
  const indicators = report.indicators
    .filter((i) => wanted.has(i.id) && (i.hasValues || Boolean(i.comments)))
    .sort((a, b) => Number(b.hasValues) - Number(a.hasValues) || Number(a.isShared) - Number(b.isShared))
    .map((i): Nr7DetailIndicator => {
      const translated = overlay.indicators?.[i.id];
      return {
        id: i.id,
        label: translated?.name ? `${i.code ? `${i.code} ` : ""}${translated.name}` : indicatorLabel(i),
        shared: i.isShared,
        series: i.series
          .map((s) => ({
            label: s.disaggregation ?? null,
            unit: s.unit ?? null,
            points: s.points
              .filter((p): p is typeof p & { year: number; value: number } => p.year !== null && p.value !== null)
              .map((p) => ({ year: p.year, value: p.value }))
              .sort((a, b) => a.year - b.year),
          }))
          .filter((s) => s.points.length > 0),
        note: translated?.comments ?? i.comments ?? null,
      };
    });

  const targets = (data.targets as Record<string, unknown>[] | undefined) ?? [];
  const actionTargets = new Map(
    targets.filter((t) => String(t.sourceDocument ?? "").startsWith("BTR")).map((t) => [String(t.id), t]),
  );
  const actions: Nr7Detail["actions"] = [];
  if (row.nbsapTargetId && actionTargets.size > 0) {
    for (const pair of (data.alignment as Record<string, unknown>[] | undefined) ?? []) {
      if (pair.alignment !== "high") continue;
      const a = String(pair.targetAId);
      const b = String(pair.targetBId);
      const other = a === row.nbsapTargetId ? b : b === row.nbsapTargetId ? a : null;
      const action = other ? actionTargets.get(other) : undefined;
      if (other && action) actions.push({ id: other, name: actionName(action), text: String(action.text ?? "") });
    }
  }

  return {
    id,
    level: row.levelOfProgress,
    gbf: row.gbfTargets.map((g) => ({ code: g.code, title: g.title })),
    words,
    ...(shown
      ? {
          original: {
            challenges: row.keyChallengesSummary,
            progress: row.progressSummary,
            actions: row.mainActionsSummary,
            effectiveness: row.actionEffectivenessSummary,
          },
        }
      : {}),
    indicators,
    answers: {
      mix: {
        yes: row.answers.yes,
        partially: row.answers.partially,
        underDevelopment: row.answers.underDevelopment,
        no: row.answers.no,
        other: row.answers.other,
      },
      items: [...row.scaleAnswers, ...row.otherAnswers].map((a) => ({
        question: a.questionTitle ?? a.indicatorTitle ?? a.questionNumber,
        response: readableResponse(a.response),
        value: a.responseValue ?? null,
      })),
    },
    actions,
  };
}
