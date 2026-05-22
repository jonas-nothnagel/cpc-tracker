# Coherence Briefing prototype — handoff

A 10-slide click-through briefing that ends in an exploration workspace.
Mounted on `/prototypes`.

## Quick start

```bash
pnpm dev
# open http://localhost:3000/prototypes?country=mongolia
# (or ?country=panama)
```

Existing prototypes (Atlas, Financing Gaps, Funding Network) are hidden behind a
`SHOW_LEGACY_PROTOTYPES = false` flag in `prototypes-client.tsx` — flip to restore.

## Information architecture

10 slides driven by `SlideDeckShell` (Prev / Next buttons + arrow keys). The
wheel sits on the right of every slide and changes state per slide; the left
text panel changes per slide.

| # | Slide | Left content | Wheel state |
|---|-------|--------------|-------------|
| 1 | Hero — both questions | Q1 / Q2 framing + counts | `idle` |
| 2 | Primer aligned | one real aligned pair card | `pair` highlight |
| 3 | Primer tension | one real tension pair card | `pair` highlight |
| 4 | Build-up | "now all targets in one frame" | `aggregate` |
| 5 | Pattern | what stands out at a glance | `aggregate` |
| 6 | Q1 verdict | `pickHeadlineVerdict()` sentence + verdict badge | `alignments` only |
| 7 | Q2 intro | "where do those tensions concentrate?" | `tensions` only |
| 8 | **Sectoral grid** | clickable sector tile list, density bars | `sector` on top sector |
| 9 | **Top gaps** | top 6 fault-line rows, click → pair drawer | `tensions` only |
| 10 | Explore | chip filters + sector chips + chat | chip-driven, interactive |

Slides 8 and 9 are the A1/A2-style panels (sectoral list + fault lines list)
that the user explicitly wanted back as their own deck slots rather than being
folded into individual per-sector tour slides.

Drill-downs (sector tile click on slide 8, fault-line row click on slide 9,
primer card on slides 2/3, wheel chord click on slide 10) open side drawers
— never advance the deck.

## File map

```
src/components/prototypes/coherence-briefing/
├── index.tsx              # orchestrator: 10-slide config, drawer state, explore-slide state
├── slide-deck-shell.tsx   # Prev/Next/arrow-key deck with persistent visual slot
├── centerpiece/
│   ├── index.tsx          # dispatcher: wheel ↔ constellation
│   ├── wheel.tsx          # A3 aggregated bezier ribbons
│   └── constellation.tsx  # alternative cluster view
├── chat-panel.tsx         # /api/coherence-chat wrapper, used by slide 10
├── sector-drawer.tsx      # opened by sector tile click + "Full briefing" chip
├── pair-drawer.tsx        # opened by primer card / fault-line row / wheel chord
└── HANDOFF.md             # this file

src/lib/coherence-briefing.ts  # verdict, fault lines, primer examples, sector density, sector briefing
```

## Design rules (do not violate without explicit ask)

- **Each slide is a finding.** No buildup slides except slides 4 / 5 which both
  carry the centerpiece view; the buildup is paid back immediately on slide 6.
- **Primer is its own pair of slides (2, 3).** The user liked these specifically.
  Slides 2 and 3 highlight one real pair each on the wheel.
- **Slides 8 and 9 are the sectoral grid and the fault-lines list.** Do not
  collapse them into the explore slide; the user wants them as their own
  deck slots.
- **Drill-downs are drawers.** Never advance a slide on a click within a slide.
- **Wheel keeps A3 aggregated-ribbon style.** Not d3-chord. Not individual
  chords. (`feedback_wheel_aggregated_ribbons` memory).
- **Off-white background, serif headlines, calm spacing.** Aesthetic locked.
- **No em dashes in user-facing text.**

## WheelState shape

```ts
interface WheelState {
  mode: "idle" | "aggregate" | "pair" | "alignments" | "tensions" | "sector";
  pair?: { aId: string; bId: string };          // for mode === "pair" (ghosts the rest)
  sectorCategoryId?: string;                     // for mode === "sector"
  sectorTaxonomyType?: string;
}
```

## Open improvement areas

- Slides 4 and 5 are both `aggregate` — could differentiate by adding a
  hover-cue or by isolating one specific doc pair on slide 5.
- The wheel ribbon endpoints / widths still feel "kinda random" to the user.
  Untried: connect at the doc-arc edge nearest the partner; encode dominance
  via a gradient ribbon.
- Country handling: Panama lacks BER, so any future "Budget angle" content
  needs graceful skip.

## What was tried and rejected (May 2026)

- Long scrollytell with 5+ narrative scenes — "blog article"
- Cockpit dashboard with everything flat — "too dashboardy"
- Snap-scroll 4-scene storytelling — "ends on empty view" + "blog article"
- 4-slide click-through deck — "want sectoral grid + top gaps back"
- `d3-chord` proper rim-subdivided layout — "mechanical"
- Individual chord rendering (top-N curated) — "individual lines without aggregation"
- Fingerprint scatter and River braids centerpieces (deleted)
- Constellation as primary (kept as alternative only)

See `MEMORY.md` entries `feedback_briefing_iteration_journey.md` and
`feedback_wheel_aggregated_ribbons.md` for context.

## Data dependencies

No new pipeline runs. The briefing reads:
- `python/output/{country}/alignment.json` (target × target)
- `python/output/{country}/measure_alignment.json` (BTR × target)
- `python/data/{country}-targets.json`
- `python/data/{country}-country-config.json`
- `python/output/{country}/classifications.json`
- BER for Mongolia only (`python/data/mongolia-ber.json`)

Served by the existing `/api/dashboard?country={id}` endpoint that
`prototypes-client.tsx` already consumes.
