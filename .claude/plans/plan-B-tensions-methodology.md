# Plan B: Tensions Methodology Refinement

## Context

Only 6 `low_tension` contradictions out of 330 alignment pairs. Zero `moderate_contradiction` or `high_contradiction`. The feedback asks to fine-grain the tension methodology to surface good examples for presentation. The question is whether the prompts are too conservative or whether Mongolia's targets genuinely have few contradictions.

**Important**: Don't force tensions that don't exist. But the current prompt does lean heavily toward positive alignment — worth investigating whether rebalancing produces more honest assessments.

## Current State

- 330 pairs: 143 high, 152 medium, 29 low, 6 low_tension
- All 6 tensions are `resource_competition` type
- Agent 2 prompt (align.py:63-160) emphasizes "most targets share some degree of alignment" and has extensive instructions to avoid false contradictions
- Agent 1 decomposes targets into 5 fields (Goal, Action, Ecosystem, Audience, Impact)

---

## Task 1: Review and improve Agent 2 (Alignment Advisor) prompt

**File:** `python/src/align.py` (lines 63-160, `ADVISOR_USER_TEMPLATE`)

**Changes to consider:**
1. Add a calibration note acknowledging the current bias toward alignment — something like: "Be analytically honest. Policymakers need to know where real trade-offs exist, even when both targets are positively framed."
2. Add examples of common tension patterns in national policy frameworks:
   - Economic growth/expansion targets vs. environmental conservation targets
   - Livestock production vs. rangeland/grassland protection
   - Energy development vs. ecosystem protection
   - Quantitative targets with incompatible timelines or resource needs
3. Keep the guardrails against false positives but balance with encouragement to identify genuine implementation trade-offs

## Task 2: Consider adding a 6th decomposition field to Agent 1

**File:** `python/src/align.py` (lines 32-56, `ANALYST_USER_TEMPLATE`)

Currently decomposes into: Goal/Purpose, Action/Intervention, Ecosystem/Area, Target Audience, Expected Impact.

Consider adding: **"Resource Requirements / Trade-offs"** — what resources (land, water, budget, institutional capacity) does this target require? This gives Agent 2 more signal for identifying resource competition.

## Task 3: Add tension enrichment post-step (optional)

After alignment assessment completes, take all tension/contradiction pairs and run a focused LLM call to generate a more detailed explanation with specific policy references.

**Files:** `python/src/run_analysis.py` (add between step 5 and 6)

**Steps:**
1. Filter alignment results to only tension/contradiction pairs
2. For each, ask LLM: "Explain this tension in 3-4 sentences with specific references to the policy actions that create the trade-off"
3. Write enriched descriptions to the alignment output

## Task 4: Improve tension display in dashboard

**File:** `src/components/viz/contradiction-summary.tsx`

- Display enriched descriptions if available
- Consider highlighting top tensions as "Key Findings"

## Verification

- [ ] Re-run pipeline after prompt changes
- [ ] Compare tension count: are new tensions genuinely valid or just noise?
- [ ] Review individual tension descriptions for quality and accuracy
- [ ] Dashboard displays improved tension information
