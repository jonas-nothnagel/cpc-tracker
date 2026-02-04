# CPC Tracker - Project Guidelines

> Nature-Climate Policy Coherence Progress Analysis Tool

## Project Overview

An interactive web application for UNDP country offices that visualizes policy coherence and implementation progress across climate, biodiversity, and related sectoral policies. Powered by AI-generated insights from structured (budget) and unstructured (policy documents, reports) data.

### Core Questions the Product Should Answer

1. **Primary**: "Are various policies (NDC, NBSAP, NAP, NDP, sectoral policies) working in coherence toward major Nature-Climate targets?"
2. **Secondary** (exploratory): "What was the ROI of climate/nature interventions on national development priorities?"

### Target Countries (Pilot)

- Mongolia (CCD COP17 hosting country)
- Panama
- Morocco (around Water)
- Potentially: Armenia, Turkey, Seychelles

---

## Design System & Tech Stack

### Frontend Framework

| Technology | Purpose |
|------------|---------|
| **Next.js** | React framework with App Router |
| **TypeScript** | Type safety |
| **pnpm** | Package manager |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Base component primitives |
| **ESLint + Prettier** | Code quality |

> **Reference**: Stack inspired by [un-fck/open.unfck.org](https://github.com/un-fck/open.unfck.org)

### Data Processing

| Technology | Purpose |
|------------|---------|
| **Python** | Data processing, ETL scripts |
| **uv** | Python package management |

### UNDP Design System (MANDATORY)

All UI components must follow the official UNDP React Design System:

- **Documentation**: https://react.design.undp.org/?path=/docs/getting-started-intro--docs
- **NPM Package**: `@undp/design-system-react` (check for latest version)
- Follow UNDP brand guidelines for colors, typography, spacing
- Use shadcn/ui as base, customize to match UNDP design tokens

### Data Visualization (MANDATORY)

All charts, graphs, and visualizations must follow UNDP Data Visualization Guidelines:

- **Documentation**: https://dataviz.design.undp.org/
- Use recommended chart types for different data scenarios
- Follow accessibility guidelines for color contrast and labeling
- Ensure visualizations are responsive and print-friendly

### Key Visualization Types to Implement

| Visualization | Use Case |
|--------------|----------|
| Heatmaps | Target alignment matrices (NBT vs NDC vs NAP) |
| Sankey Diagrams | Policy-to-target flow, budget allocation flows |
| Spider/Radar Charts | Theme coverage comparison across policy types |
| Treemaps | Budget allocation by sector/theme |
| Timeline Charts | Temporal coherence, target deadlines |

---

## Architecture Principles

### Data Sovereignty

- Built to be **deployed independently** by national governments
- No government data exposed to external models without explicit consent
- Open source under appropriate license (Digital Public Good target)
- Data upload model, not data scraping

### Human-in-the-Loop

- AI provides suggestions and analysis, humans validate
- Clear indicators when content is AI-generated
- Easy override/correction mechanisms

---

## Data Model Concepts

### Policy Coherence Measurement

Four-level alignment classification:

| Level | Description |
|-------|-------------|
| **No alignment** | Distinct purpose, no connection |
| **Low alignment** | Superficial overlap (terminology), needs substantial effort |
| **Medium alignment** | Clear overlap (thematic/geographic), some effort needed |
| **High alignment** | Robust overlap (goals, actions, ecosystems), ready for coordination |

### Key Entities

- **Target**: A specific policy objective from any document (NDC, NBSAP, NAP, etc.)
- **Theme**: Cross-cutting categories (Climate Adaptation, Biodiversity, Water, etc.)
- **NBS Category**: Nature-based solution categories
- **Budget Line**: Financial allocation that can be mapped to targets/themes

### Important Distinction

> **Coherence ≠ Impact**
> 
> A target with high coherence across policies is not necessarily the most important target. The tool should present both:
> 1. Coherence Score: How aligned with other targets
> 2. Strategic Importance: How central to key outcomes

---

## MVP Feature Priorities

### 🔴 Must Have

1. Policy target alignment visualization (interactive heatmaps)
2. Multi-policy integration (NDC, NBSAP, NAP, sectoral)
3. Document ingestion and target extraction
4. Budget/expenditure overlay on targets

### 🟡 Should Have

5. Temporal coherence view (timelines)
6. Counterproductive target detection ("alarming incoherence")
7. Investment opportunity flagging (multiplier opportunities)
8. Query interface for exploring data

### 🟢 Could Have (Future)

9. Basic geospatial layer
10. Cross-country comparison
11. Impact proxy dashboard

---

## Project Structure

```
cpc-tracker/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components
│   │   ├── ui/           # shadcn/ui base components
│   │   └── viz/          # Visualization components
│   └── lib/              # Utilities, helpers
├── python/               # Data processing scripts
├── data/                 # Static/sample data
├── public/               # Static assets
├── docs/                 # Documentation
└── documents/            # Project reference documents
```

---

## Development Practices

### Code Quality

- Use TypeScript for type safety
- Component documentation with Storybook (aligns with UNDP design system)
- Comprehensive test coverage for data processing logic
- Linting with ESLint, formatting with Prettier

### Accessibility

- WCAG 2.1 AA compliance minimum
- Keyboard navigation support
- Screen reader friendly visualizations
- Color-blind safe palettes (per UNDP dataviz guidelines)

### Performance

- Lazy loading for large datasets
- Client-side caching for repeated queries
- Optimize bundle size (code splitting)

### Maintenance Commands

```bash
# Check for issues
pnpm audit          # Security vulnerabilities
pnpm outdated       # Outdated packages
pnpm lint           # ESLint errors
pnpm tsc --noEmit   # TypeScript errors

# Update packages
pnpm update         # Safe patch/minor updates

# Update shadcn/ui components
pnpm dlx shadcn@latest diff
pnpm dlx shadcn@latest add <component-name> --overwrite

# Clean install
rm -rf node_modules .next && pnpm install
```

---

## Open Questions & Decisions Needed

- [ ] Minimum data schema definition - what must a country provide?
- [ ] LLM provider selection (Azure OpenAI? Local models?)
- [ ] Hosting strategy for data sovereignty
- [ ] Authentication/authorization model
- [ ] Offline capability requirements
- [ ] Multi-language support scope

---

## References

- [UNDP React Design System](https://react.design.undp.org/?path=/docs/getting-started-intro--docs)
- [UNDP Data Visualization Guidelines](https://dataviz.design.undp.org/)
- [UN Website Boilerplate](https://github.com/un-fck/open.unfck.org) - Tech stack reference
- Mongolia Target Assessment Report (internal reference)
- AI Flagships Proposal Document (internal reference)

---

*Last updated: February 2026*
