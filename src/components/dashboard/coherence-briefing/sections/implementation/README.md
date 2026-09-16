# Implementation slide (one report at a time)

The Level 3 slide: what the country's own reports (the BTR, plus the NR7
where it has one) say against the plan, one report on screen at a time, the
takeaways first.

## What renders, top to bottom

1. **Headline = the finding for the report on screen, with its
   denominator.** Climate: "{n} of {country}'s {total} reported climate
   actions may work against targets in its other plans." Biodiversity:
   "{country}'s biodiversity report rates {b} of {total} national targets
   behind schedule. {k} of them carry potential misalignments with other
   national plans." (when no target behind schedule has a link: "In
   {k} places, {country}'s biodiversity report rates a target one way while
   its own evidence points another."; variants for nothing flagged and for
   a match not computed).
2. **Body = what was found, in two plain sentences**, templated from the
   data (`climateSentence` / `biodiversitySentence` in `index.tsx`), never
   authored per country and never by a model. Climate: how many of the
   flagged actions are under way, and which documents (full name, short form
   in brackets) most of the targets sit in. Biodiversity: how the rows below
   are ordered (targets rated Limited progress or No progress first) and
   what each row says (flagged pairs and the plan most are in); in the fallback, what the
   report gives per national target and that these are the places it does
   not agree with itself, "No AI is involved." Under 35 words in all three
   locales (`index.test.tsx`).
3. **"Where to start"** (`WhereToStart` in `index.tsx`, the theme drawer's
   left-ruled shape): what to do with the visual below and how. Climate:
   start with the bars that hold half of the concerns, open one for the
   targets and the AI's reason, judge whether the concern holds; caveat
   "AI-estimated review prompts, not findings." Biodiversity: open the
   top-ranked national target (number, short text, its rating, and its
   row's words for the flagged pairs), "worth a closer look" at what the
   report says holds it back (whether the flagged pairs bear on it, when
   there are any), pointing at the column beside for the plans that share
   the aim and where the pairs repeat, never a cause asserted; caveat
   that ratings and figures are the report's own while the
   links are AI-estimated alignment between target texts, not delivery or
   funding. In the fallback: open a row, then settle which side is right;
   caveat "Nothing on this tab is AI-generated." Tool guidance and a hedged
   process pointer, never a policy suggestion, no actors named.
4. **One control** (`report-toggle.tsx`): pills "Climate report (BTR)" /
   "Biodiversity report (NR7)". Only when the country has both; the host owns
   the state so its right-hand column can follow.
5. **The takeaways as a visual** (ranked by `review-groups.ts`, top five
   first, "Show all" for the rest, rows open inline, one at a time):
   - *Climate* (`climate-strain-chart.tsx`): one bar per reported action, its
     length the policy commitments it may pull against, split design-level
     (`FLAGGED_COLOR`) / coordination-level (`MECHANISM_COLORS.delivery_friction`),
     the count as text and a word legend; action names wrap to two lines. A bar opens to the commitments with
     the AI rationale under "Why it was flagged (AI-estimated)", the status
     word, the institutions named on the action (verbatim, neutral) and "Open
     the pair".
   - *Biodiversity* (`nr7-policy-link-rows.tsx`, top five first): one row
     per national target in the report, the ones rated behind schedule
     first, each block ranked by its HIGH links to other documents
     (`rankPolicyLinkCandidates`); a caption ("Rated on track, or unknown")
     marks where the second block begins. "Show all N" unfolds the rest,
     "Show fewer" folds back. One line per row: the target, the rating as
     a chip (dot + word), and the potential misalignments in words with a
     mark in the flagged colour ("11 potential misalignments, mostly with
     the FSS"; "with the" when one document; "no potential misalignments").
     No aligned count, bar or GBF chip on the face. A row opens to the GBF
     chip, the report's Key Challenges text labelled verbatim FIRST
     (clamped to three lines), one line with the aligned count ("Aligned
     strongly with 51 targets in 6 other documents; the column beside lists
     them"), then the flagged pairs under "Flagged as potential
     misalignments (AI-estimated)", and the links onward. The per-document
     bars and the aligned counterparts are the sticky column's. "Where to
     start" speaks of the top target rated behind schedule with a link
     (`lead`), with the same words for its potential misalignments as its
     row; the headline counts the targets behind schedule with a flagged
     pair (`behindFlagged`). When no target behind schedule has a link,
     the cross-check rows below are the visual.
   - *Biodiversity cross-checks* (`nr7-cross-checks.tsx`, folded under the
     full picture while the policy-link rows lead): one row per cross-check
     between the country's own rating, questionnaire answers and indicators
     (`../../nr7-report/`): the national target, the rating as a chip (dot +
     word), and the disagreeing evidence as a glyph with a short label: an
     answer-mix bar, a sparkline (titled with the direction word), a reach bar
     or a value count. A row opens to the report's own evidence and links.
6. **The full picture, folded** (`full-picture.tsx`), for that report only:
   Coverage by document (the dot-map, `coverage-by-document.tsx`) under the
   climate report; Ratings that do not match their own evidence (the
   cross-checks), NR7 by national target (grouped under GBF target headings)
   and All NR7 indicators under the biodiversity one. Closed by default;
   review rows and NR7 chips open them at a target or an indicator.
7. Two caption lines: the source of the report on screen, and what is not
   yet included.

## Decisions (2026-09-09 and 2026-09-11, with the product owner)

- (2026-09-11, after the 10 Sep call with Julien and Reina) The biodiversity
  view leads with the targets rated behind schedule and their links to
  other plans, not with the cross-checks: the reader wanted one
  action-oriented message before the detail, tied to cross-document
  coherence, and "why it is stuck" in the report's own words. Links come
  from the policy alignment through the NBSAP restatement, never from the
  uncalibrated NR7 narrative run. The cross-checks stay one fold down.
  Cross-level: Level 1 alignment joined to a Level 3 rating.
- (2026-09-11) National targets group under the GBF global target the
  country filed each under (from the reporting tool), the axis that stays
  the same across countries.
- (2026-09-15) The policy-link rows list every national target, not only
  the ones rated behind schedule with a link, five on the face and the rest
  behind one "Show all": the reader wanted the whole report reachable from
  the slide and, above all, the order explained. Behind schedule still comes first and the
  headline still counts only those; the body says the order rule in plain
  words instead of defining "behind schedule" by quoting the reporting
  tool's option labels. The sticky column keeps its header for a target
  without links and says there are none.
- (2026-09-15) Potential misalignments show on the row face, not only in
  the open row: a mark in the flagged colour with the count in words and
  the document most of the pairs come from. The reader wanted to see at a
  glance when a target that is behind is also contested. The face states
  the two counts; whether the flagged pairs have anything to do with the
  rating is left to the reader, with a hedged "worth a closer look at
  whether" in "Where to start" only (guardrail: no cause asserted on a
  static surface, no actor named).
- (2026-09-15, from a read of the Mongolia data) The flag count is not
  drawn as a bar on the aligned scale, the open row leads with the
  report's own reason, and the pairs are also listed per counterpart. On
  Mongolia the number of flagged pairs on a national target has no
  relation to its rating (the most flagged target is rated on track; four
  targets behind schedule have none), because eight expansion targets in
  other plans (new cropland, fodder, irrigation, a dam) account for nearly
  half of the 168 pairs and hit 8 to 12 national targets each: the count
  measures how much land a target touches, not how it is doing. Where the
  report itself names cross-sector coherence as the obstacle (NT01, NT02,
  NT16), the flagged pairs are that obstacle made concrete; elsewhere the
  reported obstacles are data gaps, an unapproved law, financing. So: a
  fixed mark plus the document instead of a comparable length; the
  challenges text before the links so the pairs read beside the country's
  reason, never as the reason; and the counterpart list, where one review
  covers every national target the counterpart is listed against. Not
  built: any automatic match between the challenges text and the pair
  rationales (it would hold on four or five targets and need keyword rules
  or another model pass); the text and the pairs sit side by side and the
  reader judges.
- (2026-09-15, same day) The slide grew too dense with the rows and the
  counterpart list under them, so: one line per row (rating and the
  flagged words only; the aligned count moved into the open row, the
  per-document bars and aligned counterparts left to the column), and the
  counterpart list moved into the sticky column as its default view, where
  its chips open the matching row. The slide keeps one list; the column
  carries the turned-round read. Mobile (no column) keeps the rows only.
- (2026-09-11, revised 2026-09-15) The sticky column follows the NR7
  view: while the biodiversity report is on screen and no row is opened it
  shows where the flagged pairs repeat (`centerpiece/nr7-recurring-counterparts.tsx`,
  see below; the top-ranked target stands in only when nothing repeats);
  for the opened policy-link row it shows that national target's links to
  the other plans, one bar per document and the aligned targets listed,
  each repeating counterpart marked "on N targets"
  (`centerpiece/nr7-target-links.tsx`). The host owns the open row
  (`focusedNr7TargetId`, cleared on a report switch), like
  `hoveredDocPairKey`; the rows fall back to their own state when the host
  does not pass one. The column is desktop-only; the open row keeps the
  report's words, the aligned count and the flagged pairs inline, and
  points at the column for the rest.

- One report at a time; the reader switches. Group headings, captions and
  the both-reports sentences are gone.
- (2026-09-10) The body no longer compresses the findings into one clause
  per rule ("2 on-track targets have most enabling conditions not yet in
  place; ..."): newcomers could not follow it, and the rows below already
  show each one. The body says what was found in plain words; the "Where to
  start" block says what to do and how; the caveat moved there. Row
  evidence labels name the thing ("building blocks", "figure") rather than
  the rule's variable.
- Review items are only the two kinds above. Gaps (targets with no reported
  action) and actions still on paper are the full picture, not review items.
- Flagged pairs whose action is an NR7 narrative (the uncalibrated NR7
  alignment run) are not review items; they stay in the coverage dot-map. The
  climate group counts BTR actions only, so the headline equals the chart.
- The biodiversity top slice takes card-eligible signals only; a held-back
  rule (the unreviewed domestic-funding decline) shows after "Show all",
  never in the first five.
- Colour is never the only channel: every bar segment, chip and glyph has a
  word or a count beside it; the toggle pills and the tour expand BTR / NR7.

## Removal

`git rm -r` this directory and restore the pre-redesign slide from history
(`git show bbc7f1f^:src/components/dashboard/coherence-briefing/sections/implementation/index.tsx`
and its sibling `coverage-by-document.tsx`), then
`grep -rn "review-groups\|full-picture\|nr7PairTargets\|openTargetProfile\|implReport\|ImplementationReport\|PolicyLink\|Nr7TargetLinks\|nr7TargetLinks\|nr7Links" src messages`
and remove the `index.tsx` memos, state and props, the tour steps `toggle`,
`visual`, `row`, `fullPicture` (and their copy in three locales), and the
`briefing.implementation` keys `toggle`, `startHeading`, `climate`,
`biodiversity`, `row`, `showAll`, `showFewer`, `fullPicture`. `npx tsc --noEmit
&& pnpm test` point at anything left.
