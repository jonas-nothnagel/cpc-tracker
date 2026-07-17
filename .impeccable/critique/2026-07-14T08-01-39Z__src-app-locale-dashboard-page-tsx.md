---
target: dashboard
total_score: 27
p0_count: 0
p1_count: 3
timestamp: 2026-07-14T08-01-39Z
slug: src-app-locale-dashboard-page-tsx
---
Method: dual-agent (A: design-review · B: detector+static-evidence)
Target: Coherence Briefing dashboard — `src/app/[locale]/dashboard/page.tsx` → `src/components/dashboard/coherence-briefing/`

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active-section nav + live recompute + "updating/fallback" caveats are good; wheel meaning-change not announced, no aria-live on recompute |
| 2 | Match System / Real World | 3 | Serif plain-language findings + neutral vocabulary; analyst jargon leaks ("flagged share", "pool composition", "manageability", "delivery friction") |
| 3 | User Control and Freedom | 3 | Esc on drawers/modal, pair-drawer Back, doc-filter reset; no focus restore on drawer close |
| 4 | Consistency and Standards | 2 | Deviates from its OWN DESIGN.md: cream ground, red-for-flagged, black-not-blue selection, per-slide eyebrow, non-token reds; drawer focus ≠ Modal |
| 5 | Error Prevention | 3 | Doc filter always discloses exclusions (no silent drop); off-path prose caveated; empty states handled |
| 6 | Recognition Rather Than Recall | 2 | Sticky wheel's meaning + red/green semantics re-recalled per slide from a small legend; lens/filter state invisible off Sectors |
| 7 | Flexibility and Efficiency | 3 | Jump-nav, sort, lens/filter, expand, chat; the wheel is mouse-only, costing keyboard power users |
| 8 | Aesthetic and Minimalist Design | 2 | "Accessible over dense" half-met: 7-9 dense slides, tracked-label saturation, 9-11px type, repeated red/green box pattern, cream everywhere |
| 9 | Error Recovery | 3 | Graceful degradation: dashboard error → home, storyline fetch fail → full-set caveat, synthesis_error → legacy list |
| 10 | Help and Documentation | 3 | Genuine strength: (i) InfoBox, inline term popovers, AI disclaimers, chip tooltips; a few terms still unexplained |
| **Total** | | **27/40** | **Acceptable-to-Good — a genuinely strong tool held back by self-inflicted design-system violations, density, and wheel/drawer accessibility** |

## Anti-Patterns Verdict

**Does this look AI-generated? Mixed — high genuine craft, but it wears four of the exact tells its own DESIGN.md bans.**

**LLM assessment:** An expert would not say "a machine cranked this out" — live recomputation, the synced wheel↔matrix, honest-magnitude copy ("broadly similar" instead of a fake winner), and teaching popovers are clearly hand-built. But four documented tells are present: (1) an uppercase tracked eyebrow on every slide (`slide-frame.tsx:45`); (2) tracked micro-label saturation (dozens of 10px/0.18em caps per screen); (3) red as the language of the entire negative axis; (4) a cream ambient ground (`#fbfaf7`). Genuinely absent: gradient text, hero-metric template, glassmorphism-as-default, colored >1px side-stripes, text overflow.

**Deterministic scan:** 209 findings (exit 2). 201 are `design-system-font-size` — off-scale `text-[Npx]` values (10px×105, 12px×38, 9px×17, 13px×17, plus 9.5/12.5/13.5px) across 26 files, i.e. a sprawling type scale with heavy sub-11px use. 7 are `design-system-color` palette drift (`#9ca3af`, `#92400e`, `#f59e0b`, `rgba(220,38,38…)`). 1 `side-tab` warning (`financing.tsx:278` `border-l-2`) — a **false positive** (neutral-gray content indent, not a colored accent). Static grep corroborates: 0 gradient-text, 0 arbitrary z-index (Tailwind scale only), reduced-motion globally guarded (`globals.css:10`). **0 uses of `focus-visible`** anywhere in the briefing, and `globals.css:83` sets a bare `outline:none` on `.recharts-surface:focus`. 14 `backdrop-blur` uses — all conventional drawer scrims / sticky headers (not decorative glass), so not a violation. Contrast is fine: `--undp-gray #55606e` ≈ 7:1; the issue is type *size*, not contrast.

**Where they agree:** the eyebrow tell (A flags it, B confirms 8/10 sections + drawers), red-for-flagged (A: Neutral-Red Rule broken; B: 17 `#dc2626` + 4 `--undp-red` locations), cream ground (both, plus the shell at `coherence-dashboard.tsx:271/291`), tiny type (A: below the 11px floor; B: 201 instances quantified), and focus gaps (A: wheel + drawers; B: zero `focus-visible`). The detector quantified the density A judged; A explained the intent behind reds the detector only counted.

## Overall Impression

This is a real decision-support instrument, not a demo — the headline-is-the-finding principle is genuinely computed, the trust scaffolding (AI caveats, "possible misalignment", documents-not-ministries) is exactly what a government sounding board needs, and the live document filter is "test your own context" done right. The single biggest opportunity: **it violates its own freshly-written DESIGN.md in the four places that matter most to the brief** — red contradicts the no-blame posture, cream is the template tell, the eyebrow/micro-label density fights "accessible over dense", and the primary visual (the wheel) locks out keyboard and colorblind users. Fixing those four would move this from "good tool with slop tells" to "on-brand and defensible."

## What's Working

1. **Headline-Is-The-Finding is implemented, not decorative.** Each slide's serif headline is a computed plain-language conclusion (verdict buckets in `direction.tsx`, misalignment-share thresholds in `doc-focus.tsx:181`), and the copy refuses to fake a winner (`composeFlagBody` reports "broadly similar" when shares cluster, `sectors.tsx:399`). Anti-slop done right.
2. **Trust scaffolding built for a government audience.** Neutral "possible misalignment" vocabulary, AI caveats on every model-derived surface, confidence/manageability as subordinate facets (not competing pills), documents-not-ministries framing. This directly answers the "must survive a sounding board" constraint.
3. **Live, disclosed document include/exclude.** Every derived number recomputes from the visible set with excluded documents always named (`doc-filter-control.tsx:167`), plus honest off-path storyline handling (updating → fallback caveat). Real decision-support.

## Priority Issues

**[P1] Red is the language of the entire negative axis — breaks the Neutral-Red Rule and the no-blame posture.**
Why it matters: DESIGN.md says flagged is "never rendered red," and PRODUCT.md anti-references "red-alert risk dashboards" precisely because prior outputs were used to assign blame and must survive sounding-board review. Yet `#dc2626` codes every misalignment surface — wheel ribbons, friction header (`direction.tsx:68`), sector flag-share bar (`sectors.tsx:38`), hotspot bar (`where-to-focus.tsx:24`), pair/sector drawers. A minister sees "our NDC" in red no matter how neutral the caption — the color contradicts the whole tool's posture. (It isn't even the palette token; `danger #ee402d` goes unused for flagged.)
Fix: recolor the negative axis to neutral ink or desaturated warm-slate; if a second channel is needed use NAP amber or a pattern; reserve red for genuine errors; replace hardcoded `#dc2626`/`#196127` with tokens.
Suggested command: **/impeccable colorize** (then **/impeccable quieter**)

**[P1] The sticky wheel — primary visual on 6 slides — is keyboard- and colorblind-inaccessible.**
Why it matters: it's an SVG `role="img"` (`wheel.tsx:674`) whose arcs/ribbons are `<path onClick>` with no `tabIndex`/`role`/`onKeyDown` (`wheel.tsx:718,782,1070`). Ribbon-click (jump to doc-pairs) and arc-click (focus a doc) are unreachable by keyboard; aligned-vs-flagged is green/red + width with no pattern on the ribbons themselves (the dashed cue lives only on the legend dots). Sam cannot use the centerpiece at all; a colorblind minister can't read it.
Fix: make arcs/ribbons real buttons (tabindex, role, key handlers, aria-label with counts) or guarantee every wheel action has a keyboard-reachable twin in the left column; add a non-color channel (hatching/label) to the flagged thread.
Suggested command: **/impeccable harden**

**[P1] Drawers don't trap or restore focus — the primary depth surface fails keyboard/SR users.**
Why it matters: the shared `Modal` traps Tab, moves focus in, and restores it on close (`modal.tsx:24`). The four drawers (pair, sector, theme, flag) only lock scroll + handle Escape (`pair-drawer.tsx:102`) — they don't move focus in, don't trap Tab, don't restore focus. A keyboard user opening a pair drawer is left focused behind the overlay and Tabs into the frozen page. Drawers carry all the depth, so this hits the core flow.
Fix: extract the Modal's focus-trap/restore into a shared hook and apply it to all four drawers.
Suggested command: **/impeccable harden**

**[P2] The color system drifts from its own DESIGN.md: cream ground + black-not-blue selection.**
Why it matters: the briefing, sticky nav, and all four drawers sit on `#fbfaf7` (`coherence-dashboard.tsx:271/291`, `pair-drawer.tsx:149`) — the "cream-everywhere tell" DESIGN.md confines to the landing; product surfaces should default to White/Surface-Light. Separately, every selected state (jump-nav, doc switcher, lens/filter chips, impl toggle) is a **black** pill (`index.tsx:1821/1363`, `sectors.tsx:260`) — DESIGN.md's One Voice Rule assigns "current selection" to UNDP Blue, so the system's one "here / act" signal is absent.
Fix: set the dashboard and drawer grounds to White (`#f7f7f7` for grouped regions), keep cream on the landing only; move the selected state to UNDP Blue.
Suggested command: **/impeccable colorize**

**[P2] Density undercuts "accessible over dense": per-slide eyebrow + tracked micro-labels + sub-11px type sprawl.**
Why it matters: an uppercase tracked eyebrow on 8/10 slides (`slide-frame.tsx:45`) plus dozens of 10px/0.18em caps per screen plus an 8-step type scale reaching down to 9px (201 detector hits) is the generic-SaaS-analytics grammar the brief bans, and it taxes the non-technical reader the tool exists to serve. The serif headline is strong enough to lead alone.
Fix: remove the SlideFrame eyebrow and let each serif headline lead (vary the cadence per DESIGN.md's note); convert most tracked sub-labels to quiet sentence-case; consolidate the type scale and lift the sub-11px floor.
Suggested command: **/impeccable distill** (then **/impeccable typeset**)

## Persona Red Flags

**Alex (impatient power user):** jump-nav anchors are keyboard-focusable and Esc works on drawers/modal — good. But his fastest reaches — click a ribbon to drill into a doc-pair, click an arc to focus a doc — are mouse-only (P1). The expand affordance is an easy-to-miss 11px icon (`index.tsx:1639`). Row buttons use `focus:outline-none` with only a `focus:bg-gray-50` replacement (`where-to-focus.tsx:156`, `sectors.tsx:482`) — weak for rapid keyboard scanning, and they fire on mouse click too (no `focus-visible`).

**Sam (accessibility):** fails in four concrete places — (1) meaning is color-only in wheel ribbons and every share bar; (2) the wheel is not keyboard-operable; (3) drawers don't trap/move focus (P1); (4) tiny labels — `text-[9px] text-[var(--undp-gray)]/55` legend text (`index.tsx:1872`) and 9-10.5px throughout, below the 11px floor. Positives: list rows and chart segments carry descriptive `aria-label`s, so the *list* surfaces are largely usable — it's the *wheel and drawers* that lock her out. Keyboard-only end-to-end is mostly possible via the left columns, but not for wheel-native actions.

**Bataa (UNDP officer, ~10 min, must defend every number, fears blame framing):** can get one defensible read fast — yes, via the serif headlines and one-sentence syntheses. Blame framing in *language* is avoided well (documents-not-ministries, "possible misalignment", AI caveats). But the pervasive red (P1) is his single biggest exposure — a minister asking "why is our NDC in red?" is exactly what the no-blame posture exists to prevent; the copy and the color disagree. Jargon he'd have to explain without a tooltip: "flagged share", "reviewed relationships", "pool composition", "manageability / fundamental", "delivery friction".

## Minor Observations

- Hardcoded `#dc2626` / `#196127` / `#4b5563` repeated across ~8 files instead of tokens — drift risk; the palette's `danger`/`alignment` tokens go unused for these.
- The numbered jump-nav ("01 / 02 …", `index.tsx:1825`) is on the "numbered scaffolding" watch-list, but the slides genuinely ARE an ordered sequence, which the ban explicitly permits — acceptable as wayfinding, not a violation.
- The wheel's section label duplicates the active jump-nav label (`index.tsx:1636`) — mild redundancy.
- `FooterLink` is a fixed `bottom-3 left-6` 10px overlay (`index.tsx:1932`) that can sit atop content on short viewports.
- Direction's "how the pipeline built this" toggle uses ASCII `▸/▾` glyphs (`direction.tsx:549`) vs. the SVG chevrons used elsewhere — slightly unpolished.
- Loading skeleton is generic gray blocks (`coherence-dashboard.tsx:274`); a faint wheel silhouette would set expectation and add warmth.
- `globals.css:83` `.recharts-surface:focus { outline: none }` removes focus outline on charts with no replacement — a focus-invisible gap outside the briefing dir.

## Questions to Consider

1. If the Neutral-Red Rule is real, what is the single non-red visual language for "worth a second look" that reads across the wheel, the share bars, AND the drawers — and would a minister receive the briefing differently under it than under the current red?
2. Is this trying to be both the 10-minute skim and the analyst workbench in one scroll? Would separating a "findings skim" (7 serif headlines + wheel) from "evidence" (moved behind each disclosure) serve Bataa better?
3. One morphing sticky centerpiece vs. purpose-built small visuals per slide: is the shared wheel actually clearer, or is the reader paying the recall tax the "working memory" failure quantifies?
4. Selection is black and UNDP Blue is absent — deliberate restraint, or has the interface lost its one signal for "this is where to act"?
