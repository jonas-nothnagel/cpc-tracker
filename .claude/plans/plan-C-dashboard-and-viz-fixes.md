# Plan C: Dashboard & Visualization Fixes

## Context

Two specific UX issues raised:
1. Theme/category titles in the classification section are always the same regardless of what was configured in the analysis
2. The radial alignment network's visibility logic is confusing — users don't understand which connections are shown vs. hidden

---

## Task 1: Dynamic theme/category titles

**Problem**: The `ClassificationSection` in the dashboard uses hardcoded tab labels ("Nature-Based Solutions", "IPCC Sectors", "Cross-Cutting Themes") and static bar chart titles regardless of which categories were actually used in the analysis.

**Files:** `src/components/dashboard/dashboard-client.tsx`

**Steps:**
1. The dashboard API already returns `nbsCategories`, `sectors`, and `themes` arrays — these reflect what was configured for the analysis
2. Pass these arrays to the classification section component
3. Derive tab labels dynamically:
   - If `nbsCategories.length > 0`, show NBS tab with actual category count
   - If `themes.length === 0`, hide the cross-cutting themes tab
   - Bar chart titles: "Classification across N NBS categories" etc.
4. For dynamic analyses (via upload), categories come from `categories.json` in the analysis input — titles should reflect those

**Note:** The `ThemeBarChart` and `NbsBarChart` components already accept `title` and `subtitle` as props — no changes needed there. Fix is in how `ClassificationSection` constructs those props.

## Task 2: Alignment network visibility logic

**Problem**: `AlignmentNetwork` component only shows top 12 targets by connectivity (configurable `maxNodes`). All other targets and their edges are completely invisible. When users hover/click a visible node, they may see connections to targets that weren't visible before — which is confusing.

**File:** `src/components/viz/alignment-network.tsx`

**Current logic (lines 97-115):**
- Calculate connectivity count per target
- Sort by connectivity, take top 12
- Only render nodes and edges involving those 12 targets
- On hover: highlight connected edges, dim others

**Proposed fix — show all nodes with visual hierarchy:**
1. Render ALL target nodes, but:
   - Full size (radius 8-10) + full opacity for top 12
   - Smaller (radius 4-5) + reduced opacity (0.3) for remaining targets
2. On hover/click ANY node (including dim ones): reveal all its connections at full opacity
3. Add explanatory text below the visualization: "Showing top 12 of N targets by connectivity. Hover any target to see its connections."
4. Optional: add a "Show all connections" toggle checkbox

## Verification

- [ ] Classification section titles change based on analysis configuration
- [ ] Empty category tabs are hidden
- [ ] All nodes visible in alignment network (dim ones for non-top-12)
- [ ] Hovering any node (including dim) reveals its connections
- [ ] Explanatory text present
