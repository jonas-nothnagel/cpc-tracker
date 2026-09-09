# NR7 self-report (Implementation slide, inline)

The country's 7th National Report to the Convention on Biological Diversity
(NR7), read three ways at once and joined to the coherence map:

- the **progress rating** the country gave each national target,
- its **questionnaire answers** (the GBF binary indicators: yes / partially /
  under development / no, wording from the reporting tool),
- its **indicator series** (headline, component and national indicators,
  one series per disaggregation),
- plus **policy reach**: how many policy targets in the corpus align HIGH
  with the NBSAP target the national target restates (from the visible
  target × target alignment, so it follows the document toggle).

No model is involved anywhere in this module. Every number is arithmetic on
the country's own statements; the copy states numbers, years and the report's
words and never carries a suggestion (see CLAUDE.md, pathway rules).

## What renders (all inline on the Implementation slide, no drawer)

- The cross-check signals are the slide's biodiversity review group
  (`sections/implementation/review-list.tsx` renders `SignalLine` rows that
  expand to `QuestionnaireTable` / `IndicatorCard` evidence).
- `Nr7TargetsList` (rating mix + twenty expandable `Nr7TargetRow`s) and
  `IndicatorsView` (every indicator, sparklines, small multiples for
  disaggregations, the country's note where no value was reported) render
  inside the slide's folded "full picture" sections.
- `nr7PairByTarget` tells the slide which national targets can open a
  reported-action pair.
- Countries without NR7 data render nothing from this module.

## Rules ("worth a closer look")

Thresholds live in `NR7_RULES` (`nr7-self-report.ts`).

| Rule | Fires when | Card-eligible |
|---|---|---|
| `ratingVsAnswers` | rated on track, at least 3 scale answers, half or more of them "under development" or "no" | eligible |
| `flatWhileOnTrack` | rated on track, a target-specific series (indicator on at most 3 targets) with at least 3 numeric points is unchanged (within 1% of its first value) | eligible |
| `unknownWithData` | rated unknown while the report carries values for a target-specific indicator | eligible |
| `reachWhileNoChange` | no significant change, policy reach at or above the 75th percentile of matched targets | eligible |
| `sharedIndicatorDeclining` | an indicator on 4 or more targets whose series with 3+ points all fall; once per indicator | **not eligible** until the reading of the funding series is reviewed (decision 2026-09-09) |

`cardEligible` is what the slide's review group orders by: eligible signals
first, the held-back one after "Show all". `cardSignals` (one per rule in
priority order, then fill, cap three) stays in the model, unused by the
current slide. Deterministic.

Mongolia (Sept 2026): NT12 (4 of 5 answers under development, reach 60),
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
with `progressItems`, `questionnaire.answers` and `indicators` from the CBD
reporting tool's public API (`python/src/nr7_ort.py`). The raw exports sit in
`python/data/external/nr7_ort/{iso3}/`.

## Removal

```
git rm -r src/components/dashboard/coherence-briefing/nr7-report
grep -rn "nr7-report\|Nr7Report\|nr7Report\|nr7PairTargets" src messages
```

Then delete every hit: the `nr7Report` and `nr7PairTargets` memos and the
two props in `index.tsx`; the NR7 group, rows and folded sections in
`sections/implementation/` (`review-groups.ts` keeps a null biodiversity
group when the model is null, so the slide degrades to the climate group
alone once the imports are gone); the `briefing.nr7Report` block in all three
locale files. `npx tsc --noEmit && pnpm test` point at anything left. The
additive `Nr7*` types, `src/components/ui/sparkline.tsx` and the Python side
may stay.
