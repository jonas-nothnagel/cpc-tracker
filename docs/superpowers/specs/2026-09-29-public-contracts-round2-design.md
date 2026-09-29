# Public contracts, round 2: one focus, seen from every angle

Date: 2026-09-29. Branch `experiment/coherence-pulse` (worktree `coherence-pulse`). Page
`/{country}/brief/contracts` (Mongolia only). Direction approved by Jonas after three rounds of
real-data sketches in the brainstorm companion (`.superpowers/brainstorm/97699-1790671665/content/`:
`round2.html`, `round3.html`, `round3b.html`, `round3c.html`). "Lets go with blue and build the full
brief for me to see it now."

## What Jonas said (round 2 onwards)

- Step 3, policy areas: sketch B (the money and the targets side by side) is "much better". The right
  side should show every area at once, with potentially misaligned beside strongly matching (no click
  on the left needed to change the right).
- Green for money is misleading. Green means strong alignment in the brief. "Mainly for nature or
  climate" is the taxonomy reading of a contract's title, not an alignment with targets. Ink and ochre:
  "not great". Choice: **UNDP blue** (#0468B1, the UNDP data viz library's graph main colour).
- The map was "good job". Filter it by policy area and by document ("is Vision 2050 implemented largely
  in a certain state?"). One filter was missing: **Strongly matching**, beside Potentially misaligned.
  "All contracts" is not a right-side filter but a switch on the left; nature or climate is the default.
  Filtered map views are "really cool and novel". **Move the map one step up**: it combines the most in
  one visual.
- Merge more; build views from each other; look at the same money from different angles; "a holistic
  exploration deep dive experience", without clutter ("we dont want to overwhelm users").
- "Behind each target" (contract / budget line / reported action per target) was not understood. BER
  and BTR are not to be mixed with contracts: dropped from this page.
- The synergy histogram ("two grey bars? why?") is gone; its finding lives in the focus views.
- "Where to look closer" is the clearest deep dive, but "looks unfinished".
- Build item 3 (the years answer the focus) and item 4 (the map's potentially misaligned tenders).

## Decisions

R2.1 **One focus.** The page keeps one focus: a policy area (under the chosen lens), a document and a
place, each optional. It is chosen where it lives:
- the policy area from step 4's rows or the map's policy-area choice;
- the document from the map's document choices;
- the place from the map.

A sticky line under the page head names it ("Focus: Restoration ✕ · Vision 2050 ✕ · Govi-Altai ✕";
"the whole record" when empty). Each ✕ clears its part. The lens is shared by the map and step 4.
Every view answers the focus in its own way:
- **Years (step 2):** the principal money in focus.
- **Map (step 3):**
  - the money layer: policy area and document;
  - the tender layers: the targets in focus (by document and target area);
  - the place is the selection.
- **Policy areas (step 4):** money by document and place; targets by document.
- **Deep dive:** targets by document and area; contracts by place.

R2.2 **Colours.**
- The record: ink (#232e3d).
- Money mainly for nature or climate: UNDP blue #0468B1.
- Side benefit: blue-100 #B5D5F5.
- The rest: pale #E4E6E9.
- Strongly matching: the brief green #2A7443.
- Potentially misaligned: the brief red #D2432C.
- Target dots: grey (#6B7684 with a strongly matching contract, #D5D9DF without).

Blue appears on this page only as data (no blue controls), a deliberate exception to DESIGN.md's One
Voice Rule, which the UNDP data viz library's own main colour supports.

R2.3 **Step order.** The record → for nature and climate → where it lands (map) → what the money is
for (policy areas). Without outlines, the map step is dropped.

R2.4 **Step 2 answers the focus.**
- The record's squares stay in their year columns.
- Each year's principal squares in focus keep the blue (counted by largest remainder of the focus money
  per year, never more than the year's principal squares); the rest of that year's principal and side
  benefit squares turn light blue.
- The column labels give the focus money per year (₮ billion or US$ million; the unit named once).
- One line under the finding: "{Money for Restoration}: ₮4.1 billion in 2019, ₮64.3 billion in 2025."
  It gives the first and last full years; a year is thin below 20% of the median year's contracts.

R2.5 **The map (step 3).**
- **The stage:** above the map, a plain switch "Mainly for nature or climate · All contracts" (the
  money layer only; default nature or climate).
- **The right side:** three plain choices, "Mainly for nature or climate · Strongly matching ·
  Potentially misaligned". Below them, the focus choices (all but All contracts):
  - "Policy area: [All policy areas ▾] Biodiversity" (a plain select, lens named);
  - "Document: All · Vision 2050 · NDC · …" (codes, full names on hover).
- **Money (no focus):**
  - The 155 principal squares move from the year columns into one block per place, at the place's point.
  - Blocks never overlap: they are pushed apart, and a displaced block keeps a hairline to its place.
  - Ulaanbaatar and "No single place named" sit in a band below the map (UB with a hairline up to its
    point).
  - Labels: name and "₮8.4 per ₮100".
  - Headline: the place with the highest rate. "In Govi-Altai, ₮8.4 of every ₮100 contracted went to
    work mainly for nature or climate; across the record, ₮1.6." Second: "Ulaanbaatar holds 35% of
    that money: ₮2.3 of every ₮100 contracted there."
- **All contracts:**
  - Every record square goes to its place's block (whole-record counts per place, from the bake), in ink.
  - Headline: "24% of the money in the record was contracted in Ulaanbaatar; 54% names no single
    place." Second: "Buyers that serve the whole country, such as state companies and national
    agencies, name no single place."
- **Money with a policy area or document in focus:**
  - Only the focus money, regrouped per place at a finer unit (₮5B, 2B, 1B, 500M, 200M, 100M, 50M…),
    chosen so the focus fills about 100 squares or more. The unit is named in the corner ("One square:
    ₮1 billion").
  - Headline: the place most over-represented against all money mainly for nature or climate. Guards:
    at least max(₮3B, 3% of the focus); a share of 5% or more; a ratio of 1.5 or more. Example:
    "Govi-Altai holds 13% of the money strongly matching Res. 91 targets, against 3% of all money
    mainly for nature or climate." Otherwise the top place: "Ulaanbaatar holds 11% of the money
    strongly matching Vision 2050 targets."
  - Second: when one contract holds more than half of that place's focus money, "Most of it is one
    contract: {title}, ₮17.7 billion."; "{47%} names no single place." when 20% or more.
  - With a document in focus, a line: "The {N} contracts strongly matching its targets also strongly
    match: NDC 92% · NAP 90% · …" and "{64%} of them serve no other document."
- **Strongly matching:**
  - One green dot per tender strongly matching a target in focus, placed where its largest contract is.
  - Headline without a focus: "2,950 tenders strongly match a target; 22% name no single place, 19%
    are in Ulaanbaatar." With a focus, the over-representation form (guards: at least max(5, 3%);
    share 5%; ratio 1.5), else the same plain form.
- **Potentially misaligned:**
  - One red dot per tender, placed the same way.
  - Headline, naming no aimag (no blame on a region): "77 of the 191 potentially misaligned tenders
    name no single place; 114 name an aimag or the capital." Second: "The 77 hold ₮8.3 trillion; the
    114, ₮31.4 billion." Tag: "AI-identified, for review".
- **The list:** below the finding, the places ranked by the layer's measure (money: per ₮100; focus:
  money; tenders: count), 8 shown, "Show 15 more".
- **A place selected** (block, outline, name or list row) becomes the focus place. The right side then
  shows it:
  - money layers: facts, by policy area (5 bars, the focus lens), the targets its contracts strongly
    match per document, and "See its N contracts ›";
  - tender layers: its tenders (title, contracts, value, year, targets), 6 shown.
- **Pointing:** a place outlines it in ink and marks its name (pale yellow) on the map and in the list.
  Nothing is marked at rest.

R2.6 **Policy areas (step 4), sketch B.**
- **Left:**
  - One row per area of the lens, sorted by money mainly for nature or climate (the "No policy area"
    row last).
  - The name above; one line of blue squares; the value.
  - At 61% of the width, the area's targets as grey dots in two lines, with their count. Column heads:
    "Mainly for nature or climate", "Targets".
  - With a document or place in focus: the focus money per area at a finer unit (as R2.5), and the
    targets of the document only.
- **Right:**
  - The lens as plain choices, then the headline, as round 1 (the area whose share of the targets most
    exceeds its share of the money), then the second.
  - At rest: "Their targets, with" and a table of every area. Potentially misaligned tenders count the
    targets with at least one (red, left of a hairline); a strongly matching contract counts the
    targets with at least one (green, right), shown as "14 of 15".
  - An area selected (row, name, or table row) becomes the focus area, and the right side shows it:
    - "‹ All policy areas";
    - facts, with "{10%} of its contracts with a strong match serve 3 or more documents at once (all
      areas: 49%)" when it has 20 or more;
    - its targets (up to 8) as the same red|green rows in tenders;
    - "{N} targets without a strongly matching contract ›" (expands);
    - "See its N contracts ›".

R2.7 **Deep dive: Where to look closer** (replaces the three deep dives of round 1).
- **Left, the rows:** one row per target in focus with potentially misaligned tenders (in the place in
  focus), sorted by them.
  - The row names "{doc code} · {label}", then the start of its text in muted ink (targetLine).
  - Red dots to the left of a hairline (one per potentially misaligned tender) and green dots to the
    right (one per strongly matching tender), in three lines, with counts at the ends.
  - A cloud longer than 62 columns stops with a gap of one column, then its last column.
- **Left, the gaps:** below the rows, "No strongly matching contract anywhere": the targets in focus
  that no contract strongly matches, grouped by document ("FSS · 12", then their names), as buttons.
- **Right:**
  - The headline: "191 tenders are potentially misaligned with a target; for 93% of them, the target
    is in Res. 91." With a focus: "…with NDC targets", "…in Govi-Altai".
  - Second: "For 3 of these 15 targets, they outnumber the strongly matching tenders. 23 other targets
    have no strongly matching contract at all." With 0: "For each of these 3 targets, the strongly
    matching tenders outnumber them."
  - Tag: "AI-identified, for review · a tender can hold many contracts".
- **At rest:** "The tenders behind the most potential misalignments": tenders with the same title
  merged ("3 tenders · 68 contracts · 2023 · 5 targets"), 5 shown; a click opens the first.
- **A target selected** (row name, dot, gap name):
  - "‹ All targets", its label and document, and its text (3 lines);
  - its potentially misaligned tenders, 4 shown then "Show N more", each with the AI's first sentence
    and confidence (fetched as in round 1);
  - its strongly matching tenders (count, value, top 3 titles);
  - where its strongly matching contracts are (top 4 places, shares);
  - "Explore this target ›".
- **A red dot selected:** that target, with the tender first and marked.

R2.8 **Contracts behind a link.** "See its N contracts ›" (a place or an area) opens a panel: the title
(the place or area and the focus), then the contracts by value (title, value, year), 20 at a time.
A row opens the contract panel (pushed on the stack).

R2.9 **Kept from round 1:** the record step, the currency switch, the panels (contract, target), the
example contract, the source line, the AI tags, the vocabulary rules, numbers never words, and no em
dashes. **Removed:**
- the targets block (BER/BTR columns);
- the synergy histogram and fault-line list;
- the round-1 misaligned block;
- the "largest contracts" lists in the steps.

R2.10 **Data.** The bake adds `places` to the payload: every place's whole-record contracts and value
(after dedupe), with "none" for no single place. `ContractsFile.places` is optional. No AI run: every
reading exists already.

## Architecture

- `python/scripts/build_contracts_layer.py`: `places` in the payload; a test.
- `src/lib/brief/contracts/`:
  - `model.ts`: `PlaceTotal`, optional `places` on the file;
  - `focus.ts`: `Focus`, `focusParts`, `inFocus(contract)`, `targetInFocus`, `focusLabel` parts
    (pure);
  - `angles.ts`: the findings of the new views, all pure:
    - `yearFocus`, `fullYears`;
    - `moneyByPlace`, `mapFinding`, `rateFinding`;
    - `tendersByPlace` (match or mis), `tenderFinding`;
    - `alsoServed`, `areaSynergy`, `areaTargetCounts`;
    - `closerRows`, `closerGaps`, `topTenders`;
    - `unitFor`.
  - `field.ts`:
    - the new stages: `purpose` with focus cut, `places` with layer and overlay, `areas` B with overlay;
    - `resolveBlocks` (collision), `placeLabels` (label placement);
    - an `overlay` of marks (squares or dots, each with an ink) on the layout;
    - a per-square ink override (step 2).
- `src/components/brief/contracts/`:
  - `money-field.tsx`: draws the overlay with a crossfade, the dots' inks, leaders, the ink override;
    the base squares still move between steps.
  - `overview.tsx`: the new order and right sides; the map switch in the stage.
  - `focus-bar.tsx` (new).
  - `closer-block.tsx` (new): the canvas rows and gaps, and the right side.
  - `panels.tsx`: the contracts list panel.
  - `contracts-page.tsx`: the focus state, wiring; the old blocks removed.
  - CSS in `contracts.css`.
- `messages/{en,es,mn}.json`: the `brief.contracts` block rewritten (es/mn English placeholders);
  staged as HEAD plus this block only (the parallel session's rule).

## Tests

- **Bake:** `places` sums to the census.
- **focus / angles (fixture):**
  - focus predicates;
  - year focus and full years;
  - money by place and the over-representation guards (including the one-contract note);
  - tenders by place (lead contract, counted once);
  - the tender findings (no aimag named on the misaligned side);
  - also-served shares and "alone";
  - area synergy;
  - area target counts;
  - closer rows, gaps grouped by document, merged top tenders;
  - `unitFor`.
- **field:**
  - every base square in every step;
  - blocks never overlap and stay in bounds;
  - UB and none in the band;
  - the all layer uses the whole-record counts;
  - the focus and tender layers carry an overlay and hide the base;
  - B rows sorted by money with targets right of 61%;
  - step 2's ink override counts.
- **Components:**
  - the step order (record, purpose, places, areas);
  - the layer choices and the all switch;
  - the focus flowing from step 4 to the map and the deep dive, and cleared from the bar;
  - nothing marked at rest;
  - the closer block's gaps grouped, merged tenders, reasons fetched;
  - the list panel;
  - the currency switch still applies.
- **Full suite:** full suite, `tsc`, lint on changed files, locale parity; `/mongolia/brief/contracts`
  200 on the dev server.
