import { overallLead, scopeOf, toneCounts, type OverallLead, type ToneCounts } from "./compute";
import { defaultSelection } from "./selection";
import type { BriefSource } from "./source";

/** The figures a country's brief opens with: its standard documents, their
 *  targets and how every target pair reads. The landing previews them, so
 *  they come from the brief's own selection and counts, never a copy. */
export interface BriefOverview {
  documents: number;
  targets: number;
  counts: ToneCounts;
  lead: OverallLead;
}

export function briefOverview(source: BriefSource): BriefOverview {
  const scope = scopeOf(source, defaultSelection(source).docs);
  const counts = toneCounts(scope.comparisons);
  return {
    documents: scope.docs.length,
    targets: scope.commitments.length,
    counts,
    lead: overallLead(counts),
  };
}
