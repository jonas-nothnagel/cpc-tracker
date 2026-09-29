/**
 * The rows of "Where to look closer": one row per target, one dot per tender,
 * potentially misaligned to the left of a line and strongly matching to the
 * right, in three lines. A cloud longer than its side stops with a gap of one
 * column, then its last column, so the cut reads as a cut.
 */

export interface CloserInput {
  id: string;
  /** Its potentially misaligned tenders, the largest first. */
  mis: string[];
  /** How many tenders strongly match it. */
  match: number;
}

export interface CloserRow {
  id: string;
  /** The top of the row (its name). */
  y: number;
  /** The middle of its dots. */
  mid: number;
  misCols: number;
  matchCols: number;
  misCut: boolean;
  matchCut: boolean;
}

export interface CloserDot {
  x: number;
  y: number;
  kind: "mis" | "match";
  target: string;
  /** The tender a potentially misaligned dot stands for. */
  tender: string | null;
}

const NAME = 20;
const LINES = 3;
const GAP = 14;
const PITCH = 4.6;
/** The line between the two sides, as a share of the width. */
const SPINE_AT = 0.47;
/** Room at each end for the count. */
const COUNT_ROOM_LEFT = 36;
const COUNT_ROOM_RIGHT = 44;

export function layoutCloser(
  rows: CloserInput[],
  width: number,
): { rows: CloserRow[]; dots: CloserDot[]; spine: number; pitch: number; height: number } {
  const spine = Math.round(width * SPINE_AT);
  const capLeft = Math.max(4, Math.floor((spine - 5 - COUNT_ROOM_LEFT) / PITCH));
  const capRight = Math.max(4, Math.floor((width - spine - 5 - COUNT_ROOM_RIGHT) / PITCH));
  const dots: CloserDot[] = [];
  const out: CloserRow[] = [];
  let y = 4;
  for (const row of rows) {
    const band = y + NAME;
    const lay = (count: number, cap: number, kind: "mis" | "match") => {
      const cut = count > cap * LINES;
      const shown = cut ? (cap - 2) * LINES : count;
      const put = (k: number, col: number) =>
        dots.push({
          x: kind === "mis" ? spine - 5 - col * PITCH - PITCH / 2 : spine + 5 + col * PITCH + PITCH / 2,
          y: band + (k % LINES) * PITCH + PITCH / 2,
          kind,
          target: row.id,
          tender: kind === "mis" ? (row.mis[k] ?? null) : null,
        });
      for (let k = 0; k < shown; k++) put(k, Math.floor(k / LINES));
      if (cut) for (let k = 0; k < LINES; k++) put(count - LINES + k, cap - 1);
      return { cols: cut ? cap : Math.ceil(shown / LINES), cut };
    };
    const left = lay(row.mis.length, capLeft, "mis");
    const right = lay(row.match, capRight, "match");
    out.push({ id: row.id, y, mid: band + (LINES * PITCH) / 2, misCols: left.cols, matchCols: right.cols, misCut: left.cut, matchCut: right.cut });
    y += NAME + LINES * PITCH + GAP;
  }
  return { rows: out, dots, spine, pitch: PITCH, height: Math.max(y, 24) };
}
