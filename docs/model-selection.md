# Choosing the pipeline model

`LLM_MODEL` is not a free parameter. It is part of every LLM cache key, so
changing it makes the next run fully cold, and more importantly it changes the
analysis itself: the same policy pair can come back as a potential misalignment
under one model and as ordinary low alignment under another. A new model must be
validated against the advisor prompt before it is adopted, the same way prompt
revisions are validated (see the calibration harness at
`python/scripts/calibrate_prompt.py`, added with advisor prompt v2.2).

Current pipeline model: **gpt-5.4** at `LLM_TEMPERATURE=0`. It is the control
arm the v2.2 advisor prompt was calibrated against, and the model behind every
committed country output.

## What to measure before adopting a model

Run the candidate and the incumbent over the *same* real pairs, with the *real*
advisor prompt, twice each (two cache namespaces, so the second run is not a
cache replay). Four numbers decide it:

1. **Flag retention** — of the pairs flagged for review in the country's current
   `alignment.json`, how many does the candidate still flag? A model that keeps
   almost none is not "stricter", it removes the review layer the country
   offices work from. Retention is relative to whatever that file holds, so
   record which run it was measured against.
2. **Background flag rate** — of pairs that are not currently flagged, how many
   does the model flag? Too high and flags stop meaning anything (this is what
   prompt v2.2 fixed for DeepSeek).
3. **Run-to-run churn** — how many verdicts change between two identical runs?
   This is the reproducibility a policymaker-facing artifact rests on.
4. **Parameter compatibility** — some deployments reject an explicit
   `temperature`. `llm.py` detects this once and drops the parameter, but the
   run then samples at the model default, which is the main driver of churn.

## Result: gpt-5.6-terra (probed 2026-07-28, not adopted)

Deployed on `cpc-tracker-ai-c657` at the same list price as gpt-5.4. Probed on
160 Sri Lanka pairs (80 flagged, 80 background) against the 2026-07-28 v2.2
run, two runs per model:

| | gpt-5.4 (temp 0) | gpt-5.6-terra (temp default) |
|---|---|---|
| keeps currently-flagged pairs | 68-70 of 80 (85-88%) | 8 of 80 (10%) |
| background flags | 0 of 80 | 0 of 80 |
| run-to-run churn | 11 of 160 (6.9%) | 32 of 160 (20.0%) |
| verdicts of "no alignment" | 1-3 of 160 | 29-32 of 160 |
| flags the other model does not raise | 60 | 0 |

The two models disagreed on 64% of pairs, and the disagreement runs one way:
gpt-5.6-terra never flagged a pair gpt-5.4 did not. gpt-5.6-terra reads the v2.2 rule
that friction must be named in the text far more literally: on an NDC target to
map and restore climate-vulnerable habitats against a minerals target to zone
high-potential areas for extraction, it answers low alignment because neither
text names a shared geography, where gpt-5.4 flags the land-use pressure for
review. Applied to the whole corpus that would erase the extractives-conservation
interface, which is Sri Lanka's headline coherence finding.

Neither behaviour is self-evidently correct: the open question is whether
gpt-5.4 over-flags or gpt-5.6-terra under-flags, and only human adjudication of
a sample answers it. Until that work is done, gpt-5.6-terra stays commented out
in `.env.example`. The probe script lives at `python/scripts/probe_model.py`.

Reproduce with:

```bash
cd python
uv run python -m scripts.probe_model --country sri-lanka --pairs 160 \
    --models gpt-5.4,gpt-5.6-terra
```

Retention is measured against the country's current `alignment.json`, so the
figure moves when that file is regenerated. An earlier reading of this same
probe, taken while Sri Lanka still held its 2026-07-10 prompt-v2.1 outputs,
put gpt-5.4 at 40% retention and gpt-5.6-terra at 1-4%: that run was measuring
prompt-v2.1 flags being re-scored under v2.2, which is a different question and
mostly explains the gap. The comparison between the two models is unaffected,
since both always read the same sample.
