# Public contracts: finance and implementation beside the targets (round 1)

Date: 2026-09-28. Branch `experiment/coherence-pulse` (worktree `coherence-pulse`).
Approved in chat by Jonas: "Lets go ahead with A", then "otherwise go ahead! we will
just iterate". Sketches: `.superpowers/brainstorm/55500-1790601191/content/`
(`shapes.html`, `findings.html`; local, untracked).

## Why

Coherence needs ambition, finance and implementation read together (the proposal;
TAG 2's second insight: "Is money following ambition?", positive and negative financial
flows). Mongolia publishes every public contract. In August the whole record was
mirrored (77,101 contracts, 2018 to February 2026, ₮50.4 trillion), every contract was
read for its environmental purpose, and the relevant ones were compared with the 178
targets (`docs/nctp-procurement/HANDOFF.md` on branch `data/mongolia-nctp-procurement`).
The country office asked (21 April) for a financing picture beyond the Biodiversity
Expenditure Review, which covers biodiversity spending only. Contracts cover everything
the state buys, climate included. No such view exists anywhere else.

## What Jonas said (this session)

- Shape A (the record, narrowing) leads. The opening (the whole record, then how much
  of it is for nature or climate) is the favourite and must be done well: how much
  money overall, how little of it green.
- Shape B (slope per policy area) was too complicated at first look. Shape C (three
  records as dots) was too abstract: "I can not make policy on dots and colors".
- Which contracts are in the analysis must be visually clear at every step.
- One real contract shown in full, as a side item, not the centre of anything, with a
  link to its source.
- "What the money buys" needs a visual and wording aligned with the proposal.
- The visuals and insights must be far better than the sketches, with fewer text
  components.
- A rough map of where the money lands.
- Answer on the page: targets with no matching contract; contracts that may hinder a
  target; contracts serving several targets (synergies); use the money and what the
  contracts are about.

## Decisions

R1.1 **A page of its own:** `/{country}/brief/contracts`, like `/brief/explore`, in
     the brief's design (`[data-brief]`, its tokens and fonts). English, Mongolia only;
     a country without a contracts file gets a 404. Mounting into the brief comes later.

R1.2 **Two parts.** The overview: a sticky field beside four steps, the same money
     re-forming at each step (the brief's hub pattern). Then the deep dives, full
     width: the targets, what works well, where to look closer. A target and a
     contract each open a panel.

R1.3 **Money is the unit of the overview.** One square is ₮5 billion; the squares of
     each group are allotted by largest remainder, so every total on the field is
     exact. Counts appear in words and labels. The deep dives count contracts, except
     step 7, which counts tenders (below).

R1.4 **The set in view is always shown.** Above the field, one line spans the whole
     record (₮50.4 trillion). The part the step works with is inked on it, with its
     words: all 77,101 contracts in step 1; from step 2 on, the two green slivers,
     "2,251 contracts mainly for nature or climate · ₮802 billion" and "2,650 where it
     is a side benefit · ₮1.5 trillion". The two tiers are never added into one
     figure. When the green squares leave the year columns (step 3), the record stays
     behind as a pale ground, so the reader sees the analysis narrow to the green part.

R1.5 **Vocabulary** (DESIGN.md, CLAUDE.md, memory):
     - "matching contract" / "strongly matching" (the pipeline's high level);
     - never funded, unfunded or under-funded (BIOFIN feedback: adequacy needs
       financing needs);
     - "potential misalignment" / "potentially misaligned" only, never "work against",
       "pull against", "hinder" or "clash";
     - "contracted", never "spent", with "contracted, not verified delivered" as the
       source tag;
     - "for nature or climate" (the principal tier), "a side benefit" (the significant
       tier);
     - "policy areas" with the brief's lens names (Biodiversity, Mitigation sectors,
       Climate adaptation);
     - third person, no em dashes, abbreviations expanded or in `<abbr>`.

R1.6 **Names:** targets and contracts are named freely. Purchasers appear only inside
     a contract's own record panel, never on a face, never ranked or summed. Suppliers
     never appear.

R1.7 **Headlines are data-driven** (templates over computed fields, as in the brief),
     so another country's record drops in.

## The overview (sticky field, four steps)

Each step has a plain kicker above its serif finding (the brief added kickers in round
10 so steps can be found by name).

**Step 1 · The record.**
- Finding: "₮50.4 trillion in 77,101 public contracts since 2018" (with "about US$14.4
  billion" beside it).
- One line on why: contracts show where public money is committed to specific work,
  the step between a target and its delivery.
- Field: every year a column of ink squares, the year below it and its total above it
  in ₮ trillion (unit named once).
- A small typographic link, "See one contract in full ›", opens the contract panel
  (below).
- Source tag under the field: "tender.gov.mn, 2018 to February 2026 · contracted, not
  verified delivered".

**Step 2 · For nature and climate.**
- Finding: "₮1.6 of every ₮100 was contracted for work mainly for nature or climate",
  second line "₮2.9 more where nature or climate is a side benefit".
- Field: the same squares recoloured. Deep green (`#2a7443`) for mainly, light green
  (`#9cc7a8`) for side benefit, the rest pale (`#e4e6e9`). Each column shows its
  mainly-for-nature share above it; the first and last years in muted ink, as partial.
- A two-line key: the squares are too small to label.
- Pointing at a green square shows the contract behind it: the English title, ₮ and
  year, or for a square shared by small contracts, "N contracts, the largest …".
  Selecting it opens the contract panel.

**Step 3 · Toward each policy area** (the proposal's "toward each key target area").
- Lens switch, typographic: Biodiversity · Mitigation sectors · Climate adaptation.
- Field: one row per policy area. Left of a spine sit the area's targets, one ink
  circle per target (primary classification). Right of it sits the area's money: the
  green squares fly in from the columns, deep then light, by the contract's own
  primary area under the same lens.
- Rows sorted by number of targets; name, "N targets" and "₮X billion" in place.
- Money no lens area claims gets a muted last row.
- Finding: the area with the largest gap between its share of the targets and its
  share of the money mainly for nature or climate, among areas holding at least 10% of
  the targets. "Sustainable use holds 75 of the 178 targets and 9% of the money
  contracted mainly for nature or climate" (Mitigation sectors: agriculture, 50 and
  2%; Climate adaptation: agriculture and food, 69 and 2%).
- Second line: the area drawing the largest share ("Pollution management draws 38%
  with 15 targets"). With no gap of 5 points or more, only the second line leads.
- Beside the finding, the rows' largest contracts, 3 to 5 English titles with ₮, for
  the area pointed at, else the headline's area.

**Step 4 · Where it lands** (a rough draft).
- Field: Mongolia's 21 aimags and Ulaanbaatar as outlines (Natural Earth 1:10m admin-1,
  public domain, simplified). The squares fly from the rows to their place and pile as
  a small block at the aimag's label point.
- The place comes from the buying body's name or the contract title (for example
  "/Khovd, Jargalant soum/", "Selenge aimag"): a gazetteer and patterns, no AI. About
  8 in 10 green contracts get a single place.
- The rest pile beside the map, labelled "No single place named".
- Names and ₮ in place for the larger piles. Pointing at an aimag gives its contracts
  and both tiers.
- Finding, data-driven: the place with the largest share of the money mainly for
  nature or climate, then the next.

## The deep dives (full width)

**Step 5 · The targets.**
- Finding: "155 of the 178 targets have a strongly matching contract; 23 have none".
- Second line: how many of those 23 also have no matching budget line (BER) and no
  matching reported action (BTR); 16 in Mongolia.
- One row per document: colour square, name, a coverage bar and "34 of 36".
- Under each row, its targets with no matching contract are named, one line each
  (verbatim, clamped with an ellipsis), with plain words for what they do have ("a
  budget line", "a reported action", "neither").
- A disclosure lists the targets with 1 to 4 contracts.
- A target opens the target panel.

**Step 6 · What works well: one contract, many targets.**
- Finding: "1,821 contracts, worth ₮397 billion, strongly match targets in three or
  more documents at once" (the threshold is stated in the words).
- A small row of columns shows how many contracts serve 1, 2, … 8 documents.
- The list: each contract's English title, ₮, year, and eight document squares in the
  builder's colours (filled where it serves a target of that document). Sorted by
  documents served, then value; the first 8, then "Show more".
- Second line: the share of the target pairs these contracts serve that the policy
  analysis rates strongly aligned (70%).
- A disclosure: "N contracts serve two targets the policy analysis rates as
  potentially misaligned" (403), listed.

**Step 7 · Where to look closer: contracts potentially misaligned with a target.**
- Counted as tenders: framework agreements are listed lot by lot, and the
  coal-haulage framework alone is 886 lots of 27 tenders.
- Finding: "191 tenders are potentially misaligned with a target; 9 in 10 of them with
  the emission targets of Resolution 91". Second line "(1,068 contracts)".
- One line naming what was compared: the green contracts plus 1,994 others in coal,
  mining, energy and roads.
- One row per target with any such tender, as the brief's result bar. Red hatched to
  the left: potentially misaligned tenders. Green to the right: strongly matching
  tenders. Target named verbatim with its document square.
- A row opens its tenders: English title, ₮, year, lots, and the AI explanation's first
  sentence with its confidence and kind, tagged "AI-identified, for review". "Full
  record" opens the contract panel.

## Panels

**A contract, in full** (the side item Jonas asked for):
- Title in English (machine translation, labelled), the original below.
- ₮ with indicative US$ (₮3,500 per US$), year, start and end, type, procurement stage
  (translated), place.
- The buying body (the record's own field).
- The AI's readings: purpose tier; policy areas under the three lenses; targets it
  strongly matches and targets it is potentially misaligned with, each with the
  explanation's first sentence.
- "View on tender.gov.mn ↗".
- Opened from step 1's link (an example picked by rule: mainly for nature or climate,
  English title, a local buyer, the most documents served), from any square, row or
  list entry.

**A target in focus:**
- The target's text as the serif title, its document.
- Its strongly matching contracts (count, ₮, and the list with English titles),
  potentially misaligned tenders, matching budget lines and reported actions by name.
- "Explore this target" opens `/{country}/brief/explore?focus=ID`. The ring's contracts
  layer is next round.

## Data

- **Bake** `python/scripts/build_contracts_layer.py`: deterministic, no AI. Reads the
  August mirror (`dev_data_scripts/nctp_mirror/data/`, the main checkout, path as an
  argument) and `python/data/mongolia-targets.json`. Writes:
  - `python/output/mongolia/gpt-5-4/contracts.json`: the page payload. Source and
    period; per year totals by tier; the green contracts (id, year, tier, ₮, titles,
    place, primary area per lens, type, stage, link); per target counts, value and
    tender counts; lens rows; synergy counts; the potentially misaligned tenders.
  - `contract-pairs.json`: explanations for strongly matching and potentially
    misaligned pairs, server side only, fetched per target or contract through
    `/api/brief/contracts`.
- Every figure on the page traces to these files. The bake prints the page's headline
  figures so they can be checked against this spec.
- **Geometry** `src/data/geo/mongolia-aimags.json`: Natural Earth 1:10m admin-1 (public
  domain), 22 features, simplified. The source is noted in the file.
- **English titles:** 557 exist (`tender_mt_v1`). The rest come from
  `python/scripts/translate_contract_titles.py`, which uses the same prompt, cache
  namespace and model as in August. 50 go first for Jonas's check; the full run
  (roughly 6,000 titles, a few US$) waits for his go. Until then the page shows the
  original with a "not yet translated" marker.
  Prompt, verbatim from August:
  `Translate the Mongolian public procurement contract title to concise English. Return ONLY the translation, no commentary.`
- The page and its data stay local; nothing goes to Vercel before Jonas says so (the
  potentially misaligned tenders await his review-sheet verdicts).

## Code

- Pure and tested, in `src/lib/brief/contracts/`:
  - `model.ts`: types, parse;
  - `units.ts`: squares, largest remainder, square to contract;
  - `stages.ts`: positions per step: columns, rows, map piles;
  - `geo.ts`: projection, label points;
  - `headlines.ts`: which area, which place;
  - `targets.ts`, `synergy.ts`, `misaligned.ts`;
  - `format.ts`: ₮ and US$.
- In `src/components/brief/contracts/`: the page shell, `money-field.tsx` (canvas,
  morphing squares, hover, the set line), the step and deep-dive blocks, the two
  panels, and `contracts.css`, scoped under `[data-brief]`.
- Route `src/app/[locale]/[country]/brief/contracts/page.tsx` (server: loads the
  payload, builds the slim source) and `src/app/api/brief/contracts/route.ts`.
- Copy in `brief.contracts.*` (en); es and mn get English placeholders (the parity
  test).

## Testing

- vitest on every lib: square totals exact per group; attribution of each square;
  stage positions inside their bounds; headline selection on real-shaped fixtures;
  gaps, synergy counts, tender counting; projection and label points.
- Component tests: steps, blocks and panels on a fixture.
- `tsc`, lint on changed files, the full suite.
- `/mongolia/brief/contracts` returns 200; other countries 404.
- Jonas inspects the page himself (no screenshots).

## Not in this round

The ring's contracts layer; payments from the Glass Account; the fault-line deep dive
beyond its list; English purpose reasons (they are Mongolian today); the 90-contract
spot check of the purpose reading; the review-sheet verdicts; a walkthrough; es/mn
copy; a "without the state mining companies" line (Jonas's call).
