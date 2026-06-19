# Methodology: Nature-Climate Policy Coherence Analysis

> How the CPC Tracker analyzes alignment between national policy targets.

*Based on the methodology developed through UNDP's Nature-Climate Policy Coherence initiative, with enhancements for the automated web-based tool.*

*Last verified against the pipeline (`python/src/`) at commit `8cdb1ff` on 2026-06-19. This document must be re-verified whenever pipeline behaviour changes; see [PROJECT_GUIDELINES.md](PROJECT_GUIDELINES.md).*

---

## Overview

The analysis pipeline takes a set of **policy targets** from multiple national documents (NDC, NBSAP, NAP, LDN, sectoral) and assesses them across the tool's three analytical levels:

1. Which **policy theme(s)** each target relates to, across multiple expert taxonomies
2. Which targets across different documents **align with each other**, and how strongly (Level 1, policy coherence)
3. Whether **government budget programmes** match the policy targets (Level 2, financial alignment, where budget data exists)
4. Whether **reported implementation measures** (BTR) genuinely implement the targets (Level 3, implementation progress, where BTR data exists)
5. Whether targets include **measurable outcomes** and **time-bound commitments**
6. How coherent different **document types** are with each other overall, with short hedged storylines synthesising the patterns

The pipeline combines **LLM-based analysis** with deterministic **graph-based computations**. The LLM is provider-agnostic via `LLM_BASE_URL` / `LLM_MODEL`: the development default is `openai/gpt-4o-mini` through OpenRouter, and production runs on UNDP's private Azure OpenAI (gpt-5.4).

---

## Pipeline Steps

```
Input: Policy targets (text + source document type)
  │
  ├─ Step 1: Quantitative & Time-Bound Detection (LLM)
  │     └─ Are there numbers, percentages, deadlines?
  │
  ├─ Step 2: Thematic Classification (LLM)
  │     ├─ NBS categories (10), IPCC sectors (7), GLOBE categories (9) + subcategories (49)
  │     └─ Optional country adaptation goals; ranked dual-mode (primary + relevant)
  │
  ├─ Step 3: Cross-Document Pair Generation (computation)
  │     └─ All cross-document pairs (classification is for grouping only)
  │
  ├─ Step 4: Target Decomposition — Agent 1 (LLM)
  │     └─ Break each target into structured components
  │
  ├─ Step 5: Pairwise Alignment Assessment — Agent 2 (LLM)        [Level 1]
  │     ├─ 5-state scale: none / low / medium / high / flagged
  │     └─ Step 5a: friction enrichment on flagged pairs (LLM)
  │
  ├─ Step 6: BTR Measure-Target Alignment (LLM, if BTR data)      [Level 3]
  │     └─ Assess implementation coherence between measures and targets
  │
  ├─ Step 7: Budget-Target Alignment (LLM, if budget data)        [Level 2]
  │     └─ Do government budget programmes match policy targets?
  │
  ├─ Step 8: Synthesis Layer (LLM)
  │     └─ Doc-pair, corpus, and per-sector storylines (hedged)
  │
  └─ Derived Metrics (frontend computation)
        ├─ Document coherency scores
        └─ Aggregated visualizations
```

---

## Step 1: Quantitative and Time-Bound Detection

**Purpose:** Identify targets that include measurable outcomes or specific deadlines — indicators of implementation readiness.

**Method:** An LLM evaluates each target for:

- **isQuantitative** — Does the target contain explicit numeric values? (percentages, counts, amounts like "30%", "50 million tons", "20,000 hectares")
- **isTimeBound** — Does the target reference a specific time horizon? (years like "by 2030", timeframes like "2024–2025")

Administrative references (e.g., "Article 2", "Target 3") are explicitly excluded.

**Implementation:** Targets are batched (12 per LLM call) to reduce API calls. The LLM returns structured JSON with the extracted phrases for highlighting in the dashboard.

**Background:** The original methodology used spaCy NLP (part-of-speech tagging, named entity recognition for CARDINAL/DATE entities) with exclusion rules. The current implementation uses LLM-based detection, which is multilingual, requires no additional NLP dependencies, and handles edge cases more robustly.

**Output:** `quantitative_flags.json` — for each target: `isQuantitative`, `isTimeBound`, and extracted phrase details.

---

## Step 2: Thematic Classification

**Purpose:** Map each target to predefined expert taxonomies. This identifies thematic coverage and gaps, and provides the grouping dimensions (lenses) used in dashboard visualizations (bar charts, chord diagram, sector views).

**Method:** The classifier is **ranked and dual-mode**. For each target the LLM scores every category in a taxonomy on a 0.0–1.0 relevance scale, and each (target, category) record carries:

- `score` — relevance from 0.0 (no relevance) to 1.0 (primarily and explicitly about this category)
- `isRelevant` — `true` when `score >= RELEVANCE_THRESHOLD` (0.5, hard-coded in `classify.py`)
- `isPrimary` — `true` for the single highest-scoring category per target

Dashboard surfaces choose a mode intentionally: **primary** for ranking ("what is this target mainly about?") and **relevant** for breadth ("everything this target touches"). The two modes are never mixed in a single view, because relevant tags carry different scores.

**Categories are pre-defined by experts and traced to a primary source, never LLM-drafted.** The active taxonomies are:

### Nature-Based Solutions Categories (10)

Derived from the IPCC Special Report on Climate Change and Land and Griscom et al. (Natural Climate Solutions):

| Category | Examples |
|----------|----------|
| Protection, management, and restoration of marine and coastal habitats | Mangroves, coral reefs, seagrass, tidal marshes |
| Agriculture and livestock management | Climate-smart agriculture, agroforestry, sustainable grazing |
| Water management | Watershed restoration, sustainable irrigation, catchment protection |
| Forest management, restoration, and protection | REDD+, reforestation, fire management, sustainable forestry |
| Protection and restoration of wetlands and freshwater ecosystems | Peatland rewetting, river protection, catchment restoration |
| Ecosystem protection and connectivity | Protected areas, wildlife corridors, habitat rewilding |
| Soil fertility management and restoration | Soil organic carbon, conservation tillage, biochar |
| Nature-based risk management and disaster prevention | Flood control, wildfire management, disaster risk reduction |
| Nature-based carbon sequestration | BECCS, enhanced weathering, proforestation |
| Urban settlements management | Urban green spaces, green roofs, rain gardens |

### IPCC Sectors (7)

The standard IPCC greenhouse-gas inventory sectors, used as a mitigation lens: Energy, Transport, Industrial Processes and Product Use (IPPU), Agriculture, Land Use / Land-Use Change and Forestry (LULUCF), Waste, and Other.

### GLOBE Categories (9) + Subcategories (49)

The GLOBE taxonomy (BIOFIN 2024) is the biodiversity-finance lens used to connect policy, finance, and implementation. When a country provides expert-curated GLOBE examples (e.g. Mongolia's 138 BIOFIN expert items in `mongolia-ber-globe-examples.json`), targets are classified against the 49 subcategories using those few-shot examples, and the parent category of the top-ranked subcategory becomes the primary GLOBE category. Where no expert examples exist, the generic ranked classifier is used against the 9 categories.

### Adaptation Goals (optional, country-specific)

When a country supplies adaptation data (e.g. Mongolia's APNDC goals via `mongolia-btr-adaptation.json`), targets are additionally classified against those goals so the adaptation lens can group targets by national adaptation objective.

Which taxonomies (lenses) are available is a country-level, data-driven choice, not a fixed part of the methodology; users may also bring their own taxonomy.

**Cost note:** This is the most API-intensive step. The ranked classifier scores all categories in a taxonomy per target, so cost scales with the number of targets and the breadth of the active taxonomies. Results are cached (per taxonomy namespace) to avoid duplicate calls across analyses.

**Output:** `classifications.json` — for each (target, category) record: `score`, `isRelevant`, `isPrimary`, `taxonomyType` (`nbs` / `sector` / `globe` / `adaptation_goal`), and a short `reasoning` for primary/relevant entries.

---

## Step 3: Cross-Document Pair Generation

**Purpose:** Determine which target pairs should be compared for alignment.

**Method:** Every target is paired with every target from a **different document type** (e.g., NDC vs NBSAP, not NDC vs NDC). Classification results from Step 2 are used for visualization grouping (bar charts, chord diagram sector mode) but **not** as a pairing filter.

**Rationale for assessing all pairs:** The alignment LLM (Agent 2) works from decomposed target text and never sees classification data. Using classification as a pre-filter created a noisy binary gate that blocked the alignment LLM from ever seeing most pairs — including valid cross-sector connections. The alignment LLM itself is better positioned to judge relevance.

**Example:** With 20 NBSAP targets, 27 NDC targets, and 15 NAP targets: 20×27 + 20×15 + 27×15 = 1,245 cross-document pairs.

**Output:** A list of `(targetA_id, targetB_id)` pairs to evaluate in Steps 4–5.

---

## Step 4: Target Decomposition (Agent 1 — Target Analyst)

**Purpose:** Structure each target into consistent analytical components so alignment assessment is based on policy content, not keyword matching.

**Method:** An LLM agent ("Target Analyst") decomposes each target into five fields:

| Field | Description |
|-------|-------------|
| **Goal/Purpose** | The overarching objective or intended impact |
| **Action/Intervention** | Specific measures or activities proposed |
| **Ecosystem/Area** | The relevant sector, environment, or domain |
| **Target Audience** | Key stakeholders responsible for or benefiting from implementation |
| **Expected Impact/Outcome** | Anticipated measurable results or changes |

The agent is instructed to remain factual — no speculation or inference beyond what is explicitly stated in the target text.

All targets are decomposed since all appear in cross-document pairs.

**Output:** `decompositions.json` — structured breakdown for each decomposed target.

---

## Step 5: Pairwise Alignment Assessment (Agent 2 — Alignment Advisor)

**Purpose:** For each target pair, assess the degree of policy alignment — are these targets working toward compatible goals through compatible means?

**Method:** A separate LLM agent ("Alignment Advisor") receives the structured decompositions of both targets and assigns one of **five states** (the v2.1 alignment schema, shared by `align.py`, `measure_align.py`, `budget_align.py`).

**Positive scale (four levels):**

| Level | Meaning |
|-------|---------|
| **No alignment** | Targets are distinct in purpose and implementation, with no clear connection |
| **Low alignment** | Superficial overlap exists (shared terminology or broad thematic association); substantial effort needed to align |
| **Medium alignment** | Clear overlap in themes, geography, or priorities; meaningful synergies possible with some effort |
| **High alignment** | Robust overlap across goals, actions, ecosystems, and actors; strong potential for coordinated implementation |

**Negative side (a single flagged state):**

The negative side is one state, `flagged` (display label: **"Potential misalignment"**), because the pipeline surfaces pairs for human review, not certain conflicts. A flagged pair carries three sub-fields that describe *why* it was flagged rather than ranking severity:

| Sub-field | Values |
|-----------|--------|
| **mechanism** | `goal_conflict` (opposing objectives) · `resource_competition` (both need the same finite resource) · `delivery_friction` (compatible goals, but implementation undermines; includes scale/scope/timeline mismatches) |
| **manageability** | `manageable` (resolvable via coordination, sequencing, or safeguards) · `fundamental` (at least one target needs revision or dropping) |
| **confidence** | `high` / `medium` / `low` — how strongly the targets' own text supports the flag |

The agent evaluates alignment on strategic intent, feasibility, synergies, and ecosystem interactions, not textual similarity. Flagging is reserved for genuine, text-evidenced friction, not differences in sector or scale. In the coherency score the single `flagged` state weighs `-3`.

The earlier vocabulary (`possible misalignment` / `possible conflict` / `likely conflict`, and the pre-v1 `low_tension` / `moderate_contradiction` / `high_contradiction`) survives **only** as backward-compatible parser aliases that collapse onto `flagged`; it is never emitted in new output or shown in the UI.

**Multi-agent design rationale:** By separating decomposition (Agent 1) from alignment assessment (Agent 2), the methodology ensures that alignment classifications are based on structured policy content. This separation supports consistency across countries and policy frameworks.

**Output:** `alignment.json` — for each pair: `alignment` state, a natural-language `description`, and (when `flagged`) `mechanism`, `manageability`, and `confidence`.

---

## Step 5a: Friction-Dimension Enrichment

**Purpose:** Make flagged pairs concretely actionable by naming what is contested and where, without changing the verdict.

**Method:** A separate cached LLM pass (`extract_friction_dimensions.py`) reads the alignment `description` of `flagged` pairs whose mechanism is `resource_competition` or `delivery_friction` (goal conflicts are skipped). Grounded strictly in the rationale text, it extracts:

- **contestedResources** — up to three single common nouns actually named in the rationale (e.g. land, water, forest)
- **sharedContext** — a specific place name as it would appear on a map or plan

Nothing is invented or inferred from the mechanism label. Running this as a separate step keeps the alignment verdicts stable across re-runs.

**Output:** `contestedResources` and `sharedContext` fields added in place to the flagged records in `alignment.json`.

---

## Step 6: BTR Measure-Target Alignment (Level 3, conditional)

**Purpose:** Assess whether government-reported implementation measures (from Biennial Transparency Reports) genuinely implement or support stated policy targets. Runs only when BTR data is present. This is one self-reported lens on implementation, not the full implementation picture.

**Method:** BTR mitigation measures and (where available) adaptation actions are converted to pseudo-targets and processed through the same two-agent workflow:

1. **Classification:** Measures are LLM-classified against the same taxonomies (NBS, GLOBE). IPCC sector tags from government reporting are used as ground truth (not LLM-classified).
2. **Pairing:** Every measure is paired with every policy target (no pre-filtering). When both mitigation measures and adaptation actions exist, mitigation×adaptation cross-pairs are also assessed.
3. **Decomposition + Alignment:** Agent 1 decomposes measures, then an adapted Agent 2 assesses implementation coherence using the **same v2.1 five-state scale**.

The adapted prompt frames the comparison as policy-target vs. reported-measure (the reported side is called "the action", never "target"). For adaptation actions the prompt instructs the agent **not** to penalise the absence of CO2e figures, since adaptation reporting is less quantified.

**Output:** `measure_alignment.json` and `measure_pseudo_targets.json`.

---

## Step 7: Budget-Target Alignment (Level 2, conditional)

**Purpose:** Map government budget programmes against policy targets to see where money does and does not follow ambition. Runs only when a Biodiversity Expenditure Review (`{country}-ber.json`) is present (currently Mongolia).

**Method:** Budget programmes (name, description, and multi-year expenditure) are converted to pseudo-targets and run through the same workflow as Steps 4–5: Agent 1 decomposes each programme, then an adapted Agent 2 assesses alignment against each policy target on the v2.1 five-state scale. Framing follows the guardrail that the BER is "reviewed biodiversity spending", not "the country's biodiversity budget".

**Output:** `budget_alignment.json` and `budget_pseudo_targets.json`.

---

## Step 8: Synthesis Layer

**Purpose:** Turn the pairwise verdicts into short, hedged storylines a non-technical reader can grasp, without writing extended AI narrative.

**Method:** Three LLM passes summarise the alignment results:

- **Document-pair synthesis** (`synthesize_doc_pairs.py`) — for each pair of document types with enough signal, a one-line storyline plus brief reinforce / clash / coordination-hint text.
- **Corpus synthesis** (`synthesize_corpus.py`) — country-level cross-cutting storylines and a short summary paragraph.
- **Sector synthesis** (`synthesize_by_sector.py`) — per-category storylines within each taxonomy lens.

Coordination hints are process pointers only and are always hedged ("could", "may"); they never prescribe ministry- or sector-specific action. Syntheses for each document include/exclude combination the dashboard filter can reach are pre-computed (`synthesis_states.py`) so no LLM runs at view time.

**Output:** `doc_pair_synthesis.json`, `corpus_themes.json`, `sector_synthesis.json` (with `.{lang}.json` variants when a non-English `--language` is used).

---

## Derived Metrics (Frontend Computation)

These metrics are computed from the pipeline outputs — no additional LLM calls required.

### Document Coherency Scores

For each pair of document types (e.g., NDC ↔ NBSAP), the dashboard computes an aggregate coherency score from the pairwise verdicts. Each verdict carries the canonical weight defined in `ALIGNMENT_WEIGHTS` (`src/lib/utils.ts`):

| State | Weight |
|-------|--------|
| High alignment | `+3` |
| Medium alignment | `+2` |
| Low alignment | `+1` |
| No alignment | `0` |
| Potential misalignment (`flagged`) | `-3` |

Higher scores indicate stronger and more widespread alignment; the single `flagged` weight (`-3`) pulls a score down where pairs are surfaced for review. A companion **coverage** metric shows what share of possible cross-document pairs show any alignment, so coherency measures quality and coverage measures breadth. The frontend (`src/lib/`) is the source of truth for the exact aggregation, which evolves with the dashboard.

### Aggregated Visualizations

The dashboard computes several aggregate views from the raw data:

- **Lens breakdown by document type** — how many targets from each document fall under each category, for the active taxonomy lens (NBS / IPCC sectors / GLOBE / adaptation), from Step 2 classifications
- **Alignment network graphs** — target-level nodes colored by document type, edges by alignment state, filterable by the active lens
- **Chord diagram** — document-type-level overview showing aggregate alignment flows between all document types simultaneously
- **Pairwise heatmaps** — full target-by-target matrix for each document pair, with alignment state as cell color

---

## Cost and Performance

| Step | API calls scale with |
|------|----------------------|
| Quantitative detection | targets (batched) |
| Thematic classification | targets × categories across the active taxonomies (NBS, IPCC sectors, GLOBE + subcategories, adaptation) — the dominant cost |
| Target decomposition | targets |
| Alignment assessment | all cross-document pairs — the other dominant cost |
| Friction enrichment | flagged pairs only |
| BTR / budget alignment | measures (or programmes) × targets, when that data exists |
| Synthesis | a small fixed number of passes per document-set state |
| Derived metrics | 0 (computed locally in the frontend) |

The two dominant costs are classification (targets × taxonomy breadth) and alignment (cross-document pairs), both of which grow with the target count. Per-analysis cost therefore depends on the model and the breadth of the active taxonomies; with `gpt-4o-mini` in development it is on the order of a few US dollars.

**Caching:** All LLM calls are cached by a hash of `{system_prompt, user_prompt, model}`, namespaced per step (and per `--language`). Re-running with the same inputs and model uses cached results with zero API calls; a cold-run canary warns when the cache will recompute at full cost.

**Concurrency:** Up to 20 concurrent LLM calls by default (configurable via `LLM_CONCURRENCY`; Azure gpt-5.4 needs a lower value such as 4) with exponential backoff retry (up to 12 attempts, backoff capped at 60s).

---

## Data Sovereignty and AI Governance

- The pipeline is designed for deployment on UNDP's private Azure OpenAI environment, ensuring government data does not leave UNDP-controlled infrastructure.
- OpenRouter is used for development only.
- All results are presented as AI-assisted assessments — human validation by national experts is required before use in policy processes.
- The tool does not generate or hallucinate policy content. It classifies and compares targets as provided by users.

---

## References

- IPCC Special Report on Climate Change and Land (SRCCL)
- Griscom, B.W., et al. (2017). Natural Climate Solutions. *PNAS*.
- UNDP Nature-Climate Policy Coherence Technical Working Group (2024–2025)
- Kunming-Montreal Global Biodiversity Framework (KMGBF)
- Original methodology document: `old_scripts/Methodology development process for Git Hub.pdf`
