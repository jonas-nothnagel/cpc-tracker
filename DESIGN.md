---
name: Policy Coherence Analyzer
description: A serious public institution's guided atlas of nature-climate policy coherence — navigable evidence, quietly beautiful, uncluttered with depth on request.
colors:
  primary: "#0468b1"
  primary-dark: "#035293"
  primary-light: "#0099d9"
  ink: "#232e3d"
  muted: "#55606e"
  surface-light: "#f7f7f7"
  border: "#e5e7eb"
  white: "#ffffff"
  success: "#59ba47"
  warning: "#ffbc00"
  danger: "#ee402d"
  chart-ndc: "#0468b1"
  chart-nbt: "#0d9488"
  chart-nap: "#b45309"
  chart-alignment: "#196127"
typography:
  display:
    fontFamily: "'Source Serif 4', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "clamp(2.25rem, 5vw, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Source Serif 4', ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif"
    fontSize: "1.75rem"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "normal"
  body:
    fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  data:
    fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  caption:
    fontFamily: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
rounded:
  none: "0"
  sm: "6px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  chip:
    backgroundColor: "{colors.white}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  info-badge:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.muted}"
    rounded: "{rounded.full}"
    size: "20px"
---

# Design System: Policy Coherence Analyzer

## 1. Overview

**Creative North Star: "The Public Atlas"**

_This file has two layers with different authority. The **tokens** (colors, type, radii, components above) document the visual system as it stands **today** — an honest baseline, not a mandate. The **North Star, Named Rules, and Do's and Don'ts** encode the **target** this system is steering toward. Where the two disagree, the rules win for new work. The point of this document is to raise the floor, not to freeze the current state._

The Public Atlas is what a serious public institution would build if it set out to map a country's nature-climate policy terrain and hand it to the people who govern it. It is an **atlas** first: evidence you can navigate, a landscape of instruments and targets that rewards exploration and guides the eye rather than dumping a table. It is **public** second: it speaks in the generous, quietly beautiful register of a national broadcaster or a museum wall text, legible to a minister and a junior analyst alike, never a specialist's console. And it is **uncluttered** throughout: every surface leads with one clear finding and holds its depth in reserve, one click away.

The register is calm institutional authority carried by craft, not decoration. Serif headlines give the institution a voice; a plain working sans carries the analysis. Motion is used to make a finding land and to guide navigation, never to perform. Colour is rationed so that the one blue that means "act here" still means something. The result should feel purpose-built — an instrument a government office trusts — and, in its moments, quietly impressive.

This system explicitly rejects the auto-generated consultancy dashboard with its extended AI-written narrative and gradient hero-metrics; the alarmist red-alert risk board that reads as assigning blame; the interchangeable SaaS-analytics look of identical card grids and tracked eyebrows above every section; jargon-dense academic output a non-technical reader cannot parse; and the generic, templated "vibe-coded" feel of something machine-assembled rather than designed.

**Key Characteristics:**
- Evidence-led and navigable: the interface maps, it does not lecture.
- One finding on the face, depth on request: never a wall of prose or a dense grid at rest.
- Serif voice, sans working text: gravity where it speaks, clarity where it works.
- Rationed colour: UNDP Blue means "act" and "here", nothing else.
- Neutral by construction: opportunity for stronger alignment, never fault.
- Quietly beautiful: craft is felt, not announced.

## 2. Colors

A restrained institutional palette anchored on a single UNDP Blue, extended by a small analytical set for the policy frameworks and a conventional semantic trio for genuine status.

### Primary
- **UNDP Blue** (`#0468b1`): The one voice of action. Primary buttons, links, the current selection, active states, and the NDC framework in charts. Its scarcity is what makes it legible.
- **UNDP Blue Deep** (`#035293`): The pressed and hover state of the primary; never a fill of its own.
- **UNDP Blue Bright** (`#0099d9`): A lighter accent for secondary emphasis and lighter data marks. Used sparingly.

### Secondary
The analytical palette — one hue per policy framework, so a reader learns the map by colour. Reserved for data visualization and framework tags, never for chrome.
- **NDC Blue** (`#0468b1`): Nationally Determined Contributions. Shares the primary hue by design.
- **NBT Teal** (`#0d9488`): National Biodiversity Targets / nature framework.
- **NAP Amber** (`#b45309`): National Adaptation Plan / adaptation framework.
- **Alignment Green** (`#196127`): Positive coherence and strong-alignment marks in coherence views.
- **Reserved document colours** — **BTR Violet** (`#7c3aed`), **BTR Adaptation Fuchsia** (`#c026d3`), **Other Stone** (`#78716c`): the universal fallback palette for the Biennial Transparency Report's mitigation and adaptation subsets and the catch-all "Other" document (`RESERVED_DOC_TYPES` in `src/lib/utils.ts`). The rest of the per-document palette is supplied by each country config as data.
- **Neutral Mark Slate** (`#94a3b8`): the neutral fallback for unknown documents and de-emphasised data marks inside visualizations.

### Tertiary
Semantic status only. Not decoration, not framework colour.
- **Signal Green** (`#59ba47`): Genuine success/positive confirmation.
- **Signal Amber** (`#ffbc00`): Genuine caution/pending.
- **Signal Red** (`#ee402d`): Genuine error/negative state only.

### Neutral
- **Ink** (`#232e3d`): Primary text on light. The default for body and headlines; contrast is roughly 13:1 on white.
- **Muted Slate** (`#55606e`): Secondary text, captions, labels, eyebrows. ~7:1 on white — the floor for legible muted text; never go lighter for "elegance".
- **Surface Light** (`#f7f7f7`): The second neutral layer — panels, toolbars, hover fills, grouped regions inside a white page.
- **Hairline** (`#e5e7eb`): Borders, dividers, table rules.
- **White** (`#ffffff`): The default product ground and the surface of floating layers.

### Named Rules
**The One Voice Rule.** UNDP Blue (`#0468b1`) appears only on primary actions, links, and current selection. It is never a background band, a decorative fill, or an icon tint "for colour". On any given screen it should cover well under 10% of the surface; its rarity is the signal.

**The Legible-Axis Rule.** Red/green is allowed as the intuitive encoding for the alignment axis in data visualization (wheel ribbons, share bars, matrices, status dots): green reads as reinforcing, red as a possible misalignment worth a second look. Two conditions keep it honest. First, colour is never the sole channel: pair red/green with a pattern (hatching or dashed) or a text label so it survives colour-blindness. Second, the no-blame line is carried by neutral language and framing, and colour never sharpens into a whole-surface "alert" wash or a fault signal against a ministry or actor. Outside data visualization, red stays conventional error/negative status. (This supersedes the earlier no-red-for-flagged rule: for a non-technical audience, the legibility of red/green won.)

**The One Ground Rule.** White is the only page ground, landing included; Surface Light marks grouped regions inside it. No warm or tinted bands anywhere: a cream band reads as generated decoration, not as the product.

## 3. Typography

**Display Font:** Source Serif 4 (self-hosted variable woff2, SIL OFL) — falls back to `ui-serif, Georgia, Cambria, "Times New Roman", Times, serif`
**Body Font:** Source Sans 3 (self-hosted variable woff2, SIL OFL) — falls back to `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

**Character:** A deliberate contrast-axis pairing — a serif for voice, a sans for work, in the register of a UN flagship publication. The serif gives headlines the gravity of a broadsheet or a museum wall; the sans keeps every label, control, table, and paragraph plain and fast. No display font ever appears in a control. Both families are self-hosted under `public/fonts/` (Digital Public Good: no runtime font CDN) with latin, cyrillic, and cyrillic-ext subsets; Mongolian requires cyrillic-ext (Ө/ө, Ү/ү). The serif ships roman-only; `font-synthesis-style: none` prevents faux obliques.

### Hierarchy

The working scale is five steps, exposed as Tailwind utilities (`text-display`, `text-headline`, `text-body`, `text-data`, `text-caption`) from `@theme` in `globals.css`. **12px (`caption`) is the floor for user-facing text.**

- **Display** (serif, 600, `clamp(2.25rem, 5vw, 3.5rem)` ≈ 36–56px, line-height 1.05, tracking `-0.02em`): The landing hero and the briefing's country headline. The only place type gets large.
- **Headline** (serif, 500, 1.75rem / 28px — may step to 2rem / 32px from `sm` via `sm:text-headline-lg`, line-height 1.15): Section and slide headlines that **state the finding in plain words**. Drawer and modal titles use the same serif voice at a reduced 1.25rem sub-size; that is the only sanctioned serif below Headline.
- **Body** (sans, 400–500, 0.9375rem / 15px, line-height 1.6): Reading text, short insight copy, controls, and primary row lines. Cap prose at 65–75ch (`max-w-prose`); data and dense UI may run wider.
- **Data** (sans, 400–500, 0.8125rem / 13px, line-height 1.45, `tabular-nums` for figures): Dense evidence rows and tables, secondary row lines, chart tick labels, compact controls.
- **Caption** (sans, 400–500, 0.75rem / 12px, line-height 1.45): Legends, meta, footnotes, method notes, AI-provenance lines. Sentence case by default; an uppercase variant is allowed only sparingly, tracked at most `0.08em`, never as a per-section eyebrow.

The former tracked 11px Label step is retired: eyebrows and tracked micro-labels are not part of this system (see Don'ts).

### Named Rules
**The Headline-Is-The-Finding Rule.** A section headline states the conclusion in plain language ("Water and land-use targets pull in the same direction"), not a topic label ("Sector analysis"). The serif carries the finding; the body only elaborates, in ≤35 words, with the rest behind a disclosure.

**The Serif-For-Voice-Only Rule.** The serif is for display and headlines exclusively. Buttons, labels, table cells, form controls, and data readouts are always the sans. A serif in a control is prohibited.

## 4. Elevation

The system is **flat by default** and conveys depth through tonal layering, not shadow: White content sits on Surface Light groupings, which sit on the page. A shadow means one specific thing — "this element floats above the page" — and appears only on transient overlay layers: dropdown menus, info popovers, and drawers. Resting surfaces (cards, panels, table rows) carry a hairline border or a tonal shift, never a drop shadow.

### Shadow Vocabulary
- **Popover** (`box-shadow: 0 10px 15px -3px rgba(0,0,0,0.10), 0 4px 6px -4px rgba(0,0,0,0.10)`): Info popovers and small floating panels anchored to a trigger.
- **Overlay Deep** (`box-shadow: 0 18px 40px -12px rgba(15,22,30,0.45)`): The larger disclosure menus (e.g. the hero country menu) that need to read clearly as a lifted layer over imagery.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. If an element has a drop shadow, it must genuinely be floating (a menu, popover, or drawer). A resting card with a shadow is wrong — group it with a border or Surface Light instead.

## 5. Components

Refined and restrained: quiet chrome, generous whitespace, standard affordances used the standard way, so the evidence — not the interface — is what the user notices.

### Buttons
- **Shape:** The primary action is **square** (radius `0`). This sharp corner is a UNDP signature and is deliberate; it is the one place the system does not round.
- **Primary:** Solid UNDP Blue (`#0468b1`) fill, white semibold text, padding `12px 24px` (`px-6 py-3`). Hover/active deepen to UNDP Blue Deep (`#035293`) via a `transition-colors`.
- **Focus:** `focus-visible` outline, 2px solid, 2px offset, in a colour that reads on its ground (white over the blue hero, blue over light surfaces). Never suppressed.
- **Quiet / Secondary:** A text button — underlined, `underline-offset-4`, decoration at reduced opacity that solidifies on hover. Used for the "explore / disclose" affordance beside the primary, and for low-emphasis actions. There is one primary per view.

### Chips
- **Style:** `rounded-full` pill, thin Hairline border, small uppercase Label text in Muted Slate. Background White or transparent.
- **State:** Status/meta tags (e.g. "coming soon", framework tags). Use sparingly — prefer plain typography to a chip when a chip is not earning its keep. Never a colored side-stripe or a dense field of pills.

### Cards / Containers
- **Corner Style:** `rounded-lg` (8px) for panels and floating menus.
- **Background:** White, or Surface Light (`#f7f7f7`) for grouped/secondary regions.
- **Shadow Strategy:** None at rest (see Elevation). Shadow only when the container is itself a floating overlay.
- **Border:** A single Hairline (`#e5e7eb`) border where separation is needed.
- **Internal Padding:** Generous — roughly `16–24px`. Nested cards are prohibited.

### Inputs / Fields
- **Style:** Hairline border, White fill, `rounded-md`/`rounded-lg`, sans Body text.
- **Focus:** `focus-visible` outline in UNDP Blue, 2px, matching the button focus vocabulary — one focus language across the surface.
- **Disabled:** Reduced opacity with Muted Slate text; never a colour fill.

### Navigation
- **Style:** Sans text links in Ink, hover to UNDP Blue; the current item carries the blue as its selected state (One Voice Rule). Top-bar pattern on the product; a light header on the landing. Standard patterns only — no invented nav affordances.

### Info Affordance (signature)
The `(i)` **InfoBox** is the system's answer to the "expand every abbreviation, explain the method" guardrail. A 20px round badge sits inline after a term or heading — Surface Light with Muted Slate at rest, UNDP Blue fill with white glyph when open — and reveals a bordered Popover-elevation panel with the plain-language explanation. It is how depth-on-request works at the word level: nothing is left as an opaque acronym, and nothing clutters the face to explain itself.

## 6. Do's and Don'ts

### Do:
- **Do** lead every surface with one clear finding stated in plain words, and hold detail in a drawer, popover, or disclosure — depth on request, never on the face.
- **Do** keep UNDP Blue (`#0468b1`) for primary actions, links, and current selection only; under ~10% of any screen (The One Voice Rule).
- **Do** frame flagged pairs and gaps as neutral opportunities for stronger alignment, with an AI-generated + confidence caveat where the content is model-derived. Red/green may encode the alignment axis; keep the no-blame line in the words, not in the absence of colour.
- **Do** pair any red/green alignment encoding with a second channel (pattern, dashed vs solid, or a text label) so it reads for colour-blind users; colour is never the only signal.
- **Do** keep the primary CTA square-cornered; round the surfaces and pills around it, not the button.
- **Do** expand every abbreviation on first use or attach an InfoBox; no bare acronyms.
- **Do** keep body text at Ink (`#232e3d`) or Muted Slate (`#55606e`); if contrast is even close, move toward Ink. Legibility beats "elegant" light gray, always.
- **Do** honour `prefers-reduced-motion` (already global): every animation has a static fallback, and reveals enhance already-visible content — never gate content on a transition.
- **Do** keep every surface, landing included, on White with Surface Light for grouped regions; no tinted bands.

### Don't:
- **Don't** ship auto-generated consultancy-dashboard output: no extended AI-written narrative reports, no gradient hero-metric templates, no generative filler presented as analysis.
- **Don't** use alarmist or blame framing: no whole-surface red "alert" washes, and no colour or language that reads as assigning fault to a ministry, sector, or actor. Red/green as a data encoding is fine; a red-alert *dashboard* is not.
- **Don't** fall into generic SaaS-analytics grammar: no identical card grids repeated endlessly, no decorative charts, and **no uppercase tracked eyebrow above every section**. (The `SlideFrame` per-slide eyebrow is legacy current-state, not a pattern to replicate — give new sections a different cadence.)
- **Don't** produce dense, jargon-heavy academic output; if a non-technical policymaker can't grasp it at a glance, it belongs behind a disclosure or needs rewriting.
- **Don't** let it feel templated or "vibe-coded": standard affordances, yes; unconsidered defaults, no. Every screen should read as purpose-built.
- **Don't** use a `border-left`/`border-right` colored stripe (>1px) on cards, callouts, or list items; use a full Hairline border, a Surface Light tint, or nothing.
- **Don't** use gradient text (`background-clip: text`), and don't use glassmorphism/decorative blur as a default; both are prohibited.
- **Don't** put a drop shadow on a resting surface, a serif in a control, or a second competing primary action in one view.
