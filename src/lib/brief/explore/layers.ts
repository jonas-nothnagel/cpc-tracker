import type { AlignmentLevel, AlignmentMechanism } from "@/types";
import type { Nr7Status } from "@/lib/labels";
import { LEVEL_CODES, MECHANISM_CODES, type BriefSource } from "../source";

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
  text: string;
  /** A reported action's status as the BTR states it ("Ongoing"). */
  status?: string;
  /** A budget line's spending over the years the review reports. */
  spend?: { total: number; years: number };
}

export interface ExploreLayers {
  items: LayerItem[];
  /** One reading per link: [target id, item index, level code, mechanism
   *  code], codes as in `BriefSource.comparisons`. */
  links: [string, number, number, number][];
  budget?: { currency: string; unit: string; start: number; end: number };
  /** NBSAP target id -> its least advanced NR7 status. */
  nr7?: Record<string, Nr7Status>;
}

/** Least advanced first: the status an NBSAP target shows when two national
 *  targets map to it. */
const NR7_RANK: Nr7Status[] = ["no_progress", "limited", "on_track", "unknown"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function buildExploreLayers(data: Record<string, unknown>, source: BriefSource): ExploreLayers | null {
  const items: LayerItem[] = [];
  const raws = ((data.targets as Record<string, unknown>[]) ?? []).filter((t) => t.sourceDocument === "BTR");
  for (const layer of ["mitigation", "adaptation"] as const) {
    for (const t of raws) {
      const kind = t.actionType === "adaptation" ? "adaptation" : "mitigation";
      if (kind !== layer) continue;
      const label = String(t.sourceLabel ?? t.id);
      items.push({
        id: String(t.id),
        layer,
        label,
        name: label,
        text: String(t.text ?? label),
        ...(t.measureStatus ? { status: String(t.measureStatus) } : {}),
      });
    }
  }
  for (const t of (data.budgetPseudoTargets as Record<string, unknown>[]) ?? []) {
    const label = String(t.sourceLabel ?? t.id);
    const [first, ...rest] = label.split(" ");
    const coded = rest.length > 0 && /\d/.test(first);
    const values = Object.values(asRecord(t.expenditure) ?? {}).filter((v): v is number => typeof v === "number");
    items.push({
      id: String(t.id),
      layer: "budget",
      label,
      name: coded ? rest.join(" ") : label,
      ...(coded ? { code: first } : {}),
      text: String(t.text ?? label),
      spend: { total: Math.round(values.reduce((s, v) => s + v, 0) * 1000) / 1000, years: values.length },
    });
  }
  if (items.length === 0) return null;

  const known = new Set(source.commitments.map((c) => c.id));
  const item = new Map(items.map((it, i) => [it.id, i]));
  const links: [string, number, number, number][] = [];
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
      links.push([target, other, level, mechanism]);
    }
  };
  addRows(data.alignment as Record<string, unknown>[]);
  addRows(data.budgetAlignment as Record<string, unknown>[]);

  const ber = asRecord(data.berData);
  const period = asRecord(ber?.period);
  const budget =
    ber && period
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

  return { items, links, ...(budget ? { budget } : {}), ...(nr7 ? { nr7 } : {}) };
}

/** Every id and document a link may put in the centre from the layers:
 *  each action and budget line, and each layer as a whole. */
export function layerIdsOf(layers: ExploreLayers): string[] {
  const present = LAYER_ORDER.filter((l) => layers.items.some((it) => it.layer === l));
  return [...layers.items.map((it) => it.id), ...present.map((l) => `doc:layer:${l}`)];
}
