# Plan: Rethink Classification-Before-Alignment Methodology

**Branch:** `feat/alignment-methodology-rework`

## Context

The BTR-NDC measure alignment produces only 14 pairs (all agriculture) out of ~1,054 possible, because sector pre-matching requires exact IPCC sector overlap. Investigation reveals this is not a classification quality bug — it's a fundamental methodology limitation.

**Core insight:** Classification currently serves two roles: (1) pair-generation filter, (2) visualization grouping. Role 1 is harmful (creates a noisy binary gate that blocks the alignment LLM from ever assessing pairs). Role 2 is valuable. This plan decouples them.

### Investigation findings

**Current pairing asymmetry:**

| Step | Pairing strategy | Taxonomies used | Pairs generated |
|------|-----------------|-----------------|-----------------|
| Target-target (Step 5) | `generate_pairs()` | ALL: NBS + Sector + Themes | 330 / 1,245 max (26.5%) |
| BTR measure-target (Step 6) | `generate_measure_pairs()` | IPCC Sectors ONLY | 14 / 1,054 max (1.3%) |

**Why BTR is broken:**
- BTR measures have pre-assigned IPCC sector tags from govt reporting (ground truth) but are NEVER LLM-classified
- Mongolia's NDC targets have ZERO `sector_energy` classifications — correctly so, the NDC focuses on nature/agriculture
- The alignment LLM (Agent 2) never sees classification info — it only gets decomposed target texts
- Classification is a cheaper but worse duplicate of the alignment judgment

**Data points:**
- 62 targets (NBSAP: 20, NAP: 15, NDC: 27), 17 BTR measures
- 38/62 targets have NO relevant IPCC sector
- 4 targets have zero relevant classifications in any taxonomy
- ZERO targets classified as `sector_energy`, `sector_transport`, `sector_ippu`, or `sector_waste`
- BTR measures appear in chord (via 14 agriculture alignment pairs) but show 0 in IPCC bar chart (never classified)

---

## Implementation Plan

### Step 0: Create feature branch

```bash
git checkout -b feat/alignment-methodology-rework
```

### Step 1: Remove classification filtering from pair generation

**Files:** `python/src/align.py`, `python/src/measure_align.py`, `python/src/run_analysis.py`

**`align.py` — simplify `generate_pairs()`** (lines 325-387):
- Remove the `classifications` parameter
- Generate ALL cross-document pairs (every target paired with every target from a different document)
- Keep deduplication and cross-document constraint

```python
def generate_pairs(targets: list[dict]) -> list[tuple[dict, dict]]:
    """Generate ALL cross-document target pairs."""
    by_doc = defaultdict(list)
    for t in targets:
        by_doc[t["sourceDocument"]].append(t)
    pairs = []
    seen = set()
    for doc_a, doc_b in combinations(sorted(by_doc.keys()), 2):
        for ta in by_doc[doc_a]:
            for tb in by_doc[doc_b]:
                key = tuple(sorted([ta["id"], tb["id"]]))
                if key not in seen:
                    seen.add(key)
                    pairs.append((ta, tb))
    return pairs
```

**`measure_align.py` — simplify `generate_measure_pairs()`** (lines 153-181):
- Remove `classifications` parameter
- Remove sector pre-matching
- Pair every BTR measure with every target

```python
def generate_measure_pairs(
    targets: list[dict], pseudo_targets: list[dict]
) -> list[tuple[dict, dict]]:
    """Pair every measure with every target."""
    pairs = []
    for pt in pseudo_targets:
        for t in targets:
            pairs.append((t, pt))
    return pairs
```

**`run_analysis.py`:**
- Update call to `generate_pairs()` (line 145) — remove `all_classifications` arg
- Update call to `generate_measure_pairs()` (line 201) — remove `all_classifications` arg
- Classification step still runs (needed for visualization)
- Update logging to show total pairs vs previous filtered count

### Step 2: Classify BTR measures against NBS and cross-cutting themes

BTR measures are currently never LLM-classified. Add classification for NBS categories and cross-cutting themes only (NOT IPCC sectors — we have ground truth for those).

**`run_analysis.py`** — after converting BTR measures to pseudo-targets (line 197), classify them:

```python
# Classify BTR pseudo-targets against NBS and themes (not sectors — ground truth)
if measure_pseudo_targets:
    btr_nbs = await run_classification(measure_pseudo_targets, nbs_categories, "nbs")
    btr_themes = await run_classification(measure_pseudo_targets, themes, "theme")
    all_classifications.extend(btr_nbs + btr_themes)
    # Re-save classifications with BTR entries included
    out_path = OUTPUT_DIR / "classifications.json"
    out_path.write_text(json.dumps(all_classifications, indent=2))
```

This means BTR measures will:
- Appear in NBS and cross-cutting theme bar charts
- Be placed in correct groups in the chord diagram (not "Other") when viewing by NBS or theme mode

### Step 3: Use BTR ground-truth IPCC sectors in visualization

BTR measures have government-reported IPCC sector tags (`sector` field on pseudo-targets). Use these for:

**A. IPCC bar chart** — `src/lib/utils.ts` `countByCategory()` (line 109):
- After counting from `classifications`, also count BTR pseudo-targets using their `sector` field
- These are ground truth labels, arguably more reliable than LLM classification

**B. Chord diagram sector grouping** — `src/components/viz/policy-coherence-explorer.tsx` `buildGroupsByTaxonomy()` (line 82):
- When `taxonomyType === "sector"`, also check if a BTR target has a `sector` field and use it for grouping
- This moves BTR measures from "Other" to their correct sector group

**C. Alternatively** — inject synthetic classification entries for BTR measures' IPCC sectors in `run_analysis.py`:
```python
# Add ground-truth sector classifications for BTR measures
for pt in measure_pseudo_targets:
    all_classifications.append({
        "targetId": pt["id"],
        "categoryId": pt["sector"],
        "taxonomyType": "sector",
        "isRelevant": True,
    })
```
This is simpler — the frontend code doesn't need to change at all. The bar chart and chord grouping will automatically pick up BTR measures through the existing classification data flow.

**Recommended: Option C** — inject synthetic classifications. Cleanest approach, no frontend changes needed.

### Step 4: Handle increased "none" alignment results

With all pairs assessed, many will return "No alignment". The existing pipeline already handles this:
- `convert_to_ts.py` filters out `alignment == "none"` before generating TypeScript data
- Frontend never sees "none" pairs

Store all results in JSON (preserves audit trail). No changes needed here.

### Step 5: Verify with Euro-5 example

After running the pipeline:
1. BTR_energy_4 (Euro-5 fuel) has alignment results with all 62 targets
2. Agent 2 finds relevant connections (likely Low-Medium with emission/mitigation targets)
3. Agent 2 returns "No alignment" for unrelated targets (biodiversity, culture, etc.)
4. BTR measures appear in IPCC bar chart with correct sector counts (8 energy, 3 IPPU, 2 waste, etc.)
5. BTR measures appear in NBS/theme bar charts based on LLM classification
6. Chord diagram groups BTR correctly in all modes (document, sector, theme, nbs)

---

## Files to modify

| File | Change |
|------|--------|
| `python/src/align.py` | Simplify `generate_pairs()` — remove classification filtering, remove `classifications` param |
| `python/src/measure_align.py` | Simplify `generate_measure_pairs()` — remove sector matching, remove `classifications` param |
| `python/src/run_analysis.py` | Remove classification args from pair gen calls. Add BTR classification (NBS + themes). Inject ground-truth sector classifications for BTR. Update logging. |

## Files NOT modified

| File | Why |
|------|-----|
| `python/src/classify.py` | Unchanged — still runs for all targets + now also for BTR |
| `python/src/convert_to_ts.py` | Already filters `none` results — no changes needed |
| `src/components/viz/policy-coherence-explorer.tsx` | Chord grouping works via classifications — auto picks up BTR via injected entries |
| `src/lib/utils.ts` | Bar chart counting works via classifications — auto picks up BTR via injected entries |

## Expected outcome

| Metric | Before | After |
|--------|--------|-------|
| Target-target pairs assessed | 330 | 1,245 |
| BTR measure pairs assessed | 14 | ~1,054 |
| Targets with zero connections | 4 | 0 |
| BTR energy measures with connections | 0 | all 8 |
| BTR in IPCC bar chart | 0 (invisible) | ground truth counts |
| BTR in NBS/theme bar charts | 0 (invisible) | LLM-classified counts |
| BTR chord grouping (sector mode) | "Other" | correct IPCC sector |
| Additional LLM calls | — | ~1,955 alignment + ~476 BTR classification |
| Estimated cost increase | — | ~$2.50 with GPT-4o-mini |

## Verification checklist

1. `git checkout feat/alignment-methodology-rework` — working on feature branch
2. `cd python && uv run python -m src.run_analysis` — full pipeline run
3. Check `measure_alignment.json` — ALL BTR measures have alignment results
4. Check BTR_energy_4 (Euro-5) — has results with relevant targets, not just "none"
5. Check `classifications.json` — includes BTR entries for NBS, themes, and ground-truth sectors
6. `cd .. && pnpm dev` — verify dashboard:
   - IPCC bar chart shows BTR measures in correct sectors
   - NBS/theme bar charts show BTR measures
   - Chord diagram groups BTR correctly in all modes
   - No bloated TypeScript data files
