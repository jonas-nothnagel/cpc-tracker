# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

AI-powered web application that helps UNDP country offices and national policy makers assess coherence across nature-climate policies and track implementation progress.

- **Real value-added or nothing**: policymakers may use this tool for decisions affecting real people, ecosystems, and climate outcomes. Every feature must deliver actionable decision-support, easy to grasp for non-technical users, and not already available via a quick internet search. Deadlines, demo polish, and technical interestingness are not reasons to ship. If "would this improve the quality of decision-support a policymaker gets?" is not a clear yes, cut it; raise a warning if you think we deviate.
- **Positioning**: decision-support system, not a decision-maker; final interpretation stays with policymakers. Prefer visuals plus short factual insights; never generate extended AI-written narrative reports. Hedged pathway-style suggestions are allowed under the guardrails. All AI outputs are labeled AI-generated with confidence caveats.
- **Target users**: UNDP country office staff and national policy makers. No developer jargon in UI copy; show what happened in human terms, not system terms.
- **Digital Public Good**: code must be handoverable to vendors; hosted on Azure, buildable as a Docker image. Prioritize the UNDP Design System (https://react.design.undp.org/) and UNDP Data Viz Guidelines (https://dataviz.design.undp.org/); other libraries where they add clear UX value.
- **Context sources**: `dev_data_scripts/sharepoint_sync/` (team SharePoint: country materials, scoping docs, TAG notes, and the authoritative `Scoping materials/Feedback log for AI Flagship.docx`) is the primary, most up-to-date source. `dev_data_scripts/rolling_context/` is secondary. See `PROJECT_GUIDELINES.md` for dev conventions.

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

Identify any new feature against these levels before scoping; flag cross-level features explicitly.

- **Level 1: policy coherence.** Pairwise alignment between targets and measures to surface synergies, potential misalignments, and gaps. Most mature.
- **Level 2: financial / budget alignment.** Finance flows mapped against policy objectives: where money does and does not follow ambition. Shipped for Mongolia (BER); other countries pending.
- **Level 3: implementation progress.** Are these policies actually being implemented (BTR measures, national reports). In progress.

## Architecture (Current State)

Architecture is evolving; treat the actual code as source of truth.

**Frontend**: Next.js App Router + TypeScript + Tailwind CSS + Recharts/D3.
- `src/app/` Pages and API routes
- `src/components/` UI and visualization components
- `src/data/` Static TypeScript data
- `src/types/` Domain types
- `src/lib/` Shared utilities

**Python pipeline** (`python/src/`): multi-agent LLM pipeline for classification, alignment analysis, and target parsing. Results in `python/analyses/{id}/` and `python/output/{country}/`.

**Data flow**: Frontend → API route → Python subprocess → JSON results → frontend polls for completion.

## Key Conventions

- `@/` path alias for imports from `src/` (configured in tsconfig)
- Python uses `uv` for package management
- LLM access is provider-agnostic via `LLM_BASE_URL` / `LLM_MODEL` (`python/src/config.py`): OpenRouter default in dev, Azure OpenAI in prod
- `AlignmentLevel` canonical values: `none | low | medium | high | flagged`, where `flagged` is the negative side (surfaced for review). Display vocabulary is guardrail-governed (see Guardrails).

## Collaboration Workflow

- Developers using CC or similar. Feature branches off `main`, PRs back to `main`.
- PRs should include a brief "why": not just what changed, but the intent behind it.

## Guardrails and Previous Learnings

When a design decision (especially AI/pipeline) is revised and the learning would materially change future implementation choices, propose adding it here. High bar: short rule plus a one-line `Why:`.

- No hallucination of policy content: AI classifies and compares only user-provided targets.
- Data sovereignty: no external API calls with government data without consent. Pulling public data into the tool is fine.
- Political sensitivity: never frame results as blame toward sectors or ministries; use neutral language ("opportunity for stronger alignment"). Why: previous SDG-mapping outputs were used to assign blame; government sounding boards validate outputs before distribution.
- Terminology: never "low" as a standalone positive label; display "Partial" or "Emerging". All abbreviations get tooltips or inline expansion on first use. Why: Mongolia user testing showed abbreviations are opaque and "low" reads negatively.
- Negative-side vocabulary: the pipeline flags pairs for human review; it does not establish certain contradictions. Display label for `flagged` is "Potential misalignment"; pipeline wording uses "possible misalignment / possible conflict / likely conflict", never "tension" or "contradiction". Legacy strings (`low_tension`, `moderate_contradiction`, `high_contradiction` and the v1 conflict names) survive only as parser aliases in `alignment_schema.py`; never emit them in UI or as stored values. Why: "contradiction" implies a confidence the model cannot claim against highly varied policy documents; outputs are review prompts, not findings.
- No LLM-drafted content in pipeline inputs. Any text concatenated into pipeline LLM prompts (taxonomy names and descriptions, prompt templates, classification instructions, framing language, scope text in country-config / BTR / BER data files) must trace to a primary source or be explicitly labeled project-defined; never LLM-draft it silently. Pipeline outputs (classifications, alignment verdicts, decompositions) are LLM-derived by design; this rule covers inputs. Why: LLM-generated IPCC sector descriptions once shipped in `categories.json` under a misleading `_source` annotation, feeding `classify.py` prompts and biasing every classification.
- Classification is dual-mode: each target gets one `primary` (top score) plus any number of `relevant` tags (score >= `RELEVANCE_THRESHOLD` in `classify.py`; hard-coded today, per-taxonomy derivation is future work). UI surfaces choose one mode intentionally: primary for ranking, relevant for breadth. Why: mixing modes visually weights all relevant tags equally regardless of score.
- GLOBE few-shot calibration scores (`classify_globe.py`) are positional fallbacks, not expert weights; never surface them as expert relevance. Why: the BIOFIN expert data carries no explicit ranking, so the scores would overclaim.
- Adaptation alignment uses the same 7-level scale as mitigation, with a prompt-level instruction in `measure_align.py` not to penalize adaptation actions for missing CO2e numbers. Why: adaptation reporting is less structured (Apr 2026 Mongolia call); the asymmetry is prompt-level, not schema-level, so treat it as fragile.
- Usability supersedes country-agnosticism: when a data source is genuinely valuable to one country but does not structurally generalize, work around it; do not drop it for symmetry. Pair-check during integration: "is this valuable to the country it serves?" and "is portability cheap?". Why: forcing portability strips local relevance; some sources are intrinsically country-shaped (APNDC adaptation, Mongolia BAR codes, Panama's 11 BTR sectors).
- Pathway-style suggestions (process pointers: boundary review, joint M&E, coordination, indicator alignment, triage of flagged pairs) are allowed only in chat replies and insight callouts, anchored to visible evidence and hedged ("could", "may", "worth a closer look"); never "should" or "must", no country/ministry/sector-specific prescriptions, no extended narratives. All other static surfaces (headline cards, KPI tiles, status badges) stay factual-only. Why: stakeholders asked for practical how-to-improve pointers (May 2026), but unhedged or targeted prescriptions would overclaim and politicize.
