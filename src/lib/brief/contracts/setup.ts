import type { BriefDocument, BriefLens, BriefSource } from "../source";
import type { ContractsFile } from "./model";

/**
 * Everything the contracts page needs in the browser: the record, and the
 * brief's documents, targets and policy-area lenses. Budget lines and
 * reported actions stay off this page (they are other views of public money
 * and implementation; the Explore ring shows them).
 */
export interface ContractsSetup {
  countryId: string;
  countryName: string;
  file: ContractsFile;
  documents: BriefDocument[];
  targets: { id: string; doc: string; label: string; text: string }[];
  lenses: BriefLens[];
}

const PAGE_LENSES = new Set(["globe", "ipcc", "gga"]);

export function contractsSetup(args: { file: ContractsFile; source: BriefSource }): ContractsSetup {
  const { file, source } = args;
  return {
    countryId: source.countryId,
    countryName: source.countryName,
    file,
    documents: source.documents,
    targets: source.commitments.map((c) => ({ id: c.id, doc: c.doc, label: c.label, text: c.text })),
    lenses: source.lenses.filter((l) => PAGE_LENSES.has(l.id)),
  };
}
