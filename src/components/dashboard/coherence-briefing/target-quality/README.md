# Target definition elements (removable system)

Reports **which elements a target's text states** — a specific action, where or
for whom, the result expected, a measurable value, a deadline — with the
verbatim phrase from the target supporting each one.

Added for the Panama focal-group report (23 Jul 2026), which asked the tool to
grow toward "goals, indicators, progress". A planner cannot track a target that
does not say what will change, by how much, where, or by when; telling them
which targets are ready to monitor is the most useful thing this analysis can
add without new data.

## The framing is the feature

This is an observation about **text**, not a grade of a target and never a
judgement of whoever wrote it. Policy language is often deliberately broad; a
target that leaves an element unstated is not a bad target.

Hard rules, enforced by review and by the guardrail check:

- No score, no "weak" / "poor" / "incomplete". "3 of 5 elements stated", never
  "3 out of 5 quality".
- Nothing may rank documents, sectors, or institutions by this
  (political-sensitivity guardrail, CLAUDE.md).
- Every element marked stated carries its quote. `target_quality.py` drops any
  claim it cannot locate verbatim in the target, so an unquotable element is
  reported as not stated rather than asserted.
- Labelled AI-generated with the standard caveat wherever it appears.

## Where the five elements come from

| Element | Source |
|---|---|
| `measurable` | `quantitative_flags.json` (`isQuantitative`) — already existed |
| `deadline` | `quantitative_flags.json` (`isTimeBound`) — already existed |
| `action` | `target_quality.json` |
| `scope` | `target_quality.json` |
| `outcome` | `target_quality.json` |

The two pre-existing flags are merged in `src/lib/dashboard-data.ts` rather than
recomputed, so the two sources cannot disagree.

## Known limitation: evidence quotes are English

The assessment runs against the English analysis text, so the quoted phrases are
English. On `/es/{country}` the element labels and the caveat are translated but
the quotes are not, which is the same class of gap as the quantitative highlight
phrases (see `src/lib/locale-text/README.md`).

Translating the quotes would break them: a quote's whole job is to be findable
in the target the reader is looking at. The real fix is to run this assessment
against the source-language text so the quotes match the Spanish the reader now
sees — follow-up pipeline work, tracked here rather than hidden.

## Generating the data

```bash
cd python && uv run python -m src.run_analysis --targets-file panama-targets.json
```

The step runs after target decomposition (step 4b) so it can pass the pipeline's
own reading of each target as context. Skip it with `--skip-target-quality`.

## Turning it off without deleting code

Delete `python/output/{country}/target_quality.json`. Every affordance hides:
the chip returns null, and the pair drawer falls back to the measurable /
deadline badges it showed before. This is the same data-absence pattern the
briefing already uses for missing BER / BTR / NR7 data, and needs no code change.

## Removal recipe

1. Delete the roots:

   ```bash
   git rm -r src/components/dashboard/coherence-briefing/target-quality \
     python/src/target_quality.py
   git rm python/output/*/target_quality.json
   ```

2. Find and delete the touch points (one loader block plus one merge in
   `dashboard-data.ts`, one mount in the doc-targets drawer, one branch in the
   pair drawer, one stage in `run_analysis.py`):

   ```bash
   grep -rn "target-quality\|target_quality\|DefinitionChip\|definition\?" src/ python/src/
   ```

3. Drop `TargetDefinition`, `TARGET_DEFINITION_ELEMENTS`, and `Target.definition`
   from `src/types/index.ts`, and the `briefing.targetQuality` message block.
