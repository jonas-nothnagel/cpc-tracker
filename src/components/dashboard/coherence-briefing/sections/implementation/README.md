# Implementation slide (one report at a time)

The Level 3 slide: what the country's own reports (the BTR, plus the NR7
where it has one) say against the plan, one report on screen at a time, the
takeaways first.

## What renders, top to bottom

1. **Headline = the finding for the report on screen.** Climate: "{n}
   reported climate actions may pull against {m} policy commitments."
   Biodiversity: "{k} places where {country}'s biodiversity report disagrees
   with itself." (variants for nothing flagged and for a match not computed).
2. **Body = the takeaways in one or two sentences**, templated from the data
   (`climateSentence` / `biodiversitySentence` in `index.tsx`), never
   authored per country and never by a model. Climate: how many actions carry
   half of the flagged pairs, how many are under way, which documents most
   flags fall on, then the AI caveat. Biodiversity: one clause per rule
   present (at most three, `fragments` from `review-groups.ts`), then
   "Computed from the report's own statements." Every variant stays under 35
   words in all three locales (`index.test.tsx`).
3. **One control** (`report-toggle.tsx`): pills "Climate report (BTR)" /
   "Biodiversity report (NR7)". Only when the country has both; the host owns
   the state so its right-hand column can follow.
4. **The takeaways as a visual** (ranked by `review-groups.ts`, top five
   first, "Show all" for the rest, rows open inline, one at a time):
   - *Climate* (`climate-strain-chart.tsx`): one bar per reported action, its
     length the policy commitments it may pull against, split design-level
     (`FLAGGED_COLOR`) / coordination-level (`MECHANISM_COLORS.delivery_friction`),
     the count as text and a word legend. A bar opens to the commitments with
     the AI rationale under "Why it was flagged (AI-estimated)", the status
     word, the institutions named on the action (verbatim, neutral) and "Open
     the pair".
   - *Biodiversity* (`nr7-cross-checks.tsx`): one row per cross-check between
     the country's own rating, questionnaire answers and indicators
     (`../../nr7-report/`): the national target, the rating as a chip (dot +
     word), and the disagreeing evidence as a glyph with a short label: an
     answer-mix bar, a sparkline (titled with the direction word), a reach bar
     or a value count. A row opens to the report's own evidence and links.
5. **The full picture, folded** (`full-picture.tsx`), for that report only:
   Coverage by document (the dot-map, `coverage-by-document.tsx`) under the
   climate report; NR7 by national target and All NR7 indicators under the
   biodiversity one. Closed by default; review rows and NR7 chips open them
   at a target or an indicator.
6. Two caption lines: the source of the report on screen, and what is not
   yet included.

## Decisions (2026-09-09, with the product owner)

- One report at a time; the reader switches. Group headings, captions and
  the both-reports sentences are gone; the caveat lives in the body's last
  clause.
- Review items are only the two kinds above. Gaps (targets with no reported
  action) and actions still on paper are the full picture, not review items.
- Flagged pairs whose action is an NR7 narrative (the uncalibrated NR7
  alignment run) are not review items; they stay in the coverage dot-map. The
  climate group counts BTR actions only, so the headline equals the chart.
- The biodiversity top slice takes card-eligible signals only; a held-back
  rule (the unreviewed domestic-funding decline) shows after "Show all",
  never in the first five.
- Colour is never the only channel: every bar segment, chip and glyph has a
  word or a count beside it; the tour and the reading line expand BTR / NR7.

## Removal

`git rm -r` this directory and restore the pre-redesign slide from history
(`git show bbc7f1f^:src/components/dashboard/coherence-briefing/sections/implementation/index.tsx`
and its sibling `coverage-by-document.tsx`), then
`grep -rn "review-groups\|full-picture\|nr7PairTargets\|openTargetProfile\|implReport\|ImplementationReport" src messages`
and remove the `index.tsx` memos, state and props, the tour steps `toggle`,
`visual`, `row`, `fullPicture` (and their copy in three locales), and the
`briefing.implementation` keys `toggle`, `climate`, `biodiversity`, `frag`,
`readingNr7`, `row`, `showAll`, `showFewer`, `fullPicture`. `npx tsc --noEmit
&& pnpm test` point at anything left.
