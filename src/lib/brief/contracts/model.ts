/**
 * The public contract record beside the targets: the page payload the bake
 * writes (python/scripts/build_contracts_layer.py) and its parsing. Money is
 * in the record's currency (tugrik) as plain numbers; every contract counts
 * once.
 */

/** A contract's purpose as the AI read it: mainly for nature or climate
 *  ("principal"), with it as a side benefit ("significant"), or neither
 *  ("none": such contracts appear only when a target was compared with them). */
export type Tier = "principal" | "significant" | "none";

export type LensKey = "globe" | "ipcc" | "gga";
export const LENS_KEYS: readonly LensKey[] = ["globe", "ipcc", "gga"];

/** Where a contract names no single place (none, or several). */
export const NO_PLACE = "none";

export interface TierTotals {
  contracts: number;
  value: number;
}

export interface ContractYear {
  year: number;
  /** Every contract of the year. */
  contracts: number;
  value: number;
  principal: TierTotals;
  significant: TierTotals;
}

export interface Contract {
  id: string;
  /** The tender it came from; lots of one tender share it. */
  tender: string;
  year: number;
  tier: Tier;
  value: number;
  /** English title (machine translation) when there is one, else the original. */
  title: string;
  translated: boolean;
  /** ISO 3166-2 code of the one place it names, "several", or null. */
  place: string | null;
  /** Its own primary policy area under each lens, where it has one. */
  areas: Partial<Record<LensKey, string>>;
  /** Targets it strongly matches. */
  matches: string[];
  /** Targets it is potentially misaligned with (high confidence). */
  misaligned: string[];
}

/** The whole record in one place: a region's ISO 3166-2 code, or NO_PLACE
 *  where a contract names no single place. */
export interface PlaceTotal {
  code: string;
  contracts: number;
  value: number;
}

export interface ContractsFile {
  version: 1;
  source: {
    name: string;
    url: string;
    firstYear: number;
    lastYear: number;
    /** The platform's snapshot, "YYYY-MM". */
    snapshot: string;
    /** Tugrik per US$, indicative. */
    usdRate: number;
    /** Records the source lists twice, counted once. */
    duplicates: { records: number; value: number };
    /** Contracts compared with the targets beyond those for nature or climate. */
    comparedOthers: number;
    excluded: { otherCurrency: number; rejected: number };
  };
  census: { contracts: number; tenders: number; value: number };
  years: ContractYear[];
  /** Every contract of the record by place (bakes before round 2 have none). */
  places?: PlaceTotal[];
  contracts: Contract[];
  /** The policy analysis on the target pairs served by contracts matching
   *  targets in three or more documents, each pair once. */
  agreement: { high: number; flagged: number; total: number };
  /** Contracts that strongly match two targets the policy analysis rates as
   *  potentially misaligned. */
  faultline: { contract: string; pairs: [string, string][] }[];
  /** The contract "See one contract in full" opens. */
  example: string | null;
}

/** One contract's record and the AI's explanations, fetched on request. */
export interface ContractRecord {
  id: string;
  /** The title as published. */
  original: string;
  /** Machine translation, when there is one. */
  english: string | null;
  /** The public body buying (the record's own field; shown only here). */
  buyer: string;
  code: string;
  /** goods, works, services, consulting, non_consulting, framework, turnkey, direct, e_shop, other */
  type: string;
  /** new, approved, sent, in_progress, closed, other */
  stage: string;
  start: string | null;
  end: string | null;
  url: string;
  /** The purpose reading's one-line reason, in the language the AI wrote it. */
  reason: string;
  /** Contracts in the same tender. */
  lots: number;
  strong: { target: string; text: string }[];
  misaligned: { target: string; text: string; confidence: string; mechanism: string | null }[];
}

export function parseContractsFile(raw: unknown): ContractsFile | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Partial<ContractsFile>;
  if (f.version !== 1 || !f.source || !f.census) return null;
  if (!Array.isArray(f.years) || !Array.isArray(f.contracts)) return null;
  if (f.places !== undefined && !Array.isArray(f.places)) return null;
  return f as ContractsFile;
}

export function tierTotals(file: ContractsFile, tier: "principal" | "significant"): TierTotals {
  return file.years.reduce(
    (t, y) => ({ contracts: t.contracts + y[tier].contracts, value: t.value + y[tier].value }),
    { contracts: 0, value: 0 },
  );
}

/** For nature or climate, mainly or as a side benefit. */
export function isGreen(c: Contract): boolean {
  return c.tier === "principal" || c.tier === "significant";
}
