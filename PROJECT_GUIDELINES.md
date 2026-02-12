# CPC Tracker - Project Guidelines

> Nature-Climate Policy Coherence Progress Analysis Tool for UNDP

*Last updated: February 2026*

---

## 1. Product Vision

An interactive web application that allows UNDP country offices and national partners to **input their policy targets**, run AI-powered coherency analysis, and explore the results through interactive visualizations. The tool automates and enhances the process currently done manually in static reports (e.g. the Mongolia Target Alignment Assessment).

### What This Tool Is NOT

- Not a replacement for national planning processes

### What This Tool IS

- A **data input** platform where users submit their own structured targets
- An **AI analysis engine** that assesses alignment between targets
- An **interactive dashboard** that visualizes coherency results
- A tool designed for **human-in-the-loop** validation

---

## 2. Core Questions

| Priority | Question |
|----------|----------|
| **Primary** | Are various policies (NDC, NBSAP, NAP, LDN, sectoral) working in coherence toward Nature-Climate targets? |
| **Secondary** | Where are the highest opportunities for coordinated implementation? |
| **Future** | What is the progress toward coherent implementation (indicators, finance, outcomes)? |

---

## 3. Phased Roadmap

### Phase 1: Coherency Analysis Dashboard (Current Focus)

Replicate and enhance the Mongolia report output as an interactive web application.

**Input**: Users upload/enter their national targets from various policy documents.
**Processing**: LLM-based multi-agent analysis assesses alignment.
**Output**: Interactive dashboard with visualizations and insights.

Specific deliverables:
1. **Target upload interface** — structured input for targets from NDC, NBSAP, NAP, LDN, other policies
2. **NBS classification** — AI classifies each target against 10 nature-based solution categories
3. **Theme classification** — AI classifies each target against 10+ cross-cutting themes (user-extensible)
4. **Pairwise alignment assessment** — AI evaluates every target pair for alignment (No/Low/Medium/High)
5. **Interactive dashboard** — heatmaps, bar charts, radar charts, summary statistics
6. **Exportable results** — allow users to download analysis for offline use

### Phase 2: Progress & Implementation Tracking

Move from "are policies coherent?" to "are we making coherent progress?"

- Monitorable indicators mapped to targets
- Cross-sector progress tracking (energy, water, agriculture moving in coherence?)
- Finance and budget commitment overlay on targets
- Potentially integrate [BIOFIN Global Biodiversity Expenditure Taxonomy](https://www.biofin.org/knowledge-product/global-biodiversity-expenditure-taxonomy)

### Phase 3: Impact & Cross-Country (Future)

- Cross-country comparison
- Impact proxies (job creation, green economy indicators)
- Geospatial layers

---

## 4. Data Model

### 4.1 Policy Documents (Sources)

Users provide targets from these document types:

| Document | Convention | Example |
|----------|-----------|---------|
| **NDC** (Nationally Determined Contributions) | UNFCCC | Mongolia NDC 3.0 |
| **NBSAP / NBT** (National Biodiversity Targets) | CBD / KMGBF | Mongolia NBTs |
| **NAP** (National Adaptation Plan) | UNFCCC | Mongolia 2021 NAP |
| **LDN** (Land Degradation Neutrality Targets) | UNCCD | Mongolia LDN targets |
| **Sectoral policies** | Various | Agriculture, water, forest, land use |

### 4.2 Target

A specific policy objective submitted by the user.

```
Target {
  id: string
  text: string                    // Full target text
  source_document: PolicyDocument // NDC, NBSAP, NAP, LDN, other
  source_label: string            // e.g. "Animal husbandry and pastureland 2"
  country: string
  is_quantitative: boolean
  is_time_bound: boolean
  quantitative_details?: string   // e.g. "30%", "by 2030"
}
```

### 4.3 Nature-Based Solution Categories (10 predefined)

From IPCC Special Report on Climate Change and Land + Griscom et al:

1. Agriculture and livestock management
2. Ecosystem protection and connectivity
3. Forest management, restoration, and protection
4. Nature-based carbon sequestration
5. Nature-based risk management and disaster prevention
6. Protection and restoration of wetlands and freshwater ecosystems
7. Protection, management, and restoration of marine and coastal habitats
8. Soil fertility management and restoration
9. Urban settlements management
10. Water management

### 4.4 Cross-Cutting Themes (10 predefined + user-extensible)

1. Climate change adaptation
2. Climate change mitigation
3. Land conservation and restoration
4. Species conservation and ecosystems
5. Pollution
6. Gender equality
7. Capacity building and development
8. Sustainable development and the SDGs
9. Indigenous Peoples and local communities
10. Private sector

> Countries may propose additional themes for assessment.

### 4.5 Alignment Classification

| Level | Description |
|-------|-------------|
| **No alignment** | Distinct in purpose and implementation, no connection |
| **Low** | Superficial overlap (terminology), substantial effort needed to align |
| **Medium** | Clear overlap (thematic/geographic), some effort needed to align |
| **High** | Robust overlap (goals, actions, ecosystems, actors), ready for coordination |

### 4.6 Important Distinction

> **Coherence ≠ Impact**
>
> High coherence across policies does not mean a target is the most important. Coherence identifies coordination opportunities, not strategic priority.

---

## 5. AI / LLM Architecture

### Multi-Agent Approach (from existing methodology)

The analysis uses a two-agent pipeline:

**Agent 1 — Target Analyst**
- Decomposes each target into structured components:
  - Goal/Purpose
  - Action/Intervention
  - Ecosystem/Area
  - Target Audience
  - Expected Impact/Outcome

**Agent 2 — Alignment Advisor**
- Compares target pairs using structured output from Agent 1
- Classifies alignment level (No/Low/Medium/High)
- Generates descriptive rationale for each classification

### Thematic Classification

- Each target independently compared against each predefined theme/NBS category
- Binary output (Yes/No) per target-theme combination
- For n targets and 20 categories → n × 20 observations

### LLM Provider Strategy

| Phase | Provider | Notes |
|-------|----------|-------|
| Development / Prototype | [OpenRouter](https://openrouter.ai/) | Multi-model access, easy switching, pay-per-use |
| Production | Azure OpenAI (pending access) | UNDP-compliant, data sovereignty |

> Previous work used GPT-4o mini. We should evaluate newer/better models.

---

## 6. Visualizations (Phase 1)

Following [UNDP Data Visualization Guidelines](https://dataviz.design.undp.org/).

| Visualization | Use Case | Mongolia Report Equivalent |
|--------------|----------|---------------------------|
| **Heatmaps** | Pairwise target alignment (NBT×NDC, NBT×NAP, NDC×NAP) | Figures 3.3–3.5 |
| **Stacked bar charts** | Targets per NBS category / theme, colored by source document | Figures 3.1, 3.2 |
| **Radar/spider charts** | NBS coverage comparison across document types | Figure 4.1 |
| **Summary statistics** | Counts, percentages, alignment distribution | Throughout report |

---

## 7. Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Next.js** (App Router) | React framework |
| **TypeScript** (strict) | Type safety |
| **pnpm** | Package manager |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | Base component primitives |

### Design Systems (MANDATORY)

- **UI**: [UNDP React Design System](https://react.design.undp.org/?path=/docs/getting-started-intro--docs)
- **Charts**: [UNDP Data Visualization Guidelines](https://dataviz.design.undp.org/)

### Backend / Data Processing

| Technology | Purpose |
|------------|---------|
| **Python** (uv) | LLM pipeline, data processing |
| **Next.js API routes** | Lightweight API layer |

---

## 8. Architecture Principles

### Data Sovereignty
- Deployable independently by national governments
- No government data sent to external services without explicit consent
- Data upload model, not data scraping
- Open source (Digital Public Good target)

### Human-in-the-Loop
- AI provides analysis, humans validate
- Clear indicators when content is AI-generated
- Users can override/correct classifications

### Vendor-Ready / Handoverable
- Clean, well-documented code with clear separation of concerns
- Comprehensive tech requirements (this document) that can serve as Terms of Reference
- No tribal knowledge — all decisions documented

---

## 9. Pilot Countries

| Country | Context | Status |
|---------|---------|--------|
| Mongolia | CCD COP17 host, has existing report | Pilot data available |
| Panama | — | Planned |
| Morocco | Water focus | Planned |
| Armenia | — | Potential |
| Turkey | — | Potential |
| Seychelles | — | Potential |

---

## 10. Future: Document Processing Pipeline

While Phase 1 focuses on structured manual input of targets, a later iteration may include:

- **PDF / Word upload** → automated target extraction via LLM
- **Processing + confirmation flow**: uploaded documents are parsed, extracted targets are shown to the user for review/correction before analysis runs
- **Challenge**: need to define what kinds of input to expect — bullet lists? Numbered targets? Prose paragraphs? Mixed formats?
- This could be a Python processing script that returns structured candidates for user confirmation on the frontend

> Keep the input interface flexible enough to support both manual entry (Phase 1) and document-upload-then-confirm (future).

---

## 11. Open Questions

- [ ] LLM cost model: per-analysis pricing for country offices?
- [ ] Azure OpenAI access timeline
- [ ] Minimum data schema: what exactly must a country provide beyond target text?
- [ ] Hosting strategy for production (data sovereignty requirements)
- [ ] Authentication model: who can access, who can upload?
- [ ] Offline capability requirements?
- [ ] Multi-language support scope (targets may be in local languages)
- [ ] Build vs vendor decision — maintain this doc as potential ToR

---

## 12. References

- [UNDP React Design System](https://react.design.undp.org/?path=/docs/getting-started-intro--docs)
- [UNDP Data Visualization Guidelines](https://dataviz.design.undp.org/)
- [BIOFIN Expenditure Taxonomy](https://www.biofin.org/knowledge-product/global-biodiversity-expenditure-taxonomy)
- Mongolia Target Assessment Report (internal, Jan 2025)
- AI Flagships Proposal Document (internal)
