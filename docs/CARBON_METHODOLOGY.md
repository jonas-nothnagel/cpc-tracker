# AI Carbon Footprint Methodology

How the CPC Analyzer measures and reports the environmental footprint of the AI
computation behind the tool. This is a transparency record for reporting, not a
decision-support output. It is designed to be reusable as a standard for other
UNDP projects that run LLM and API calls.

All figures are clearly labelled in the UI as AI-estimated. They are modelled
estimates, not meter readings, and carry a margin of uncertainty.

## 1. Purpose and scope

In scope: the inference cost of the large language model (LLM) calls the tool
makes, across four components:

- `extract` - document extraction (upload wizard).
- `user_pipeline` - a coherence analysis run triggered by a user upload.
- `dev_pipeline` - a pipeline run started by a developer from the command line.
- `chat` - the in-app coherence chatbot.

Out of scope (v1): model training, frontend hosting, network transfer, user
devices, and any non-LLM compute. These are excluded so the number is honest
about what it does and does not cover.

## 2. What we measure

Each metric is stored in a small base unit and promoted to a friendlier unit in
the UI once it crosses 1000.

| Metric | Base unit | Meaning |
| --- | --- | --- |
| Energy | Wh (watt hours) | Electricity drawn by the inference. |
| Carbon | gCO2e (grams CO2 equivalent) | Global Warming Potential of that energy, given the grid mix. |
| Water | mL (water consumption footprint) | Data-centre cooling and related water use. |
| Minerals | ugSb-eq (micrograms antimony equivalent) | ADPe, abiotic depletion potential of mineral resources. |

Abbreviations are expanded inline on first use in the UI (CO2e, kWh, ADPe).

## 3. EcoLogits basis

We use the [EcoLogits](https://ecologits.ai) methodology, which models impact
from the model's architecture, the output token count, and the request latency.
There are three call paths, all the same methodology:

1. Instrumented (Python pipeline): EcoLogits patches the OpenAI SDK so each
   response carries an `.impacts` attribute. This is the primary path.
2. Manual fallback (Python pipeline): when a response has no `.impacts` (for
   example an OpenRouter-style model name not in the registry), we recompute via
   `ecologits.tracers.utils.llm_impacts(...)` from the output tokens and latency.
3. Hosted API (chat): the chatbot runs in TypeScript, outside EcoLogits' Python
   reach, so it calls the hosted endpoint
   `POST https://api.ecologits.ai/v1beta/estimations`.

Impact fields are reported by EcoLogits as min/max ranges. Headline totals use
the midpoint so running totals stay single-valued; since August 2026 the
min/max bounds are also accumulated and persisted (ledger schema 2), so the
modelled-uncertainty envelope is not lost. Calls that carry no range (per-token
coefficient estimates, totals seeded from older files) contribute their
midpoint to both bounds, which means the envelope only ever understates the
uncertainty. Water is read from the usage phase (`impacts.usage.wcf`) in every
path for consistency.

## 4. Region and grid intensity

Carbon depends on the electricity mix that powered the inference. EcoLogits takes
an `electricity_mix_zone` (ISO 3166-1 alpha-3). We set it via
`CPC_ELECTRICITY_ZONE`, default `USA`, because the production Azure OpenAI
deployment runs in East US. `USA` is also the OpenAI provider default in
EcoLogits, so pinning it keeps the historical Mongolia and Panama numbers stable
while making the region explicit and overridable for other deployments. Every
ledger row records the zone it was computed against. Changing the zone changes
the carbon numbers.

## 5. The ledger

Every component appends one row to a single append-only JSONL file,
`footprint-ledger.jsonl`. The pipeline and extraction write one summary row per
run per model (a run makes thousands of calls, so per-call rows would be absurd).
Chat writes one row per message.

Row schema (`schema: 2`; schema 1 rows lack the optional bounds and stay valid):

| Field | Notes |
| --- | --- |
| `ts` | ISO8601 UTC. |
| `component` | extract, user_pipeline, dev_pipeline, chat. |
| `provider`, `model`, `region` | provider, model/deployment name, electricity zone. |
| `run_id`, `country` | analysis id and country where applicable, else null. |
| `input_tokens`, `output_tokens` | chat only; pipeline rows leave them null. |
| `call_count`, `cached_call_count` | total calls and cache hits (cache hits add no marginal footprint). |
| `energy_wh`, `water_ml`, `co2_geq`, `minerals_ugsbeq` | impacts in base units (midpoints). |
| `*_min`, `*_max` per metric | optional modelled-uncertainty bounds (schema 2, August 2026 onward). |
| `source` | measured, estimated, api, or unavailable (see below). |

The `country` tag is derived from the targets filename (the same derivation as
the output directory), never from output-path components: a path heuristic once
recorded the model slug as the country for model-comparison runs under
`<country>/<model-slug>/` (4 rows, ~28 kWh, repaired 2026-08-10). The deploy
reconcile (`python/scripts/merge_ledger.py`) de-duplicates rows on identity
(everything except `country`, `run_id` and `schema`), so seed-side metadata
corrections supersede stale volume copies instead of double-counting.

`source` values: `measured` (live EcoLogits on Python responses), `estimated`
(computed from call counts when a run was fully cache-served), `api` (hosted
EcoLogits estimation for chat), `unavailable` (row recorded with null impacts
because the model was unknown or the API was unreachable).

Atomicity: a single `O_APPEND` write of a line below `PIPE_BUF` (4096 bytes) is
POSIX-atomic, so concurrent appends from the pipeline and the chat route never
interleave. Rows are well under 1 KB. No external lock is used.

Location and persistence: the ledger path is resolved identically by Python
(`python/src/footprint/ledger.py`) and Node (`src/lib/footprint/paths.ts`). It
honours `CPC_LEDGER_DIR` (set this on Azure to the persistent `/home` mount so it
survives restarts) and falls back to the repo-relative `python/output/`. On
read-only hosting (Vercel preview) writes are skipped gracefully and the page
reads the committed seed ledger.

## 6. Units and conversions

EcoLogits returns kWh, kgCO2eq, kgSbeq, and L. We store Wh, gCO2eq, ugSbeq, and
mL: kWh x 1000, kgCO2eq x 1000, kgSbeq x 1e9, L x 1000.

## 7. Cache and zero-marginal-cost calls

The pipeline caches LLM responses on disk. A cache hit is counted in
`call_count` and `cached_call_count` but adds no impact, because no new inference
ran. This keeps the footprint honest: re-running an analysis that is fully cached
reports near-zero new impact.

## 8. Caveats and confidence

- Estimates, not meter readings. EcoLogits models energy from public model
  characteristics; closed models (for example gpt-5.x) are approximated.
- Ranges. Underlying values are ranges; headline figures are midpoints. Since
  August 2026 the bounds are persisted per row, and the dashboard shows the
  summed envelope once enough of the recorded footprint carries bounds (rows
  recorded before then count their midpoint on both ends, so the shown range
  is a floor on the true uncertainty, never an exaggeration).
- Reasoning tokens. Models that reason before answering may use more compute
  than the visible output tokens imply.
- Always label outputs as AI-estimated with the EcoLogits basis.

## 8b. Everyday equivalences

The dashboard translates the running totals into three everyday anchors, each
tied to exactly one metric so energy-based and carbon-based framings never
blend: full charges of a long-range electric car (energy, 75-100 kWh pack,
midpoint 87.5 kWh), litres of petrol with the same carbon (US EPA factor,
8,887 g CO2 per US gallon, verified August 2026), and bathtubs of cooling
water (155 litres). Factors live in `src/lib/footprint/equivalents.ts` with
their provenance; the strip is labelled illustrative and hidden while totals
are too small for the anchors to be legible.

## 9. Data sovereignty

The chat path sends only the output token count and the model name to the hosted
EcoLogits API. It never sends the prompt, the user's question, or any policy
content. The Python pipeline computes impacts entirely in-process and sends
nothing externally.

## 10. How to reuse in another project

1. Copy `python/src/footprint/` (tracker, ledger, zones) and
   `src/lib/footprint/` (types, paths, ledger, ecologits-api, rollup).
2. Route every Python LLM call through one wrapper that records to the tracker
   (here, `call_llm` in `python/src/llm.py`), and emit a ledger row per run.
3. For any non-Python caller (a chat route, a worker), append a ledger row using
   the hosted EcoLogits API, sending only token counts and the model name.
4. Set `CPC_LEDGER_DIR` to a persistent path and `CPC_ELECTRICITY_ZONE` to the
   deployment's region.
5. Read and roll up the ledger for a dashboard and an export.

## 11. Deferred (not in v1)

- A standalone installable package (the module is reused by copy for now).
- A self-hosted EcoLogits API (EcoLogits ships the API as a deployable service,
  which a future UNDP deployment could run for full data control and resilience).
- Per-user or per-session attribution.
- Training-cost amortization, frontend hosting, network, and device footprint.
- Cross-process file locking beyond the atomic-append guarantee.

## Deployment note (Azure)

The committed seed ledger lives at `python/output/footprint-ledger.jsonl` and
serves local and read-only (Vercel) environments. On Azure, where
`CPC_LEDGER_DIR` points at the `/home` mount, seed the live ledger once by
running `python scripts/backfill_ledger.py` against that mount (or copy the seed
into it at container start), so the page is non-empty before the first new run.
