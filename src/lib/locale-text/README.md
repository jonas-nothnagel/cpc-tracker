# Source-language content (removable system)

Makes a translated page actually read in its own language. Three independent
pieces, applied once at the data layer so no render site needs a locale:

1. **Target text** — on `/es/{country}`, a Spanish-sourced target renders its
   original Spanish. The English analysis text moves to `textTranslation` and
   stays one click away behind the existing language chip.
2. **Document labels** — `documentTypes[].labels.<locale>` overrides fold onto
   the base fields, so "PEG (Gov't Strategic Plan)" reads
   "PEG (Plan Estratégico de Gobierno)".
3. **Pair rationales** — sparse `<file>.<locale>.json` overlays produced by
   `python/scripts/translate_alignment.py` are merged onto the records of all
   three alignment files (policy-to-policy, BTR, BER), so no drawer is left in
   English while its neighbours are translated.

Added for the Panama focal-group report (23 Jul 2026): *"ensure linguistic
consistency in the Spanish version by correcting content or responses that are
still in English."* All 368 Panama targets were written in Spanish and machine-
translated to English so the pipeline could analyse one language; the dashboard
then showed that English back to the people who wrote the originals.

**This system is built to be deleted**, and its three pieces are independently
revertable — a problem with one does not force undoing the others.

## What it does not do

It does not re-run any analysis. Every verdict was computed on the English text
and is unchanged; only which string is displayed changes.

## Known degradation

`quantitativeDetails` / `timeBoundDetails` hold phrases extracted from the
English text, and `TargetTextWithHighlights` locates them by substring. Against
swapped Spanish text those lookups miss and the component falls back to plain
text, so the highlight is lost rather than the sentence. Re-extracting the
phrases per language is follow-up pipeline work.

## Partial rationale translation

`translate_alignment.py` translates `high`, `low` and `flagged` verdicts by
default — 25,271 of Panama's 66,554 rationales (13,549 policy-to-policy, 4,492
BTR, 7,230 BER) — skipping the bulk `medium` tier. Any pair not covered keeps
its English rationale and is marked `descriptionTranslationPending`, which
renders a one-line disclosure in the pair drawer. Run with `--levels all` to
close the gap.

**The pass has not been run yet**: it needs live LLM calls with a real cost, so
it is a deliberate spend decision rather than something to trigger silently. The
code path is verified and, until it runs, no overlay exists, nothing is marked
pending, and the rationales read as they do today.

## Turning it off without deleting code

Each piece has its own lever, smallest blast radius first:

| Piece | Turn off by |
|---|---|
| Pair rationales | Delete `python/output/{country}/*.{locale}.json` overlays |
| Document labels | Remove the `labels` keys from the country config |
| Target text | Delete the `localizeTargetTexts(...)` call in `dashboard-data.ts` |

The first two need no code change at all.

## Removal recipe

1. Delete the roots:

   ```bash
   git rm -r src/lib/locale-text python/scripts/translate_alignment.py
   git rm python/output/*/alignment.*.json
   ```

2. Find and delete the touch points (three calls in `dashboard-data.ts`, one
   conditional in the pair drawer, one in the language chip):

   ```bash
   grep -rn "locale-text\|textTranslation\|descriptionTranslationPending" src/
   ```

3. Drop `textTranslation`, `sourceLabelTranslation`, `textLocale`, and
   `descriptionTranslationPending` from `src/types/index.ts`, `labels` from
   `DocumentTypeEntry`, and the `labels` keys from the country configs.

4. Delete the `chip.ariaLabelEnglish` / `chip.titleEnglish` and
   `briefing.drawer.pair.rationaleTranslationPending` message keys.
