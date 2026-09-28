import type { ExploreLayers } from "../explore/layers";
import { LEVEL_CODES, type BriefDocument, type BriefLens, type BriefSource } from "../source";
import type { ContractsFile } from "./model";

/**
 * Everything the contracts page needs in the browser: the record, the
 * brief's documents, targets and policy-area lenses, and, from the finance
 * and implementation layers, which targets have a strongly matching budget
 * line (Biodiversity Expenditure Review) or reported action (Biennial
 * Transparency Report), with their names.
 */
export interface ContractsSetup {
  countryId: string;
  countryName: string;
  file: ContractsFile;
  documents: BriefDocument[];
  targets: { id: string; doc: string; label: string; text: string }[];
  lenses: BriefLens[];
  budget: string[];
  action: string[];
  backing: Record<string, { budget: string[]; action: string[] }>;
}

const PAGE_LENSES = new Set(["globe", "ipcc", "gga"]);

export function contractsSetup(args: {
  file: ContractsFile;
  source: BriefSource;
  layers: ExploreLayers | null;
}): ContractsSetup {
  const { file, source, layers } = args;
  const high = LEVEL_CODES.indexOf("high");
  const budget = new Set<string>();
  const action = new Set<string>();
  const backing: ContractsSetup["backing"] = {};
  for (const [target, index, level] of layers?.links ?? []) {
    if (level !== high) continue;
    const item = layers?.items[index];
    if (!item) continue;
    const b = (backing[target] ??= { budget: [], action: [] });
    if (item.layer === "budget") {
      budget.add(target);
      if (!b.budget.includes(item.name)) b.budget.push(item.name);
    } else {
      action.add(target);
      if (!b.action.includes(item.name)) b.action.push(item.name);
    }
  }
  return {
    countryId: source.countryId,
    countryName: source.countryName,
    file,
    documents: source.documents,
    targets: source.commitments.map((c) => ({ id: c.id, doc: c.doc, label: c.label, text: c.text })),
    lenses: source.lenses.filter((l) => PAGE_LENSES.has(l.id)),
    budget: [...budget],
    action: [...action],
    backing,
  };
}
