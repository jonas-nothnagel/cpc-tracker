# Target quality (removable system)

Assesses **how well defined each target is** against five criteria a trackable
target meets — names a specific action, says where or for whom, states the
result expected, includes a measurable value, includes a deadline — with the
verbatim wording from the target quoted for each criterion it meets. Renders a
banded verdict ("Well defined" / "Partly defined" / "Broadly defined") plus the
score behind it.

Added for the Panama focal-group report (23 Jul 2026), which asked the tool to
grow toward "goals, indicators, progress". A planner cannot track a target that
does not say what will change, by how much, where, or by when; telling them
which targets are ready to monitor is the most useful thing this analysis can
add without new data.

## What it judges, and what it does not

It judges how fully a target is **written** — whether it can be monitored as it
stands. It says nothing about whether the policy is right, ambitious enough, or
a priority. A broad framing principle is not a bad commitment for lacking a
number, and the caveat on every panel says so.

The first version hedged so hard it stopped communicating: the chip read "3 of 5
stated" and the caveat said it described "what the text says, not how good the
target is" — a denial of the feature's own purpose. Readers could not tell what
was being measured. Naming the judgement is the fix; bounding it is the caveat's
job.

Hard rules that stand:

- **Nothing ranks documents, sectors, or institutions by this.** Assessing an
  individual target against standard criteria is ordinary M&E practice. A league
  table of "which ministry writes the worst targets" is the blame vector the
  political-sensitivity guardrail (CLAUDE.md) exists to prevent. A per-document
  rollup component was written and deliberately deleted; do not reintroduce one.
- **Every criterion marked met carries its quote.** `target_quality.py` drops any
  claim it cannot locate verbatim in the target, so an unquotable criterion is
  reported as unmet rather than asserted. This is what makes the assessment
  checkable rather than an opinion.
- **Dots stay neutral grey.** The verdict lives in words, where it can be precise
  about judging the wording and not the policy; a red dot on a government
  commitment says something blunter than is meant.
- Labelled AI-assessed wherever it appears.

## Where the five elements come from

| Criterion | Source |
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
