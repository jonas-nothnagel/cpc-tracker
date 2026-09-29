# Coherence brief, round 13: the map of documents, named on its edges

Date: 2026-09-29. Branch `experiment/coherence-pulse` (worktree `coherence-pulse`).
Direction approved in chat by Jonas after six rounds of real-data sketches ("lets go with 7, in
one aligned row"). Sketches: `.superpowers/brainstorm/12462-1790678217/content/`
(`lines-and-aligned.html` holds the approved column names; `today-look.html` the approved map).

## What Jonas said

- The map is good and he understands it. He asked for experiments that make it even clearer what
  the reader is looking at and which two documents a block compares, possibly rethinking the
  triangle, in the same philosophy.
- Round 1 offered three options: A (the triangle mirrored, rows named at the left edge, columns
  along the bottom), B (the triangle turned 45°) and C (pairs of documents side by side). He
  picked A.
- With eight documents, A was "very blurry and unreadable", and today's map "looked cleaner":
  its colouring and dots. The sketch had changed more than the names (solid squares, one tone,
  numbers in every block).
- Round 3 redrew both on today's own drawing: A against today's map with the pair traced on
  hover. He chose A: "easier to read even with the cost of double labels".
- The tilted column names under the map were not elegant ("don't overcomplicate it"). From his
  own eight mockups he chose number 7 in one aligned row: a short name, with a smaller second
  line for context, centred under each column on one baseline.
- He noticed eight documents but seven names per edge. This follows from the triangle: the
  first document has only a column, the last only a row. Kept as it is (R13.10).

## Decisions

R13.1 **Geometry.** The map becomes a lower triangle.
      - Rows are documents 2..N, top to bottom (the later document of each pair).
      - Columns are documents 1..N-1, left to right (the earlier one).
      - Every row starts at the left edge and every column ends at the bottom edge.
      - Each pair of documents is one block, sized by its two documents' targets. Each target
        pair is one square at its two targets.
      - No empty squares for a document with itself. The first document has no row; the last
        has no column.
      - Screen only: print has no map.

R13.2 **Look: today's.**
      - Squares sit on the device pixel grid with today's one-pixel gap.
      - Paper blocks.
      - On a side, the two tones: the concentrated targets' pairs at full ink, the side's other
        pairs at `MAP_MID`.
      - No numbers in the blocks.
      - The document colours move from the diagonal to 2.5px bars along the two edges.

R13.3 **Row names** stand at the left edge.
      - Right-aligned, up to three lines, beside the row's colour bar.
      - Spread apart like today's names, with R13.9's fix, and led back when moved.

R13.4 **Column names**, mockup 7, stand under the bottom edge.
      - Each sits under its column's colour bar, centred under the column, all on one baseline.
      - A short name comes first, then a smaller, muted line of context. The full name shows on
        hover.
      - They come from a new optional field on each document type in the country configs,
        `mapLabel: [name, context]`.
        - Mongolia uses Jonas's: Vision / 2050, NDC / Contribution, Paris / Agreement,
          Biodiv. / 2030, Adapt. / Plan, Food / Measures, LDN / Targets,
          LDN / Investment.
        - Elsewhere, the existing `mediumLabel` "ACRONYM (context)" splits in two
          ("NP (Nature Pledge)" becomes NP / Nature Pledge). Without a context, the
          `shortLabel` stands alone.
      - When the names do not fit on one row (Sri Lanka's 4-target documents), every second name
        drops a row. A thin line joins it to its column (mockup 2 with connecting lines).

R13.5 **Named targets** (the two sides). Same targets and same re-sorting as today, placed for
      the new geometry.
      - The first document's targets stand above the map, at the front of its column, as today.
      - The middle documents' targets stand in the empty half where their row ends. They are
        spread apart, with a lead back to their row.
      - The last document's targets stand under its row name at the left.
      - One line each, clipped with an ellipsis where the empty half narrows. The full text shows
        on hover.

R13.6 **Pointing and selecting.**
      - A block:
        - its row name and column name are marked (pale yellow, words only);
        - the other blocks are set back, as today;
        - two hairlines run along the white gaps, from the block to its row's bar and down to its
          column's bar, never over a square.
      - A document name, on either edge: its row and column come forward, and both its names are
        marked.
      - A named target: its row comes forward (from the left edge to where the row ends), with
        its column (from where the column starts to the bottom edge). Each block's count stands
        beside them as today.
      - Selecting works as today: a block opens its pair of documents, a name leads to that
        document, a square opens its comparison, and a target is kept.

R13.7 **Size and scale.**
      - The map takes the width the row names leave. The field keeps its size.
      - Checked on real data:
        - Mongolia with 4 and 8 documents;
        - Panama with 4, and with 8 including the 206-target REDD+ strategy;
        - Sri Lanka with 8;
        - Côte d'Ivoire with 3.
      - On a short field (phones), today's rules hold: target names take one line, then the ones
        carrying least go unnamed, never the one in focus. Column names fall back to two rows.

R13.8 **Walkthrough.**
      - The "Map of the documents" stop is rewritten for the new reading: rows named at the left,
        columns under the map, each block where a row and a column meet.
      - Any side stop that mentions the diagonal is rewritten too.
      - es/mn get English placeholders (branch practice).

R13.9 **Fix in `spread`** (`src/lib/brief/hub.ts`).
      - The first name is held inside the field before the others follow.
      - Today every name is squeezed to the top whenever the first one's place lies within half
        its height of the top edge. Sri Lanka's first row hit this in the sketches.

R13.10 **Not in this round.**
      - The How it works triangle keeps its diagonal.
      - The Explore ring and print are unchanged.
      - Naming all eight documents on both edges was considered and not taken: it would need an
        empty first row and an empty last column, which shrinks the map.

## Tests

- `src/lib/brief/hub.test.ts`: the map tests are rewritten for the new geometry.
  - Every pair once, one block per pair of documents.
  - Later document in rows, earlier in columns.
  - Names inside the field and apart, with many documents too.
  - Squares never overlap.
  - On a side: its pairs only, targets re-sorted, named targets placed per R13.5, the two tones.
  - A target in focus: its row, column and counts.
  - Phones: names fit at their height, and the target in focus is always named.
  - A unit test for R13.9.
- The column labels:
  - `mapLabel` resolution: an explicit label, the split `mediumLabel`, the `shortLabel` alone;
  - one row when the names fit, two rows with connecting lines when not.
- `src/components/brief/hub/hub-canvas.test.tsx`:
  - row names and two-line column names are rendered;
  - pointing at a block marks both names and draws the two hairlines;
  - pointing at a name brings its row and column forward.
- Full suite (`LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`), `tsc`, lint on changed files. `/brief`
  answers 200 for all four countries.
