# Implementation slide (one report at a time)

The Level 3 slide: what the country's own reports (the BTR, plus the NR7
where it has one) say against the plan, one report on screen at a time, the
takeaways first.

## What renders, top to bottom

1. **Headline = the finding for the report on screen, with its
   denominator.** Climate: "{n} of {country}'s {total} reported climate
   actions may work against targets in its other plans." Biodiversity:
   "{country}'s biodiversity report rates {b} of {total} national targets
   behind schedule. {k} of them align strongly with {m} or more targets in
   other national plans." (when no target behind schedule has a link: "In
   {k} places, {country}'s biodiversity report rates a target one way while
   its own evidence points another."; variants for nothing flagged and for
   a match not computed).
2. **Body = what was found, in two plain sentences**, templated from the
   data (`climateSentence` / `biodiversitySentence` in `index.tsx`), never
   authored per country and never by a model. Climate: how many of the
   flagged actions are under way, and which documents (full name, short form
   in brackets) most of the targets sit in. Biodiversity: what "behind
   schedule" means in the report's own rating and what the bars count (the
   AI-judged aligned targets in other documents); in the fallback, what the
   report gives per national target and that these are the places it does
   not agree with itself, "No AI is involved." Under 35 words in all three
   locales (`index.test.tsx`).
3. **"Where to start"** (`WhereToStart` in `index.tsx`, the theme drawer's
   left-ruled shape): what to do with the visual below and how. Climate:
   start with the bars that hold half of the concerns, open one for the
   targets and the AI's reason, judge whether the concern holds; caveat
   "AI-estimated review prompts, not findings." Biodiversity: open the
   top-ranked national target (number, short text, its rating, how many
   targets in how many other documents align with it), "worth a closer
   look" at what the report says holds it back and which plans share the
   aim; caveat that ratings and figures are the report's own while the
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
   - *Biodiversity* (`nr7-policy-link-rows.tsx`, top three first): one row
     per national target the report rates behind schedule, ranked by its
     HIGH links to other documents (`rankPolicyLinkCandidates`): the target
     with its GBF chip, the rating as a chip (dot + word), and a bar split by
     document in the document colours with "aligned with {n} targets in {d}
     documents" beside it. A row opens to the documents with counts, the
     three most aligned counterparts (open the target profile), the
     potential-misalignment count with its main document, the report's Key
     Challenges text labelled verbatim, and the links onward. When no target
     behind schedule has a link, the cross-check rows below are the visual.
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
`grep -rn "review-groups\|full-picture\|nr7PairTargets\|openTargetProfile\|implReport\|ImplementationReport\|PolicyLink" src messages`
and remove the `index.tsx` memos, state and props, the tour steps `toggle`,
`visual`, `row`, `fullPicture` (and their copy in three locales), and the
`briefing.implementation` keys `toggle`, `startHeading`, `climate`,
`biodiversity`, `row`, `showAll`, `showFewer`, `fullPicture`. `npx tsc --noEmit
&& pnpm test` point at anything left.
