# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Project Overview

AI-powered web application that helps UNDP country offices and national policy makers assess coherence across nature-climate policies and track implementation progress.

**Core principle**: Every feature, visualization, and component must deliver real, actionable value for policy making. We do not build things that are merely technically impressive or already available via a quick internet search. Insights must be actionable, easy to grasp for non-technical users and genuinely useful for decision-making. Raise a warning if you think we deviate from this.

**Target users**: UNDP country office staff and national policy makers — avoid developer jargon in UI copy. Show what happened in human terms, not system terms.

**Digital Public Good**: Code must be handoverable to vendors. Prioritize UNDP Design System (https://react.design.undp.org/) and UNDP Data Viz Guidelines (https://dataviz.design.undp.org/) for UI and charts. Other libraries may be used where they add clear UX value.

**Scope**: This project is under active development. See `PROJECT_GUIDELINES.md` and `dev_data_scripts/` for more dev notes, meeting notes, and domain context — consult `dev_data_scripts/rolling_context/` for the most up-to-date notes and `dev_data_scripts/rolling_context/feedback_log.pdf` for feedback summaries and product brainstorming. 
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
- API routes require local/Docker/server with Python — won't work on serverless (Vercel)

## Collaboration Workflow

- Developers using CC or similar. Feature branches off `main`, PRs back to `main`.
- PRs should include a brief "why" — not just what changed, but the intent behind it.

## Guardrails and Previous Learnings

When a design decision (especially AI/pipeline) is revised and the learning would materially change future implementation choices, propose adding it here. High bar — only non-obvious insights that prevent repeating a real mistake or validate a reusable approach. Format: short rule + `Why:` line.

- No hallucination of policy content — AI classifies and compares only user-provided targets.
- Data sovereignty: no external API calls with government data without consent.
