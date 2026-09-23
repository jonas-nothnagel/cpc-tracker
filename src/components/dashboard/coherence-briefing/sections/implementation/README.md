# Implementation slide (one report at a time)

The Level 3 slide: what the country's own reports (the BTR, plus the NR7
where it has one) say against the plan, one report on screen at a time, the
takeaways first.

## What renders, top to bottom

1. **Two tabs, only when the country has both reports**
   (`report-toggle.tsx`): "Climate report (BTR)" / "Biodiversity report
   (NR7)", above the headline through the frame's `controlsFirst` slot,
   because everything below is about the chosen report. The host owns the
   state so its right-hand column can follow.
2. **Headline = the finding for the report on screen, with its
   denominator, one number.** Climate: "{n} of {country}'s {total} reported
   climate actions may work against targets in its other plans."
   Biodiversity: "{country}'s biodiversity report rates {b} of {total}
   national targets behind schedule." (fallback without policy links: "In
   {k} places, {country}'s biodiversity report rates a target one way while
   its own evidence points another."; variants for nothing flagged and for
   a match not computed).
3. **Body = two plain sentences**, templated from the data
   (`climateSentence` / `biodiversitySentence` in `index.tsx`), never
   authored per country and never by a model. Climate: how many of the
   flagged actions are under way, and which documents (full name, short
   form in brackets) most of the targets sit in. Biodiversity: what a row
   shows (rating, count of linked pairs flagged for review) and the one
   document most flagged pairs are with (`topFlaggedDoc` in
   `review-groups.ts`; said here once, never on the rows). Under 35 words
   in all three locales (`index.test.tsx`).
4. **"Where to start"** (`WhereToStart` in `index.tsx`, the theme drawer's
   left-ruled shape), one line. Climate: start with the bars that hold half
   of the concerns, open one, judge whether the concern holds; caveat
   "AI-estimated review prompts, not findings." Biodiversity: "Start with
   the top row: what the report says holds it back, then whether the linked
   plans bear on it." No caveat here (the rows carry it). Tool guidance and
   a hedged process pointer, never a policy suggestion, no actors named.
5. **The takeaways as a visual** (ranked by `review-groups.ts`, top five
   first, "Show all" for the rest, rows open inline, one at a time):
   - *Climate* (`climate-strain-chart.tsx`): one bar per reported action, its
     length the policy commitments it may pull against, split design-level
     (`FLAGGED_COLOR`) / coordination-level (`MECHANISM_COLORS.delivery_friction`),
     the count as text and a word legend; action names wrap to two lines. A
     bar opens to the commitments with the AI rationale under "Why it was
     flagged (AI-estimated)", the status word, the institutions named on the
     action (verbatim, neutral) and "Open the pair".
   - *Biodiversity* (`nr7-policy-link-rows.tsx`): one row per national
     target in the report, the ones rated behind schedule first, each block
     ranked by its HIGH links to other documents (`rankPolicyLinkCandidates`);
     a caption ("Rated on track, or unknown") marks where the second block
     begins. "Show all N" unfolds the rest, "Show fewer" folds back. The face:
     the target's number and text with its deadline prefix dropped
     (`stripNr7Deadline`; the raw text is the tooltip; two lines at most),
     the rating as a chip (dot + word), and a count in the flagged colour
     ("11 to review") or grey "none to review". No document on the face, no
     aligned count, no bar, no GBF chip. On a phone the row stacks. A row
     opens, in this order: what the report says holds it back (labelled the
     report's words, clamped to three lines), one line with the aligned count
     ("Aligned strongly with 51 targets in 6 other documents."), the flagged
     pairs under "Flagged pairs (11)" as a plain list (`+ N more`; each opens
     the pair drawer with this national target as its context, see below), the GBF
     target it is filed under with the abbreviation expanded, one "Full
     report entry" disclosure (`nr7-report/target-detail.tsx`: rating
     wording, narrative, questionnaire, indicators, shared-indicator chips
     that open the indicators fold), and one link "The target in the
     biodiversity plan (NBSAP n)". **The view's one caveat** sits under the
     list ("Ratings and the report's words are the report's own. Links to
     other plans are AI-estimated alignment between target texts: a prompt
     for review, not a record of delivery or funding."); nothing inside a
     row, the column or the folds repeats it (`index.test.tsx` counts one).
     A national target named below the rows (a cross-check row, a target
     chip on an indicator card) asks the rows to open it through the
     `rowRequest` channel in `full-picture.tsx` (unfolding "Show all" when
     needed, with the full entry when asked); without rows on the slide
     those links are not offered.
   - *Biodiversity cross-checks* (`nr7-cross-checks.tsx`, folded under the
     full picture while the policy-link rows lead): one row per cross-check
     between the country's own rating, questionnaire answers and indicators
     (`../../nr7-report/`): the national target, the rating as a chip (dot +
     word), and the disagreeing evidence as a glyph with a short label: an
     answer-mix bar, a sparkline (titled with the direction word), a reach bar
     or a value count. A row opens to the report's own evidence and links.
     When no target behind schedule has a link, these rows are the visual
     and carry their own caveat.
6. **The full picture, folded** (`full-picture.tsx`), for that report only:
   Coverage by document (the dot-map, `coverage-by-document.tsx`) under the
   climate report; under the biodiversity one, in this order: Pairs that
   repeat across targets (`nr7-recurring-counterparts.tsx`: the flagged
   pairs turned round, one counterpart in another plan per item with the
   national targets it is flagged against by name, number, short text and
   rating word, each opening its row; only counterparts on two or more
   targets), Ratings that do not match their own evidence (the
   cross-checks), and All NR7 indicators. Closed by default. There is no
   second list of the national targets: the rows are that list.
7. Two caption lines: the source of the report on screen ("Evidence: …
   One self-reported lens, not a complete audit."), and what is not yet
   included. Neither repeats the caveat.

**A flagged pair, opened** (`onOpenNr7Pair` in the host, `pair-drawer.tsx`):
the pair drawer for the NBSAP target the national target restates and the
counterpart, NBSAP side first (the target the reader opened, then what it
may pull against), carrying the national target as context
(`nr7-report/pair-context.ts`; the panel entry is `target-pair` with
`nr7TargetId`, keyed apart from the same pair opened from the wheel): above
the two cards, "From national target 4 · No progress", the target's full
text as the report gives it (deadline included; the drawer has the room the
row face does not) and the report's own words on what holds it back
(clamped, labelled the report's words); then the cards, the connector, the AI rationale with its
caveat and the feedback bar as everywhere else; and under the counterpart's
card, only when the report's rows flag it against two or more national
targets, "The biodiversity report's rows flag this target against N
national targets. All its flagged pairs ›", which pushes the counterpart's
corpus-wide flag profile (the drawer that used to open directly) onto the
trail. The column's links and the aligned pairs still open the counterpart's
profile.

**The sticky column** (`centerpiece/nr7-target-links.tsx`, desktop only)
follows the biodiversity view: the opened row's national target (the top
row until one is opened, with a note saying so), one line per document
("16 aligned", and "1 to review" in the flagged colour when any), then the
aligned targets per document, the flagged pairs marked by colour and word,
and "on N targets" on a flagged pair whose counterpart repeats. No bars, no
count sentence, no caveat. The host owns the open row (`focusedNr7TargetId`,
cleared on a report switch); the rows fall back to their own state when the
host does not pass one.

## Decisions (2026-09-09 to 2026-09-16, with the product owner)

- (2026-09-16, later) A flagged pair in an open row opened the counterpart's
  corpus-wide flag profile (every pair flagged on it, its document pairs,
  themes and manageability split), which never mentioned the national
  target the reader came from nor why this pair was flagged: the one thing
  the click promised. Now it opens the pair drawer (the rationale, both
  texts, the mechanism) with a context block for the national target on
  top, so the pair reads beside the country's own reason and never as it;
  the profile stays one link away, offered only where the counterpart
  repeats (the eight expansion targets that hit 8 to 12 national targets
  each are where one review covers many). Four product calls, the user's:
  only the row's flagged pairs (the column and the aligned links unchanged),
  a context block rather than one line or none, the profile kept reachable
  inside the drawer, the NBSAP side first. es/mn copy drafted in-session
  for native review.
- (2026-09-16, after a design audit of the Mongolia NR7 view) The view was
  making three arguments at once (the report's rating, the AI flag count,
  the turned-round counterparts) with about 530 words and four caveats on
  the first desktop screen, the flag count said up to six times with a row
  open, subjects truncated to "By 2030, reduce ecosystem de…", and a row
  grid that clipped on a phone. The one function to lead with, from the
  10 Sep call: for the targets the country itself rates behind schedule,
  what the report says holds them back, then which other plans share the
  aim. So: tabs above the headline; a one-number headline (the flag count
  is a row attribute, never fused with the rating in the headline, since
  the Mongolia read below shows the two are unrelated); the document most
  flagged pairs are with named once in the body, not on every row; a
  one-line "Where to start"; one caveat under the rows and none anywhere
  else on the view (the footer keeps the source only); the deadline prefix
  dropped from row subjects; the flag cell a count; the open row in the
  reader's order with the flagged pairs as a plain list (no pill per line);
  GBF expanded on first use; the "NR7 by national target" fold removed and
  the report's entry opened inside the row instead (one list of targets,
  not two); the recurring counterparts demoted from the column's default
  view to a fold under the rows, with target names instead of numbered
  chips; the column's bars (the aligned count is context, not a finding)
  replaced by a per-document line; and the rating colours made a
  sequential ramp app-wide so "No progress" and "potential misalignment"
  no longer share one red (the questionnaire "no" moved off red too, since
  it now sits in the same open row as the flagged box). The three product
  calls (entry inside the row, counterparts to a fold, colours app-wide)
  were the user's; es/mn copy was drafted in-session for native review.
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
`grep -rn "review-groups\|full-picture\|nr7PairTargets\|openTargetProfile\|implReport\|ImplementationReport\|PolicyLink\|Nr7TargetLinks\|nr7TargetLinks\|nr7Links\|controlsFirst\|rowRequest\|stripNr7Deadline\|stripDeadlinePrefix\|nr7Recurring\|topFlaggedDoc\|Nr7TargetDetail" src messages`
and remove the `index.tsx` memos, state and props, the frame's
`controlsFirst` slot, the tour steps `toggle`, `visual`, `row`,
`fullPicture` (and their copy in three locales), and the
`briefing.implementation` keys `toggle`, `startHeading`, `climate`,
`biodiversity`, `row`, `showAll`, `showFewer`, `fullPicture`. The NR7
colour ramp (`nr7-report/nr7-colors.ts`) and `target-detail.tsx` belong to
the nr7-report module and stay. `npx tsc --noEmit && pnpm test` point at
anything left.
