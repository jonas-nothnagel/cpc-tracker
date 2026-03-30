# Plan D: Upload Wizard Redesign & EcoLogits Integration

## Context

Two independent but both substantial pieces of work:
1. Upload page needs a complete UX overhaul as a multi-step wizard (+ fix for large document failures)
2. EcoLogits GHG footprint tracking is a must-have

Grouped together because both involve cross-cutting changes (Python + frontend) and neither depends on the pipeline investigation work.

---

## Part 1: Upload Flow

### Task 1a: Fix large document upload failure

**Root cause**: Next.js App Router has a default body size limit. An 80-page PDF (5-15MB) exceeds it. `next.config.ts` is currently empty.

**Files:** `next.config.ts`, `src/app/api/extract/route.ts`, `src/components/upload/document-upload-zone.tsx`

**Steps:**
1. Configure body size limit in `next.config.ts`:
   ```ts
   const nextConfig: NextConfig = {
     experimental: {
       serverActions: { bodySizeLimit: '50mb' },
     },
   };
   ```
2. Increase base timeout in `src/app/api/extract/route.ts` from 5 to 10 minutes (`MIN_TIMEOUT_MS`)
3. Update UI feedback for large files — indicate longer wait times for documents over 10MB
4. Test with an actual large PDF from Mongolia materials

### Task 1b: Multi-step upload wizard

**Design — 4 steps:**

**Step 1: Country & Documents**
- Country input field
- Document upload zone (PDF/DOCX/TXT + CSV/TSV/XLSX + BTR Excel)
- Basic explanation of what each document type is for

**Step 2: Available Reference Data**
- Show BTR data if uploaded in step 1
- Show pre-extracted targets from known policy types (NDC, NBSAP, etc.)
- Allow adding previously cached targets from past analyses (localStorage)
- This step enables data reuse instead of re-uploading each time

**Step 3: Review & Configure**
- Review all extracted/uploaded targets (reuse `ExtractReviewPanel`, `TargetsByDocument`)
- Manual editing capabilities
- NBS/sector/theme category selection (reuse `CategoryConfig`)
- Allow custom category additions

**Step 4: Summary & Run**
- Full summary of what will be analyzed
- Cost estimate (reuse `AnalysisEstimate`)
- Submit button to start pipeline

**Files to create:**
- `src/components/upload/upload-wizard.tsx` — step container with progress indicator, back/next/submit navigation
- `src/hooks/usePersistedTargets.ts` — localStorage-based cache for extracted targets (keyed by document content hash)

**Files to modify:**
- `src/app/upload/page.tsx` — replace single-page layout with `<UploadWizard>`
- Existing upload components — minor prop changes to work within step context

**Implementation approach:**
1. Create the wizard shell with step state management and navigation
2. Move existing components into step-specific panels (no rewrite — just reorganize)
3. Add step validation (can't proceed to step 3 without targets, etc.)
4. Add localStorage persistence for target reuse
5. Polish transitions and visual flow

---

## Part 2: EcoLogits Integration

### Task 2a: Python integration

**Files:** `python/pyproject.toml`, `python/src/llm.py`, `python/src/run_analysis.py`

**Steps:**
1. Add dependency: `"ecologits>=0.5.0"` in `python/pyproject.toml`
2. In `python/src/llm.py`:
   - Initialize: `from ecologits import EcoLogits; EcoLogits.init()`
   - Create `FootprintTracker` class accumulating per-call metrics:
     - `energy_wh` (Wh), `water_ml` (mL), `co2_geq` (gCO2eq), `minerals_ugsbeq` (ugSbeq)
   - Capture `response.impacts` after each `call_llm` response
   - Note: verify EcoLogits works with OpenRouter. May need model name mapping or fallback to token-based estimation
3. In `python/src/run_analysis.py`:
   - Write `footprint.json` to output after pipeline completion
   - Include running footprint totals in `status.json` at each step

### Task 2b: Frontend display

**Files:** `src/app/analysis/[id]/page.tsx`, `src/components/dashboard/dashboard-client.tsx`, `src/app/api/dashboard/route.ts`

**Steps:**
1. **During pipeline**: Show running footprint in analysis status page below progress bar
   - Format: "This analysis consumed X Wh energy, Y mL water, Z gCO2eq emissions, W ugSbeq minerals"
   - Add disclaimer: "Estimated via EcoLogits — values may differ from actual consumption"
2. **On dashboard**: Add footprint to dashboard API response, display in footer
3. Reference format from stakeholder feedback:
   > "This LLM call to [model] consumed X±Y Wh of energy, X±Y mL of water, X±Y gCO2eq of emissions, X±Y ugSbeq of critical minerals."

---

## Verification

- [ ] Large document upload (80+ pages) succeeds without timeout
- [ ] Wizard navigates through all 4 steps with working back/next
- [ ] Step validation prevents proceeding without required data
- [ ] Previously extracted targets can be reused from localStorage
- [ ] EcoLogits footprint accumulates during pipeline execution
- [ ] Footprint shown in analysis status page during pipeline run
- [ ] Footprint shown in dashboard footer after completion
- [ ] EcoLogits disclaimer present ("estimates may differ")
