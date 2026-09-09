# Implementation slide (findings first)

The Level 3 slide: what the country's own reports (the BTR, plus the NR7
where it has one) say against the plan, with what needs a look first.

## What renders, top to bottom

1. **Headline = the finding.** "{n} reported actions and {m} self-report
   cross-checks are worth a closer look" (variants for climate only,
   biodiversity only, nothing flagged, match not computed). One body
   sentence gives the coverage counts and ends with the AI caveat.
2. **Two review groups** (`review-list.tsx`, ranked by `review-groups.ts`):
   - *Climate report (BTR)*: reported actions that may pull against policy
     targets, most flagged pairs first. A row expands inline to the
     commitments with the AI rationale under a labelled "Why it was flagged
     (AI-estimated)" heading, the institutions named on the action (verbatim,
     neutral) and "Open the pair" into the pair drawer.
   - *Biodiversity report (NR7)*: the cross-checks between the country's own
     rating, questionnaire answers and indicators (`../../nr7-report/`). A row
     expands inline to the report's own evidence and "See the national target".
   Top five per group, "Show all" for the rest.
3. **The full picture, folded** (`full-picture.tsx`): Coverage by document
   (the dot-map, `coverage-by-document.tsx`), NR7 by national target, All NR7
   indicators. Closed by default; review rows and NR7 chips open them at a
   target or an indicator.

## Decisions (2026-09-09, with the product owner)

- Review items are only the two kinds above. Gaps (targets with no reported
  action) and actions still on paper are the full picture, not review items.
- Flagged pairs whose action is an NR7 narrative (the uncalibrated NR7
  alignment run) are not review items; they stay in the coverage dot-map. The
  climate group counts BTR actions only, so the headline equals the list.
- The biodiversity group's top slice takes card-eligible signals only; a
  held-back rule (the unreviewed domestic-funding decline) shows after "Show
  all", never in the first five.
- No source switch and no drawer: both reports always feed the reads.

## Removal

`git rm -r` this directory and restore the pre-redesign slide from history
(`git show bbc7f1f^:src/components/dashboard/coherence-briefing/sections/implementation/index.tsx`
and its sibling `coverage-by-document.tsx`), then `grep -rn "review-groups\|full-picture\|nr7PairTargets\|openTargetProfile" src messages`
and remove the `index.tsx` memos and props, the tour steps `review`, `rows`,
`fullPicture` (and their copy in three locales), and the
`briefing.implementation` keys added by commit bbc7f1f. `npx tsc --noEmit &&
pnpm test` point at anything left.
