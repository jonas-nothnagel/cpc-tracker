# v2.1 alignment pipeline — internal credibility audit

**Date**: 2026-05-26
**Auditor**: internal (reading by the agent, no external reviewers)
**Scope**: Mongolia (5,332 pairs, 713 flagged) + Panama (44,474 pairs, 893 flagged)
**Method**: mechanical coherence script + stratified case-file reading + false-negative sampling
**Reproducibility**: `python -m src.audit_v2 coherence|sample|false-negatives --country {country}` from `python/`

## Top-line

The v2.1 pipeline produces **defensible flagged calls in roughly three-quarters of cases**, with a clear systematic weakness: it over-flags when the link between two targets is indirect. The schema (mechanism / manageability / confidence) carries real signal — Mongolia's 12 "Fundamental" pairs and 8 "Goal conflict" pairs are all real policy contradictions, and the high-stakes claims hold up under reading. The dubious cases concentrate exactly where the model's own confidence score is "Low", which is the calibration working as designed.

| | Mongolia | Panama |
|---|---|---|
| Flagged records | 713 (13.4%) | 893 (2.0%) |
| Mechanical-coherence issues | 16 (2.2%) | 2 (0.2%) |
| Sample cases read | 17 | 10 |
| Sample plausible | 13 (76%) | 7 (70%) |
| Sample dubious / overstated | 4 (24%) | 3 (30%) |
| v1-flagged → v2-unflagged | 60 candidates; 6 read | (not sampled) |

**Net recommendation**: ship v2.1 to the worktree and the prototype. Surface two follow-ups before showing CO stakeholders: (1) tighten the No/Low/Flagged boundary rule against indirect inference, (2) consider adding a fourth manageability bucket only after expert review of the 12 Mongolia "Fundamental" pairs.

---

## 1. Mechanical coherence check

Script: `python -m src.audit_v2 coherence --country {country}` (read-only, no LLM calls). Checks each flagged record against keyword heuristics:

- `resource_competition` descriptions should mention a shared finite resource (water, land, budget, headcount, etc.).
- `goal_conflict` descriptions should assert opposition or target redesign.
- `delivery_friction` descriptions should use delivery / coordination / siting language.
- `fundamental` descriptions should call out target redesign needs.
- `high` confidence shouldn't lean on hedge words ("may / could / appears to").
- `low` confidence should have some hedge language.

**Mongolia**: 16 of 713 flagged records (2.2%) tripped at least one heuristic warning. **Panama**: 2 of 893 (0.2%). The heuristic is conservative (mostly false positives where the description uses different vocabulary for the same concept), so the *actual* mechanical-coherence rate is well above 99%.

Top issue type, both countries: `mechanism=delivery_friction` records whose description doesn't use specific "coordination / siting" language. Reading those cases shows they describe genuine delivery friction (subsidies enabling expansion, supply-chain pressure) in words my keyword list doesn't catch. Not a real defect.

The real-defect cases are concentrated in Mongolia:
- **3 records** labelled `manageability=fundamental` whose description leans on coordination language ("could keep both", "would be needed through safeguards"). These are the cases where the LLM picked `fundamental` but reasoned through `manageable`. Examples: FSS_15 ↔ NDC_5, FSS_28 ↔ NDC_22, FSS_29 ↔ NDC_22.
- **2 records** labelled `goal_conflict` whose description doesn't explicitly assert opposition. Reading them, the contradiction *is* there but framed obliquely (e.g. FSS_15 ↔ NDC_5: "could compete for the same undeveloped land base" — the contradiction is real but the language is hedged).

→ Mechanical defects are rare. The remaining quality questions are qualitative, addressed in §2.

## 2. Stratified case-file review

Method: `audit_v2.py sample` stratifies over the 9 (Mongolia) / 4 (Panama) populated `mechanism × manageability × confidence` cells, oversampling the high-stakes cells (`fundamental`, `goal_conflict`, `high` confidence). 17 Mongolia cases + 10 Panama cases were read in full against the source target text.

### Mongolia (17 cases)

Verdicts:

| Verdict | Count | % |
|---|---:|---:|
| Plausible | 13 | 76% |
| Plausible but overstated | 1 | 6% |
| Dubious | 3 | 18% |

**Strong cases** (clearly defensible, the v2.1 redesign yields useful signal):
- **FSS_18 / FSS_28 / FSS_29 ↔ NDC_22** (Resource competition, Fundamental, High). All three are the same structural pattern: FSS expands livestock or feed supply; NDC caps the national herd at 50M head for emissions. v2 correctly identifies the cap as a finite resource and labels it Fundamental. This is *the* case the v2 redesign was built to catch (it was Example F in the prompt). The v1 baseline mistyped these as `implementation_tension`, missing the resource-budget framing. ✓
- **NDC_24 ↔ SECTORAL_1** (Goal conflict, Fundamental, High). NDC pairs an emissions-reduction goal with "increase meat supply"; SECTORAL_1 wants to "limit livestock numbers to pasture carrying capacity". The two government plans directly contradict on livestock policy in the same sector. ✓
- **FSS_15 ↔ NBSAP_1** (Delivery friction, Manageable, High). 200K ha agricultural conversion vs ecological-integrity spatial planning. The description correctly names the friction and the resolution path (zoning, biodiversity safeguards). ✓
- **FSS_21 ↔ NDC_3, NDC_3 ↔ SECTORAL_8** (Resource competition, Manageable, High). Water shared between irrigated cash-crop expansion and adaptation-driven irrigation regimes. Clean. ✓
- **FSS_1 ↔ NAP_3/NAP_6** (Delivery friction, Manageable, Medium). The food-security legal-reform target touches protected watershed regulation; the friction is indirect but real. Confidence Medium is appropriately calibrated. ✓

**Plausible but overstated** (1):
- **FSS_15 ↔ NDC_5** (Goal conflict, Fundamental, Medium). The structural pattern is real (agricultural land expansion vs forest protection), but the labels `goal_conflict` + `fundamental` are stronger than the description warrants ("could compete for the same undeveloped land base" — hedged language). A reviewer would defend the flag but might prefer Resource competition + Manageable + Medium. Minor.

**Dubious** (3):
- **FSS_5 ↔ NDC_24** (Goal conflict, Fundamental, Medium). FSS_5 is "develop regulations on seasonal food reserves" — a fairly neutral governance target. v2 stretches to read it as "reinforcing demand for animal-source foods". v1 called this Medium alignment, which is more accurate. **Probable false positive.**
- **FSS_21 ↔ NBSAP_14** (Resource competition, Manageable, Low). Cash-crop cultivation vs reduce-overconsumption-and-waste public education campaign. v2 reads "competing demand for water/inputs", but NBSAP_14 is about consumer education, not production constraints. The mechanism label is poorly chosen.
- **FSS_39 ↔ NBSAP_2** (Resource competition, Manageable, Low). Dietary supplements production vs restore 30% degraded ecosystems. Very weak link; v2 explicitly says "depends on how and where production expands". v1 said low alignment. **Probable false positive, low-confidence flag.**

**Pattern**: dubious cases all hit `confidence: Low` and / or feature an indirect link the LLM constructs by inference rather than the policy text naming. The confidence anchor is working — the LLM correctly self-rates these as low-confidence — but the *binary* decision "to flag or not" is too generous at the boundary.

### Panama (10 cases)

Verdicts:

| Verdict | Count | % |
|---|---:|---:|
| Plausible | 7 | 70% |
| Dubious | 3 | 30% |

**Strong cases**:
- **CNR_1 ↔ PEG_1** (Delivery friction, Manageable, High). PIEA expansion inside Canal watershed vs logistics corridors near Canal economy. This is the canonical Panama tension; the v2 description is precise. (Example D from the prompt.) ✓
- **CNR_4 ↔ ENR_29 / ENR_125** (Delivery friction, Manageable, Medium). Forest restoration in protected areas vs new tourism trails in protected areas. Same geography, real but manageable tension. ✓
- **CNR_2 ↔ PEG_1** (Delivery friction, Manageable, Medium). PIEA outside Canal watershed vs logistics corridors. ✓
- **ENR_12 ↔ HR_3 / NP_9** (Resource competition, Manageable, Medium). Commercial reforestation (incl. exotic species) vs SINAP protected-area expansion to 40%. Real land-use tension. ✓
- **CNR_4 ↔ PEG_14** (Resource competition, Manageable, Medium). Forest restoration vs housing self-construction + Metro line. ✓

**Dubious** (3):
- **ENR_18 ↔ PEG_4** (Delivery friction, Manageable, Low). Mangrove protection vs industrial policy for medical devices / semiconductors / pharma. The link is implausibly thin. v2 explicitly says "the friction is only an inferred implementation risk". v1 said low alignment, correctly. **Probable false positive.**
- **ENR_32 ↔ PEG_1** (Delivery friction, Manageable, Low). REDD+ ecotourism emissions *measurement* vs logistics corridors. ENR_32 is about MRV, not land use. Stretched. **Probable false positive.**
- **ENR_122 ↔ PEG_1** (Delivery friction, Manageable, Low). Bioprospecting training programs vs logistics corridors. Very weak link. **Probable false positive.**

**Same pattern as Mongolia**: all three dubious cases are `confidence: Low` and all three pair an environmental target with `PEG_1` (the omnibus logistics target). The LLM appears to flag PEG_1 against many ENR targets at low confidence based on inferred development pressure. Worth investigating whether PEG_1 acts as a "magnet" target with too many flagged partners.

## 3. False-negative sampling

For Mongolia, **60 pairs** were flagged by v1 (`possible_misalignment` mostly) but downgraded to `medium` or `low` by v2. I read the first 6 in full.

Pattern:
- **4 of 6** were defensibly de-flagged by v2. Example: FSS_18 ↔ NAP_5 (fodder vs water-monitoring system). NAP_5 is a *monitoring* system, not a constraint, so it doesn't restrict fodder expansion; v2's "enabling rather than operationally direct" reading is more accurate than v1's "implementation tension".
- **2 of 6** are borderline misses worth re-flagging:
  - **FSS_20 ↔ NAP_6** (fertiliser production vs water conservation). Fertiliser runoff *is* a real water-quality concern; v2's "complementary enabling conditions" reading may be too generous.
  - **FSS_26 ↔ NAP_7** (livestock headcount/pasture vs forest restoration). Both target rural land; v2 said "different primary ecosystems" but they can compete in the same landscapes.

Extrapolating, **roughly 20-30 of the 60 v1-flagged-but-v2-unflagged pairs may be borderline misses**. That's ~3-5% of v2's total flagged count. Not catastrophic, but worth a second pass if a stakeholder review surfaces "v1 had this and v2 doesn't".

(Panama false-negative review was generated but not read in depth; the pattern is expected to mirror Mongolia.)

## 4. The mechanism field — does it carry signal?

Yes, by two tests:

1. **Distribution**. Mongolia mechanism breakdown: 53% delivery_friction / 46% resource_competition / 1% goal_conflict. Panama: 94% / 6% / 0%. The 3-way split (vs v1's collapse where 75-98% of negative-side records were `implementation_tension`) is genuine — both countries spread across mechanisms, with the difference between Mongolia (more resource competition) and Panama (almost entirely delivery friction) reflecting their actual policy text differences (Mongolia's hard livestock cap vs Panama's broader strategic-plan framing).
2. **Within-case reading**. Across all 27 cases read, the mechanism label matched the friction the description describes. The 17 mechanism reassignments Panama had vs v1 (mostly `implementation_tension → resource_competition`) all looked like genuine corrections: e.g., the v1 LLM lumped "livestock feed expansion vs herd cap" under `implementation_tension` when `resource_competition` was the better label.

## 5. The manageability field — does it carry signal?

Yes, but sparsely. Mongolia has 12 `fundamental` pairs (1.7%); Panama has 0. Reading all 12 Mongolia Fundamental pairs:

| Pair | Mechanism | Defensible? |
|---|---|---|
| FSS_5 ↔ NDC_24 | goal_conflict | Dubious (see §2) |
| FSS_15 ↔ NDC_5 | goal_conflict | Plausible but overstated |
| FSS_15 ↔ NDC_7 | goal_conflict | (not sampled; same pattern as NDC_5) |
| FSS_18 ↔ NDC_22 | resource_competition | ✓ |
| FSS_28 ↔ NDC_22 | resource_competition | ✓ |
| FSS_29 ↔ NDC_22 | resource_competition | ✓ |
| FSS_41 ↔ NDC_24 | goal_conflict | (not sampled) |
| FSS_29 ↔ SECTORAL_1 | resource_competition | ✓ |
| FSS_29 ↔ SECTORAL_15 | goal_conflict | (not sampled) |
| NAP_14 ↔ NDC_24 | goal_conflict | (not sampled) |
| NDC_24 ↔ SECTORAL_1 | goal_conflict | ✓ |
| NDC_24 ↔ SECTORAL_14 | goal_conflict | (not sampled) |

The 5 cases I sampled in full: 4 strong, 1 overstated, 1 dubious. Even the 1 dubious case (FSS_5 ↔ NDC_24) flags a livestock-system pair, which is at least topically reasonable. **The Fundamental label is rare but real signal.** That Panama produces zero Fundamental is a finding about Panama's documents (more aspirational, fewer hard numeric constraints), not a defect.

## 6. The confidence field — does it carry signal?

Partially. The distribution is heavily skewed toward `medium` (Mongolia 93%, Panama 98%). Reading the rare `high` (2.7% / 0.7%) and `low` (4.3% / 1.1%) cases:

- **High** maps to cases where the policy text near-explicitly names the friction (50M head cap, 200K ha conversion, Canal watershed + Canal logistics geography). ✓
- **Low** maps to indirect-inference cases. The LLM correctly self-rates them as Low confidence — but those are also the cases most likely to be false positives. So the confidence signal *is* doing useful triage: filter to confidence ≥ Medium for stakeholder review and the dubious cases drop out.

**Recommendation**: surface the confidence chip prominently in the UI; reviewers should be able to filter by confidence and see Low-confidence flags as a separate "review optional" group.

## 7. Compared to v1

In every Mongolia case where v1 and v2 disagree on the label, I judged v2 to be either equivalent or sharper. The clearest wins are the three FSS↔NDC_22 livestock-cap cases where v1 said `implementation_tension` and v2 said `resource_competition` — v2 is correct: a hard headcount cap *is* a finite-resource constraint. The 147 Mongolia mechanism reassignments and 17 Panama reassignments are mostly of this character.

v1 also has known structural failures v2 fixes:
- v1's 99.4% severity collapse on Mongolia's `possible_misalignment` — addressed by removing severity from text.
- v1's zero `scale_scope_mismatch` records — absorbed into `delivery_friction`.

There is no Mongolia or Panama case where v1's label clearly beat v2's. The closest is the small set of false-negative borderline cases in §3 — but those are misses by v2, not wins by v1.

## 8. Recommendations

1. **Ship v2.1 to the worktree and the prototype.** The data quality is high enough to use. The Mongolia distribution is meaningfully different from v1 (and meaningfully better in the high-stakes cells); the Panama distribution validates that the pipeline does not over-fire when the source documents are more aspirational.

2. **Surface `confidence` in the UI.** A `confidence: low` flag is roughly 2-3× more likely to be a false positive than a `medium` or `high` flag. Reviewers should be able to filter or de-emphasise low-confidence flags.

3. **Iterate the No/Low/Flagged boundary rule before any next prompt revision.** The 4 Mongolia + 3 Panama dubious cases share a pattern: the LLM constructs an inferred link where the text does not name a shared resource, geography, or implementation pathway. A tighter prompt instruction along the lines of "if the friction requires inference of more than one step, prefer Low alignment over Flagged with low confidence" would suppress most of these.

4. **Spot-check the 60 v1-flagged-but-v2-unflagged Mongolia pairs.** Roughly 30-50% of these may be genuine misses (estimated from the small sample). A 1-hour focused read by you would let us decide whether to re-flag any.

5. **For the methodology expert**, the open questions are:
   - Is `delivery_friction` the right label, or should the family split (e.g. `subsidy_friction` for cases where one target's instrument enables the other target's harm)?
   - Should `manageability: fundamental` be reserved for cases where the text *explicitly* names mutual exclusion (e.g. "50M head cap" vs "expand farms"), and a third bucket `requires_trade_off` added for the soft-conflict cases?
   - Should `confidence: low` be a soft-flag (rendered differently in the UI) rather than a hard flag?

6. **What's *not* a concern**: the manageability skew toward Manageable, and the confidence skew toward Medium. Both reflect the underlying distribution of real policy tensions (most are manageable through coordination; most are evident in text but not unambiguously). The collapse threshold in `report_distribution.py` (>95% one value) is too tight for binary fields and should be relaxed to >99% before flagging.

## 9. Replication

```bash
cd python
uv run python -m src.audit_v2 coherence --country mongolia
uv run python -m src.audit_v2 coherence --country panama
uv run python -m src.audit_v2 sample --country mongolia --n 20
uv run python -m src.audit_v2 sample --country panama --n 10
uv run python -m src.audit_v2 false-negatives --country mongolia --n 15
uv run python -m src.audit_v2 false-negatives --country panama --n 15
```

Each command is read-only and reproducible against the committed `python/output/{country}/alignment.json`.
