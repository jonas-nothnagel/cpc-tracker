# CPC Tracker - Project Guidelines

> Nature-Climate Policy Coherence Progress Analysis Tool for UNDP

*Last updated: February 2026*

---

## 1. Product Vision

An interactive web application that allows UNDP country offices and national partners to **input their policy targets and documents**, and potentially other data (budget, fiscal, sectoral, etc) run AI-powered coherency analysis, and explore the results through interactive visualizations. The tool automates and enhances the process currently done manually in static reports (e.g. the Mongolia Target Alignment Assessment). 
We also aim to track and visualise implementation and budget, fiscal flows as well for better understanding. 
We may also include geospatial data in later iterations if it makes sense and work also towards assessing causal relationships, for example, impact on job creation, impact of funding on implemenation etc.

For now, lets assume targets will be submitted in semi-structed format (not focusing on extracting from docs, pdfs for now)

### Target Users

Primary users are **UNDP country office staff** and **national policy makers**. They are domain experts in climate/biodiversity policy but not technical users. All UI copy, labels, and status messages must use plain language — avoid developer jargon like file names, JSON, API calls, or technical pipeline terminology. Show *what happened* in human terms, not *what was produced* in system terms.

### What This Tool Is NOT

- Not a replacement for national planning processes

### What This Tool IS - non exclusive 

- A **data input** platform where users submit their own data (targets in structured form or as documents (and processing has to happen within the tool), secotral data, budget data, etc) and data is inferred by the backend model pipeline resulting in dynamic dashboard, visualisation results.
- A platform that provides an initial overview of countries policy alignments (perhaps only in the beginning).
- An **AI analysis engine** that assesses alignment between policies.
- An **interactive dashboard** that visualizes coherency results
- A tool potentially designed for **human-in-the-loop** validation

---

## 2. Some Guding Questions
|
* Are various policies (NDC, NBSAP, NAP, LDN, sectoral) working in coherence toward Nature-Climate targets? 
* Where are the highest opportunities for coordinated implementation? 
* What is the progress toward coherent implementation (indicators, finance, outcomes)? 

* Currently, we only support comparing policies but we want to consider integrating data from impact sources. This could be funding data but another idea could be integrating with existing MRV systems. UNDP develops an open source one that is in use by some countries, this could be a good place to start: https://github.com/undp/National-Climate-Transparency-Platform/

* We are particularly interested in expanding the vision away from comparing nature & climate policies (NDC vs NBSAP) to other sectoral policies. Instead we should look into how we can connect these policies with sectoral policies such as transport, energy, & agriculture.

## 4. Data 

### 4.1 Policy Documents Examples (Sources)

Users provide targets from these document types:

| Document | Convention | Example |
|----------|-----------|---------|
| **NDC** (Nationally Determined Contributions) | UNFCCC | Mongolia NDC 3.0 |
| **NBSAP / NBT** (National Biodiversity Targets) | CBD / KMGBF | Mongolia NBTs |
| **NAP** (National Adaptation Plan) | UNFCCC | Mongolia 2021 NAP |
| **LDN** (Land Degradation Neutrality Targets) | UNCCD | Mongolia LDN targets |
| **Sectoral policies** | Various | Agriculture, water, forest, land use |

This is an ongoing open ticket to source and integrate openly available data sources.
Contributions could include:

API/scraping script that can run semi-autonomous.
Develop as flexible as possible (such that the script can be re-used to obtain and structure data also for different countries etc).
Script MUST contain processing part to structure data. Data structure should follow some existing schemes if possible. Best case schemes are developled for all incoming data.
Data should be stored at python/data/ and a fitting folder should be created.
add to .gitignore if too big and route to azure cloud later on.
Possible Data Sources


https://www.climatewatchdata.org/

NDCs: https://unfccc.int/sites/default/files/2025-09/Mongolia%20NDC3_0%20under%20UNFCCC_PA%20FINAL.pdf *UNFCC example for NDC

NBSAP targes: https://www.cbd.int/nbsap/targets/ Alternative: [https://wwf.panda.org/act/nbsap_tracker_check_your_countrys_nature_progress/]

NAP Official: https://napcentral.org/ https://trends.napglobalnetwork.org/

LDN Target Explorer: https://data.unccd.int/country-targets

---

## 5. Future Considerations (Production Readiness)

These items must be addressed before production deployment:

### 5.1 Security & Authentication
- User sessions and authentication (likely Azure AD / UNDP SSO)
- API rate limiting per user (currently only per-analysis target cap)
- Input validation and sanitization of user-provided targets
- CORS and CSRF protection for the API endpoints

### 5.2 Data Persistence & State
- Currently, analysis results are stored on-disk in `python/analyses/{id}/`. There is no database, no user accounts, and no way to browse past analyses from the UI.
- For production: a database (Postgres or similar) to track analyses, link them to users, and enable re-visiting results.
- Consider whether users should be able to share analysis results with colleagues.

### 5.3 Cost Management
- Each analysis run makes many LLM API calls (roughly `targets × categories` for classification alone). A 60-target analysis costs ~$0.50-2.00 with gpt-4o-mini.
- Current prototype has a hard cap of 150 targets per analysis (~$1 estimated max).
- For production: per-user usage quotas, cost tracking, and potentially a funding/billing model.
- The LLM cache (`python/output/.cache/`) helps avoid duplicate calls across analyses.

### 5.4 Deployment
- Target deployment: Docker image on Azure (App Service or Container Instances).
- The Python pipeline needs `uv` or a pip-based virtualenv inside the container.
- Environment variables for LLM provider switching (OpenRouter for dev, Azure OpenAI for prod).
- National data sovereignty: ensure no government data is sent to external APIs without consent.

### 5.5 NBS Categories & Themes Customization
- Users can currently add/remove NBS categories and themes per analysis.
- In production, consider country-specific presets (e.g., Mongolia has different NBS relevance than Panama).
- Theme definitions should be versioned so analyses can be reproduced.