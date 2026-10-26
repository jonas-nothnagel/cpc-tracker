import type { TargetSource, TextCleanup } from "@/types";
import type { OwnLensInput } from "./own-areas";

/**
 * An upload in progress, as the server keeps it under its analysis id and
 * the page shows it. Client-safe: types only.
 */

/** Where a document is on its way to targets. A spreadsheet's documents
 *  arrive "read". */
export type ReadingState = "added" | "queued" | "reading" | "read" | "noText" | "failed";

/** One target as read from a document (or typed in), with the reviewer's
 *  edits and the reading's provenance. */
export interface DraftTarget {
  /** Stable within the draft: `{docId}-{n}`, `{docId}-a{n}` for typed ones. */
  key: string;
  label: string;
  /** The English working text. */
  text: string;
  removed?: true;
  /** Typed in by the reviewer, not read from the document. */
  added?: true;
  /** As first shown, so the review ledger can tell edits apart. */
  initialText?: string;
  initialLabel?: string;
  pageNumbers?: number[];
  /** The document's language when it is not English. */
  language?: string;
  textOriginal?: string;
  labelOriginal?: string;
  textOriginalSource?: "source" | "machine";
  sources?: TargetSource[];
  textCleanup?: TextCleanup;
  activities?: string;
  actions?: string;
  _provenanceFlag?: string;
}

export interface DraftDocument {
  /** `d1`, `d2`, … never reused within a draft. */
  id: string;
  /** Read by the AI from a PDF, Word or text file, or rows of a spreadsheet. */
  source: "read" | "table";
  fileName: string;
  /** Editable until the start; becomes the document's name in the brief. */
  name: string;
  /** Editable until the start; the short name targets are filed under. */
  code: string;
  state: ReadingState;
  /** Parts read so far while reading, of `parts`. */
  part?: number;
  parts?: number;
  /** Times reading was started, and when it last was. */
  attempts?: number;
  readingAt?: string;
  /** Pages without machine-readable text, of `pages`. */
  emptyPages?: number;
  pages?: number;
  targets: DraftTarget[];
}

/** The reading's footprint, summed over every document read. */
export interface ExtractionFootprint {
  energy_wh: number;
  water_ml: number;
  co2_geq: number;
  minerals_ugsbeq: number;
  energy_wh_min: number;
  energy_wh_max: number;
  water_ml_min: number;
  water_ml_max: number;
  co2_geq_min: number;
  co2_geq_max: number;
  minerals_ugsbeq_min: number;
  minerals_ugsbeq_max: number;
  call_count: number;
  tracked_call_count: number;
  cached_call_count: number;
}

export interface Draft {
  id: string;
  createdAt: string;
  updatedAt: string;
  country: string;
  /** The language the upload was started in. */
  locale: string;
  documents: DraftDocument[];
  btr: { fileNames: string[]; data: Record<string, unknown>; actions: number } | null;
  ownLens: OwnLensInput | null;
  footprint: ExtractionFootprint | null;
  /** Once true, the draft is the analysis's record and takes no changes. */
  started: boolean;
  /** The number the next document's id takes. */
  nextDoc: number;
}

/** One edit from the page: one field, so two tabs never undo each other. */
export type DraftChange =
  | { op: "country"; value: string }
  | { op: "document"; id: string; name?: string; code?: string }
  | { op: "removeDocument"; id: string }
  | { op: "target"; docId: string; key: string; text?: string; removed?: boolean }
  | { op: "addTarget"; docId: string; label: string; text: string; key?: string }
  | { op: "ownLens"; value: OwnLensInput | null }
  | { op: "removeBtr" };
