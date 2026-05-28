# Policy Coherence prototype — handoff

A findings-first home page that replaces the slide deck. Mounted on
`/prototypes?country=mongolia|panama`.

## Quick start

```bash
pnpm dev
# open http://localhost:3000/prototypes?country=mongolia
# (or ?country=panama)
```

Legacy prototypes (Atlas, Financing Gaps, Funding Network) are hidden
behind a `SHOW_LEGACY_PROTOTYPES = false` flag in `prototypes-client.tsx`.
Flip to restore them while the findings-home direction is still shaping.

## Information architecture

One scrolled page, four sections, sticky wheel on the right.

| #  | Section          | What it asserts                                                                 | Wheel default                                                       |
|----|------------------|---------------------------------------------------------------------------------|---------------------------------------------------------------------|
| 01 | Direction        | The country's anchor doc and how it sits with the others (or doc-agnostic).     | `groupBy: doc`, focus = `anchorDocType`                             |
| 02 | Sectors          | Where flags concentrate, with a one-sentence finding per populated sector.      | `groupBy: sector`, focus = top tension sector, filter = tensions    |
| 03 | Misalignments    | The single doc-pair that disagrees most, plus the top-6 fault lines.            | `groupBy: doc`, focus = most-flagged doc, filter = tensions         |
| 04 | Explore          | User-controlled chips + chat for everything the home does not pre-compute.      | `groupBy` auto by doc count (≤5 doc, ≥6 sector), focus from chips   |

Active section is detected via `IntersectionObserver` in `index.tsx`. The
sticky wheel reacts: groupBy, focus, and filter all change with the section.
Jump nav at the top lets users hop directly to any section.

Drill-downs (primer card on Direction, sector card on Sectors, fault-line
row on Misalignments, arc click on the wheel) either open a side drawer
(sector / pair) or update focus. The page never advances; clicks are
non-blocking.

## File map

```
src/components/prototypes/coherence-briefing/
├── index.tsx                  # orchestrator: derived data, section refs, wheel state, drawers
├── primer-card.tsx            # extracted from the dropped slide-deck primer pattern
├── sections/
│   ├── direction.tsx          # Section 1 — anchor-centric paragraph + verdict + primer
│   ├── sectors.tsx            # Section 2 — concentration sentence + per-sector cards
│   ├── misalignments.tsx      # Section 3 — doc-pair sentence + fault-line list
│   └── explore.tsx            # Section 4 — chips + chat + lens-aware sector chips
├── centerpiece/
│   ├── index.tsx              # dispatcher (wheel ↔ constellation); legend
│   ├── wheel.tsx              # three-axis state model (see below)
│   └── constellation.tsx      # alternative cluster view (kept as opt-in only)
├── chat-panel.tsx             # /api/coherence-chat wrapper, used by Explore
├── sector-drawer.tsx          # opened from sector row click + "Open sector" chip
├── pair-drawer.tsx            # opened from primer card / fault-line row / wheel ribbon click
└── HANDOFF.md                 # this file

src/lib/coherence-briefing.ts   # verdict, fault lines, primer, sector density, anchor headline,
                                # concentration stat, sector hub, doc-pair disagreement.
src/lib/vision-anchor.ts        # aggregateAnchorCoverage reused for the Direction headline.
```

## Wheel — three-axis state

```ts
interface WheelState {
  groupBy: "document" | "sector";            // arc grouping
  focus:
    | { type: "doc"; id: string }
    | { type: "sector"; id: string; taxonomyType: string }
    | null;                                  // null = aggregate, all ribbons
  filter: "all" | "alignments" | "tensions"; // colour overlay
  highlightPair?: { aId: string; bId: string };
}
```

- Ribbons are always aggregated per arc-pair. Width is `sqrt(count) * factor`.
  Green half = aligned (medium+high). Red half = flagged (any negative-side).
- `groupBy: "sector"` buckets targets by primary classification under the
  active lens taxonomy (country sectors → IPCC → GLOBE fallback). Targets
  without a primary classification sit in a quiet "Unclassified" bucket.
- `focus` is the new mode. When set, only ribbons touching the focused arc
  render at full opacity; the rest ghost. Click any other arc → focus
  switches (this is the mode that scales to 15+ docs).
- Section 1 and Section 3 stay on `document` grouping; Section 2 on `sector`.
  Section 4 auto-switches based on document count and yields to chip clicks.

## Design rules (do not violate without explicit ask)

- **Each section IS a finding from the moment it scrolls into view.** Section
  headlines are paragraph claims, not labels or questions.
- **Drill-downs open drawers.** Clicking a sector card or fault-line row
  never reflows the page; it opens a side panel.
- **Wheel uses the A3 aggregated bezier ribbon style.** Not d3-chord. Not
  individual chords. The focus mode is the new addition; ribbon geometry
  itself is unchanged.
- **Off-white background, serif headlines, calm spacing.** Aesthetic locked.
- **No em dashes in user-facing text.**
- **No "tension" in user-facing strings.** Negative-side vocabulary is
  "possible misalignment / possible conflict / likely conflict" for levels,
  "flagged pair" / "potential misalignment" / "possibly misaligned with" for
  aggregate text. Internal field names (`tensionCount`, `tensionShare`,
  `WheelFilter` literal `"tensions"`) stay.
- **No detectors.** The headline content uses generic data-derived helpers
  in `coherence-briefing.ts`. Detectors in `src/lib/coherence-insights.ts`
  belong to the curated production dashboard.

## What was tried and rejected (May 2026)

- Long scrollytell with 5+ narrative scenes — "blog article"
- Cockpit dashboard with everything flat — "too dashboardy"
- 10-slide click-through deck — "tedious; clicking through every visit"
- 4-slide click-through (compromise) — same click-through cost remained
- `d3-chord` proper rim-subdivided layout — "looks mechanical"
- Individual chord rendering (even curated top-N) — "individual lines without
  aggregation is also not the solution"
- Doc-theme derivation from classifications — user noted that doc names
  already carry identity; do not add synthetic "mainly about" tags.
- Fingerprint scatter and River braids centerpieces (deleted)

## Data dependencies

No new pipeline runs. The findings home reads:

- `python/output/{country}/alignment.json` (target × target)
- `python/output/{country}/measure_alignment.json` (BTR × target)
- `python/data/{country}-targets.json`
- `python/data/{country}-country-config.json` (anchorDocType + document labels)
- `python/output/{country}/classifications.json`
- BER for Mongolia only (filtered upstream in `prototypes-client.tsx`)

Served by the existing `/api/dashboard?country={id}` endpoint that
`prototypes-client.tsx` already consumes.
