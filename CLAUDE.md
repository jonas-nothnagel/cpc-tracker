# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

AI-powered web application that helps UNDP country offices and national policy makers assess coherence across nature-climate policies and track implementation progress.

**Core principle**: Every feature, visualization, and component must deliver real, actionable value for policy making. We do not build things that are merely technically impressive or already available via a quick internet search. Insights must be actionable, easy to grasp for non-technical users and genuinely useful for decision-making. Raise a warning if you think we deviate from this.

**Real value-added or nothing**: Real policymakers may use this tool for decisions that affect real people, real ecosystems, and real climate outcomes. Deadlines, demo polish, and technical interestingness are not acceptable reasons to ship a feature. When proposing anything, ask "would this improve the quality of decision-support a policymaker gets from this tool?" If the answer isn't a clear yes, cut it.

**Positioning**: Decision-support system, not a decision-maker. Final interpretation remains with policymakers. Never generate extended AI-written narrative reports — prefer visuals + short factual insights. Hedged pathway-style suggestions are allowed under the rules in guardrails. All AI outputs must be clearly labeled as AI-generated with confidence caveats.

**Target users**: UNDP country office staff and national policy makers — avoid developer jargon in UI copy. Show what happened in human terms, not system terms.

**Digital Public Good**: Code must be handoverable to vendors. Prioritize UNDP Design System (https://react.design.undp.org/) and UNDP Data Viz Guidelines (https://dataviz.design.undp.org/) for UI and charts. Other libraries may be used where they add clear UX value.

**Scope**: This project is under active development. For domain context, meeting notes, and materials:
- **Primary source (most up-to-date)**: `dev_data_scripts/sharepoint_sync/` — symlink to the team's shared SharePoint/OneDrive folder. Country materials (Mongolia, Panama), scoping docs, TAG notes, and the authoritative feedback log (`Scoping materials/Feedback log for AI Flagship.docx`) live here. Always check this first.
- **Secondary**: `dev_data_scripts/rolling_context/` — local dev notes (may be older copies).
- See also `PROJECT_GUIDELINES.md` for dev conventions.

The tool is hosted on Azure and should be easily buildable through a docker image.

## Commands

```bash
# Frontend (Next.js)
pnpm install          # Install dependencies
pnpm dev              # Dev server with Turbopack (http://localhost:3000)
pnpm build            # Production build
pnpm lint             # ESLint
pnpm test             # Run tests (vitest)

# Python pipeline
cd python
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
python -m src.run_analysis                                 # Full pipeline (default: Mongolia → python/output/mongolia/)
python -m src.run_analysis --targets-file panama-targets.json  # Other country → python/output/panama/
```

## Analytical Framework: Three Levels

The tool is structured around three analytical levels. Any new feature should be identified against these levels before scoping, and cross-level features should be flagged explicitly:

- **Level 1 — Policy coherence / alignment.** Current focus. Pairwise alignment between targets and measures to surface synergies, contradictions, and gaps. Chord chart, tension clusters, alignment heatmap, and pairwise scoring all live here.
- **Level 2 — Financial / budget alignment.** Still pending. Where finance flows get mapped against policy objectives to show where money does and doesn't follow ambition.
- **Level 3 — Implementation progress tracking.** The "are these policies actually being implemented?" layer. 

## Architecture (Current State)

Architecture is evolving — treat the actual code as source of truth.

**Frontend**: Next.js App Router + TypeScript + Tailwind CSS + Recharts/D3.
- `src/app/` — Pages and API routes
- `src/components/` — UI and visualization components
- `src/data/` — Static TypeScript data (Mongolia pilot)
- `src/types/` — Domain types
- `src/lib/` — Shared utilities

**Python pipeline** (`python/src/`): Multi-agent LLM pipeline for classification, alignment analysis, and target parsing. Results stored in `python/analyses/{id}/` and `python/output/`.

**Data flow**: Frontend → API route → Python subprocess → JSON results → frontend polls for completion.

## Key Conventions

- `@/` path alias for imports from `src/` (configured in tsconfig)
- Python uses `uv` for package management
- LLM provider: Azure OpenAI 
- `AlignmentLevel` is bidirectional: negative values (likely_conflict, possible_conflict, possible_misalignment) and positive (low, medium, high alignment)
- Display labels for positive `AlignmentLevel` values: avoid "Low" — use "Partial" or "Emerging" instead. See guardrails.
- Display label for the negative `AlignmentLevel` value (`flagged`): "Potential misalignment". The cautious vocabulary frames the negative side as surfaced for review, not certain contradictions. Legacy v1 level names (possible/likely conflict, possible misalignment) survive only as parser aliases. See guardrails.

## Collaboration Workflow

- Developers using CC or similar. Feature branches off `main`, PRs back to `main`.
- PRs should include a brief "why" — not just what changed, but the intent behind it.

## Guardrails and Previous Learnings

When a design decision (especially AI/pipeline) is revised and the learning would materially change future implementation choices, propose adding it here. High bar — only non-obvious insights that prevent repeating a real mistake or validate a reusable approach. Format: short rule + `Why:` line.

- No hallucination of policy content — AI classifies and compares only user-provided targets.
- Data sovereignty: no external API calls with government data without consent.
- Political sensitivity in comparative outputs — never frame results as blame toward specific sectors or ministries. Use neutral language (e.g., "opportunity for stronger alignment" not "ministry X is lagging"). Why: Previous SDG-mapping outputs were used to assign blame, creating political tensions. Government sounding boards validate outputs before broader distribution.
- Terminology sensitivity — avoid "low" as a standalone positive label (reads as negative culturally). Prefer "emerging" or "partial". All abbreviations  must have tooltips or inline expansions on first use. Why: Mongolia user testing showed abbreviations are opaque and "low" is perceived negatively.
- Negative-side alignment vocabulary uses "possible misalignment / possible conflict / likely conflict" (not "tension / moderate contradiction / high contradiction"). The pipeline flags pairs for human review; it does not establish certain contradictions. Why: framing AI output as "contradiction" implied a confidence level the model cannot legitimately claim against highly varied policy documents, and could be misread as decisive findings rather than review prompts. The legacy strings (`low_tension`, `moderate_contradiction`, `high_contradiction`) remain in the Python parser map as backward-compatible aliases so an LLM regression to old wording still parses; never emit them in UI or as canonical stored values.
- No LLM-drafted content in the pipeline infrastructure. Any text concatenated into pipeline LLM prompts — taxonomy names, taxonomy descriptions, prompt templates, classification instructions, framing language, scope text in country-config / BTR-adaptation / BER-taxonomy data files — must trace to a primary source or be explicitly labeled project-defined. Never LLM-draft pipeline-prompt content silently. Why: discovered 2026-04-27 that IPCC sector descriptions in `categories.json` were LLM-generated and stored under a misleading `_source` annotation; they feed `classify.py:151` and `:228` directly, biasing every classification result. Distinct from the rule above (no narrative reports in *outputs*) — this rule covers the pipeline's *inputs*. Pipeline outputs (target classifications, alignment verdicts, decompositions) are LLM-derived by design; pipeline inputs must not be.
- Usability supersedes country-agnosticism. When a data source or analysis is genuinely valuable to one country but doesn't structurally generalize, work around — don't drop it for symmetry's sake. Why: forcing portability strips local relevance. Some sources are intrinsically country-shaped (APNDC for Mongolia adaptation, BAR codes specific to Mongolia's budget, Panama's 11 BTR sectors). Pair-check during integration: ask separately "is this valuable to the country it serves?" and "is portability cheap?".
- Multi-label vs multi-class classification policy: each target gets a `primary` (single-label, top-scored category) AND any number of `relevant` (multi-label, score ≥ 0.5) tags. Both modes coexist in the same record. UI surfaces should choose one mode intentionally — primary for ranking, relevant for breadth. The 0.5 threshold is hard-coded today (`python/src/classify.py:32`); future work to derive per-taxonomy from data. Why: prevents accidental visual weighting of all relevant equally regardless of score.
- GLOBE few-shot calibration scores are positional fallbacks. `python/src/classify_globe.py:55 _FEWSHOT_SCORES = [0.9, 0.7, 0.55, 0.4, 0.3]` are assigned by position because the BIOFIN expert data carries no explicit ranking. Don't surface them as if they were expert weights. Why: surfacing positional scores as "expert relevance" would overclaim.
- Adaptation alignment uses the same 7-level scale as mitigation, with a prompt-level instruction not to penalise adaptation actions for missing CO2e numbers (`python/src/measure_align.py:39-44`). Why: adaptation is "less structured/standardised" (Apr 7 Mongolia call). The asymmetric relationship is fixed at prompt level not schema level — captured in `project_btr_methodology_limitation.md`.
- Pathway-style suggestions (process pointers like boundary review, joint M&E, coordination, indicator alignment, triage of flagged pairs) are allowed in chat replies and insight callouts when anchored to visible evidence. Stay hedged ("could potentially", "may", "worth a closer look"), never "should" or "must". No country/ministry/sector-specific prescriptions and no extended narrative reports. Other static surfaces (headline cards, KPI tiles, status badges) stay factual-only. Why: recurring May 2026 CBD/TAG/CO ask for practical recommendations on how coherence could be improved, not just misalignment lists.
