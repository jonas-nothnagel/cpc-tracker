# Methodology: Nature-Climate Policy Coherence Analysis

> How the CPC Tracker analyzes alignment between national policy targets.

*Based on the methodology developed through UNDP's Nature-Climate Policy Coherence initiative, with enhancements for the automated web-based tool.*

---

## Overview

The analysis pipeline takes a set of **policy targets** from multiple national documents (NDC, NBSAP, NAP, LDN, sectoral) and assesses:

1. Which **nature-based solutions** and **cross-cutting themes** each target relates to
2. Which targets across different documents **align with each other**, and how strongly
3. Whether targets include **measurable outcomes** and **time-bound commitments**
4. How coherent different **document types** are with each other overall

The pipeline uses a combination of **LLM-based analysis** (GPT-4o-mini) and **graph-based computations** to produce these results.

---

## Pipeline Steps

```
Input: Policy targets (text + source document type)
  │
  ├─ Step 1: Quantitative & Time-Bound Detection (LLM)
  │     └─ Are there numbers, percentages, deadlines?
  │
  ├─ Step 2: Thematic Classification (LLM)
  │     ├─ NBS categories: 10 nature-based solution categories
  │     └─ Cross-cutting themes: 11+ policy themes
  │
  ├─ Step 3: Theme-Filtered Pair Generation (computation)
  │     └─ Only compare targets from different documents that share themes
  │
  ├─ Step 4: Target Decomposition — Agent 1 (LLM)
  │     └─ Break each target into structured components
  │
  ├─ Step 5: Pairwise Alignment Assessment — Agent 2 (LLM)
  │     └─ Classify each pair: none / low / medium / high alignment
  │
  └─ Step 6: Derived Metrics (frontend computation)
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

**Purpose:** Map each target to predefined nature-based solution (NBS) categories and cross-cutting themes. This identifies thematic coverage, gaps, and — critically — determines which target pairs should be compared in Step 5.

**Method:** For every (target, category) combination, the LLM performs a binary classification: *does this target pertain to this category?*

The prompt structure follows a three-step reasoning process:
1. Identify the overarching topic and purpose of the theme
2. Identify sub-topics and subject matter
3. Assess whether the target covers the theme, considering ecosystem relationships and policy interconnections

**Categories are pre-defined by experts, not by the LLM.** Two taxonomies are used:

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

### Cross-Cutting Themes (11)

Represent common policy elements that can serve as catalysts for coordination across sectors:

| Theme | Focus |
|-------|-------|
| Climate change adaptation | Vulnerability reduction, resilience building, ecosystem-based adaptation |
| Climate change mitigation | GHG reduction, renewable energy, decarbonization |
| Desertification, drought, and land degradation | LDN, sustainable land management, degraded land restoration |
| Species conservation and ecosystems | Halting extinction, protected areas, ecosystem services |
| Pollution | Waste management, reduced pesticide risk, air quality |
| Gender equality | Gender mainstreaming, women's participation, KMGBF Gender Plan |
| Capacity building and development | Technology transfer, knowledge sharing, institutional strengthening |
| Sustainable development and the SDGs | 2030 Agenda, poverty eradication, policy coherence across goals |
| Indigenous peoples and local communities | FPIC, traditional knowledge, rights over territories |
| Finance | Resource mobilization, green bonds, biodiversity finance, GCF/GEF |
| Health | One Health, zoonotic diseases, nature and health co-benefits |

Users can add custom themes relevant to their national context before running the analysis.

**Cost note:** This is the most API-intensive step. For *n* targets and *c* categories, it produces *n × c* LLM calls. With 50 targets and 21 categories, that is ~1,050 calls. Results are cached to avoid duplicate calls across analyses.

**Output:** `classifications.json` — for each (target, category) pair: `isRelevant` (boolean) and `taxonomyType` (nbs or theme).

---

## Step 3: Theme-Filtered Pair Generation

**Purpose:** Determine which target pairs should be compared for alignment. Comparing every possible cross-document pair would be O(n²) and wasteful — most pairs are unrelated.

**Method:** Two targets are paired for comparison only if:
1. They come from **different document types** (e.g., NDC vs NBSAP, not NDC vs NDC)
2. They **share at least one theme** — both were classified as relevant to the same cross-cutting theme in Step 2

This filtering typically reduces the comparison space by 60–80% while preserving all meaningful comparisons.

**Example:** If 4 NDC targets, 2 NBSAP targets, and 2 NAP targets all pertain to the "Gender Equality" theme, 16 cross-document pairs are generated (4×2 + 4×2 + 2×2).

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

Only targets that appear in at least one pair from Step 3 are decomposed (typically 30–70% of all targets), reducing unnecessary LLM calls.

**Output:** `decompositions.json` — structured breakdown for each decomposed target.

---

## Step 5: Pairwise Alignment Assessment (Agent 2 — Alignment Advisor)

**Purpose:** For each target pair, assess the degree of policy alignment — are these targets working toward compatible goals through compatible means?

**Method:** A separate LLM agent ("Alignment Advisor") receives the structured decompositions of both targets and classifies their alignment into one of four levels:

| Level | Meaning |
|-------|---------|
| **No alignment** | Targets are distinct in purpose and implementation, with no clear connection |
| **Low alignment** | Superficial overlap exists (shared terminology or broad thematic association); substantial effort needed to align |
| **Medium alignment** | Clear overlap in themes, geography, or priorities; meaningful synergies possible with some effort |
| **High alignment** | Robust overlap across goals, actions, ecosystems, and actors; strong potential for coordinated implementation |

The agent evaluates alignment based on strategic intent, feasibility, synergies, and ecosystem interactions — not simple textual similarity.

**Multi-agent design rationale:** By separating decomposition (Agent 1) from alignment assessment (Agent 2), the methodology ensures that alignment classifications are based on structured policy content. This separation supports consistency across countries and policy frameworks.

**Output:** `alignment.json` — for each pair: `alignment` level and a natural-language `description` explaining the rationale.

---

## Step 6: Derived Metrics (Frontend Computation)

These metrics are computed from the pipeline outputs — no additional LLM calls required.

### Document Coherency Scores

For each pair of document types (e.g., NDC ↔ NBSAP), a coherency score is computed:

```
Score = (3 × high_pairs + 2 × medium_pairs + 1 × low_pairs) / (3 × total_possible_pairs) × 100
```

Where `total_possible_pairs` = number of targets in document A × number of targets in document B.

This produces a 0–100% score where:
- Higher scores indicate stronger and more widespread alignment
- The weighting (3/2/1) reflects that high alignment is more valuable than low

A companion **coverage** metric shows what percentage of possible cross-document pairs show *any* alignment:

```
Coverage = aligned_pairs / total_possible_pairs × 100
```

Together, coherency measures quality and coverage measures breadth.

### Aggregated Visualizations

The dashboard computes several aggregate views from the raw data:

- **NBS/Theme breakdown by document type** — how many targets from each document pertain to each category (from Step 2 classifications)
- **Alignment network graphs** — target-level nodes colored by document type, edges by alignment level, filtered by NBS category or theme
- **Chord diagram** — document-type-level overview showing aggregate alignment flows between all document types simultaneously
- **Pairwise heatmaps** — full target-by-target matrix for each document pair, with alignment level as cell color

---

## Cost and Performance

| Step | API Calls | Example (50 targets, 21 categories) |
|------|-----------|-------------------------------------|
| Quantitative detection | ceil(targets / 12) | ~5 calls |
| Thematic classification | targets × categories | ~1,050 calls |
| Target decomposition | targets in pairs | ~25–35 calls |
| Alignment assessment | unique pairs | ~100–500 calls |
| Derived metrics | 0 (computed locally) | 0 calls |

**Estimated cost:** ~$0.50–2.00 per analysis with GPT-4o-mini (varies with target count and theme overlap).

**Caching:** All LLM calls are cached by a SHA-256 hash of `{system_prompt, user_prompt, model}`. Re-running with the same inputs uses cached results with zero API calls.

**Concurrency:** Up to 20 concurrent LLM calls (configurable via `LLM_CONCURRENCY` environment variable) with exponential backoff retry (5 attempts max).

**Target cap:** Maximum 150 targets per analysis to keep costs predictable (~$1 estimated max).

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
