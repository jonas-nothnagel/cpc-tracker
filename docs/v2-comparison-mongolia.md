# v1 vs v2 alignment comparison — mongolia

- v1 baseline: `main:python/output/mongolia/alignment.json`
- v2 working tree: `python/output/mongolia/alignment.json`

### v1 distribution (n=5332)
  medium                      3449   64.7%
  low                          682   12.8%
  high                         652   12.2%
  possible_misalignment        516    9.7%
  none                          30    0.6%
  possible_conflict              3    0.1%

### v2 distribution (n=5332)
  medium                      3219   60.4%
  flagged                      713   13.4%
  high                         702   13.2%
  low                          607   11.4%
  none                          91    1.7%

## Pair-level changes
- Flagged status flipped (v1 flagged ↔ v2 not, or vice versa): **314**
- Both flagged but mechanism reassigned: **147**
- Same status on both sides: **4871**

### Sample flipped pairs (first 20 of 314)

| targetA | targetB | v1 | v2 |
|---|---|---|---|
| FSS_1 | NAP_3 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NAP_6 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NAP_7 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NBSAP_1 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NBSAP_16 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NBSAP_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NBSAP_4 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NBSAP_7 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NBSAP_9 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NDC_1 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NDC_13 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NDC_2 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NDC_4 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | NDC_5 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | SECTORAL_1 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | SECTORAL_10 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | SECTORAL_11 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | SECTORAL_15 | medium | flagged (delivery_friction, manageable, conf:medium) |
| FSS_1 | SECTORAL_8 | medium | flagged (resource_competition, manageable, conf:medium) |
| FSS_11 | NBSAP_13 | medium | flagged (delivery_friction, manageable, conf:medium) |

### Mechanism reassignments (first 20 of 147)

| targetA | targetB | v1 (post-migration) | v2 |
|---|---|---|---|
| FSS_11 | NAP_4 | flagged (resource_competition, manageable, conf:medium) | flagged (delivery_friction, manageable, conf:low) |
| FSS_11 | NBSAP_17 | flagged (resource_competition, manageable, conf:medium) | flagged (delivery_friction, manageable, conf:medium) |
| FSS_13 | NAP_4 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NAP_7 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NBSAP_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NBSAP_3 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NBSAP_7 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NDC_1 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NDC_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NDC_22 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NDC_25 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | NDC_5 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | SECTORAL_10 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_13 | SECTORAL_11 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_15 | NAP_4 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_15 | NAP_7 | flagged (goal_conflict, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_15 | NBSAP_2 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_15 | NBSAP_3 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_15 | NBSAP_9 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |
| FSS_15 | NDC_1 | flagged (delivery_friction, manageable, conf:medium) | flagged (resource_competition, manageable, conf:medium) |

