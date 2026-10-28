import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import type { Nr7Status } from "@/lib/labels";
import { LEVEL_CODES, MECHANISM_CODES, type BriefSource } from "../source";
import { shownName, type BerNames } from "../ber-names-shared";
import { areaLines, berRecord, completeYears, countedIn, lineText, shownCurrency } from "../ber-record";
import type { TargetLabels } from "../target-labels";

/**
 * The implementation and finance layers of the ring, where a country has
 * them: actions reported in the Biennial Transparency Report (BTR), split into
 * mitigation and adaptation as the report does, and budget lines of the
 * Biodiversity Expenditure Review (BER), each with the AI's readings against
 * the policy targets. NR7 progress travels along as each NBSAP target's own
 * self-assessed status.
 */

export type LayerId = "mitigation" | "adaptation" | "budget";

export const LAYER_ORDER: LayerId[] = ["mitigation", "adaptation", "budget"];

export interface LayerItem {
  id: string;
  layer: LayerId;
  /** The source's own label, e.g. "71401 Waste management". */
  label: string;
  /** The label without its budget code, for running text. */
  name: string;
  code?: string;
  /** The source's own name where the name shown differs from it (written
   *  out, or translated): kept for the reader to check against. */
  original?: string;
  /** The name shown is a machine translation of the source's, as a
   *  target's text is flagged (`BriefCommitment.translated`). */
  translated?: "machine";
  text: string;
  /** The description shown was written with AI for its source, as the
   *  review says of its own (`descriptionAiGenerated`): labelled so. */
  aiWritten?: true;
  /** The description shown is a machine translation, the name the
   *  source's own. */
  textTranslated?: "machine";
  /** A reported action's status as the BTR states it ("Ongoing"). */
  status?: string;
  /** A budget line's spending over the years the review reports, in the
   *  review's currency and unit; `usd` is the same in US$ million, each year
   *  at its own rate, where the review is not in US$. */
  spend?: { total: number; years: number; usd?: number };
}

/**
 * Every reading of the items against the targets, packed for the page (a
 * review rebuilt from its own workbook reads every budget line against every
 * target: 96,888 readings for Panama). `targets` names the targets read;
 * `rows` holds one string per item, one character per target in that order:
 * "." for no reading, else "A" + level code × 4 + mechanism code, codes as in
 * `BriefSource.comparisons`. Read them with `layerReadings`.
 */
export interface LayerLinks {
  targets: string[];
  rows: string[];
}

export interface ExploreLayers {
  items: LayerItem[];
  links: LayerLinks;
  /** The budget lines' currency and unit as the review states them. `usd`:
   *  every line also carries its US$ figure, which every page but the
   *  country's own-language one states instead (the money rule). */
  budget?: { currency: string; unit: string; start: number; end: number; usd?: true };
  /** NBSAP target id -> its least advanced NR7 status. */
  nr7?: Record<string, Nr7Status>;
}

/** Least advanced first: the status an NBSAP target shows when two national
 *  targets map to it. */
const NR7_RANK: Nr7Status[] = ["no_progress", "limited", "on_track", "unknown"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** A budget line's description from the review, in the reader's language. */
function describe(program: Record<string, unknown>, locale: string): string {
  const pick = (key: string) => (typeof program[key] === "string" && program[key] ? String(program[key]) : null);
  return (locale === "es" ? pick("descriptionEs") : pick("descriptionEn")) ?? pick("description") ?? String(program.name ?? "");
}

export function buildExploreLayers(
  data: Record<string, unknown>,
  source: BriefSource,
  {
    locale = "en",
    names = null,
    labels = null,
  }: {
    locale?: string;
    names?: BerNames | null;
    /** Reported actions' titles and texts in the page's language, where the
     *  report gives none (machine translations). */
    labels?: TargetLabels | null;
  } = {},
): ExploreLayers | null {
  const items: LayerItem[] = [];
  // The review's own record of each budget line: its name, and its
  // description in the reader's language (never the text written for the AI).
  const programs = new Map(
    ((asRecord(data.berData)?.programs as Record<string, unknown>[] | undefined) ?? []).map((p) => [String(p.code), p]),
  );
  const raws = ((data.targets as Record<string, unknown>[]) ?? []).filter((t) => t.sourceDocument === "BTR");
  for (const layer of ["mitigation", "adaptation"] as const) {
    for (const t of raws) {
      const kind = t.actionType === "adaptation" ? "adaptation" : "mitigation";
      if (kind !== layer) continue;
      const own = String(t.sourceLabel ?? t.id);
      // In a language the report does not give, its machine translation,
      // flagged, with the report's own title kept.
      const label = labels?.labels[String(t.id)]?.[locale];
      const text = label ? labels?.texts[String(t.id)]?.[locale] : undefined;
      items.push({
        id: String(t.id),
        layer,
        label: label ?? own,
        name: label ?? own,
        ...(label ? { original: own, translated: "machine" as const } : {}),
        text: text ?? String(t.text ?? own),
        ...(t.measureStatus ? { status: String(t.measureStatus) } : {}),
      });
    }
  }
  // A review rebuilt from its own workbook (step 1 of the BER plan) gives its
  // lines and amounts from the record; its earlier comparisons with the
  // targets wait until they are rebuilt for those lines (step 3).
  const record = berRecord(data.berData);
  const complete = record ? completeYears(record) : [];
  // The same spending in US$ million, each year at its own rate, as the
  // spending section converts it; none for a review in US$ (Panama's balboa,
  // at par) or where a year has no rate.
  const atPar = record?.currency === "PAB";
  const base = record?.unit === "billion" ? 1e9 : 1e6;
  const usdRate = new Map(
    ((record?.years as Record<string, unknown>[] | undefined) ?? []).map((y) => [String(y.year), Number(y.usdRate)]),
  );
  const usdMillion = (line: Record<string, unknown>): number | undefined => {
    if (atPar) return undefined;
    let usd = 0;
    for (const year of complete) {
      const rate = usdRate.get(year);
      if (!rate || !Number.isFinite(rate) || rate <= 0) return undefined;
      usd += (countedIn(line, year) * base) / rate / 1e6;
    }
    return Math.round(usd * 1000) / 1000;
  };
  let everyUsd = !atPar;
  for (const line of record ? areaLines(record) : []) {
    const total = complete.reduce((s, y) => s + countedIn(line, y), 0);
    if (!(total > 0)) continue;
    const usd = usdMillion(line);
    if (usd === undefined) everyUsd = false;
    const code = String(line.code);
    const own = String(line.name ?? code);
    const listed = names?.names[code];
    const shown = shownName(listed, locale);
    // On the Mongolian page, the review's own Mongolian description where
    // the workbook has one, else its machine translation, marked.
    const described = locale === "mn" && listed?.mn ? listed.mnDescription : undefined;
    items.push({
      id: `BER_${code}`,
      layer: "budget",
      label: `${code} ${own}`,
      name: shown?.name ?? own,
      code,
      ...(shown && !shown.own && shown.name !== own ? { original: own } : {}),
      ...(shown?.machine ? { translated: "machine" as const } : {}),
      text: described ?? lineText(line),
      ...(described && listed?.mnDescriptionMachine && !shown?.machine ? { textTranslated: "machine" as const } : {}),
      spend: { total: Math.round(total * 1000) / 1000, years: complete.length, ...(usd !== undefined ? { usd } : {}) },
    });
  }
  for (const t of record ? [] : ((data.budgetPseudoTargets as Record<string, unknown>[]) ?? [])) {
    const label = String(t.sourceLabel ?? t.id);
    const [first, ...rest] = label.split(" ");
    const coded = rest.length > 0 && /\d/.test(first);
    const program = coded ? programs.get(first) : undefined;
    const own = program?.name ? String(program.name) : coded ? rest.join(" ") : label;
    const listed = coded ? names?.names[first] : undefined;
    const shown = shownName(listed, locale);
    // The review's own Mongolian description where it has one, else the
    // machine translation beside the name.
    const described = locale === "mn" && listed?.mn ? listed.mnDescription : undefined;
    const values = Object.values(asRecord(t.expenditure) ?? {}).filter((v): v is number => typeof v === "number");
    items.push({
      id: String(t.id),
      layer: "budget",
      label,
      name: shown?.name ?? own,
      ...(coded ? { code: first } : {}),
      // The review's name, where the one shown is not the review's own.
      ...(shown && !shown.own && shown.name !== own ? { original: own } : {}),
      ...(shown?.machine ? { translated: "machine" as const } : {}),
      text: described ?? (program ? describe(program, locale) : String(t.text ?? label)),
      ...(program?.descriptionAiGenerated === true ? { aiWritten: true as const } : {}),
      spend: { total: Math.round(values.reduce((s, v) => s + v, 0) * 1000) / 1000, years: values.length },
    });
  }
  if (items.length === 0) return null;

  const known = new Set(source.commitments.map((c) => c.id));
  const item = new Map(items.map((it, i) => [it.id, i]));
  // [target id, item index, code] per reading; a later reading of the same
  // pair replaces an earlier one.
  const read: [string, number, number][] = [];
  const addRows = (rows: Record<string, unknown>[] | undefined) => {
    for (const r of rows ?? []) {
      const a = String(r.targetAId);
      const b = String(r.targetBId);
      const target = known.has(a) ? a : known.has(b) ? b : undefined;
      const other = item.get(b) ?? item.get(a);
      if (target === undefined || other === undefined) continue;
      const level = LEVEL_CODES.indexOf(r.alignment as AlignmentLevel);
      if (level < 0) continue;
      const mechanism = Math.max(0, MECHANISM_CODES.indexOf((r.mechanism as AlignmentMechanism | undefined) ?? null));
      read.push([target, other, level * MECHANISM_CODES.length + mechanism]);
    }
  };
  addRows(data.alignment as Record<string, unknown>[]);
  if (!record || data.budgetAlignmentBasis === "ber-record") addRows(data.budgetAlignment as Record<string, unknown>[]);

  const ber = asRecord(data.berData);
  const period = asRecord(ber?.period);
  const budget = record
    ? complete.length
      ? {
          currency: shownCurrency(record),
          unit: String(record.unit ?? ""),
          start: Number(complete[0]),
          end: Number(complete[complete.length - 1]),
          ...(everyUsd ? { usd: true as const } : {}),
        }
      : undefined
    : ber && period
      ? {
          currency: String(ber.currency ?? ""),
          unit: String(ber.unit ?? ""),
          start: Number(period.start),
          end: Number(period.end),
        }
      : undefined;

  let nr7: Record<string, Nr7Status> | undefined;
  const progress = (asRecord(data.nr7Data)?.progressItems as Record<string, unknown>[]) ?? [];
  for (const p of progress) {
    const target = p.nbsapTargetId ? String(p.nbsapTargetId) : null;
    const status = String(p.progressStatus ?? "unknown") as Nr7Status;
    if (!target || !NR7_RANK.includes(status)) continue;
    nr7 = nr7 ?? {};
    const current = nr7[target];
    if (!current || NR7_RANK.indexOf(status) < NR7_RANK.indexOf(current)) nr7[target] = status;
  }

  const links = packLinks(read, source, items.length);
  return { items, links, ...(budget ? { budget } : {}), ...(nr7 ? { nr7 } : {}) };
}

const NO_READING = ".";
const FIRST_CODE = "A".charCodeAt(0);

/** The readings as `LayerLinks`: the targets read, in the source's order,
 *  and a row per item. */
function packLinks(read: [string, number, number][], source: BriefSource, count: number): LayerLinks {
  const isRead = new Set(read.map(([target]) => target));
  const targets = source.commitments.map((c) => c.id).filter((id) => isRead.has(id));
  const column = new Map(targets.map((id, i) => [id, i]));
  const cells = Array.from({ length: count }, () => new Array<string>(targets.length).fill(NO_READING));
  for (const [target, at, code] of read) cells[at][column.get(target)!] = String.fromCharCode(FIRST_CODE + code);
  return { targets, rows: cells.map((row) => row.join("")) };
}

/** Each reading in `links`: [target id, item index, level code, mechanism
 *  code], codes as in `BriefSource.comparisons`. */
export function* layerReadings(links: LayerLinks): Generator<[string, number, number, number]> {
  const kinds = MECHANISM_CODES.length;
  for (let at = 0; at < links.rows.length; at++) {
    const row = links.rows[at];
    for (let t = 0; t < row.length; t++) {
      const code = row.charCodeAt(t) - FIRST_CODE;
      if (code < 0) continue;
      yield [links.targets[t], at, Math.floor(code / kinds), code % kinds];
    }
  }
}

/** Every id and document a link may put in the centre from the layers:
 *  each action and budget line, and each layer as a whole. */
export function layerIdsOf(layers: ExploreLayers): string[] {
  const present = LAYER_ORDER.filter((l) => layers.items.some((it) => it.layer === l));
  return [...layers.items.map((it) => it.id), ...present.map((l) => `doc:layer:${l}`)];
}
