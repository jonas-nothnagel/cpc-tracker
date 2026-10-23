/**
 * The official chain's shape (python/output/{country}/ber_chain.json), safe
 * to run in the browser; the file is read on the server (`loadBerChain` in
 * ./ber-chain).
 */

import type { Nr7Status } from "@/lib/labels";

export interface ChainTarget {
  /** The report's own id: "NT03" for Mongolia, the CBD tool's unique id otherwise. */
  id: string;
  /** A short label the report gives ("NT03"), where it gives one. */
  label: string | null;
  /** The national target as the report words it. */
  text: string;
  status: Nr7Status;
  /** The report's own level of progress, verbatim. */
  levelOfProgress: string;
  /** The GBF targets the country filed it under. */
  gbf: number[];
  /** GBF target number -> the CBD's heading, as the report gives it. */
  gbfTitles: Record<string, string>;
  /** The corpus NBSAP target it restates, where matched. */
  nbsapTargetId: string | null;
  /** The budget lines it meets, and through which GBF targets. */
  lines: { code: string; via: number[] }[];
}

export interface BerChain {
  targets: ChainTarget[];
  /** Line code -> its expenditure type and the GBF targets it leads to: those
   *  both models' types share, or a person's checked type's. */
  lines: Record<string, { type: string | null; gbf: number[]; linked: boolean; checked: boolean }>;
}

const STATUSES: Nr7Status[] = ["on_track", "limited", "no_progress", "unknown"];

function str(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function numbers(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((n): n is number => typeof n === "number" && Number.isFinite(n)) : [];
}

export function parseBerChain(raw: unknown): BerChain | null {
  const data = raw as { nationalTargets?: unknown; lines?: unknown } | null;
  if (!data || !Array.isArray(data.nationalTargets)) return null;
  const targets: ChainTarget[] = [];
  for (const t of data.nationalTargets as Record<string, unknown>[]) {
    const id = str(t?.id);
    const text = str(t?.text);
    if (!id || !text) continue;
    const status = STATUSES.includes(t.status as Nr7Status) ? (t.status as Nr7Status) : "unknown";
    const titles = (t.gbfTitles && typeof t.gbfTitles === "object" ? t.gbfTitles : {}) as Record<string, unknown>;
    targets.push({
      id,
      label: str(t.label),
      text,
      status,
      levelOfProgress: str(t.levelOfProgress) ?? "",
      gbf: numbers(t.gbf),
      gbfTitles: Object.fromEntries(Object.entries(titles).filter((e): e is [string, string] => typeof e[1] === "string")),
      nbsapTargetId: str(t.nbsapTargetId),
      lines: (Array.isArray(t.lines) ? (t.lines as Record<string, unknown>[]) : [])
        .filter((l) => typeof l?.code === "string")
        .map((l) => ({ code: l.code as string, via: numbers(l.via) })),
    });
  }
  const lines: BerChain["lines"] = {};
  for (const [code, l] of Object.entries((data.lines ?? {}) as Record<string, Record<string, unknown>>)) {
    lines[code] = { type: str(l?.type), gbf: numbers(l?.gbf), linked: l?.status === "linked", checked: l?.checked === true };
  }
  return { targets, lines };
}
