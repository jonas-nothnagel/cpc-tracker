/** View-model for the coherence canvas. Everything is precomputed and
 *  pre-translated server-side; the client component owns only geometry,
 *  staging, and interaction. */

export interface PulseDocView {
  id: string;
  label: string;
  full: string;
  color: string;
  targetCount: number;
}

export interface PulseStrandView {
  pairKey: string;
  /** Row label in the pathway list: "3.4 Fodder production ↔ Livestock mitigation". */
  rowTitle: string;
  /** One caption line of ranked signals, pre-joined. */
  signals: string;
  /** The claim sentence (same template family as the finding headline). */
  claim: string;
  aTag: string;
  aText: string;
  bTag: string;
  bText: string;
  mechanismSentence?: string;
  rationale: string;
}

export interface PulseEdgeView {
  key: string;
  a: string;
  b: string;
  compared: number;
  flagged: number;
  alignedShare: number;
  rel: number;
  inflamed: boolean;
  /** "N potential misalignments in M compared pairs (P%)". */
  pathwayLine: string;
  /** "and N more, ranked" — empty when nothing is cut. */
  moreLine: string;
  strands: PulseStrandView[];
}

export interface PulseStrings {
  back: string;
  topStrands: string;
  showRationale: string;
  hideRationale: string;
  aiDisclaimer: string;
  openPage: string;
  targetsWord: string;
  clickHint: string;
  legendTissue: string;
  legendNerve: string;
}

export interface CoherenceCanvasProps {
  docs: PulseDocView[];
  edges: PulseEdgeView[];
  countryId: string;
  strings: PulseStrings;
}
