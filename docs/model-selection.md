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

1. **Flag retention** — of the pairs currently flagged for review, how many does
   the candidate still flag? A model that keeps almost none is not "stricter",
   it removes the review layer the country offices work from.
2. **Background flag rate** — of pairs with no known friction, how many does it
   flag? Too high and flags stop meaning anything (this is what prompt v2.2
   fixed for DeepSeek).
3. **Run-to-run churn** — how many verdicts change between two identical runs?
   This is the reproducibility a policymaker-facing artifact rests on.
4. **Parameter compatibility** — some deployments reject an explicit
   `temperature`. `llm.py` detects this once and drops the parameter, but the
   run then samples at the model default, which is the main driver of churn.

## Result: gpt-5.6-terra (probed 2026-07-28, not adopted)

Deployed on `cpc-tracker-ai-c657` at the same list price as gpt-5.4. Probed on
160 Sri Lanka pairs (80 currently flagged, 80 background) with advisor prompt
v2.2, two runs per model:

| | gpt-5.4 (temp 0) | gpt-5.6-terra (temp default) |
|---|---|---|
| keeps currently-flagged pairs | 32 of 80 (40%) | 1-3 of 80 (1-4%) |
| background flags | 1 of 80 | 0 of 80 |
| run-to-run churn | 4.4% | 16.9% |
| verdicts shifted to "no alignment" | 1% of pairs | 23% of pairs |

The two models disagreed on 59% of pairs. gpt-5.6-terra reads the v2.2 rule
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
