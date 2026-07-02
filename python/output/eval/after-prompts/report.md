# Extraction eval report: `after-prompts`

- Generated: 2026-07-02T11:31:30+00:00  ·  git `356c77d`  ·  model `gpt-5.4` (concurrency 4)
- Prompt hash: `be58bec8117e` (changes when any extraction prompt changes and the LLM cache invalidates)
- Thresholds: similarity >= 0.6, quote-Jaccard >= 0.3, reachable >= 0.5

Gold is not exhaustive: `extraction matched` is a soft precision proxy, not a target to optimise.
`recall (reachable)` counts only gold targets whose curated quotes actually occur in the parsed local PDF.

## Headline (tier 1 = quote-anchored gold; tier 2 similarity-only, reported separately)

| doc | tier | gold | reachable | extracted | matched | recall (reachable) | recall (raw) | extraction matched | granularity | verbatim quotes found | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PNSH | 1 | 17 | 14 | 44 | 14 | 79% | 82% | 32% | 2.59 | 65/65 | 0 |
| NRVTS | 1 | 27 | 21 | 14 | 4 | 14% | 15% | 29% | 0.52 | 25/25 | 0 |
| ILDN | 1 | 8 | 8 | 9 | 0 | 0% | 0% | 0% | 1.12 | 9/9 | 0 |
| HR | 2 | 30 | 0 | 12 | 3 | n/a | 10% | 25% | 0.4 | 13/13 | 0 |

## Tier-3 fixtures (parse stats only)

- **NP**: 39/39 pages with text, 44,633 chars. Real-world partial-text-layer fixture (20/39 pages with <30 extractable chars). Excluded from recall; exercises the scanned-page detection. Gold recovery option: download the UNFCCC-published version referenced by the corpus sourceUrl and re-check reachability.

## PNSH (tier 1, PNSH, es)

Strongest gold doc: 16/17 quotes reachable; 170 pages of Spanish; gold contains CO transcription typos, so matching must stay fuzzy. Also the runtime stress case.

- Parse: 167/170 pages with text, 798,687 chars
- Extraction: 44 targets in 150.4s (fresh run); LLM calls 92 (69 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 60, 'normalized': 5, 'fuzzy': 0, 'not_found': 0} of 65 quotes
- textCleanup: {'cleaned': 29, 'synthesis': 3, 'verbatim': 12}; provenance flags: 0
- Length (chars) gold p10/median/p90: 402/640/1022 vs extracted: 24/63/134

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| panama_PNSH_1 `Universal access to quality water and sanitatio…` | `Universal access to quality water and sanitatio…` | 0.9 | 0.0 | text |
| panama_PNSH_2 `Improvements to the efficiency of drinking wate…` | `Improvements to water and sanitation systems` | 0.9 | 0.0 | text |
| panama_PNSH_5 `Planning for water and sanitation systems at th…` | `Planning for water and sanitation systems at th…` | 0.9 | 0.0 | text |
| panama_PNSH_7 `Management of water-resource availability. The …` | `Management of water resource availability.` | 0.9 | 0.0 | text |
| panama_PNSH_9 `Increased availability of freshwater. The actio…` | `Increase the availability of water resources.` | 0.9 | 0.0 | text |
| panama_PNSH_10 `Preventive management of water-related risks. C…` | `Preventive management of water-related risks.` | 0.9 | 0.027 | text |
| panama_PNSH_11 `Preventive risk management. The PNSH's objectiv…` | `Risk management` | 0.9 | 0.0 | text |
| panama_PNSH_12 `Risk monitoring and early warning. This line of…` | `Early warning monitoring` | 0.9 | 0.0 | text |
| panama_PNSH_4 `Increased sanitation services. The objective is…` | `Improvement of drinking water and sanitation se…` | 0.787 | 0.0 | text |
| panama_PNSH_6 `Water for inclusive socio-economic growth. Havi…` | `Water for inclusive socioeconomic growth.` | 0.72 | 0.0 | text |
| panama_PNSH_8 `Management of freshwater demand. This line of a…` | `Demand management of water resources` | 0.72 | 0.0 | text |
| panama_PNSH_16 `Institutional strengthening. The institutional …` | `Improved water governance.` | 0.72 | 0.0 | text |
| panama_PNSH_17 `Education and research on the sustainable use o…` | `Watershed restoration and conservation of water…` | 0.675 | 0.0 | text |
| panama_PNSH_14 `Water consensus-building. The objective is to h…` | `Support and strengthen the participation of loc…` | 0.619 | 0.0 | text |

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| panama_PNSH_3 `Increased coverage of drinking water services. This act…` | 0.675 | `Improvement of drinking water and sanitation se…` |
| panama_PNSH_13 `Water sustainability. Guaranteeing water sustainability…` | 0.573 | `Planning for water and sanitation systems at th…` |
| panama_PNSH_15 `Updating of regulations. This will focus on updating ce…` | 0.514 | `Management of water resource availability.` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Healthy river basins.` | 0.022 | panama_ENR_24 @ 0.077 |
| `Water sustainability.` | 0.053 | panama_ENR_22 @ 0.062 |
| `Achieve equitable access to adequate sanitation and hygiene services fo…` | 0.366 | panama_HR_26 @ 0.394 |
| `Improve water quality by reducing pollution, eliminating dumping and mi…` | 0.25 | panama_HR_7 @ 0.4 |
| `Substantially increase water-use efficiency across all sectors and ensu…` | 0.42 | panama_PEG_2 @ 0.48 |
| `Implement integrated water resources management at all levels, includin…` | 0.426 | panama_HR_22 @ 0.514 |
| `By 2020, protect and restore water-related ecosystems, including forest…` | 0.426 | panama_PEG_25 @ 0.521 |
| `Expand international cooperation and support to developing countries in…` | 0.332 | panama_ENR_92 @ 0.45 |
| `Achieve 100% sustained coverage with quality water and basic services` | 0.72 | panama_PNSH_1 @ 0.72 |
| `Guarantee water availability for inclusive socioeconomic growth in a ch…` | 0.655 | panama_PNSH_9 @ 0.655 |
| `Maintain the growing national water and sanitation infrastructure in fu…` | 0.655 | panama_PEG_2 @ 0.675 |
| `Evolve toward a culture of responsible and shared water use` | 0.45 | panama_HR_1 @ 0.54 |
| `Work together to achieve universal access and continuous and dignified …` | 0.45 | panama_HR_27 @ 0.45 |
| `Reduce the level of non-revenue water and increase metering coverage` | 0.525 | panama_PEG_11 @ 0.6 |
| `Protect, recover and conserve water sources to guarantee supply, taking…` | 0.54 | panama_PEG_25 @ 0.54 |
| `Develop water reserves to guarantee the continuity of the country's inc…` | 0.554 | panama_PNSH_9 @ 0.554 |
| `Restore the forest cover of river basins and contribute to revitalizing…` | 0.45 | panama_PEG_25 @ 0.585 |
| `Goal No. 1 Access universal to quality water and sanitation services.` | 0.75 | panama_PNSH_1 @ 0.75 |
| `Goal No. 4 Healthy river basins` | 0.022 | panama_HR_7 @ 0.45 |
| `Goal No. 5 Water sustainability` | 0.049 | panama_HR_12 @ 0.54 |
| `Main urban and rural population centers have quality water and sanitati…` | 0.573 | panama_PNSH_3 @ 0.573 |
| `The country has new multipurpose reservoirs to increase water security …` | 0.72 | panama_PNSH_9 @ 0.72 |
| `The country has information on water resources for knowledge and decisi…` | 0.66 | panama_PEG_2 @ 0.66 |
| `Efficient use of water resources in agriculture through supply systems …` | 0.514 | panama_PEG_3 @ 0.579 |
| `Improved capacity for prevention of and response to extreme water-relat…` | 0.623 | panama_HR_24 @ 0.623 |
| `Water quality in surface and groundwater sources.` | 0.514 | panama_PEG_2 @ 0.562 |
| `Establishment of micro- and macro-metering` | 0.75 | panama_PNSH_2 @ 0.75 |
| `Reduction of Unaccounted-for Water to 30%` | 0.643 | panama_HR_17 @ 0.643 |
| `Integrated watershed management` | 0.035 | panama_CNR_5 @ 0.9 |
| `Healthy watersheds` | 0.022 | panama_HR_22 @ 0.54 |

## NRVTS (tier 1, NRVTS, en)

21/27 gold quotes reachable; the gap is transcription drift from land_targets.xlsx, not extraction failure.

- Parse: 56/56 pages with text, 131,018 chars
- Extraction: 14 targets in 25.0s (fresh run); LLM calls 24 (21 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 25, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 25 quotes
- textCleanup: {'synthesis': 4, 'cleaned': 10}; provenance flags: 0
- Length (chars) gold p10/median/p90: 29/71/115 vs extracted: 51/98/137

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| NRVTS_1 `Reduce deforestation and forest degradation to …` | `Reduce deforestation and forest degradation to …` | 1.0 | 0.696 | text |
| NRVTS_10 `Promote sustainable grassland management and st…` | `Promote sustainable grassland management and st…` | 1.0 | 0.5 | text |
| NRVTS_17 `Increase agricultural yields by 2.5 t/ha per an…` | `Increase agricultural yields to 2.5 t/ha per an…` | 1.0 | 0.036 | text |
| NRVTS_23 `Ensure no net loss of wetlands by 2030 compared…` | `Ensure no net loss of wetlands by 2030 compared…` | 1.0 | 0.727 | text |

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| NRVTS_2 `Reforestation of land affected by forest fire, pest ins…` | 0.409 | `Reduce deforestation and forest degradation to …` |
| NRVTS_3 `Forest fire monitoring and prevention system` | 0.083 | `Reduce deforestation and forest degradation to …` |
| NRVTS_4 `Forest cleaning and weeding` | 0.091 | `Reduce deforestation and forest degradation to …` |
| NRVTS_5 `Promote urban greening` | 0.1 | `Promote sustainable grassland management and st…` |
| NRVTS_6 `Amend, if necessary newly develop standards and norms f…` | 0.059 | `Promote sustainable grassland management and st…` |
| NRVTS_7 `Establishing a gene bank for major wood species` | 0.045 | `Improve water availability for arable land to i…` |
| NRVTS_8 `Amend current forest sector policy to oblige forest use…` | 0.409 | `Expand special protected areas to reach 30% of …` |
| NRVTS_9 `Integrate greening programs into the urban development …` | 0.053 | `Expand special protected areas to reach 30% of …` |
| NRVTS_11 `Recover the traditional seasonal rotational pasture sys…` | 0.059 | `Expand special protected areas to reach 30% of …` |
| NRVTS_12 (unreachable) `Air seeding, sowing of perennial grasses in areas where…` | 0.3 | `Restore 30% of grassland currently transformed …` |
| NRVTS_13 (unreachable) `Developing a system for silvo-pastoral animal husbandry…` | 0.245 | `Regulate and manage animal numbers in alignment…` |
| NRVTS_14 `Integrate grassland planning into the regional land use…` | 0.091 | `Improve water availability for arable land to i…` |
| NRVTS_15 `Develop legal instruments and/or establish mechanism fo…` | 0.118 | `Promote sustainable grassland management and st…` |
| NRVTS_16 `Support researches towards development of adaptive silv…` | 0.043 | `Bring under protection about 60% of all headwat…` |
| NRVTS_18 (unreachable) `Developing agroforestry including shelter belt system d…` | 0.0 | `` |
| NRVTS_19 (unreachable) `Decrease in use of pesticides` | 0.087 | `Reduce deforestation and forest degradation to …` |
| NRVTS_20 `Erosion prevention in agriculture` | 0.091 | `Introduce no-till soil processing in arable lan…` |
| NRVTS_21 `Amend soil protection and desertification prevention la…` | 0.24 | `Reduce deforestation and forest degradation to …` |
| NRVTS_22 `Revise current norms and standards on use of pesticides…` | 0.3 | `Afforest 50% of forest transformed to grassland…` |
| NRVTS_24 `Expanding the national network of special protected are…` | 0.562 | `Expand special protected areas to reach 30% of …` |
| NRVTS_25 `Promote sustainable use of wetland ecosystems` | 0.167 | `Promote sustainable grassland management and st…` |
| NRVTS_26 (unreachable) `Develop the suitable system on payment for ecosystem se…` | 0.208 | `Reduce deforestation and forest degradation to …` |
| NRVTS_27 `Research and development of PES` | 0.143 | `Maintain the appropriate ratio between types of…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Expand special protected areas to reach 30% of the total area.` | 0.562 | NBSAP_3 @ 0.573 |
| `Bring under protection about 60% of all headwaters.` | 0.083 | FSS_15 @ 0.338 |
| `Introduce no-till soil processing in arable land.` | 0.095 | FSS_17 @ 0.338 |
| `Improve water availability for arable land to increase the irrigated ar…` | 0.18 | FSS_15 @ 0.54 |
| `Regulate and manage animal numbers in alignment with pasture carrying c…` | 0.245 | SECTORAL_5 @ 0.491 |
| `Maintain the appropriate ratio between types of animals and herd compos…` | 0.327 | NAP_3 @ 0.338 |
| `Afforest 50% of forest transformed to grassland, increase forested area…` | 0.338 | NBSAP_10 @ 0.491 |
| `Restore 30% of grassland currently transformed to other lands and impro…` | 0.3 | NAP_3 @ 0.338 |
| `Increase productivity of 1260.5 sq. km of agricultural land (cropland) …` | 0.327 | FSS_15 @ 0.405 |
| `Improve wetland productivity by 30% and restore 30% of wetland currentl…` | 0.327 | NBSAP_2 @ 0.36 |

## ILDN (tier 1, ILDN, en)

8/8 gold quotes reachable. The ILDN gold does NOT come from the LDN TSP Country Report.

- Parse: 19/20 pages with text, 47,067 chars
- Extraction: 9 targets in 22.3s (fresh run); LLM calls 14 (10 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 9, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 9 quotes
- textCleanup: {'cleaned': 9}; provenance flags: 0
- Length (chars) gold p10/median/p90: 67/196/314 vs extracted: 79/139/211

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| ILDN_1 `The objective of this project is to reduce negative imp…` | 0.346 | `Reduce GHG emissions from deforestation and for…` |
| ILDN_2 `Sustainable forest management in Mongolia's forest land…` | 0.315 | `Reduce rate of pasture degradation; regulate he…` |
| ILDN_3 `The project aims to catalyze the strategic expansion of…` | 0.281 | `A comprehensive plan for emission reductions in…` |
| ILDN_4 `LDN targets: setting targets and establishing the level…` | 0.087 | `A comprehensive plan for emission reductions in…` |
| ILDN_5 `Leverage and impact: catalyzing the multiple benefits t…` | 0.257 | `Make forests resilient to climate change by imp…` |
| ILDN_6 `Partnerships and resource mobilization: rationalizing e…` | 0.15 | `Reduce rate of pasture degradation; regulate he…` |
| ILDN_7 `Transformative action: designing and implementing bold …` | 0.071 | `Mongolia has committed to set a national volunt…` |
| ILDN_8 `Monitoring and reporting: tracking progress towards ach…` | 0.083 | `A comprehensive plan for emission reductions in…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Mongolia has committed to set a national voluntary LDN target, establis…` | 0.2 | FSS_31 @ 0.3 |
| `Reduce GHG emissions from deforestation and forest degradation by 2% by…` | 0.346 | NRVTS_1 @ 0.538 |
| `A comprehensive plan for emission reductions in the livestock sub-secto…` | 0.281 | NBSAP_11 @ 0.338 |
| `Make forests resilient to climate change by improving their productivit…` | 0.257 | NDC_1 @ 0.321 |
| `Forest area will be increased to 9% by 2030 through reforestation activ…` | 0.216 | NBSAP_10 @ 0.491 |
| `Reduce bare fallow to 30%; introduce crop rotation system with 3-4 rout…` | 0.155 | NAP_4 @ 0.386 |
| `Reduce rate of pasture degradation; regulate headcounts and types of an…` | 0.315 | NRVTS_10 @ 0.45 |
| `Enhance and improve early warning and prevention systems for natural di…` | 0.056 | NDC_9 @ 0.52 |
| `Combat desertification, restore degraded land and soil, including land …` | 0.225 | SECTORAL_12 @ 0.554 |

## HR (tier 2, HR, es)

Gold quotes are CO-composed (concatenated Excel action rows stamped textCleanup=verbatim by the ingest script); only ~13% of quote 4-grams appear contiguously in the PDF. Text-similarity matching only; never gates acceptance.

- Parse: 42/44 pages with text, 114,044 chars
- Extraction: 12 targets in 18.6s (fresh run); LLM calls 24 (22 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 13, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 13 quotes
- textCleanup: {'synthesis': 1, 'verbatim': 6, 'cleaned': 5}; provenance flags: 0
- Length (chars) gold p10/median/p90: 1343/2183/3396 vs extracted: 179/194/261

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| panama_HR_2 `Update the National Forest Restoration Program.…` | `Reorient management toward measurable results; …` | 0.675 | 0.0 | text |
| panama_HR_3 `Review and update the regulatory, normative, an…` | `Develop innovative financial instruments; stren…` | 0.66 | 0.0 | text |
| panama_HR_28 `Formalize the financial architecture of the Nat…` | `Deepen the financial analysis of the prioritize…` | 0.639 | 0.0 | text |

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| panama_HR_1 (unreachable) `Define a prioritized portfolio of policies and measures…` | 0.573 | `Reorient management toward measurable results; …` |
| panama_HR_4 (unreachable) `Update and validate a national list of priority native …` | 0.45 | `Reorient management toward measurable results; …` |
| panama_HR_5 (unreachable) `Identify and prioritize at least five regions of the co…` | 0.54 | `Reorient management toward measurable results; …` |
| panama_HR_6 (unreachable) `Identify and prioritize, at the national level, the mai…` | 0.471 | `Promote the adoption of emerging technologies (…` |
| panama_HR_7 (unreachable) `By 2035, Panama will reduce pollution and its cumulativ…` | 0.42 | `Develop innovative financial instruments; stren…` |
| panama_HR_8 (unreachable) `Define technical, social, and territorial criteria for …` | 0.54 | `Reorient management toward measurable results; …` |
| panama_HR_9 (unreachable) `Carry out a comparative legal analysis on frameworks fo…` | 0.489 | `Deepen the financial analysis of the prioritize…` |
| panama_HR_10 (unreachable) `Identify and prioritize productive sectors and consumpt…` | 0.54 | `Develop innovative financial instruments; stren…` |
| panama_HR_11 (unreachable) `Design and validate a standardized national methodology…` | 0.413 | `The PNTC will operate as the axis for integrati…` |
| panama_HR_12 (unreachable) `By 2035, Panama will have reduced mismanaged plastic po…` | 0.566 | `Deepen the financial analysis of the prioritize…` |
| panama_HR_13 (unreachable) `Carry out an exhaustive mapping of competencies, curren…` | 0.45 | `Reorient management toward measurable results; …` |
| panama_HR_14 (unreachable) `Exhaustively review the analysis of incentives and subs…` | 0.465 | `Deepen the financial analysis of the prioritize…` |
| panama_HR_15 (unreachable) `Delimit and prioritize critical territories of illegal …` | 0.63 | `Reorient management toward measurable results; …` |
| panama_HR_16 (unreachable) `Build and adopt a national operational definition of "o…` | 0.585 | `Reorient management toward measurable results; …` |
| panama_HR_17 (unreachable) `Define technical and climate criteria for the selection…` | 0.429 | `Promote the adoption of emerging technologies (…` |
| panama_HR_18 (unreachable) `Build a national baseline of urban green and blue space…` | 0.491 | `Reorient management toward measurable results; …` |
| panama_HR_19 (unreachable) `Define the national framework of Multi-hazard Early War…` | 0.386 | `Promote the adoption of emerging technologies (…` |
| panama_HR_20 (unreachable) `Finalize the Adaptation Plan for the Energy Sector and …` | 0.386 | `Promote the adoption of emerging technologies (…` |
| panama_HR_21 (unreachable) `Formalize the operational mandate of OSIGA (Integrated …` | 0.495 | `Reorient management toward measurable results; …` |
| panama_HR_22 (unreachable) `Define a standardized methodology for Local and Regiona…` | 0.45 | `The PNTC will operate as the axis for integrati…` |
| panama_HR_23 (unreachable) `Publication of the Marine-Coastal Adaptation Plan. Arti…` | 0.334 | `Deepen the financial analysis of the prioritize…` |
| panama_HR_24 (unreachable) `Finalize the National Adaptation Plan for the Health Se…` | 0.525 | `The PNTC will operate as the axis for integrati…` |
| panama_HR_25 (unreachable) `Formalize institutional agreements on data flow per ind…` | 0.415 | `Develop a unified national MRV system, supporte…` |
| panama_HR_26 (unreachable) `Formally constitute the National Integrated Marine-Coas…` | 0.495 | `Reorient management toward measurable results; …` |
| panama_HR_27 (unreachable) `Regulate and operationalize the Climate Risk Observator…` | 0.585 | `Reorient management toward measurable results; …` |
| panama_HR_29 (unreachable) `Harmonize the national Roadmap for the implementation o…` | 0.45 | `Reorient management toward measurable results; …` |
| panama_HR_30 (unreachable) `Finalize the process of technical, inter-institutional,…` | 0.525 | `The PNTC will operate as the axis for integrati…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Reduce its greenhouse gas emissions by 11% by 2035 relative to the refe…` | 0.386 | panama_ENR_27 @ 0.485 |
| `Implement permanent training and certification programs; promote techni…` | 0.45 | panama_PEG_3 @ 0.5 |
| `Harmonize and update normative frameworks under a common vision, integr…` | 0.495 | panama_HR_28 @ 0.495 |
| `Develop a unified national MRV system, supported by the PNTC, that cent…` | 0.485 | panama_HR_16 @ 0.485 |
| `Promote the adoption of emerging technologies (remote sensing, artifici…` | 0.514 | panama_HR_27 @ 0.514 |
| `Strengthen participatory governance; establish conservation agreements …` | 0.532 | panama_ENR_77 @ 0.54 |
| `Integrate the Nature Pledge into Panama’s regular national and internat…` | 0.576 | panama_HR_28 @ 0.576 |
| `Consolidate nationally the information generated through the Roadmap’s …` | 0.428 | panama_HR_3 @ 0.428 |
| `The PNTC will operate as the axis for integrating follow-up, monitoring…` | 0.638 | panama_HR_28 @ 0.638 |

## Comparison: `baseline-480a040` → `after-prompts`

Prompt hash: `e1e21e5b9f2d` → `be58bec8117e`  (prompts CHANGED, fresh LLM run)

| doc | recall (reachable) | recall (raw) | extraction matched | granularity | quotes found | flags |
|---|---|---|---|---|---|---|
| PNSH | 0% → 79% | 0% → 82% | n/a → 32% | 0% → 259% | 0 → 65 | 0 → 0 |
| NRVTS | 14% → 14% | 15% → 15% | 36% → 29% | 41% → 52% | 17 → 25 | 0 → 0 |
| ILDN | 0% → 0% | 0% → 0% | 0% → 0% | 125% → 112% | 11 → 9 | 0 → 0 |
| HR | None | 33% → 10% | 59% → 25% | 57% → 40% | 22 → 13 | 0 → 0 |
