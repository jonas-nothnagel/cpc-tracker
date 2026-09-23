# Coherence brief: design

Date: 2026-09-23. Branch `experiment/coherence-pulse` (long-lived experiment). Replaces the
coherence canvas at `/{country}/pulse`.

## Intent (from Jonas, 2026-09-23)

- The canvas is "neither impressive, nor pretty, nor informative, nor accessible for non
  technical people, nor understandable". Rework the visuals before any methodological work.
- Orientation: the original dashboard's main questions, **what is working well together and
  what is not**. Coherence only this round; the aim is a better replacement for the dashboard's
  coherence wheels (not the big explorer), which "looked good but were not informative".
  Finance and implementation data must be able to join later.
- Reader: a UN official or policymaker who knows policy and has no technical skills. Policy
  language, not system language ("document pathways" is out; so is long explanatory legend copy).
- A boutique system instead of one-size-fits-all: users pick documents, a taxonomy and
  components, and get their own brief that stays interactive and explorable, and prints as a
  **2-3 page** policy analysis.
- Design references: the original dashboard; Anthropic's "What 81,000 people want from AI"
  (moving text as a landing background conveying more material than a person could read);
  Gates Notes; Die Zeit's Berlin election data story (map plus serif narrative, graded
  two-hue legend, plain result bars, underlined terms that point at the map);
  `sevenevesai/riso-windowseat` (risograph: ink dots as halftone, few inks, print feel).
- Free hand on design: decisions below are Claude's, recorded here for review.

## Success criteria

1. A reader with no background can say, within a minute, whether the country's policies mostly
   reinforce each other and name one place where they may pull apart.
2. Every number on the page traces to the served alignment data; AI-written text (theme names,
   rationales) is labelled and never carries a headline claim on its own.
3. The default brief prints on 3 A4 pages or fewer; what prints is what the screen shows.
4. It reads well for Mongolia, Panama, Sri Lanka and Cote d'Ivoire (8 to 404 commitments).
5. A composed brief is shareable as a link.

## Concept

**Landing.** Rows of verbatim commitments from the selected documents drift slowly across the
page, too many to read, behind one serif statement of scale: "178 commitments. 8 policy
documents. 13,404 comparisons." One sentence says what the brief does; one button opens it.
Reduced motion shows the rows still.

**The brief.** White A4 sheets on a light desk. What is on screen is exactly what prints. A
builder beside the sheets chooses documents, the policy-area lens and the sections, orders the
sections, shows the page count, copies a share link and prints. Every section stands on its own
(any subset makes sense) and answers one question with a finding in the headline.

## Language

| System term | Brief term |
|---|---|
| target | commitment |
| document, corpus | policy document, the documents |
| pair, scored pair | comparison; two commitments |
| high + medium | reinforce each other |
| low | partial link |
| flagged | potential misalignment |
| none | no clear link |
| document pair / pathway | the NDC and the NBSAP (names), two documents |
| lens, taxonomy | policy area(s); framework names only in tooltips |

Third person, sentence case, no em dashes, full document names (medium label, full name on
hover), numbers formatted with the page locale. No "pipeline", "scored", "corpus", "fiber".

## Visual language

- Ground: white sheets on Surface Light (`#f7f7f7`) desk; ink `#232e3d`, muted `#55606e`.
- Two inks for the alignment axis, each with its own texture so colour is never the only
  channel: **green, solid** (`#196127` and tints) = reinforce each other; **red, hatched or
  ringed** (`#c8321f`, `#ee402d` tints) = potential misalignment. Partial link = pale grey-green
  dots; no clear link = light grey.
- Risograph cue carried by the data marks themselves (unit dots as halftone, hatching, multiply
  where inks overlap), not by decorative grain.
- Type: Source Serif 4 for the landing statement, sheet title and section findings; Source Sans
  3 for everything else. Sheet sizes: headline 22px, standfirst 15px, body 13px, captions 12px.
- UNDP Blue only for the primary action and focus.

## Sheet and pagination

- A4 portrait, laid out in millimetres (210 x 297). Running header (country, "Policy coherence
  brief", page n of N) and footer (date, "AI-assisted analysis for review by national experts").
- Content area is 4 **units** high (one unit about 58 mm). Page 1 opens with a 1-unit title block
  (country, title, scope line, how it was prepared, documents).
- Section sizes: 1 unit (overall picture), 2 units (most sections), 4 units (map).
- Pagination: greedy in the chosen order; a section that does not fit starts a new page.
- Default selection: overall picture, what works well together, where policies may pull apart,
  documents side by side, map of commitments = 3 pages.
- Below 840 px wide the sheets become fluid columns; print is unaffected.

## Sections (coherence, this round)

Each: small sans label naming the question, serif headline stating the finding, one visual,
at most two short sentences, and a drill-down on screen.

1. **The overall picture** (1 unit). Headline from the verdict bucket. Visual: every comparison
   is one ink dot (one dot per k comparisons when there are more than about 12,000, stated in the
   caption), sorted into reinforce / partial / potential misalignment / no clear link, each group
   labelled with its percentage. Dots settle into place on first view.
2. **What works well together** (2 units). Headline: the two documents with the highest share of
   comparisons that reinforce each other (pairs of documents with at least 30 comparisons).
   Visual: the three recurring reinforcement themes (AI-identified, labelled) as rows of a
   theme x document grid, and the live count of reinforcing comparisons. A document's mark shows
   how much of the theme it carries, in three steps of its share of the theme's comparisons
   (up to 10%, 10-25%, over 25%; a comparison counts for both its documents); no mark when it
   takes no part. One example: two
   verbatim commitments that reinforce each other, from the lead theme.
3. **Where policies may pull apart** (2 units). Headline: the two documents with the highest share
   of potential misalignment (at least 30 comparisons). Visual: the three recurring potential-misalignment
   themes in the same grid (red, hatched), live counts. One example pair, verbatim, with the AI
   reading behind a disclosure on screen.
4. **Commitments to look at first** (2 units, optional). Headline from target concentration
   ("Half of the 671 potential misalignments trace back to 7 commitments"). Visual: ranked rows
   with the commitment, its document and a count bar.
5. **Documents side by side** (2 units). Visual: one result bar per pair of documents, split into
   reinforce / partial / potential misalignment, sorted by the misalignment share, with a tick for
   the average across all pairs (Zeit "Ergebnis" style). Click a row: the pair's potential
   misalignments, ranked by the commitments they recur on (`strandsByPathway`).
6. **Map of commitments** (4 units). Every commitment is one cell inside its document's area.
   Default shading: number of potential misalignments it is part of, in six fixed steps (0, 1-2,
   3-5, 6-10, 11-20, 21+) with a Zeit-style legend; alternate shading: share of its comparisons
   that reinforce (0-25, 25-50, 50-75, 75-100%). The most involved commitments are labelled on
   the map. Click a cell: its partners light up and a panel lists them.
7. **By policy area** (2 units, optional). Per category of the chosen lens: commitments,
   reinforcing and potentially misaligned comparisons, share bar with the average tick
   (`buildSectorCoherenceShare`, which already guards thin samples).

Finance and implementation are registry entries for later: a section declares the data it needs
and the builder lists only sections the country's data can support.

## Data flow

- Server page `/{country}/brief` loads the dashboard payload and builds a slim, serializable
  `BriefSource`: commitments (id, document, label, text), documents (labels, colour, order,
  default visibility), cross-document comparisons as compact rows (target indexes, level,
  mechanism), AI readings for potential misalignments only, primary classifications and
  categories per lens, corpus themes with their document-selection states, model and date.
- The client computes every section from `BriefSource` plus the selection with pure functions in
  `src/lib/brief/` (tested), reusing `src/lib/coherence-briefing.ts` helpers (live theme stats,
  target concentration, sector shares, theme-state selection) and `src/lib/pulse` (document-pair
  model, recurring-target strands) so numbers match the dashboard.
- Selection lives in the URL (`docs`, `lens`, `sections`) so a brief is shareable; unknown values
  fall back to defaults.
- Pair details for drill-downs come from a small route handler (`/api/brief/pair`) so the page
  does not ship every rationale.
- `/{country}/pulse` redirects to `/{country}/brief`. The canvas UI is removed (git history keeps
  it); its tested data helpers stay.

## Accessibility

Every chart has a text equivalent (counts in captions or visually hidden tables); the map is one
tab stop with arrow-key movement; drawers reuse `DrawerShell` (focus trap and restore); colour is
never the only channel; reduced motion stops the landing text and the dot settling.

## Out of scope this round

Finance and implementation sections, uploading one's own documents or taxonomy from the builder,
the human review loop, and any methodology change.
