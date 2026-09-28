# Coherence brief, round 12: policy areas, explorable

Date: 2026-09-28. Branch `experiment/coherence-pulse` (worktree `coherence-pulse`).
Direction approved in chat by Jonas after four rounds of real-data sketches ("I like the
visuals now ... go ahead"). Sketches: `.superpowers/brainstorm/54941-1790601105/content/`
(`clouds-v2.html` is the approved one).

## What Jonas said

- Toggling a section in the left menu must add or remove it on screen too, not only in print.
  (Built in this session: see "Already built".)
- "By policy area" is not explorable: a reader cannot see which targets are behind a figure.
  The bar chart may not be the right visual. Start from an overview of the classification
  results, then a deep dive, changing as the reader goes; choices beside the visual, as in the
  Zeit salary piece. No clutter: add in later rounds rather than remove.
- Sketch rounds: document-coloured squares fail ("as a human I can not grasp the message with
  colored boxes"; not the riso look). A triangle re-sorted by area is too complicated, but its
  right side (a list of pairs of areas) is "so clear", and "the image resorts for the taxonomy
  chosen" is wanted. Bands of pairs combined too many dimensions. Round 3, the bar chart of
  targets per area with a lean right side, was "getting closer"; round 4 added the point clouds:
  "I like the visuals now". Pointing at a row must not re-shape the field.

## Already built (this session, uncommitted)

The builder's sections decide the screen as well as the print. "Overall coherence" keeps the
overall picture and the map; "Areas of alignment" and "Strongest alignments" each keep their
part of "What works well" (the step goes when neither is kept); "Potential misalignment" (with
the types) and "Targets to review first" do the same for "Where to look closer"; "Documents
side by side" keeps Documents (and the map's document names lead there only while it is kept);
no overview at all when none of its sections is kept. The screen keeps its reading order; the
arrows order the print only. The group reads "In the brief". Tests in `brief-app.test.tsx` and
`hub/hub.test.tsx`.

## Decisions

R12.1 **Place.** On screen, the "By policy area" section becomes an explorable component in
      the overview's two-column form (visual left, text right), after Documents and before the
      Explore ring, shown while the brief keeps "By policy area". It joins the standard brief
      as one component, last (Jonas), so the standard brief prints on 4 pages; print keeps the
      current section (bars) until the screen version is settled. The menu's policy-area choice
      stays for now, in step with the component's choice: the lens drives only this component
      and its print, so the menu's choice can go once the component prints. Mongolia in English
      first; es/mn get English placeholders.

R12.2 **The picture: the bar chart of targets per area, with point clouds.**
      - One row per policy area of the chosen lens, sorted by how many targets it holds (ties in
        the taxonomy's own order), named with that count ("Agriculture 50").
      - One dot per target on the row's line, in ink.
      - Above each target, its point cloud: one dot for each target pair of the chosen side it
        takes part in (potential misalignment: red with the checker texture; strong alignment:
        green), in lines of two or three dots. Within a row the tallest clouds come first.
      - Row heights come from the clouds at rest and do not change while the lens and side stay
        the same: opening a pair or picking a target never moves a row.
      - Targets the lens does not place are left out; a line on the right says so ("27 of the
        178 targets fall in one of these areas").
      - Large corpora (Sri Lanka: rows up to about 200 targets, one target in 211 potential
        misalignments): a row wraps onto further lines of targets; a cloud stops at 40 lines of
        dots, and a taller one is cut there with a visible break and its exact count on top
        (Jonas: fine "as long as it is visibly understandable that we cut off"). Every other
        cloud keeps one dot per pair.
      - When the field is taller than the window, the right column stays in view beside it.

R12.3 **The right side, lean.**
      - "By policy area", the headline, the lens as a plain choice (the same state as the
        menu's lens: changing either changes both and the link), the side as a plain choice
        ("Potential misalignment", "Strong alignment", with their ink squares), the scope line
        when needed.
      - The six pairs of areas that hold the most of the side's target pairs (ties by their
        number of target pairs, then by name): "Agriculture ·
        Land use, land-use change and forestry" or "Within Agriculture", a bar, the count, and
        "14% of 2,478 target pairs". A quiet line for the rest ("The other 19 pairs of areas: 45
        of their 3,176 target pairs.").
      - For a lens that places only some targets, a pair with a target outside the lens counts
        under "Indigenous Peoples and local communities · targets outside these areas".

R12.4 **Headline.** The pair of areas holding the most of the side's pairs, as a share of all
      the side's pairs in the brief: "53% of the potential misalignments sit between Agriculture
      targets and Land use, land-use change and forestry targets." Always the number, never a
      word for it (Jonas: no storytelling that turns numbers into words). "within X targets" for
      one area; "and targets outside these areas" for a partial lens; "Too few target pairs to
      compare."
      without any. The area names in it mark their rows when pointed at and open the pair when
      selected.

R12.5 **Going deeper, one step at a time.**
      - Pointing at a pair of areas (a list row or the headline's names) marks its two rows'
        names in pale yellow. Nothing else changes.
      - Opening a pair (select its row; select again to close): its two rows' clouds keep only
        that pair's pairs; every other row's clouds fall and its targets pale; the two rows read
        "32 of 50 targets". The row opens with the three targets most involved from each area
        (name, document, count) and "See the 358 target pairs".
      - Picking a target (a name in an open row, or its column on the left): the clouds fall;
        in every row its partners on the side are inked and the rest pale; the target is
        ringed; rows read "38 of 56 targets". The right shows the target: its title in pale
        yellow, document, text (three lines, then "Full text"), "Potential misalignment with 64
        targets: 38 in
        Land use, land-use change and forestry, 13 in Agriculture, 13 in Other / Cross-cutting."
        and "Explore this target" (the ring; without the ring, "See its aligned and potentially
        misaligned targets"), with a way back ("‹ Agriculture · Land use, land-use change and
        forestry" or "‹ All pairs of areas"). Picking it again lets it go.
      - Pointing at a target on the left gives its name, document and count.
      - Changing the lens moves every target to its new row (about 0.85 s); changing the side
        regrows the clouds in the other ink. Both let the open pair and the picked target go.
        With reduced motion, the new state shows at once.

R12.6 **The target pairs of a pair of areas** open in a panel (new kind): the two area names as
      the title, the pair of areas' counts in one plain line, and the side's target pairs as
      rows (each target with its document), each opening the comparison. Rows lead with the
      targets most involved in the pair of areas.

R12.7 **Names** as the data gives them. A trailing parenthetical acronym moves to a tooltip
      ("Land use, land-use change and forestry", "LULUCF" on hover). No shortening at commas:
      the sketches' "Land use" dropped "forestry".

R12.8 **Walkthrough:** one new stop, "By policy area", on the component, after Documents and
      before the menu. es/mn: English placeholder.

R12.9 **Vocabulary:** potential misalignment, strongly aligned, target pairs. The headline
      states where pairs sit, never which area is "worst"; no blame on sectors.

## Architecture

- `src/lib/brief/areas.ts` (pure, test-first):
  - `lensRows(source, scope, lensId)`: the lens's areas with their targets in scope, sorted
    (R12.2), plus the targets it leaves out.
  - `sideLinks(scope)`: each target's partners on each side (potential misalignment =
    `flagged`, strong alignment = `high`, as the overview's sides).
  - `areaPairs(rows, scope, side)`: pairs of areas (and "other targets" for a partial lens)
    with their pair count, the side's count and share, each target's involvement; ranked by
    the side's count, the first six and the rest summed.
  - `areaHeadline(...)`: which pair leads and the template it takes.
- `src/components/brief/areas/`: `areas-view.tsx` (the two columns, state: side, open pair,
  picked target) and `area-field.tsx` (canvas at the screen's pixel ratio, layout, animation,
  pointer hits). The field is `aria-hidden`; every step is reachable from the right side by
  keyboard.
- `panels.tsx`: the new panel kind (R12.6).
- `brief-app.tsx` / `flow.tsx`: the screen renders the component for "areas" instead of the
  bars; the lens choice calls the brief's `update`; "Explore this target" uses the brief's
  `exploreTarget`.
- `brief.css`: an areas block in the brief's tokens (inks, pale yellow, typographic controls).
- `messages/{en,es,mn}.json`: `brief.areas.*` keys; es/mn English placeholders.

## Tests

- `areas.test.ts` on `briefFixture` (areas g1, g2, g5, with unplaced targets): rows and order,
  pairs and shares by hand, "other targets" grouping, top six plus rest, involvement, headline
  choice (between, within, other targets, none), cloud cut at 40 lines.
- The standard brief holds "By policy area" and prints on 4 pages (the tests that pin 3 pages
  move to 4).
- Component: rows and counts render; the lens choice and the menu's lens stay in step; pointing
  at a list row marks row names only; opening a pair lists its most involved targets and "N of
  M targets"; picking a target shows its card with counts by area and lets go on a second pick;
  "See the N target pairs" opens the panel; the walkthrough stops in page order.
- Full suite, `tsc`, lint on changed files, `/mongolia/brief?sections=...,areas` 200 for all
  four countries.

## Data anchors (Mongolia, all 8 documents)

- Mitigation sectors: Agriculture 50, Land use 56, Other / Cross-cutting 59 targets; Agriculture ·
  Land use 358 of 2,478 target pairs (14%), 53% of the 671 potential misalignments.
- Climate adaptation: Agriculture and food · Ecosystems and biodiversity 432 (64%).
- Biodiversity: within Sustainable use 188 (28%); 172 of 178 targets placed.
- Human rights: 27 of 178 targets placed.

## Out of scope this round

The printed version of the new component; es/mn translations; the pipeline's AI summary per
area (`sectorSynthesis`) in the panel; areas that hold no target; removing the menu's
policy-area choice.
