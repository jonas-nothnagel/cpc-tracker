# CPC Tracker

Nature-Climate Policy Coherence Progress Analysis Tool

Interactive web application for UNDP country offices that visualizes policy coherence and implementation progress across climate, biodiversity, and related sectoral policies.

## Purpose

Helps governments and stakeholders answer:

> "Are various policies — NDC, NBSAP, NAP, NDP, and sectoral policies (agriculture, water, forest, land use) — working in coherence toward major Nature-Climate targets?"

## Key Features

- Interactive policy alignment visualizations (heatmaps, network graphs)
- Document ingestion and target extraction
- Budget/expenditure mapping to policy targets
- Multi-country support with data sovereignty

## Tech Stack

- Next.js (React framework)
- TypeScript
- pnpm
- Tailwind CSS
- Python + uv (data processing)

### Design Systems

- [UNDP React Design System](https://react.design.undp.org/?path=/docs/getting-started-intro--docs) - UI components
- [UNDP Data Visualization Guidelines](https://dataviz.design.undp.org/) - Charts and graphs

## Getting Started

```bash
# Install dependencies
pnpm install

# Configure environment
cp .env.example .env
# Edit .env with your OPENROUTER_API_KEY

# Run development server
pnpm dev

# Open http://localhost:3000
```

## Documentation

- [Project Guidelines](./PROJECT_GUIDELINES.md) - Design decisions and architecture
- [Python Pipeline](./python/README.md) - LLM analysis pipeline

## Pilot Countries

- Mongolia
- Panama
- Morocco

## Status

Early Development - Project inception phase

Part of the UNDP AI Sprint initiative for sustainable impact.
