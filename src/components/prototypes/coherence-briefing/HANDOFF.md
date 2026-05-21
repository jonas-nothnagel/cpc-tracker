# Coherence Briefing prototype — handoff

A findings-first redesign of the Policy Coherence Explorer, mounted on `/prototypes`.

## Quick start

```bash
pnpm dev
# open http://localhost:3000/prototypes?country=mongolia
# (or ?country=panama)
```

Existing prototypes (Atlas, Financing Gaps, Funding Network) are hidden behind a
`SHOW_LEGACY_PROTOTYPES = false` flag in `prototypes-client.tsx` — flip to restore.

## Information architecture

Four slides. Each one is itself a finding (not buildup). Wheel persistent on the
right, reacts per slide. Drill-downs open side drawers, not new slides.

| # | Slide | Left panel | Wheel state |
|---|-------|------------|-------------|
| 1 | Q1 verdict | verdict sentence, counts, verdict badge, one inline example pair | aggregate ribbons |
| 2 | Q2 sectors | top 5 sector tiles (clickable → sector drawer) | sector-focused on top sector |
| 3 | Top fault lines | top 5 fault-line rows (clickable → pair drawer) | tensions only |
| 4 | Explore | chip filters, sector chips, chat panel | interactive |

## File map

```
src/components/prototypes/coherence-briefing/
├── index.tsx              # orchestrator: slide config, state, drawers
├── slide-deck-shell.tsx   # Prev/Next + arrow-key deck with persistent visual slot
├── centerpiece/
│   ├── index.tsx          # dispatcher: wheel ↔ constellation
│   ├── wheel.tsx          # the centerpiece (A3-style aggregated bezier ribbons)
│   └── constellation.tsx  # alternative cluster view
├── chat-panel.tsx         # wraps existing /api/coherence-chat
├── sector-drawer.tsx      # sector briefing drawer
├── pair-drawer.tsx        # single-pair drawer
└── HANDOFF.md             # this file

src/lib/coherence-briefing.ts  # verdict, fault lines, primer examples, sector density, sector briefing
```

## Design rules (do not violate without explicit ask)

- **Four slides max.** More feels like a blog.
- **Every slide IS a finding.** No buildup, no forced primers.
- **Wheel persistent.** Only its state changes per slide.
- **Drill-downs are drawers.** Never advance a slide on click.
- **Wheel keeps A3 aggregated-ribbon style.** Not d3-chord. Not individual chords.
- **Off-white background, serif headlines, calm spacing.** Aesthetic locked.
- **No em dashes in user-facing text.**

## Open improvement areas

- Wheel ribbon endpoints / widths still read as "kinda random" to the user.
  Ideas not yet tried: endpoint at nearest doc-arc edge instead of midpoint;
  encode dominance via a split or gradient ribbon; small numeric label on hover.
- Slides 2/3 side panels are tight; could surface sector lens switcher or
  alignment counts inline.
- Country handling: Panama lacks BER, so any future "Budget angle" content needs
  graceful skip.

## What was tried and rejected (May 2026)

- Long scrollytell with 5+ narrative scenes
- 10-slide deck with primer / buildup / per-sector tours
- Cockpit dashboard with everything flat
- `d3-chord` proper rim-subdivided layout
- Individual chord rendering (top-N curated)
- Fingerprint scatter + River braids centerpieces (deleted)
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
