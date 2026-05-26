# v1 vs v2 alignment comparison — panama

- v1 baseline: `main:python/output/panama/alignment.json`
- v2 working tree: `python/output/panama/alignment.json`

### v1 distribution (n=44474)
  medium                     30338   68.2%
  low                         6967   15.7%
  high                        5815   13.1%
  none                         806    1.8%
  possible_misalignment        548    1.2%

### v2 distribution (n=44474)
  medium                     29393   66.1%
  high                        7832   17.6%
  low                         5622   12.6%
  flagged                      893    2.0%
  none                         734    1.7%

## Pair-level changes
- Flagged status flipped (v1 flagged ↔ v2 not, or vice versa): **551**
- Both flagged but mechanism reassigned: **17**
- Same status on both sides: **43906**

### Sample flipped pairs (first 20 of 551)

| targetA | targetB | v1 | v2 |
|---|---|---|---|
| panama_CNR_1 | panama_PEG_2 | medium | flagged (delivery_friction, manageable, conf:high) |
| panama_CNR_1 | panama_PIOTA_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_2 | panama_PEG_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_3 | panama_PEG_14 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_4 | panama_ENR_125 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_4 | panama_ENR_29 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_4 | panama_PEG_12 | possible_misalignment (implementation_tension) | medium |
| panama_CNR_4 | panama_PEG_5 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_5 | panama_PEG_14 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_5 | panama_PEG_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_5 | panama_PIOTA_6 | possible_misalignment (implementation_tension) | medium |
| panama_CNR_6 | panama_PEG_14 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_6 | panama_PEG_2 | medium | flagged (delivery_friction, manageable, conf:high) |
| panama_CNR_6 | panama_PEG_3 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_6 | panama_PIOTA_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_7 | panama_PEG_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| panama_CNR_7 | panama_PEG_3 | possible_misalignment (implementation_tension) | medium |
| panama_CNR_7 | panama_PIOTA_2 | low | flagged (delivery_friction, manageable, conf:medium) |
| panama_ENR_1 | panama_PEG_14 | possible_misalignment (implementation_tension) | medium |
| panama_ENR_1 | panama_PEG_2 | medium | flagged (resource_competition, manageable, conf:medium) |

### Mechanism reassignments (first 17 of 17)

| targetA | targetB | v1 (post-migration) | v2 |
|---|---|---|---|
| panama_CNR_4 | panama_PEG_14 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_ENR_12 | panama_NP_9 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_ENR_12 | panama_PIOTA_13 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_ENR_12 | panama_PNRF_6 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_ENR_14 | panama_PEG_3 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_ENR_187 | panama_PEG_14 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_ENR_33 | panama_PEG_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_HR_16 | panama_PEG_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_HR_3 | panama_PEG_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_HR_3 | panama_PIOTA_6 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_HR_3 | panama_PNSH_9 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_HR_8 | panama_PEG_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_NP_28 | panama_PEG_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_NP_9 | panama_PEG_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_NP_9 | panama_PNSH_9 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_PEG_14 | panama_PNRF_3 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| panama_PEG_3 | panama_PNRF_3 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |

