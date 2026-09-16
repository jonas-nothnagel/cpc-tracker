# NR7 self-report (Implementation slide, inline)

The country's 7th National Report to the Convention on Biological Diversity
(NR7), read three ways at once and joined to the coherence map:

- the **progress rating** the country gave each national target,
- its **questionnaire answers** (the GBF binary indicators: yes / partially /
  under development / no, wording from the reporting tool),
- its **indicator series** (headline, component and national indicators,
  one series per disaggregation),
- plus its **policy links**: the policy targets in OTHER documents that the
  pipeline's target × target alignment rated HIGH (or flagged) against the
  NBSAP target the national target restates, kept with their document and
  counterpart (`policyLinksByNbsap`); **policy reach** is their HIGH count.
  Both follow the document toggle. The restated document is `NBSAP` unless
  the country config sets `nr7PolicyLinkDocType`.
- and the **GBF global target(s)** the country filed each national target
  under (`gbfTargets`, from the reporting tool, with the CBD's heading
  verbatim): the axis that is the same for every country, shown as a chip
  with the abbreviation expanded where it first appears (`GbfChip`;
  `gbf-groups.ts` groups rows by it and is kept for any list that wants
  that order).

The only AI-derived numbers in this module are the policy links, from the
pipeline's alignment; everything else is arithmetic on the country's own
statements. The copy states numbers, years and the report's words and never
carries a suggestion (see CLAUDE.md, pathway rules); the slide's hedged
"Where to start" pointer is the one exception, and it names the links as
AI-estimated.

## What renders (all inline on the Implementation slide, no drawer)

- The slide's biodiversity view (decided 2026-09-11, Julien's and Reina's
  feedback of 10 Sep; simplified 2026-09-16 after a design audit) is the
  **policy-link rows** (`sections/implementation/nr7-policy-link-rows.tsx`):
  every national target, the ones the report rates behind schedule
  (insufficient rate, no significant change) first, ranked by
  `rankPolicyLinkCandidates` in `review-groups.ts` on their HIGH links to
  other documents; a row opens to the report's own Key Challenges text, the
  aligned count, the potential misalignments, the GBF filing and the
  report's full entry (`Nr7TargetDetail`, `target-detail.tsx`: rating
  wording, narrative, questionnaire, indicators). `stripDeadlinePrefix`
  (`nr7-self-report.ts`) drops the "By 2030," every target opens with, for
  display only. When no such target has a link (no policy alignment
  visible) the cross-checks are the view, as before.
- The briefing's sticky column follows the opened policy-link row
  (`centerpiece/nr7-target-links.tsx`): that national target's links to the
  other plans, one line per document (aligned count, count to review), and
  the aligned targets listed per document with links into the target
  profile. The top row stands in until a row is opened. Tour
  `nr7TargetLinks`; copy under `briefing.implementationCenter.nr7Links`.
- The cross-check signals (`sections/implementation/nr7-cross-checks.tsx`:
  rating chip beside the disagreeing evidence as a glyph, rows expand to
  `QuestionnaireTable` / `IndicatorCard`) fold into the full picture under
  "Ratings that do not match their own evidence" while the policy-link rows
  lead; their takeaway sentence is assembled by the slide from
  `review-groups.ts`.
- `IndicatorsView` (every indicator, sparklines, small multiples for
  disaggregations, the country's note where no value was reported) renders
  inside the slide's folded "full picture" under the NR7 view; a target
  chip on a card opens that target's row. There is no separate list of the
  national targets since 2026-09-16: the rows are that list.
- `nr7PairByTarget` tells the slide which national targets can open a
  reported-action pair.
- Countries without NR7 data render nothing from this module and get no
  report toggle.

## Rules ("worth a closer look")

Thresholds live in `NR7_RULES` (`nr7-self-report.ts`).

| Rule | Fires when | Card-eligible |
|---|---|---|
| `ratingVsAnswers` | rated on track, at least 3 scale answers, half or more of them "under development" or "no" | eligible |
| `flatWhileOnTrack` | rated on track, a target-specific series (indicator on at most 3 targets) with at least 3 numeric points is unchanged (within 1% of its first value) | eligible |
| `unknownWithData` | rated unknown while the report carries values for a target-specific indicator | eligible |
| `reachWhileNoChange` | no significant change, policy reach above zero and at or above the 75th percentile of matched targets | eligible |
| `sharedIndicatorDeclining` | an indicator on 4 or more targets whose series with 3+ points all fall; once per indicator | **not eligible** until the reading of the funding series is reviewed (decision 2026-09-09) |

`cardEligible` is what the slide's review group orders by: eligible signals
first, the held-back one after "Show all". `cardSignals` (one per rule in
priority order, then fill, cap three) stays in the model, unused by the
current slide. Deterministic.

Policy-link ranking, Mongolia (Sept 2026): NT08 sustainable agriculture
(51 HIGH links in 6 documents, 11 flagged), NT02 land restoration (44, 21
flagged), NT01 spatial planning (39, 24 flagged) lead the 13 targets rated
behind schedule. Mongolia files its 20 national targets under all 23 GBF
targets (NT07, NT08, NT09 and NT20 under two or three).

Cross-checks, Mongolia (Sept 2026): NT12 (4 of 5 answers under development, reach 60),
NT05 (rated unknown, 5 values reported), NT03 (terrestrial protected-area
coverage flat at 20.77% 2020–2025 while the narrative says 21%; both are
shown, the tool does not arbitrate), NT07 (reach 38, no change), and
held-back declines on domestic public funding (355 to 258 bn MNT) and the
Red List Index (0.965 to 0.953).

## Known gaps

- Direction is first-to-last arithmetic per series. Rules therefore run only
  on target-specific series, or once per shared indicator.
- The "reported action and NBSAP target side by side" link depends on the
  NR7 alignment run's pseudo-targets (`nr7ParentTargetId`). Until the
  calibrated run replaces the September 2026 files it points at PDF-era
  pseudo-targets; the model itself is unaffected.
- If a future export carries no `Question` column, `questionTitle` is null
  and the questionnaire shows question numbers only. No wording is ever
  authored locally.

## Data

`python/scripts/fetch_nr7_ort.py` writes `python/data/external/nr7_{iso3}.json`
with `progressItems` (each with its `gbfTargets`), `questionnaire.answers`
and `indicators` from the CBD reporting tool's public API
(`python/src/nr7_ort.py`). The raw exports sit in
`python/data/external/nr7_ort/{iso3}/`.

## Removal

The policy-link addition alone: every identifier, file, message key and
config key carries `PolicyLink`, so
`grep -rni "policylink" src messages python/data/*country-config.json`
lists it; delete `sections/implementation/nr7-policy-link-rows.tsx` and its
test, then each hit (the slide falls back to the cross-checks by itself).
The pair drawer's context for a pair opened from a row (`pair-context.ts`,
the `nr7TargetId` field on the `target-pair` panel entry, the
`briefing.drawer.pair.nr7Context` keys) goes with it:
`grep -rn "nr7PairContext\|Nr7PairContext\|nr7TargetId\|nr7Context\|onOpenNr7Pair" src messages`.
The column alone: `grep -rni "nr7targetlinks\|nr7Links\|focusedNr7TargetId" src messages`
(`centerpiece/nr7-target-links.tsx` + test, the host state and branches,
the tour id and its copy); the wheel returns by itself.
The GBF chips alone: `grep -rni "gbf" src messages` (`gbf-chip.tsx`,
`gbf-groups.ts`, the `gbfTargets` row field, `briefing.nr7Report.gbf`).
The colour ramp is imported by `src/components/viz/nr7-progress.tsx` and
`sections/implementation/coverage-by-document.tsx` too; restore their local
maps if the module goes.

The whole module:

```
git rm -r src/components/dashboard/coherence-briefing/nr7-report
grep -rn "nr7-report\|Nr7Report\|nr7Report\|nr7PairTargets\|PolicyLink" src messages
```

Then delete every hit: the `nr7Report` and `nr7PairTargets` memos and the
two props in `index.tsx`; the NR7 view, its rows and folded sections in
`sections/implementation/` (`review-groups.ts` keeps a null biodiversity
group when the model is null, so the slide degrades to the climate view
alone, toggle hidden, once the imports are gone); the `briefing.nr7Report`
block in all three locale files. `npx tsc --noEmit && pnpm test` point at anything left. The
additive `Nr7*` types, `src/components/ui/sparkline.tsx` and the Python side
may stay.
