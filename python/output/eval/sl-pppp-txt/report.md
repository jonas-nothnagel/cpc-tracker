# Extraction eval report: `sl-pppp-txt`

- Generated: 2026-07-02T13:32:57+00:00  ·  git `af5e7ed`  ·  model `gpt-5.4` (concurrency 4)
- Prompt hash: `be58bec8117e` (changes when any extraction prompt changes and the LLM cache invalidates)
- Thresholds: similarity >= 0.6, quote-Jaccard >= 0.3, reachable >= 0.5

Gold is not exhaustive: `extraction matched` is a soft precision proxy, not a target to optimise.
`recall (reachable)` counts only gold targets whose curated quotes actually occur in the parsed local PDF.

## Headline (tier 1 = quote-anchored gold; tier 2 similarity-only, reported separately)

| doc | tier | gold | reachable | extracted | matched | recall (reachable) | recall (raw) | extraction matched | granularity | verbatim quotes found | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SL-PPPP-TXT | 1 | 4 | 2 | 4 | 4 | 100% | 100% | 100% | 1.0 | 4/4 | 0 |

## SL-PPPP-TXT (tier 1, PPPP, en)

Executive summary of the updated NPPP 2048, copy-pasted verbatim by the team on 2026-07-02 because the local PDF is a 2-page scan. Committed fixture, so this entry needs no OneDrive mount. The 4 expert component rows appear verbatim in this text.

- Parse: 1/None pages with text, 4,178 chars
- Extraction: 4 targets in 6.8s (fresh run); LLM calls 5 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 4, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 4 quotes
- textCleanup: {'verbatim': 4}; provenance flags: 0
- Length (chars) gold p10/median/p90: 283/330/330 vs extracted: 283/334/334

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| PPPP_1 `Conservation of the 'Critical' and the 'Unique'…` | `Conservation of the ‘Critical’ and the ‘Unique’…` | 1.0 | 1.0 | quote |
| PPPP_4 `Exploration of the 'Potentials' and the 'Enhanc…` | `Exploration of the ‘Potentials’ and the ‘Enhanc…` | 0.996 | 0.329 | text |
| PPPP_3 `Optimization of the 'Utility' of the 'Available…` | `Optimization of the ‘Utility’ of the ‘Available…` | 0.972 | 0.129 | text |
| PPPP_2 `Promotion of the 'Livability' for 'Human' and o…` | `Promotion of the ‘Livability’ for ‘Human’ and o…` | 0.821 | 0.19 | text |

### Unmatched gold

None.

### Unmatched extracted (gold may simply not cover these)

None.
