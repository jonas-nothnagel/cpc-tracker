# Public contracts: handover until the reviewer's feedback (2 October 2026)

Pick this up when the Mongolian-speaking reviewer returns the review sheet. Context in Claude's
memory (`nctp_data_source`, `contracts_page`) and in `EXPERIMENT_HANDOFF.md` (contracts sections).

## Where things stand

**Live on cpc-tracker.vercel.app** (old-origin/main `b7ec0c7`):
- the AI explanations in the agreed vocabulary;
- the record line without the delivery claim;
- "Contracts serving both targets" under a potentially misaligned pair, in the brief and the ring
  (122 pairs, August's data);
- the bake's opt-in `--later`.

**Committed, not pushed:**
- `d879182` and `9646ac2`: footprint rows;
- `9d0408f`: the three-answer re-check prompt.

None of them changes the page except the /sustainability total. Push with
`! git push old-origin <sha>:refs/heads/main` (pushes from Claude are refused).

**In the data only, not on the page** (mirror: `dev_data_scripts/nctp_mirror/data/`, gitignored, this
laptop):

| File | What |
|---|---|
| `contract_instrument.parquet` | kind of spending for all 77,101 records, from the title (prompt approved 30 Sep) |
| `contract_recheck.parquet` | v3 re-check of 30,317 strong pairs: delivers 27,522, different_means 2,728, cannot_tell 67 |
| `contract_recheck_v2.parquet` | the approved v2, never applied (too strict: 52% of removals said "the title does not state") |
| `probe_alignment.parquet`, `probe_alignment_unmatched.parquet` | later comparisons with August's prompts (code at `e464f9e^`) |

**The effect, if applied** (`review_2026-10/effect_v3.py`):
- targets with a strong match: 155 → 168 of 178;
- of the 23 "no match anywhere" targets, 17 matched;
- "both" pairs: 122 → 110;
- FSS 1.2 (children's food bill): 254 → 9;
- FSS 3.4 (fodder): 192 → 90, right, its kept matches are new hay fields;
- FSS 5.3 (raise meal allowances): 306 → 252, the main open question.

## What we wait for

`dev_data_scripts/nctp_mirror/review_sheet_2026-10-01.xlsx` (95 rows; the sample is in the `.parquet`
beside it), sent by Jonas. The Summary tab counts Yes/No/Unsure per group:
- A: kept nature matches;
- B: removed;
- C: cannot tell;
- D: new;
- E: "both";
- F: potentially misaligned.

## When it comes back

1. Read the Summary. Then read every "No" with its comment and sort the misses into patterns
   (instrument wrong, target misread, title ambiguous, document needed).
2. Decide per group, with Jonas:
   - **Good enough** (say 80%+ right in A, B, D, E): go to step 4 below.
   - **One group weak:** fix that class only. Either a new prompt version (verbatim to Jonas,
     new cache namespace, re-test on `review_2026-10/prompt_tests/`), or keep August's verdict for
     that class.
   - **FSS 5.3 meal allowances:** follow the reviewer's verdict on its rows.
3. Full comparison (plan step 3, ~US$130, ~6 kg CO2e), only with Jonas's go on the spend:
   - every target × its nearest never-compared contracts (`probe_development_side.py --targets …
     --name …`, which skips pairs any probe already judged);
   - a keyword net for roads, wells, power, urban and industrial parks against the nature targets
     (similarity alone ranks roads ~23,000th for "protected areas");
   - then `scripts/tag_contracts.py recheck` over the new strong pairs.
4. Put it on the page (plan step 5):
   - bake with `--later` plus a re-check filter (to build: strong = high and verdict delivers or
     cannot_tell);
   - English for the newly shown contracts (~874 titles):
     `scripts/translate_contracts.py --field title|buyer|reason --all`;
   - re-bake, tests, a scratch-worktree build, then Jonas pushes;
   - recheck `test_contract_wording.py` (every explanation in agreed words) and the "both" view.
5. Optional (plan step 6): read the documents only for contracts the page singles out. Contract PDFs
   are on an open host. Computing a document's address:
   - `user.tender.gov.mn/uploads/contract/[YYYY/MM/DD/]<uniqid>.pdf`;
   - the dated folder applies from Dec 2022;
   - the uniqid comes from the mirror's `file_url`.

   Rules: pages 1-2 suffice; 86% are scans; they carry names and bank accounts, so delete them
   after reading and keep facts only. Pilot facts and the extraction instructions are in
   `review_2026-10/pilot/`.

## Rules learned this round

- **Prompts:** every new or changed prompt is shown to Jonas verbatim before a full run; test on
  the known cases in `review_2026-10/prompt_tests/` first.
- **Comparability with August:** use August's code (`git archive e464f9e^ python/src`,
  `PROBE_SRC=…`). A prompt-hardening commit changed every decomposition after the August run.
- **Footprint:** every run appends a ledger row. A scratch harness that does not gets a batch in
  `scripts/backfill_unrecorded_runs.py`. Run it from the main checkout's `python/` with
  `uv run --no-sync --with tiktoken`.
- **Shell:** zsh treats `path` as `PATH`, so don't use it as a loop variable. Stage files with
  arrays (`MINE=(…); git add "${MINE[@]}"`) and check `git diff --cached --name-only` first.
- **Page wording:** "matching" or "delivers", never "funded"; potentially misaligned only at high
  confidence; contracts, BER and BTR never mixed per target.

Cost so far for this work: about 4.7 kg CO2e for the API runs since 29 September, all in the
ledger. The document pilot ran in Claude Code agents, which the ledger does not cover.
