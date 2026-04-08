# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

AI-powered web application that helps UNDP country offices and national policy makers assess coherence across nature-climate policies and track implementation progress.

**Core principle**: Every feature, visualization, and component must deliver real, actionable value for policy making. We do not build things that are merely technically impressive or already available via a quick internet search. Insights must be actionable, easy to grasp for non-technical users and genuinely useful for decision-making. Raise a warning if you think we deviate from this.

**Real value-added or nothing**: Real policymakers may use this tool for decisions that affect real people, real ecosystems, and real climate outcomes. Deadlines, demo polish, and technical interestingness are not acceptable reasons to ship a feature. When proposing anything, ask "would this improve the quality of decision-support a policymaker gets from this tool?" If the answer isn't a clear yes, cut it.

**Positioning**: Decision-support system, not a decision-maker. Final interpretation remains with policymakers. Never generate extended AI-written narrative reports — prefer visuals + short factual insights. All AI outputs must be clearly labeled as AI-generated with confidence caveats.

**Target users**: UNDP country office staff and national policy makers — avoid developer jargon in UI copy. Show what happened in human terms, not system terms.

**Digital Public Good**: Code must be handoverable to vendors. Prioritize UNDP Design System (https://react.design.undp.org/) and UNDP Data Viz Guidelines (https://dataviz.design.undp.org/) for UI and charts. Other libraries may be used where they add clear UX value.

**Scope**: This project is under active development. For domain context, meeting notes, and materials:
- **Primary source (most up-to-date)**: `dev_data_scripts/sharepoint_sync/` — symlink to the team's shared SharePoint/OneDrive folder. Country materials (Mongolia, Panama), scoping docs, TAG notes, and the authoritative feedback log (`Scoping materials/Feedback log for AI Flagship.docx`) live here. Always check this first.
- **Secondary**: `dev_data_scripts/rolling_context/` — local dev notes (may be older copies).
- See also `PROJECT_GUIDELINES.md` for dev conventions.

The tool will be eventually hosted on Azure and should be easily buildable through a docker image. Keep that in mind to not overfit architecture for dev purposes now.

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
python -m src.run_analysis    # Full pipeline
python -m src.convert_to_ts   # Convert JSON outputs → TypeScript data files
```

## Analytical Framework: Three Levels

The tool is structured around three analytical levels. Any new feature should be identified against these levels before scoping, and cross-level features should be flagged explicitly:

- **Level 1 — Policy coherence / alignment.** Current focus. Pairwise alignment between targets and measures to surface synergies, contradictions, and gaps. Chord chart, tension clusters, alignment heatmap, and pairwise scoring all live here.
- **Level 2 — Financial / budget alignment.** Still pending. Where finance flows (BIOFIN, climate finance, harmful subsidies, BTR Chapter 4 finance tables) get mapped against policy objectives to show where money does and doesn't follow ambition.
- **Level 3 — Implementation progress tracking.** The "are these policies actually being implemented?" layer. Current attempt lives in `src/components/viz/sector-scorecard.tsx` and is slated for a rework.

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
- LLM provider: OpenRouter for dev, Azure OpenAI for production
- `AlignmentLevel` is bidirectional: negative values (high_contradiction, moderate_contradiction, low_tension) and positive (low, medium, high alignment)
- Display labels for positive `AlignmentLevel` values: avoid "Low" — use "Partial" or "Emerging" instead. See guardrails.
- API routes require local/Docker/server with Python — won't work on serverless (Vercel)

## Collaboration Workflow

- Developers using CC or similar. Feature branches off `main`, PRs back to `main`.
- PRs should include a brief "why" — not just what changed, but the intent behind it.

## Guardrails and Previous Learnings

When a design decision (especially AI/pipeline) is revised and the learning would materially change future implementation choices, propose adding it here. High bar — only non-obvious insights that prevent repeating a real mistake or validate a reusable approach. Format: short rule + `Why:` line.

- No hallucination of policy content — AI classifies and compares only user-provided targets.
- Data sovereignty: no external API calls with government data without consent.
- Political sensitivity in comparative outputs — never frame results as blame toward specific sectors or ministries. Use neutral language (e.g., "opportunity for stronger alignment" not "ministry X is lagging"). Why: Previous SDG-mapping outputs were used to assign blame, creating political tensions. Government sounding boards validate outputs before broader distribution.
- Terminology sensitivity — avoid "low" as a standalone positive label (reads as negative culturally). Prefer "emerging" or "partial". All abbreviations (NBS, NDC, NAP, NBSAP, LDN, BTR) must have tooltips or inline expansions on first use. Why: Mongolia user testing showed abbreviations are opaque and "low" is perceived negatively.
- No AI-generated narrative reports — the tool outputs structured visuals, short factual callouts, and classification results. Not written policy analysis in paragraph form. Why: TAG guidance — narratives carry hallucination risk and position the tool as decision-maker rather than decision-support.
