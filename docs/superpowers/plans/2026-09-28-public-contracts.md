# Public contracts, round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A page of its own, `/{country}/brief/contracts`, that shows Mongolia's public contract record beside the 178 targets: the record, its share for nature or climate, the policy areas and places it reaches, then which targets have contracts, which contracts serve many targets, and which are potentially misaligned with a target.

**Architecture:** A deterministic Python bake turns the August mirror into two gzipped JSON files (a page payload and server-side contract records). Pure TypeScript libs cut the money into ₮5 billion squares and lay them out per step (years, policy areas, places), and compute every finding from the payload. The page reuses the brief's hub pattern: a sticky canvas beside four steps, then full-width deep dives, and the brief's drawer for a contract or a target.

**Tech Stack:** Python 3.11 (pandas, pyarrow) for the bake; Next.js App Router, React 19 client components, TypeScript, canvas 2D, next-intl, vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-public-contracts-design.md`

## Global Constraints

- Worktree `/Users/jonas/github/cpc-tracker/.claude/worktrees/coherence-pulse`, branch `experiment/coherence-pulse`. Never push; nothing goes to Vercel without Jonas.
- A parallel session has uncommitted edits in this worktree (`messages/*.json`, `src/components/brief/hub/*`, `brief-app*`). Commit only own paths. For `messages/*.json`, stage a synthetic blob: HEAD's file plus only the `brief.contracts` block, via `git hash-object -w` and `git update-index --cacheinfo`.
- The mirror lives in the main checkout: `/Users/jonas/github/cpc-tracker/dev_data_scripts/nctp_mirror/data/` (read only). Python: `/Users/jonas/github/cpc-tracker/python/.venv/bin/python`.
- Copy follows the vocabulary rules:
  - "matching contract" / "strongly matching"; never funded or unfunded;
  - "potential misalignment" / "potentially misaligned", never "work against", "pull against" or "hinder";
  - "contracted", not "spent";
  - "mainly for nature or climate" and "a side benefit"; the two tiers are never added into one figure;
  - third person, no em dashes, abbreviations in `<abbr>`.
- No purchaser on a face (only inside a contract's record panel); no supplier anywhere.
- Controls are plain text (underline when on). Pale yellow `#fff5c7` on words only.
- es/mn: English placeholders for every new key (the parity test).
- Tests: `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx vitest run <paths>`; Python: `cd python && /Users/jonas/github/cpc-tracker/python/.venv/bin/python -m pytest tests/<file> -q`.

## Review Focus

1. **A contract listed twice in the record** (same code, buyer, supplier, amount) must count once everywhere, while lots of one framework tender with different suppliers stay separate. Test in Task 2.
2. **A square shared by many small contracts** from two cells must go to the cell holding most of it, and its hover contract must belong to that cell. Test in Task 4.
3. **A lens or place with no money, or no targets** (Access and benefit sharing: 1 target, ₮0), and a country with no geometry: the rows and steps render without a crash; no map step without geometry. Tests in Tasks 5 and 8.
4. **A target with no matching contract that still has a budget line or a reported action** must read as such, not as "neither". Test in Task 5.
5. **The contract API for an id not in the record, or a country without a contracts file**: 404, never a crash. Test in Task 7.

---

### Task 1: Where a contract's work happens (Python gazetteer)

**Files:**
- Create: `python/scripts/contract_places.py`
- Test: `python/tests/test_contract_places.py`

**Interfaces:**
- Produces: `place_of(buyer: str, title: str) -> str | None`. Returns an ISO 3166-2 code ("MN-043", capital "MN-1"), `"several"`, or `None`. Also `AIMAGS: dict[str, tuple[str, ...]]`, `CAPITAL = "MN-1"`, `SEVERAL = "several"`.

- [ ] **Step 1: Write the failing tests**

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from contract_places import place_of  # noqa: E402

def test_buyer_names_its_aimag():
    assert place_of("Ховд аймгийн Худалдан авах ажиллагааны газар", "Ундны ус") == "MN-043"

def test_title_slash_form():
    assert place_of("Төрийн худалдан авах ажиллагааны газар", "Эх үүсвэр /Ховд, Жаргалант сум/") == "MN-043"

def test_capital_by_district():
    assert place_of("Сүхбаатар дүүргийн Засаг даргын Тамгын газар", "Цэцэрлэгт хүрээлэн") == "MN-1"

def test_sukhbaatar_aimag_is_not_the_district():
    assert place_of("Сүхбаатар аймгийн Орон нутгийн өмчийн газар", "") == "MN-051"

def test_tov_needs_the_word_aimag():
    assert place_of("Төрийн худалдан авах ажиллагааны газар", "Төв цэвэрлэх байгууламж") is None
    assert place_of("Төв аймгийн Засаг даргын Тамгын газар", "") == "MN-047"

def test_a_list_of_aimags_is_several():
    assert place_of("Ойн газар", "Баянхонгор, Баян-Өлгий, Говь-Алтай, Ховд аймгуудын ойн санд") == "several"

def test_capital_in_capitals():
    assert place_of("Ойн газар", "УЛААНБААТАР ХОТЫН НОГООН БҮС") == "MN-1"

def test_no_place():
    assert place_of("Ойн газар", "Ойн цэвэрлэгээнд ашиглагдах машин") is None

def test_two_places_are_several():
    assert place_of("Ховд аймгийн газар", "Увс аймгийн ажил") == "several"
```

- [ ] **Step 2:** Run `python -m pytest tests/test_contract_places.py -q`. Expect: ImportError.
- [ ] **Step 3: Implement.**
  - A gazetteer of the 21 aimags in Cyrillic with the record's spelling variants (hyphen, space, joined).
  - A name counts when followed by `аймгийн|аймаг|аймгууд`, or in the slash or paren form `[/(]NAME[,/)]`. Cyrillic word boundaries: `(?<!\w)`.
  - The capital: `Нийслэл|Улаанбаатар|УБ хот` (case-insensitive), or a district name followed by `дүүрэг|дүүргийн`.
  - With `аймгууд` in the text, every aimag named anywhere counts.
  - Buyer and title hits are joined: one code, else `several`, else `None`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): read where a contract's work happens from its buyer and title`.

### Task 2: Bake the page's files (Python)

**Files:**
- Create: `python/scripts/build_contracts_layer.py`
- Test: `python/tests/test_build_contracts_layer.py` (pure helpers only)
- Output: `python/output/mongolia/gpt-5-4/contracts.json.gz`, `python/output/mongolia/gpt-5-4/contract-details.json.gz`

**Interfaces:**
- Produces (payload, `version: 1`):
  - `source {name, url, firstYear, lastYear, lastMonth, usdRate: 3500, duplicates {records, value}, comparedOthers, excluded {otherCurrency, rejected}}`
  - `census {contracts, tenders, value}`
  - `years[] {year, contracts, value, principal {contracts, value}, significant {contracts, value}}`
  - `contracts[] {id, tender, year, tier: "principal"|"significant"|"none", value, title, translated, place, areas {globe?, ipcc?, gga?}, matches[], misaligned[]}`: every green contract plus any other contract that strongly matches or is potentially misaligned (high confidence)
  - `agreement {high, flagged, total}`: policy-analysis ratings of the cross-document target pairs served by contracts matching 3 or more documents
  - `faultline[] {contract, pairs: [a, b][]}`
  - `example`: id or null
- Produces (details, keyed by id): `{original, english, buyer, code, type, stage, start, end, url, reason, lots, strong [{target, text}], misaligned [{target, text, confidence, mechanism}]}`.
- Helpers tested: `dedupe(df) -> (df, records_dropped, value_dropped)`, `type_key(str) -> str`, `stage_key(str) -> str`, `valid_date(ts) -> str | None`.

- [ ] **Step 1: Write the failing tests**

```python
import pandas as pd
from build_contracts_layer import dedupe, stage_key, type_key, valid_date

def frame(rows):
    cols = ["id", "contract_code", "amount", "client_name", "supplier_name", "status_name", "contract_name"]
    return pd.DataFrame(rows, columns=cols)

def test_same_contract_twice_counts_once_keeping_the_advanced_stage():
    df = frame([
        ["1", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Шинэ", "x"],
        ["2", "ЭТТХК/202309500", 8.8e11, "ETT", "S1", "Гүйцэтгэгч рүү илгээсэн", "x"],
    ])
    out, n, v = dedupe(df)
    assert list(out.id) == ["2"] and n == 1 and v == 8.8e11

def test_framework_lots_with_different_suppliers_stay():
    df = frame([
        ["1", "БЕГ/202204150", 85868400.0, "School 1", "S1", "Шинэ", "food"],
        ["2", "БЕГ/202204150", 85868400.0, "School 1", "S2", "Шинэ", "food"],
    ])
    out, n, _ = dedupe(df)
    assert len(out) == 2 and n == 0

def test_trivial_codes_never_merge():
    df = frame([["1", "15", 1.0e6, "A", "S", "Шинэ", "x"], ["2", "15", 1.0e6, "A", "S", "Шинэ", "x"]])
    assert len(dedupe(df)[0]) == 2

def test_keys():
    assert type_key("Ажил") == "works" and type_key("Ерөнхий гэрээ") == "framework"
    assert stage_key("Гүйцэтгэгч рүү илгээсэн") == "sent" and stage_key("???") == "other"

def test_dates_outside_the_record_are_dropped():
    assert valid_date("2024-05-01 00:00:00") == "2024-05-01"
    assert valid_date("5377-01-01") is None
    assert valid_date(None) is None
```

- [ ] **Step 2:** Tests fail (ImportError).
- [ ] **Step 3: Implement the bake.**
  - Read `tenders.parquet`, `tender_purpose.parquet`, `full_classification.parquet` (primary per lens), `alignment_consolidated.parquet` and `mt_lookup.json` (plus `contract-titles.en.json` beside the output, if present).
  - Also read `python/data/mongolia-targets.json`, `python/output/mongolia/gpt-5-4/alignment.json` (policy analysis) and the targets' docs.
  - Keep tugrik rows only; drop rejected contracts. Report both counts.
  - Dedupe:
    - key `(code, amount, buyer, supplier)` for codes not matching `\d{0,3}`;
    - keep the most advanced stage: in progress, closed, sent, approved, new;
    - map dropped ids to the kept id, so their alignment rows join the kept contract.
  - Tier from purpose.
  - Place: `contract_places.place_of` for every contract on the page.
  - matches: `alignment == "high"`. misaligned: `alignment == "flagged" and confidence == "high"`.
  - Tender: `invitation_id`. Lots: contracts per tender in the deduped census.
  - The example:
    - principal tier, an English title, a single place that is not the capital;
    - the most documents served, then the largest value.
  - Write both files: `json.dumps(ensure_ascii=False, separators=(",", ":"))`, `gzip.compress(..., mtime=0)`, so the output is deterministic.
  - Print the page's figures: census; each tier's share; compared; matching contracts; targets covered and none; synergy count and value; fault-line count; potentially misaligned tenders, contracts and top document; placed share.
- [ ] **Step 4:** Tests pass; run the bake:
  `cd python && /Users/jonas/github/cpc-tracker/python/.venv/bin/python scripts/build_contracts_layer.py --mirror /Users/jonas/github/cpc-tracker/dev_data_scripts/nctp_mirror/data --country mongolia --model gpt-5-4`
  Expected (post-dedupe): about 75,400 contracts and ₮48.8 trillion; principal about 2,200 and ₮775 billion (1.6 per ₮100); significant about 2,600 and ₮1.46 trillion.
- [ ] **Step 5:** Commit script, test and both `.json.gz` files: `feat(contracts): bake the public contract record for the page, each contract counted once`.

### Task 3: Aimag outlines and English titles (Python)

**Files:**
- Create: `python/scripts/build_aimag_geometry.py`, `src/data/geo/mongolia-aimags.json`
- Create: `python/scripts/translate_contract_titles.py`, output `python/output/mongolia/gpt-5-4/contract-titles.en.json`

**Interfaces:**
- Geometry file: `{source, features: [{code, name, point: [lon, lat], rings: [[lon, lat][]]}]}`.
  - Natural Earth 1:10m admin-1 (public domain), `adm0_a3 == "MNG"`, 22 features.
  - Douglas-Peucker at 0.02°, coordinates rounded to 3 decimals.
  - `point` is the centroid of the largest outer ring, with overrides where a centroid falls inside another feature (Töv around Ulaanbaatar).
- Translation: `translate(originals: list[str]) -> dict[str, str]`.
  - `call_llm_batch` on the `tender_mt_v1` namespace with the August prompt, verbatim: `Translate the Mongolian public procurement contract title to concise English. Return ONLY the translation, no commentary.`
  - `temperature 0.0`, `max_tokens 200`.
  - `--sample 50` takes a seeded sample of the untranslated green titles. `--all` translates every untranslated title in the details file.

- [ ] **Step 1:** Geometry script: run it on the downloaded Natural Earth file and check 22 features, every point inside its own ring (ray casting, asserted in the script), and a file under 60 KB.
- [ ] **Step 2:** Translation script.
  - Run the 50-title sample with the main checkout's `.env` loaded (`set -a; . /Users/jonas/github/cpc-tracker/.env; set +a`) and `CPC_CACHE_DIR=/Users/jonas/github/cpc-tracker/python/output/.cache`. The 557 August translations are cache hits.
  - The sample costs cents. The full run waits for Jonas's go.
  - Re-run the bake so the payload carries the new titles.
- [ ] **Step 3:** Commit the scripts, the geometry, the sample titles and the re-baked files. Also commit the footprint ledger row if the run appended one. Message: `feat(contracts): aimag outlines (Natural Earth, public domain) and a first sample of English titles`.

### Task 4: Squares of money (TS lib)

**Files:**
- Create: `src/lib/brief/contracts/model.ts`, `money.ts`, `units.ts`
- Test: `src/lib/brief/contracts/units.test.ts`, `money.test.ts`, `model.test.ts`

**Interfaces:**
- `model.ts`:
  - `Tier`, `LensKey`, `LENS_KEYS`, `Contract`, `ContractYear`, `TierTotals`, `ContractsFile` (as in Task 2);
  - `parseContractsFile(raw: unknown): ContractsFile | null`;
  - `tierTotals(file, tier): TierTotals`;
  - `NO_PLACE = "none"`.
- `money.ts`:
  - `moneyParts(value): {amount: number; unit: "trillion"|"billion"|"million"|"none"}` (at most one decimal, none from 100 up);
  - `toUsd(value, rate)`;
  - `per100(share)`: one decimal.
- `units.ts`:
  - `UNIT = 5e9`;
  - `squaresFor(value, unit = UNIT)`: at least 1 when above 0;
  - `largestRemainder(values, total): number[]`;
  - `interface Slice {cell: string; main: string | null; parts: number}`;
  - `sliceSquares(items: {id; value; cell}[], count, cellOrder): Slice[]`.

- [ ] **Step 1: Failing tests**

```ts
describe("sliceSquares", () => {
  const items = [
    { id: "a", value: 12e9, cell: "2024" },
    { id: "b", value: 3e9, cell: "2024" },
    { id: "c", value: 1e9, cell: "2025" },
    { id: "d", value: 1e9, cell: "2025" },
    { id: "e", value: 3e9, cell: "2025" },
  ];
  it("accounts for every square and keeps each cell's squares together", () => {
    const s = sliceSquares(items, 4, ["2024", "2025"]);
    expect(s).toHaveLength(4);
    expect(s.map((x) => x.cell)).toEqual(["2024", "2024", "2024", "2025"]);
  });
  it("names the contract holding most of a square, from the square's own cell", () => {
    const s = sliceSquares(items, 4, ["2024", "2025"]);
    expect(s[0].main).toBe("a");
    expect(s[3].main).toBe("e");
    expect(s[3].parts).toBeGreaterThan(1);
  });
});
it("largestRemainder sums to the total", () => {
  expect(largestRemainder([1, 1, 1], 10)).toEqual([4, 3, 3]);
  expect(largestRemainder([0, 0], 5)).toEqual([0, 0]);
});
it("moneyParts", () => {
  expect(moneyParts(50.36e12)).toEqual({ amount: 50.4, unit: "trillion" });
  expect(moneyParts(801.7e9)).toEqual({ amount: 802, unit: "billion" });
  expect(moneyParts(24.83e9)).toEqual({ amount: 24.8, unit: "billion" });
});
```

- [ ] **Step 2:** Tests fail.
- [ ] **Step 3: Implement `sliceSquares`.**
  - Sort items by cell rank, then value descending, then id.
  - Square size = total / count.
  - Walk the items, assigning value to squares.
  - Each square's cell is the cell holding most of it. Its `main` is the largest share among that cell's items. `parts` is the number of items touched.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): cut the money into equal squares, each with its cell and contract`.

### Task 5: The findings (TS lib)

**Files:**
- Create: `src/lib/brief/contracts/areas.ts`, `places.ts`, `targets.ts`, `synergy.ts`, `misaligned.ts`, `test-fixture.ts`
- Test: one `*.test.ts` each

**Interfaces:**
- `areas.ts`:
  - `NO_AREA = "none"`;
  - `interface AreaRow {id; name; targets: string[]; principal: TierTotals; significant: TierTotals}`;
  - `areaRows(contracts, lens, categories: {id; name}[], primary: Record<string, string>, targetIds: string[]): AreaRow[]`: sorted by targets, then principal value; `NO_AREA` last when it has targets or money;
  - `areaFinding(rows, totalTargets, principalTotal): {gap: {row; targetShare; moneyShare} | null; top: {row; moneyShare; targetShare} | null}`, with `MIN_TARGET_SHARE = 0.1`, `MIN_GAP = 0.05`.
- `places.ts`:
  - `interface PlaceRow {id; principal; significant}`;
  - `placeRows(contracts): PlaceRow[]`: by principal value; `NO_PLACE` last, covering null and "several";
  - `placeFinding(rows, principalTotal): {first: {id; share}; second: {id; share} | null} | null`: never picks `NO_PLACE`.
- `targets.ts`:
  - `interface TargetStat {id; doc; matching; matchingTenders; value; misalignedTenders; budget: boolean; action: boolean}`;
  - `targetStats(contracts, targets: {id; doc}[], budget: Set<string>, action: Set<string>): TargetStat[]`;
  - `THIN_MAX = 4`;
  - `coverage(stats, docOrder): {docs: {doc; total; covered; none: TargetStat[]; thin: TargetStat[]}[]; covered; none; noneOfThree; total}`.
- `synergy.ts`:
  - `MIN_DOCS = 3`;
  - `synergy(contracts, docOf: Map<string, string>, docOrder: string[]): {distribution: number[]; rows: {contract; docs: string[]}[]; count; value}`: `distribution[k]` is the number of matching contracts serving k documents; rows sorted by documents served, then value.
- `misaligned.ts`:
  - `interface TenderGroup {tender; contracts: Contract[]; value; lead: Contract}`;
  - `misalignedRows(contracts, docOf): {rows: {target; doc; tenders: TenderGroup[]; matchingTenders}[]; tenders; contracts; topDoc: {doc; share} | null}`: sorted by tenders.

- [ ] **Step 1: Failing tests.** The fixture holds 12 contracts across 2 years, 3 documents (A, B, C) and 6 targets. It has one framework tender with 3 lots potentially misaligned with target C1, and one contract matching targets in all 3 documents.
  - The gap area is the one holding the most targets and the least money.
  - `NO_AREA` is last.
  - A target with no matching contract but `budget: true` has `budget` set and does not count in `noneOfThree`.
  - The 3 lots count as 1 tender.
  - The contract serving 3 documents is in `rows`, and `distribution[3] === 1`.
  - `placeFinding` never names `NO_PLACE`.
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3: Implement.**
  - Area money comes from green contracts only, by the contract's own primary area under the lens; the targets come from the lens's `primary`.
  - Shares use the principal total of all green contracts as denominator.
  - `topDoc` counts a tender toward a document when any of its contracts is potentially misaligned with a target of that document.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): the findings: policy areas, places, targets, synergies, potential misalignments`.

### Task 6: The field's layouts (TS lib)

**Files:**
- Create: `src/lib/brief/contracts/field.ts`, `geo.ts`
- Test: `field.test.ts`, `geo.test.ts`

**Interfaces:**
- `geo.ts`:
  - `interface GeoFeature {code; name; point: [number, number]; rings: [number, number][][]}`;
  - `interface GeoFile {source; features}`;
  - `fitProjection(geo, box: {x; y; w; h}): {x(lon); y(lat); path(f): string; point(f): [number, number]}`: equirectangular, x scaled by cos(mid-latitude), centred in the box.
- `field.ts`:
  - `type Stage = {kind: "record"} | {kind: "purpose"} | {kind: "areas"; lens: LensKey} | {kind: "places"}`;
  - `interface FieldModel {particles: ("principal"|"significant"|"rest")[]; yearOf: number[]}`, built once;
  - `buildField(file): FieldModel`: principal squares = `squaresFor(principal total)`, the same for significant, and each year's rest = its largest-remainder share of all squares minus its green ones;
  - `interface Placed {x; y; size; visible: boolean; slice: Slice | null}`;
  - `layoutField(model, file, stage, box: {w; h}, ctx: {rows?: AreaRow[]; geo?: GeoFile}): {squares: Placed[]; labels: FieldLabel[]; targets: {id; x; y; r}[]; outlines: {code; d}[] | null; pitch}`.
  - `FieldLabel = {key; x; y; align: "start"|"middle"|"end"; kind: "year"|"columnValue"|"columnShare"|"rowName"|"rowTargets"|"rowValue"|"place"|"noPlace"; values: Record<string, string|number>}`.
- Layouts:
  - **record / purpose:** one column per year, principal squares first from the bottom, then significant, then rest. The pitch is the largest one at which the tallest column fits, one column's block centred in its width.
  - **areas:** green squares sliced by area. Row name above the row; targets as circles left of a spine at 0.42 of the width; squares right of it in 3 rows, top to bottom then left to right. Rest squares are `visible: false`, in place.
  - **places:** green squares sliced by place. Each pile is a near-square block centred on the place's projected point; `NO_PLACE` is a wide block below the map. Rest squares are invisible.

- [ ] **Step 1: Failing tests** (fixture from Task 5, box 800×500):
  - The squares count is the same in every stage.
  - In record, every square is inside the box.
  - In purpose, a year's squares are ordered principal, significant, rest from the bottom.
  - In areas, every visible square is right of the spine, and every target circle is left of it.
  - In places, each pile's centre is within one pitch of its point.
  - `fitProjection` keeps every projected point inside the box.
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): lay the squares out by year, policy area and place`.

### Task 7: Server loading and the contract API

**Files:**
- Create: `src/lib/brief/contracts/load.ts` (server only), `src/lib/brief/contracts/setup.ts`, `src/app/api/brief/contracts/route.ts`
- Test: `load.test.ts`, `setup.test.ts`, `src/app/api/brief/contracts/route.test.ts`

**Interfaces:**
- `loadContracts(countryId): ContractsFile | null` and `loadContractRecord(countryId, id): ContractRecord | null`.
  - Both use `derivePaths(null, countryId)` for the output dir, read the `.json.gz` with `zlib.gunzipSync`, and cache per path and mtime.
- `contractsSetup({file, source, layers}): ContractsSetup`, where `ContractsSetup` is:
  - `{countryId; countryName; file; documents: BriefDocument[]; targets: {id; doc; label; text}[]; lenses: BriefLens[]`;
  - `budget: string[]; action: string[]}`: targets with a high link to a BER line, or to a BTR action.
- `GET /api/brief/contracts?country=&contract=`: 404 for an unknown country, a missing file or an unknown id. Otherwise the record, `Cache-Control: no-store`.

- [ ] **Step 1: Failing tests.**
  - `route.test.ts` mocks `load.ts`: an unknown country gives 404, an unknown id gives 404, a known id gives 200 with its `strong` list.
  - `setup.test.ts` uses a payload whose layers link target T1 at level 0 to a budget item: `budget` holds `["T1"]`.
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): load the record server side; one contract's record on request`.

### Task 8: The page and its overview

**Files:**
- Create:
  - `src/app/[locale]/[country]/brief/contracts/page.tsx`;
  - `src/lib/brief/contracts/geo-data.ts`: `GEO: Record<string, GeoFile>`, Mongolia only;
  - `src/components/brief/contracts/contracts-page.tsx`, `overview.tsx`, `money-field.tsx`, `set-line.tsx`, `money.tsx` (`useMoney()`: ₮ and US$ via next-intl);
  - `src/components/brief/contracts/contracts.css`.
- Modify: `messages/en.json`, `es.json`, `mn.json`: a `brief.contracts` block (es/mn in English).
- Test: `src/components/brief/contracts/overview.test.tsx`

**Interfaces:**
- `ContractsPage({setup, geo})` holds the lens, the panel trail and the picked target.
- `Overview({setup, geo, lens, onLens, onContract, onTarget})`.
  - Steps `record`, `purpose`, `areas`, `places` (no `places` without geometry).
  - An IntersectionObserver with the hub's `-45%` band picks the lead step.
- `MoneyField({model, file, stage, rows, geo, contracts, targetName, onContract, onTarget})`: canvas plus DOM labels.
  - Squares move over 950 ms (ease in-out). With reduced motion they jump.
  - Pointing at a square shows the contract behind it: English title, ₮, year, "and N more" when shared. Selecting it opens the contract.
  - Pointing at a target circle names the target.
- `SetLine({file, stage})`: the whole record as one bar, the two green slivers at their true width, with words that change from step 1 to step 2.
- Copy: step kickers, findings and second lines as in the spec; the lens switch; "See one contract in full ›".
  - Areas step: beside the finding, the largest 3 to 5 contracts of the area pointed at (else the finding's area), each an English title with ₮, selecting one opens it.
  - Source tag: "{name}, {first} to {month} {last} · contracted, not verified delivered".
  - Duplicates note: "Contracts listed twice in the record are counted once."

- [ ] **Step 1: Failing tests** (fixture):
  - Four steps render with their kickers, three without geometry.
  - The record finding names the census value and count.
  - The purpose finding reads "₮1.6 of every ₮100" for a 1.6% share.
  - The lens switch changes the areas finding.
  - "See one contract in full" calls `onContract` with the example's id.
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3: Implement.**
  - Page server: `getCountryDashboardPayload`, `buildBriefSource`, `buildExploreLayers`, `loadContracts`; 404 without a file.
  - Layout: the brief's `[data-brief] .brief-hub` grid with the canvas in `.brief-hub-stage`, reusing `cellRect` and `mixInk` from `hub-canvas.tsx`.
- [ ] **Step 4:** Tests pass. `curl -s -o /dev/null -w "%{http_code}" localhost:3102/mongolia/brief/contracts` returns 200; `/panama/brief/contracts` returns 404.
- [ ] **Step 5:** Commit own paths plus the synthetic message blobs: `feat(contracts): the public contracts page, its record narrowing to nature and climate, by area and place`.

### Task 9: A contract and a target, in panels

**Files:**
- Create: `src/components/brief/contracts/panels.tsx`
- Test: `panels.test.tsx`

**Interfaces:**
- `ContractsPanels({stack, setup, onPush, onBack, onClose})`, with `PanelState = {kind: "contract"; id} | {kind: "target"; id}`. Uses `DrawerShell` (`scrim="light"`).
- ContractPanel fetches `/api/brief/contracts`. It shows:
  - the English title (labelled machine translation) and the original;
  - ₮ and US$; year and dates; type; stage; place; buyer;
  - purpose tier; areas by lens;
  - its strongly matching targets and its potentially misaligned targets, each with the explanation's first sentence ("More" for the rest) and an "AI reading" tag;
  - "View on tender.gov.mn ↗".
- TargetPanel shows, from client data:
  - the target text (serif), its document;
  - the counts; its contracts by value (clicking one pushes the contract panel);
  - its potentially misaligned tenders;
  - its budget lines and reported actions (names from the explore layers);
  - "Explore this target" linking to `/{country}/brief/explore?focus=ID`.

- [ ] **Step 1: Failing tests.**
  - With fetch mocked, the contract panel shows the title, the original, the tender.gov.mn link and one strongly matching target.
  - The target panel lists its contracts, and clicking one calls `onPush({kind: "contract"})`.
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): one contract in full, one target with its contracts`.

### Task 10: The deep dives

**Files:**
- Create: `src/components/brief/contracts/targets-block.tsx`, `synergy-block.tsx`, `misaligned-block.tsx`
- Test: `blocks.test.tsx`

**Interfaces:**
- `TargetsBlock({setup, onTarget})` (step 5).
  - Finding and second line.
  - One row per document: colour square, name, coverage bar, "N of M".
  - Under each row, the targets with no matching contract, clamped to one line with "budget line" / "reported action" / "neither".
  - A disclosure for the targets with 1 to 4 contracts.
- `SynergyBlock({setup, onContract})` (step 6).
  - Finding.
  - The distribution as small labelled columns.
  - The list: title, ₮, year, 8 document squares, the first 8, then "Show more".
  - The agreement line.
  - A disclosure for the fault-line contracts.
- `MisalignedBlock({setup, onContract, onTarget})` (step 7).
  - Finding.
  - The compared line.
  - Rows as result bars: hatched red to the left for potentially misaligned tenders, green to the right for strongly matching tenders.
  - A row opens its tenders: title, ₮, year, lots, and "Full record" to the contract panel; "AI-identified, for review".

- [ ] **Step 1: Failing tests** (fixture):
  - The FSS-like document row lists its targets without contracts, with "neither".
  - The synergy list shows the 3-document contract with 3 filled squares.
  - The misaligned row counts the framework's 3 lots as 1 tender and shows "3 contracts" in its opened list.
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit `feat(contracts): the targets, what works well, where to look closer`.

### Task 11: Verify and hand over

- [ ] **Step 1:** Run the suite for `src/lib/brief/contracts src/components/brief/contracts src/app/api/brief/contracts`, then the full suite. Run `npx tsc --noEmit` and `npx eslint` on changed files.
  - If the parallel session's uncommitted edits break unrelated tests, verify in a scratch worktree at this branch's HEAD instead.
- [ ] **Step 2:** Start the dev server on a free port (3102 unless 3100 is already serving this worktree).
  - `/mongolia/brief/contracts` returns 200; `/panama/brief/contracts` returns 404; the API returns the example's record.
- [ ] **Step 3:** Add a round-1 section for the contracts page to `EXPERIMENT_HANDOFF.md` and update the memories (`nctp_data_source`, `explore_ring`). Commit own paths.
- [ ] **Step 4:** Report to Jonas:
  - the URL;
  - the figures after dedupe (for example "₮48.8 trillion in 75,442 contracts");
  - the 50 sample titles for his check;
  - what is not in this round.
