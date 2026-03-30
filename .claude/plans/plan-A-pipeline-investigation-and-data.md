# Plan A: Pipeline Investigation & Data Expansion

## Context

Stakeholder feedback raised questions about pipeline result quality and requested adding a new sectoral policy. Investigation revealed that GPT-4o-mini classifies zero targets under `sector_energy`, `sector_transport`, `sector_ippu`, or `sector_waste` — only `sector_agriculture` (7), `sector_lulucf` (5), and `sector_other` (14). This causes BTR-NDC coherence to appear weak (only 14 measure pairs, all agriculture). The question is whether this reflects a real data pattern or a methodology limitation.

**Important**: Do NOT force classification results. If nothing classifies, that's a valid finding. Frame as investigation, not bug-fixing.

## Current State (as of 2026-03-26)

- 330 alignment pairs: 143 high, 152 medium, 29 low, 6 low_tension, 0 moderate/high contradiction
- 15 BTR pseudo targets (8 energy, 3 IPPU, 2 agriculture, 2 waste)
- Only 14 measure alignment pairs (all with BTR_agriculture_1 and BTR_agriculture_2)
- Model: `openai/gpt-4o-mini` via OpenRouter

---

## Task 1: Investigate BTR-NDC coherence methodology

**Question**: Is sector pre-matching the right approach for BTR measure alignment, or should we consider alternatives?

**Investigation steps:**
1. Review why NDC targets about energy (e.g., "renewable energy deployment") don't classify under `sector_energy` — is this an LLM limitation or are the targets genuinely cross-cutting?
2. Consider alternative pairing strategies:
   - Option A: Skip sector pre-matching, let the alignment LLM assess ALL measure-target pairs (more expensive but more thorough)
   - Option B: Use text similarity / embedding-based pre-filtering instead of classification-based
   - Option C: Classify BTR measures through the same pipeline instead of using raw sector tags
3. Run a small experiment: manually pair 5 BTR energy measures with relevant NDC targets and assess alignment quality
4. Document findings and recommendation

**Files to examine:**
- `python/src/measure_align.py` — `generate_measure_pairs()` (line 153-181)
- `python/src/classify.py` — classification prompts
- `python/output/classifications.json` — current classification results
- `python/output/btr_data.json` — BTR measure data

## Task 2: Evaluate prompt improvements (if investigation suggests it)

If the investigation suggests classification quality could genuinely improve:
1. Review classification prompts in `python/src/classify.py`
2. Consider whether IPCC sector definitions need better examples
3. Test with a better model (Claude Sonnet 4 via OpenRouter) and compare results
4. Only implement changes that produce genuinely more accurate results, not just more results

**Files:** `python/src/classify.py`, `python/src/config.py`

## Task 3: Add Mongolia Sustainable Development Vision 2030

User will upload the PDF to `dev_data_scripts/mongolia/sectoral_policies/`.

**Steps:**
1. Extract targets via CLI:
   ```bash
   cd python && uv run python -m src.extract \
     --file ../dev_data_scripts/mongolia/sectoral_policies/"Mongolia Sustainable Development Vision 2030 (EN).pdf" \
     --doc-type SECTORAL --source-document SECTORAL \
     --output /tmp/sdv2030-targets.json
   ```
2. Review extracted targets — filter to nature-climate relevant only
3. Have team confirm target quality before integration
4. Merge into `python/data/mongolia-targets.json` with IDs `SECTORAL_1`, `SECTORAL_2`, etc.
5. Re-run pipeline and regenerate TypeScript data: `cd python && uv run python -m src.convert_to_ts`

**Files:** `python/data/mongolia-targets.json`, `src/data/mongolia-targets.ts`

## Task 4: Re-run pipeline with better LLM (if warranted)

After investigation and any prompt changes, consider re-running with a stronger model:
1. Change `.env`: `LLM_MODEL=anthropic/claude-sonnet-4` (or equivalent on OpenRouter)
2. Clear cache: `rm -rf python/output/.cache/`
3. Re-run: `cd python && uv run python -m src.run_analysis`
4. Compare results objectively — better model should produce more nuanced results, not just different ones

**Files:** `.env`, `python/src/config.py`

## Verification

- [ ] Investigation documented with clear recommendation on BTR-NDC methodology
- [ ] SDV 2030 targets extracted and team-reviewed
- [ ] If re-run: results compared against baseline for genuine quality improvement
- [ ] Dashboard reflects updated data after `convert_to_ts`
