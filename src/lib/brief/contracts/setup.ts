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

/**
 * The setup as a brief of these documents reads it: their documents and
 * targets, and each contract's strong matches and potential misalignments
 * with those targets only. The money stays whole (every contract, the
 * record's totals). The setup itself while every document is in the brief.
 */
export function scopeSetup(setup: ContractsSetup, docs: readonly string[]): ContractsSetup {
  const keep = new Set(docs);
  if (setup.documents.every((d) => keep.has(d.id))) return setup;
  const targets = setup.targets.filter((x) => keep.has(x.doc));
  const inScope = new Set(targets.map((x) => x.id));
  return {
    ...setup,
    documents: setup.documents.filter((d) => keep.has(d.id)),
    targets,
    file: {
      ...setup.file,
      contracts: setup.file.contracts.map((c) => ({
        ...c,
        matches: c.matches.filter((id) => inScope.has(id)),
        misaligned: c.misaligned.filter((id) => inScope.has(id)),
      })),
    },
  };
}
