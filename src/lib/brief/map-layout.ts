/**
 * Geometry for the map of commitments: every commitment is one square cell,
 * grouped into a block per document under the document's name. Blocks are
 * square-ish and packed onto shelves in document order; the cell size is the
 * largest that lets the whole map fit the height available, so Sri Lanka's
 * 404 commitments and Cote d'Ivoire's 209 fill the same sheet legibly.
 */

export interface MapBlock {
  doc: string;
  count: number;
  x: number;
  y: number;
  cols: number;
  rows: number;
  /** Includes the label area above the cells. */
  width: number;
  height: number;
}

export interface MapLayout {
  cell: number;
  gap: number;
  /** Space above each block's cells for the document name. */
  labelHeight: number;
  blocks: MapBlock[];
  width: number;
  height: number;
}

export interface MapLayoutOptions {
  labelHeight?: number;
  /** Narrowest block, so a two-line document name has room. */
  minBlockWidth?: number;
  maxCell?: number;
  minCell?: number;
}

function pack(
  docs: { id: string; count: number }[],
  width: number,
  cell: number,
  labelHeight: number,
  minBlockWidth: number,
): MapLayout {
  const gap = Math.max(1, Math.round(cell * 0.2));
  const pitch = cell + gap;
  const blockGap = Math.max(16, cell * 2);
  const shelfGap = Math.max(12, cell);
  const maxCols = Math.max(1, Math.floor((width + gap) / pitch));
  const blocks: MapBlock[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const d of docs) {
    if (d.count <= 0) continue;
    const forName = Math.floor((minBlockWidth + gap) / pitch);
    const cols = Math.min(maxCols, d.count, Math.max(Math.ceil(Math.sqrt(d.count)), forName));
    const rows = Math.ceil(d.count / cols);
    const w = Math.min(width, Math.max(cols * pitch - gap, minBlockWidth));
    const h = labelHeight + rows * pitch - gap;
    if (x > 0 && x + w > width) {
      x = 0;
      y += shelf + shelfGap;
      shelf = 0;
    }
    blocks.push({ doc: d.id, count: d.count, x, y, cols, rows, width: w, height: h });
    x += w + blockGap;
    shelf = Math.max(shelf, h);
  }
  return { cell, gap, labelHeight, blocks, width, height: y + shelf };
}

export function layoutMap(
  docs: { id: string; count: number }[],
  width: number,
  maxHeight: number,
  options: MapLayoutOptions = {},
): MapLayout {
  const labelHeight = options.labelHeight ?? 34;
  const minBlockWidth = options.minBlockWidth ?? 120;
  const maxCell = options.maxCell ?? 18;
  const minCell = options.minCell ?? 5;
  let layout = pack(docs, width, minCell, labelHeight, minBlockWidth);
  for (let cell = maxCell; cell >= minCell; cell--) {
    layout = pack(docs, width, cell, labelHeight, minBlockWidth);
    if (layout.height <= maxHeight) return layout;
  }
  return layout;
}

/** Top-left corner of the i-th cell of a block (row by row under the label). */
export function cellOrigin(layout: MapLayout, block: MapBlock, i: number): { x: number; y: number } {
  const pitch = layout.cell + layout.gap;
  return {
    x: block.x + (i % block.cols) * pitch,
    y: block.y + layout.labelHeight + Math.floor(i / block.cols) * pitch,
  };
}
