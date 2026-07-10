# Extraction eval report: `post-nwrp-fixes`

- Generated: 2026-07-10T10:54:22+00:00  ·  git `bd845e7`  ·  model `gpt-5.4` (concurrency 4)
- Prompt hash: `bdede67a8108` (changes when any extraction prompt changes and the LLM cache invalidates)
- Thresholds: similarity >= 0.6, quote-Jaccard >= 0.3, reachable >= 0.5

Gold is not exhaustive: `extraction matched` is a soft precision proxy, not a target to optimise.
`recall (reachable)` counts only gold targets whose curated quotes actually occur in the parsed local PDF.

## Headline (tier 1 = quote-anchored gold; tier 2 similarity-only, reported separately)

| doc | tier | gold | reachable | extracted | matched | recall (reachable) | recall (raw) | extraction matched | granularity | verbatim quotes found | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PNSH | 1 | 17 | 14 | 62 | 16 | 93% | 94% | 26% | 3.65 | 94/94 | 0 |
| NRVTS | 1 | 27 | 21 | 10 | 4 | 14% | 15% | 40% | 0.37 | 30/30 | 0 |
| ILDN | 1 | 8 | 8 | 13 | 3 | 38% | 38% | 23% | 1.62 | 14/14 | 0 |
| HR | 2 | 30 | 0 | 22 | 14 | n/a | 47% | 64% | 0.73 | 26/26 | 0 |
| SL-PPPP | 1 | 4 | 0 | 0 | 0 | n/a | 0% | n/a | 0.0 | 0/0 | 0 |
| SL-PPPP-TXT | 1 | 4 | 2 | 6 | 4 | 100% | 100% | 67% | 1.5 | 6/6 | 0 |
| SL-NAP | 1 | 192 | 188 | 27 | 27 | 12% | 14% | 100% | 0.14 | 41/41 | 0 |
| SL-NWRP | 1 | 33 | 33 | 60 | 17 | 52% | 52% | 28% | 1.82 | 68/68 | 0 |

## Tier-3 fixtures (parse stats only)

- **NP**: 39/39 pages with text, 44,633 chars. Real-world partial-text-layer fixture (20/39 pages with <30 extractable chars). Excluded from recall; exercises the scanned-page detection. Gold recovery option: download the UNFCCC-published version referenced by the corpus sourceUrl and re-check reachability.

## PNSH (tier 1, PNSH, es)

Strongest gold doc: 16/17 quotes reachable; 170 pages of Spanish; gold contains CO transcription typos, so matching must stay fuzzy. Also the runtime stress case.

- Parse: 167/170 pages with text, 798,687 chars
- Extraction: 62 targets in 252.0s (fresh run); LLM calls 110 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 91, 'normalized': 3, 'fuzzy': 0, 'not_found': 0} of 94 quotes
- textCleanup: {'cleaned': 43, 'verbatim': 16, 'synthesis': 3}; provenance flags: 0
- Length (chars) gold p10/median/p90: 402/640/1022 vs extracted: 24/48/121

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| panama_PNSH_2 `Improvements to the efficiency of drinking wate…` | `Improvements to the efficiency of drinking wate…` | 0.9 | 0.038 | text |
| panama_PNSH_3 `Increased coverage of drinking water services. …` | `Increase in the coverage of drinking water serv…` | 0.9 | 0.015 | text |
| panama_PNSH_4 `Increased sanitation services. The objective is…` | `Increase in sanitation services` | 0.9 | 0.0 | text |
| panama_PNSH_5 `Planning for water and sanitation systems at th…` | `Planning for water and sanitation systems at th…` | 0.9 | 0.056 | text |
| panama_PNSH_7 `Management of water-resource availability. The …` | `Management of water resource availability` | 0.9 | 0.0 | text |
| panama_PNSH_8 `Management of freshwater demand. This line of a…` | `Management of freshwater demand` | 0.9 | 0.0 | text |
| panama_PNSH_9 `Increased availability of freshwater. The actio…` | `Increase the availability of the water resource.` | 0.9 | 0.0 | text |
| panama_PNSH_11 `Preventive risk management. The PNSH's objectiv…` | `Risk management` | 0.9 | 0.0 | text |
| panama_PNSH_12 `Risk monitoring and early warning. This line of…` | `Early warning monitoring` | 0.9 | 0.0 | text |
| panama_PNSH_14 `Water consensus-building. The objective is to h…` | `Water dialogue` | 0.9 | 0.0 | text |
| panama_PNSH_15 `Updating of regulations. This will focus on upd…` | `Updating regulations` | 0.9 | 0.0 | text |
| panama_PNSH_17 `Education and research on the sustainable use o…` | `Education and research on the sustainable use o…` | 0.9 | 0.022 | text |
| panama_PNSH_16 `Institutional strengthening. The institutional …` | `Demand management of the water resource` | 0.75 | 0.0 | text |
| panama_PNSH_10 `Preventive management of water-related risks. C…` | `Meta 3: Preventive management of water-related …` | 0.736 | 0.027 | text |
| panama_PNSH_1 `Universal access to quality water and sanitatio…` | `Achieve 100% sustained coverage with quality wa…` | 0.72 | 0.0 | text |
| panama_PNSH_6 `Water for inclusive socio-economic growth. Havi…` | `The country has information on water resources …` | 0.66 | 0.0 | text |

### Unmatched gold

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| panama_PNSH_13 `Water sustainability. Guaranteeing water sustainability…` | 0.6 | 0.562 | `Demand management of the water resource` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Evolve toward a culture of responsible and shared water use` | 0.491 | panama_HR_1 @ 0.54 |
| `Promote a culture of efficient, responsible, and shared water use, and …` | 0.45 | panama_PEG_16 @ 0.491 |
| `Meta 2: Water for inclusive socioeconomic growth` | 0.514 | panama_CNR_2 @ 0.514 |
| `Healthy river basins.` | 0.022 | panama_ENR_24 @ 0.077 |
| `Water sustainability.` | 0.053 | panama_ENR_22 @ 0.062 |
| `Achieve equitable access to adequate sanitation and hygiene services fo…` | 0.366 | panama_HR_26 @ 0.394 |
| `Improve water quality by reducing pollution, eliminating dumping and mi…` | 0.25 | panama_HR_7 @ 0.4 |
| `Reduction of pollution` | 0.675 | panama_HR_7 @ 0.9 |
| `Substantially increase water-use efficiency across all sectors and ensu…` | 0.42 | panama_PEG_2 @ 0.48 |
| `Implement integrated water resources management at all levels, includin…` | 0.426 | panama_HR_22 @ 0.514 |
| `By 2020, protect and restore water-related ecosystems, including forest…` | 0.426 | panama_PEG_25 @ 0.521 |
| `Expand international cooperation and support to developing countries fo…` | 0.332 | panama_ENR_92 @ 0.45 |
| `Support and strengthen the participation of local communities in improv…` | 0.619 | panama_HR_28 @ 0.731 |
| `Restore and keep healthy the country's 52 river basins` | 0.45 | panama_PEG_29 @ 0.63 |
| `Guarantee water availability for inclusive socioeconomic growth in a ch…` | 0.655 | panama_PNSH_9 @ 0.655 |
| `Keep the growing national water and sanitation infrastructure in functi…` | 0.6 | panama_PEG_2 @ 0.675 |
| `Work together to achieve universal access and continuous and dignified …` | 0.45 | panama_HR_27 @ 0.45 |
| `Reduce the level of non-revenue water and increase micro-metering cover…` | 0.525 | panama_PEG_11 @ 0.6 |
| `Protect, restore, and conserve water sources to guarantee supply, takin…` | 0.54 | panama_PEG_25 @ 0.54 |
| `Develop water reserves to guarantee the continuity of the country's inc…` | 0.554 | panama_PNSH_9 @ 0.554 |
| `Meta 4: Healthy river basins` | 0.022 | panama_HR_22 @ 0.54 |
| `Integrated watershed management` | 0.035 | panama_CNR_5 @ 0.9 |
| `Watershed restoration and conservation of the water resource` | 0.675 | panama_PEG_25 @ 0.9 |
| `Strengthening monitoring of water quality` | 0.72 | panama_PEG_2 @ 0.9 |
| `Interinstitutional strengthening` | 0.018 | panama_NP_18 @ 0.04 |
| `By 2020, cover the supply of drinking water for 98% of the population i…` | 0.9 | panama_PNSH_3 @ 0.9 |
| `Increase in freshwater availability` | 0.9 | panama_PNSH_9 @ 0.9 |
| `Establishment of multipurpose reservoirs` | 0.9 | panama_PNSH_9 @ 0.9 |
| `Water harvesting projects` | 0.9 | panama_PNSH_9 @ 0.9 |
| `Integrated river basin management` | 0.034 | panama_HR_7 @ 0.9 |
| `Strengthening water quality monitoring` | 0.675 | panama_PEG_2 @ 0.9 |
| `Water dialogue and consensus-building` | 0.9 | panama_PNSH_14 @ 0.9 |
| `Institutional strengthening` | 0.036 | panama_ENR_111 @ 0.077 |
| `Major urban and rural population centers have quality water and sanitat…` | 0.573 | panama_PNSH_3 @ 0.573 |
| `Efficient use of water resources in agriculture through supply systems …` | 0.514 | panama_PEG_3 @ 0.579 |
| `Improved capacity for prevention and response to extreme events related…` | 0.623 | panama_HR_24 @ 0.623 |
| `Water quality in surface and groundwater sources` | 0.514 | panama_PEG_2 @ 0.562 |
| `Improved water governance` | 0.72 | panama_PNSH_16 @ 0.72 |
| `Establishment of micro- and macro-metering` | 0.75 | panama_PNSH_2 @ 0.75 |
| `Reduce Non-Revenue Water to 30%` | 0.45 | panama_HR_7 @ 0.514 |
| `Construction of aqueducts, transmission lines, and supply systems` | 0.9 | panama_PNSH_3 @ 0.9 |
| `Treatment plants and sewerage` | 0.9 | panama_PNSH_4 @ 0.9 |
| `Water and sanitation studies` | 0.9 | panama_PNSH_5 @ 0.9 |
| `Design and construction of collectors` | 0.54 | panama_PEG_14 @ 0.72 |
| `Water and sanitation plans` | 0.9 | panama_PIOTA_3 @ 0.9 |
| `Education and research program for the sustainable use of water resourc…` | 0.818 | panama_PNSH_17 @ 0.818 |

## NRVTS (tier 1, NRVTS, en)

21/27 gold quotes reachable; the gap is transcription drift from land_targets.xlsx, not extraction failure.

- Parse: 56/56 pages with text, 131,018 chars
- Extraction: 10 targets in 36.9s (fresh run); LLM calls 20 (7 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 30, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 30 quotes
- textCleanup: {'cleaned': 6, 'verbatim': 3, 'synthesis': 1}; provenance flags: 0
- Length (chars) gold p10/median/p90: 29/71/115 vs extracted: 49/94/148

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| NRVTS_1 `Reduce deforestation and forest degradation to …` | `Target 1: Reduce deforestation and forest degra…` | 0.961 | 0.696 | text |
| NRVTS_17 `Increase agricultural yields by 2.5 t/ha per an…` | `Target 3: Increase agricultural yields by 2.5 t…` | 0.946 | 0.036 | text |
| NRVTS_10 `Promote sustainable grassland management and st…` | `Target 2: Promote sustainable grassland managem…` | 0.946 | 0.5 | text |
| NRVTS_23 `Ensure no net loss of wetlands by 2030 compared…` | `Target 4: Ensure no net loss of wetlands by 203…` | 0.919 | 0.727 | text |

### Unmatched gold (1 of these captured at activity level)

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| NRVTS_2 `Reforestation of land affected by forest fire, pest ins…` | 0.409 | 0.245 | `Target 1: Reduce deforestation and forest degra…` |
| NRVTS_3 `Forest fire monitoring and prevention system` | 0.077 | 0.1 | `Target 1: Reduce deforestation and forest degra…` |
| NRVTS_4 `Forest cleaning and weeding` | 0.083 | 0.111 | `Target 1: Reduce deforestation and forest degra…` |
| NRVTS_5 `Promote urban greening` | 0.083 | 0.071 | `Target 2: Promote sustainable grassland managem…` |
| NRVTS_6 `Amend, if necessary newly develop standards and norms f…` | 0.1 | 0.04 | `Support green development and enhance the livin…` |
| NRVTS_7 `Establishing a gene bank for major wood species` | 0.045 | 0.0 | `improve water availability for arable land to i…` |
| NRVTS_8 `Amend current forest sector policy to oblige forest use…` | 0.409 | 0.386 | `expand special protected areas to reach 30% of …` |
| NRVTS_9 `Integrate greening programs into the urban development …` | 0.105 | 0.071 | `Support green development and enhance the livin…` |
| NRVTS_11 `Recover the traditional seasonal rotational pasture sys…` | 0.067 | 0.083 | `bring under the protection about 60% of all hea…` |
| NRVTS_12 (unreachable) `Air seeding, sowing of perennial grasses in areas where…` | 0.225 | 0.118 | `Reducing forest degradation: Afforestation of 5…` |
| NRVTS_13 (unreachable) `Developing a system for silvo-pastoral animal husbandry…` | 0.208 | 0.118 | `Target 1: Reduce deforestation and forest degra…` |
| NRVTS_14 `Integrate grassland planning into the regional land use…` | 0.091 | 0.067 | `improve water availability for arable land to i…` |
| NRVTS_15 `Develop legal instruments and/or establish mechanism fo…` | 0.105 | 0.038 | `Target 2: Promote sustainable grassland managem…` |
| NRVTS_16 `Support researches towards development of adaptive silv…` | 0.225 | 0.048 | `Support green development and enhance the livin…` |
| NRVTS_18 (unreachable) `Developing agroforestry including shelter belt system d…` | 0.056 | **0.992** | `Support green development and enhance the livin…` |
| NRVTS_19 (unreachable) `Decrease in use of pesticides` | 0.083 | 0.091 | `introduce no-till soil processing in arable lan…` |
| NRVTS_20 `Erosion prevention in agriculture` | 0.091 | 0.067 | `introduce no-till soil processing in arable lan…` |
| NRVTS_21 `Amend soil protection and desertification prevention la…` | 0.24 | 0.069 | `Target 1: Reduce deforestation and forest degra…` |
| NRVTS_22 `Revise current norms and standards on use of pesticides…` | 0.3 | 0.077 | `Reducing forest degradation: Afforestation of 5…` |
| NRVTS_24 `Expanding the national network of special protected are…` | 0.562 | 0.071 | `expand special protected areas to reach 30% of …` |
| NRVTS_25 `Promote sustainable use of wetland ecosystems` | 0.143 | 0.083 | `Target 2: Promote sustainable grassland managem…` |
| NRVTS_26 (unreachable) `Develop the suitable system on payment for ecosystem se…` | 0.208 | 0.074 | `Target 1: Reduce deforestation and forest degra…` |
| NRVTS_27 `Research and development of PES` | 0.54 | 0.1 | `Support green development and enhance the livin…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `expand special protected areas to reach 30% of the total area;` | 0.562 | NBSAP_3 @ 0.573 |
| `bring under the protection about 60% of all headwaters;` | 0.133 | FSS_15 @ 0.4 |
| `introduce no-till soil processing in arable land;` | 0.095 | FSS_17 @ 0.338 |
| `improve water availability for arable land to increase the irrigated ar…` | 0.18 | FSS_15 @ 0.54 |
| `Support green development and enhance the living standards of herders a…` | 0.54 | NRVTS_27 @ 0.54 |
| `Reducing forest degradation: Afforestation of 50% of forest transformed…` | 0.45 | NBSAP_10 @ 0.491 |

## ILDN (tier 1, ILDN, en)

8/8 gold quotes reachable. The ILDN gold does NOT come from the LDN TSP Country Report.

- Parse: 19/20 pages with text, 47,067 chars
- Extraction: 13 targets in 99.2s (fresh run); LLM calls 18 (1 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 14, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 14 quotes
- textCleanup: {'synthesis': 1, 'cleaned': 12}; provenance flags: 0
- Length (chars) gold p10/median/p90: 67/196/314 vs extracted: 107/182/257

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| ILDN_3 `The project aims to catalyze the strategic expa…` | `Catalyze the strategic expansion of Mongolia's …` | 0.965 | 0.846 | text |
| ILDN_1 `The objective of this project is to reduce nega…` | `Reduce negative impacts of mining on rangelands…` | 0.9 | 0.577 | text |
| ILDN_2 `Sustainable forest management in Mongolia's for…` | `Sustainable forest management in Mongolia's for…` | 0.9 | 0.444 | text |

### Unmatched gold (5 of these captured at activity level)

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| ILDN_4 `LDN targets: setting targets and establishing the level…` | 0.4 | **1.0** | `Reduce negative impacts of mining on rangelands…` |
| ILDN_5 `Leverage and impact: catalyzing the multiple benefits t…` | 0.35 | **1.0** | `Sustainable forest management in Mongolia's for…` |
| ILDN_6 `Partnerships and resource mobilization: rationalizing e…` | 0.15 | **1.0** | `Livestock: Reduce rate of pasture degradation; …` |
| ILDN_7 `Transformative action: designing and implementing bold …` | 0.225 | **1.0** | `Sustainable forest management in Mongolia's for…` |
| ILDN_8 `Monitoring and reporting: tracking progress towards ach…` | 0.08 | **1.0** | `Agriculture: A comprehensive plan for emission …` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Mongolia has committed to set a national voluntary LDN target, establis…` | 0.2 | FSS_31 @ 0.3 |
| `Agriculture, Forestry and Other Land Uses (AFOLU) targets: Reduce GHG e…` | 0.27 | NAP_4 @ 0.514 |
| `Agriculture: A comprehensive plan for emission reductions in the livest…` | 0.265 | FSS_13 @ 0.371 |
| `Sustainable Forest Management: To make forests resilient to climate cha…` | 0.371 | NAP_7 @ 0.508 |
| `Reforestation: Forest area will be increased to 9% by 2030 through refo…` | 0.216 | NBSAP_10 @ 0.491 |
| `Land and Soil Management: To reduce bare fallow to 30% ; To introduce c…` | 0.203 | NAP_4 @ 0.514 |
| `Livestock: Reduce rate of pasture degradation; Regulate headcounts and …` | 0.3 | NRVTS_10 @ 0.45 |
| `Disaster Risk Management: To enhance and improve early warning and prev…` | 0.257 | NDC_9 @ 0.483 |
| `combat desertification, restore degraded land and soil, including land …` | 0.225 | SECTORAL_12 @ 0.554 |
| `the restoration of 0.6 million hectares of degraded land under the Bonn…` | 0.3 | FSS_15 @ 0.45 |

## HR (tier 2, HR, es)

Gold quotes are CO-composed (concatenated Excel action rows stamped textCleanup=verbatim by the ingest script); only ~13% of quote 4-grams appear contiguously in the PDF. Text-similarity matching only; never gates acceptance.

- Parse: 42/44 pages with text, 114,044 chars
- Extraction: 22 targets in 64.1s (fresh run); LLM calls 34 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 25, 'normalized': 1, 'fuzzy': 0, 'not_found': 0} of 26 quotes
- textCleanup: {'synthesis': 2, 'verbatim': 9, 'cleaned': 11}; provenance flags: 0
- Length (chars) gold p10/median/p90: 1343/2183/3396 vs extracted: 34/72/190

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| panama_HR_4 `Update and validate a national list of priority…` | `Strengthening of SINAP` | 0.9 | 0.0 | text |
| panama_HR_9 `Carry out a comparative legal analysis on frame…` | `Information on genetic resources, benefit-shari…` | 0.9 | 0.0 | text |
| panama_HR_19 `Define the national framework of Multi-hazard E…` | `Multi-hazard Early Warning Systems` | 0.9 | 0.0 | text |
| panama_HR_21 `Formalize the operational mandate of OSIGA (Int…` | `Local and regional adaptation plans` | 0.9 | 0.0 | text |
| panama_HR_23 `Publication of the Marine-Coastal Adaptation Pl…` | `Implementation of the marine-coastal adaptation…` | 0.9 | 0.0 | text |
| panama_HR_25 `Formalize institutional agreements on data flow…` | `National Adaptation and Loss and Damage Monitor…` | 0.9 | 0.0 | text |
| panama_HR_26 `Formally constitute the National Integrated Mar…` | `Integrated National Marine-Coastal and Wetlands…` | 0.9 | 0.0 | text |
| panama_HR_27 `Regulate and operationalize the Climate Risk Ob…` | `Climate risk observatories` | 0.9 | 0.0 | text |
| panama_HR_30 `Finalize the process of technical, inter-instit…` | `Climate Change and Green Transition Framework L…` | 0.9 | 0.0 | text |
| panama_HR_29 `Harmonize the national Roadmap for the implemen…` | `Adaptation and Climate Territorial Action (Targ…` | 0.771 | 0.0 | text |
| panama_HR_16 `Build and adopt a national operational definiti…` | `Governance and Financing (Targets 14, 28)` | 0.75 | 0.0 | text |
| panama_HR_2 `Update the National Forest Restoration Program.…` | `Reorient management toward measurable results; …` | 0.675 | 0.0 | text |
| panama_HR_14 `Exhaustively review the analysis of incentives …` | `Restoration and biological corridors` | 0.675 | 0.0 | text |
| panama_HR_3 `Review and update the regulatory, normative, an…` | `Develop innovative financial instruments; stren…` | 0.6 | 0.0 | text |

### Unmatched gold (9 of these captured at activity level)

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| panama_HR_1 (unreachable) `Define a prioritized portfolio of policies and measures…` | 0.573 | **0.9** | `Reorient management toward measurable results; …` |
| panama_HR_5 (unreachable) `Identify and prioritize at least five regions of the co…` | 0.6 | **0.72** | `Local and regional adaptation plans` |
| panama_HR_6 (unreachable) `Identify and prioritize, at the national level, the mai…` | 0.72 | 0.54 | `Multi-hazard Early Warning Systems` |
| panama_HR_7 (unreachable) `By 2035, Panama will reduce pollution and its cumulativ…` | 0.771 | **0.9** | `Implementation of the marine-coastal adaptation…` |
| panama_HR_8 (unreachable) `Define technical, social, and territorial criteria for …` | 0.6 | **0.63** | `Local and regional adaptation plans` |
| panama_HR_10 (unreachable) `Identify and prioritize productive sectors and consumpt…` | 0.54 | **0.75** | `Develop innovative financial instruments; stren…` |
| panama_HR_11 (unreachable) `Design and validate a standardized national methodology…` | 0.36 | 0.4 | `Agricultural Geospatial Information System Offi…` |
| panama_HR_12 (unreachable) `By 2035, Panama will have reduced mismanaged plastic po…` | 0.54 | **0.787** | `Multi-hazard Early Warning Systems` |
| panama_HR_13 (unreachable) `Carry out an exhaustive mapping of competencies, curren…` | 0.573 | **0.72** | `Information on genetic resources, benefit-shari…` |
| panama_HR_15 (unreachable) `Delimit and prioritize critical territories of illegal …` | 0.643 | **0.75** | `National Adaptation and Loss and Damage Monitor…` |
| panama_HR_17 (unreachable) `Define technical and climate criteria for the selection…` | 0.75 | 0.573 | `Local and regional adaptation plans` |
| panama_HR_18 (unreachable) `Build a national baseline of urban green and blue space…` | 0.75 | 0.573 | `Local and regional adaptation plans` |
| panama_HR_20 (unreachable) `Finalize the Adaptation Plan for the Energy Sector and …` | 0.562 | 0.54 | `National Adaptation and Loss and Damage Monitor…` |
| panama_HR_22 (unreachable) `Define a standardized methodology for Local and Regiona…` | 0.9 | 0.562 | `Local and regional adaptation plans` |
| panama_HR_24 (unreachable) `Finalize the National Adaptation Plan for the Health Se…` | 0.787 | 0.491 | `National Adaptation and Loss and Damage Monitor…` |
| panama_HR_28 (unreachable) `Formalize the financial architecture of the Nature Pled…` | 0.75 | **0.9** | `Governance and Financing (Targets 14, 28)` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Reduce greenhouse gas emissions by 11 % by 2035 relative to the referen…` | 0.386 | panama_ENR_27 @ 0.485 |
| `Implement permanent training and certification programs; promote techni…` | 0.45 | panama_PEG_3 @ 0.5 |
| `The Nature Pledge makes it possible to harmonize and update regulatory …` | 0.5 | panama_HR_28 @ 0.5 |
| `Develop a unified national MRV system, supported by the PNTC, that cent…` | 0.485 | panama_HR_16 @ 0.485 |
| `Promote the adoption of emerging technologies (remote sensing, artifici…` | 0.514 | panama_HR_27 @ 0.514 |
| `Strengthen participatory governance; establish conservation agreements …` | 0.532 | panama_ENR_77 @ 0.54 |
| `Agricultural Geospatial Information System Office with agroclimatic data` | 0.63 | panama_NP_27 @ 0.787 |
| `Mitigation and Productive Transition (Targets 1, 7, 12, 20)` | 0.5 | panama_HR_2 @ 0.5 |

## SL-PPPP (tier 1, PPPP, en)

Expert gold from data_sri_lanka_2Jul26.xlsx: 4 component-level rows. CONFIRMED SCAN: the local PDF is 2 pages with zero extractable text (the expert worked from a fuller/text version), so this doc behaves as a second real-world scanned fixture; the CLI/wizard reject it with NO_TEXT_LAYER.

- Parse: 0/2 pages with text, 0 chars
- Extraction: 0 targets in 0.0s (fresh run); LLM calls 0 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 0, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 0 quotes
- textCleanup: {}; provenance flags: 0
- Length (chars) gold p10/median/p90: 283/330/330 vs extracted: 0/0/0

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|

### Unmatched gold

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| PPPP_1 (unreachable) `Conservation of the 'Critical' and the 'Unique': Adequa…` | 0.0 | 0.0 | `` |
| PPPP_2 (unreachable) `Promotion of the 'Livability' for 'Human' and other liv…` | 0.0 | 0.0 | `` |
| PPPP_3 (unreachable) `Optimization of the 'Utility' of the 'Available': More …` | 0.0 | 0.0 | `` |
| PPPP_4 (unreachable) `Exploration of the 'Potentials' and the 'Enhancement' o…` | 0.0 | 0.0 | `` |

### Unmatched extracted (gold may simply not cover these)

None.

## SL-PPPP-TXT (tier 1, PPPP, en)

Executive summary of the updated NPPP 2048, copy-pasted verbatim by the team on 2026-07-02 because the local PDF is a 2-page scan. Committed fixture, so this entry needs no OneDrive mount. The 4 expert component rows appear verbatim in this text.

- Parse: 1/None pages with text, 4,178 chars
- Extraction: 6 targets in 19.2s (fresh run); LLM calls 8 (4 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 6, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 6 quotes
- textCleanup: {'verbatim': 5, 'cleaned': 1}; provenance flags: 0
- Length (chars) gold p10/median/p90: 283/330/330 vs extracted: 48/334/385

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

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `The main objective of the National Physical Planning Policy is to provi…` | 0.267 | NAP_120 @ 0.45 |
| `The development of marine and aquatic resources.` | 0.643 | PPPP_1 @ 0.643 |

## SL-NAP (tier 1, NAP, en)

Expert gold from data_sri_lanka_2Jul26.xlsx (fresh, uncontaminated): 192 rows across THREE levels (Goals, Statements, Actions X.Y — the Resolution-36 pattern). By the pipeline's granularity rules the Action rows belong in activities, not targets; read recall level-aware and check the goldCoveredByActivities metric. NAP here = National AGRICULTURAL Policy, not adaptation plan.

- Parse: 20/20 pages with text, 88,169 chars
- Extraction: 27 targets in 76.6s (fresh run); LLM calls 37 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 41, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 41 quotes
- textCleanup: {'cleaned': 24, 'verbatim': 3}; provenance flags: 0
- Length (chars) gold p10/median/p90: 71/116/186 vs extracted: 92/128/185

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| NAP_13 `Improve production and productivity of food and…` | `1. Improve production and productivity of food …` | 0.995 | 0.952 | text |
| NAP_121 `Streamline and explore the domestic and interna…` | `9. Streamline and explore the domestic and inte…` | 0.994 | 0.929 | text |
| NAP_102 `Foster strategic collaboration among the value …` | `8. Foster strategic collaboration among the val…` | 0.993 | 0.923 | text |
| NAP_177 `Strengthen institutional coordination mechanism…` | `15. Strengthen institutional coordination mecha…` | 0.993 | 0.944 | text |
| NAP_82 `Improve access to safe and high-quality food an…` | `6. Improve access to safe and high-quality food…` | 0.993 | 0.938 | text |
| NAP_4 `Increase the adoption of technology developed l…` | `4) Increase the adoption of technology develope…` | 0.992 | 0.938 | text |
| NAP_1 `Double the resource-productivity (compared to 2…` | `1) Double the resource-productivity (compared t…` | 0.992 | 0.909 | text |
| NAP_5 `Increase the high quality and high yielding see…` | `5) Increase the high quality and high yielding …` | 0.992 | 0.923 | text |
| NAP_8 `Establish a government-regulated food and feed …` | `8) Establish a government-regulated food and fe…` | 0.992 | 0.889 | text |
| NAP_46 `Improve productivity and sustainability of arab…` | `3. Improve productivity and sustainability of a…` | 0.991 | 0.684 | text |
| NAP_9 `Establish farmer/agri-producer groups with Agri…` | `9) Establish farmer/agri-producer groups with A…` | 0.991 | 0.875 | text |
| NAP_7 `Supply safe and quality food and feed in compli…` | `7) Supply safe and quality food and feed in com…` | 0.991 | 0.917 | text |
| NAP_72 `Encourage development and adoption of appropria…` | `5. Encourage development and adoption of approp…` | 0.99 | 0.6 | text |
| NAP_91 `Support sustainability in agriculture developme…` | `7. Support sustainability in agriculture develo…` | 0.99 | 0.0 | text |
| NAP_139 `Empower youth and women in agriculture with sup…` | `11. Empower youth and women in agriculture with…` | 0.989 | 0.923 | text |
| NAP_153 `Constitute a centrally-controlled information d…` | `14. Constitute a centrally-controlled informati…` | 0.989 | 0.391 | text |
| NAP_6 `Increase the eco - friendly inputs application …` | `6) Increase the eco-friendly inputs application…` | 0.989 | 0.875 | text |
| NAP_128 `Strengthen partnerships and mentorship programm…` | `10. Strengthen partnerships and mentorship prog…` | 0.989 | 0.579 | text |
| NAP_2 `Double the economic profitability of farmers/ag…` | `2) Double the economic profitability of farmers…` | 0.989 | 0.857 | text |
| NAP_30 `Strengthen delivery and management operations o…` | `2. Strengthen delivery and management operation…` | 0.989 | 0.833 | text |
| NAP_3 `Increase the contribution of the Agri-Food Syst…` | `3) Increase the contribution of the Agri-Food S…` | 0.988 | 0.875 | text |
| NAP_63 `Enhance rational use of irrigation water throug…` | `4. Enhance rational use of irrigation water thr…` | 0.988 | 0.125 | text |
| NAP_10 `Establish a constituted role and mandatory part…` | `10) Establish a constituted role and mandatory …` | 0.987 | 0.909 | text |
| NAP_142 `Promote adoption of appropriate adaptation and …` | `12. Promote adoption of appropriate adaptation …` | 0.984 | 0.133 | text |
| NAP_11 `Build an agri-food system in Sri Lanka that is …` | `11) Build an agri-food system in Sri Lanka that…` | 0.983 | 0.9 | text |
| NAP_149 `Strengthen food systems by connecting urban and…` | `13. Strengthen food systems by connecting urban…` | 0.982 | 0.2 | text |
| NAP_12 `Establish a system of transparent, accountable,…` | `12) Establish a system of transparent, accounta…` | 0.922 | 0.889 | text |

### Unmatched gold (99 of these captured at activity level)

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| NAP_14 `Prepare, approve and adopt guidelines for Good Agricult…` | 0.2 | **1.0** | `1. Improve production and productivity of food …` |
| NAP_15 `Adopt need-based Crop Prioritization (national and prov…` | 0.189 | **1.0** | `6. Improve access to safe and high-quality food…` |
| NAP_16 `Introduce measures to minimize temporal variation in pr…` | 0.347 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_17 `Adopt measures to produce more with less inputs (enhanc…` | 0.169 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_18 `Adopt Precision Agriculture systems (e.g., new technolo…` | 0.427 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_19 `Support adoption of novel and appropriate technology/me…` | 0.45 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_20 `Encourage and strengthen Climate-Smart Agriculture (CSA…` | 0.42 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_21 `Facilitate new technology generation and adoption (e.g.…` | 0.225 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_22 `Manage wildlife, based on the carrying capacity of ecos…` | 0.277 | **0.998** | `2. Strengthen delivery and management operation…` |
| NAP_23 `Improve productivity of existing farm units (with assur…` | 0.225 | **1.0** | `1. Improve production and productivity of food …` |
| NAP_24 `Introduce low-interest loan schemes (credit) to facilit…` | 0.3 | **1.0** | `1. Improve production and productivity of food …` |
| NAP_25 `Establish private-public-producer partnerships (PPPP) f…` | 0.1 | 0.3 | `9) Establish farmer/agri-producer groups with A…` |
| NAP_26 `Promote cropping systems and cropping patterns that pro…` | 0.375 | 0.375 | `12. Promote adoption of appropriate adaptation …` |
| NAP_27 `Promote and support systematic home gardening` | 0.1 | 0.45 | `12. Promote adoption of appropriate adaptation …` |
| NAP_28 `Promote different production technologies (e.g., vertic…` | 0.225 | 0.415 | `12. Promote adoption of appropriate adaptation …` |
| NAP_29 `Develop and implement a national cropping plan for prio…` | 0.225 | 0.3 | `9. Streamline and explore the domestic and inte…` |
| NAP_31 `Allocation of an adequate budget to carry out operation…` | 0.087 | 0.225 | `2) Double the economic profitability of farmers…` |
| NAP_32 `Timely supply and/or production of quality inputs inclu…` | 0.464 | 0.537 | `5) Increase the high quality and high yielding …` |
| NAP_33 `Establish a mechanism through PPP to ensure availabilit…` | 0.451 | 0.479 | `5) Increase the high quality and high yielding …` |
| NAP_34 `Decentralize and strengthen seed certification process …` | 0.3 | 0.3 | `15. Strengthen institutional coordination mecha…` |
| NAP_35 `Establish regional level supply/service/renting machine…` | 0.045 | 0.27 | `9) Establish farmer/agri-producer groups with A…` |
| NAP_36 `Establish village seed banks for conservation and susta…` | 0.3 | **0.825** | `12) Establish a system of transparent, accounta…` |
| NAP_37 `Promote private sector investment for local production …` | 0.265 | 0.4 | `5. Encourage development and adoption of approp…` |
| NAP_38 `Establish a mechanism to certify machinery and other ag…` | 0.318 | 0.472 | `11) Build an agri-food system in Sri Lanka that…` |
| NAP_39 `Establish a mechanism/system for production of fertiliz…` | 0.408 | **0.6** | `12) Establish a system of transparent, accounta…` |
| NAP_40 `Take periodic measures to establish, re-visit, assess a…` | 0.225 | 0.338 | `10. Strengthen partnerships and mentorship prog…` |
| NAP_41 `Enforce a regulatory framework for organic/bio fertiliz…` | 0.095 | 0.4 | `12) Establish a system of transparent, accounta…` |
| NAP_42 `Provide authority to FOs, FPOs and FPCs to initiate act…` | 0.284 | 0.451 | `11. Empower youth and women in agriculture with…` |
| NAP_43 `Strengthen the mechanism involved in fertilizer import/…` | 0.321 | 0.321 | `5) Increase the high quality and high yielding …` |
| NAP_44 `Establish a mechanism to provide organized skilled-labo…` | 0.225 | 0.45 | `8) Establish a government-regulated food and fe…` |
| NAP_45 `Enforce regulations strictly in import, production and …` | 0.327 | 0.409 | `6) Increase the eco-friendly inputs application…` |
| NAP_47 `Promote adoption of seeds and planting material of loca…` | 0.4 | **1.0** | `5) Increase the high quality and high yielding …` |
| NAP_48 `Adopt measures to optimize the use of fertilizer with a…` | 0.257 | **1.0** | `1. Improve production and productivity of food …` |
| NAP_49 `Introduce and adopt new and appropriate technologies fo…` | 0.257 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_50 `Adopt a productivity-based and priority-based incentive…` | 0.386 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_51 `Introduce incentive-based mechanism for gradual replace…` | 0.208 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_52 `Enforce regulatory measures to safeguard ecosystem serv…` | 0.095 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_53 `Adopt a prescription-based sale and use of pesticides –…` | 0.24 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_54 `Establish a system to promote integrated pest/weed mana…` | 0.257 | **1.0** | `12) Establish a system of transparent, accounta…` |
| NAP_55 `Introduce and promote adoption of novel and appropriate…` | 0.281 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_56 `Develop and implement plans to increase the extent of l…` | 0.338 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_57 `Introduce and increase the use of Precision agriculture…` | 0.405 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_58 `Conduct Continuing Professional Development (CPD) progr…` | 0.42 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_59 `Adopt measures to minimize abandoned lands from agricul…` | 0.087 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_60 `Implement a social audit system as a mandatory activity…` | 0.281 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_61 `Establish agro-industrial zones using farmer cluster ap…` | 0.208 | **1.0** | `9) Establish farmer/agri-producer groups with A…` |
| NAP_62 `Provide economic incentives based on cluster approach` | 0.083 | **1.0** | `6. Improve access to safe and high-quality food…` |
| NAP_64 `Take appropriate regulatory measures to avoid excessive…` | 0.327 | **1.0** | `4. Enhance rational use of irrigation water thr…` |
| NAP_65 `Promote rainwater harvesting for agricultural purposes` | 0.091 | 0.154 | `5. Encourage development and adoption of approp…` |
| NAP_66 `Adopt water-saving technologies such as drip-irrigation…` | 0.257 | 0.281 | `4. Enhance rational use of irrigation water thr…` |
| NAP_67 `Adopt soil and water conservations measures to control …` | 0.245 | 0.491 | `12. Promote adoption of appropriate adaptation …` |
| NAP_68 `Adopt catchment management practices by an effective im…` | 0.208 | 0.346 | `1) Double the resource-productivity (compared t…` |
| NAP_69 `Adopt third season cultivation in paddy fields using re…` | 0.043 | 0.083 | `6) Increase the eco-friendly inputs application…` |
| NAP_70 `Rehabilitate reservoirs and irrigation systems with the…` | 0.321 | 0.43 | `4. Enhance rational use of irrigation water thr…` |
| NAP_71 `Integrate activities to ensure fish farming in reservoi…` | 0.18 | 0.3 | `7) Supply safe and quality food and feed in com…` |
| NAP_73 `Establish a formal and a well-coordinated mechanism to …` | 0.257 | **1.0** | `12) Establish a system of transparent, accounta…` |
| NAP_74 `Provide financial and institutional support to develop …` | 0.193 | **1.0** | `7. Support sustainability in agriculture develo…` |
| NAP_75 `Upgrade the system of crop production forecasting with …` | 0.321 | **1.0** | `5) Increase the high quality and high yielding …` |
| NAP_76 `Promote adoption of technologies targeting value additi…` | 0.4 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_77 `Adopt correct harvest and pre-harvest technologies, inc…` | 0.3 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_78 `Strengthen technology transfer mechanisms through appro…` | 0.083 | **1.0** | `10. Strengthen partnerships and mentorship prog…` |
| NAP_79 `Re-visit and restructure existing authoritative body re…` | 0.284 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_80 `Adopt mechanisms to promote use of ICT-based agriculture` | 0.4 | 0.5 | `12. Promote adoption of appropriate adaptation …` |
| NAP_81 `Introduce proven and appropriate technology into the se…` | 0.245 | 0.45 | `1. Improve production and productivity of food …` |
| NAP_83 `Develop and adopt regulations to ensure food and feed s…` | 0.48 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_84 `Incentivize adoption of GAP/Organic agriculture /Ecolog…` | 0.386 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_85 `Establish state of the art laboratories to monitor food…` | 0.48 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_86 `Develop and strictly adopt food safety standards (with …` | 0.377 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_87 `Adopt standard process control measures for food produc…` | 0.42 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_88 `Adopt a stringent labeling system for food products, es…` | 0.388 | **1.0** | `8. Foster strategic collaboration among the val…` |
| NAP_89 `Revisit village fair/farmers market system while promot…` | 0.3 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_90 `Encourage the use of non-traditional food resources` | 0.338 | **1.0** | `3) Increase the contribution of the Agri-Food S…` |
| NAP_92 `Introduce and adopt eco-friendly agricultural practices…` | 0.321 | **1.0** | `1) Double the resource-productivity (compared t…` |
| NAP_93 `Ensure availability of locally improved seed and planti…` | 0.438 | **1.0** | `5) Increase the high quality and high yielding …` |
| NAP_94 `Establish village seeds banks for germplasm conservatio…` | 0.265 | **1.0** | `7. Support sustainability in agriculture develo…` |
| NAP_95 `Introduce and adopt modern eco-friendly input managemen…` | 0.346 | **1.0** | `2. Strengthen delivery and management operation…` |
| NAP_96 `Adopt a mechanism to have a mandatory involvement of mu…` | 0.257 | **1.0** | `6) Increase the eco-friendly inputs application…` |
| NAP_97 `Adopt stringent measures of plant quarantine by strengt…` | 0.24 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_98 `Adopt a well-organized surveillance system for early-wa…` | 0.36 | **1.0** | `1. Improve production and productivity of food …` |
| NAP_99 `Take appropriate measures to increase the use of renewa…` | 0.506 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_100 `Promote farming systems with crop-animal integration wh…` | 0.1 | **1.0** | `9) Establish farmer/agri-producer groups with A…` |
| NAP_101 `Adopt mechanisms to ensure conformity of agricultural p…` | 0.265 | **1.0** | `1) Double the resource-productivity (compared t…` |
| NAP_103 `Establish an effective Agriculture Enterprise Resource …` | 0.225 | **0.998** | `12. Promote adoption of appropriate adaptation …` |
| NAP_104 `Establish a market-oriented production system` | 0.45 | **1.0** | `8) Establish a government-regulated food and fe…` |
| NAP_105 `Establish a marketing network through the Agrarian Serv…` | 0.327 | 0.525 | `10) Establish a constituted role and mandatory …` |
| NAP_106 `Establish a market mechanism to ensure higher returns a…` | 0.257 | 0.45 | `10) Establish a constituted role and mandatory …` |
| NAP_107 `Adopt a minimum price for staple crop products` | 0.1 | 0.45 | `12) Establish a system of transparent, accounta…` |
| NAP_108 `Provide seed-funds and enhance management capacity of f…` | 0.277 | 0.321 | `9) Establish farmer/agri-producer groups with A…` |
| NAP_109 `Identify niche markets to promote products originated f…` | 0.083 | 0.27 | `12. Promote adoption of appropriate adaptation …` |
| NAP_110 `Build capacity of the FOs/FPOs, SMEs and existing marke…` | 0.284 | 0.3 | `8. Foster strategic collaboration among the val…` |
| NAP_111 `Create and strengthen value chains of priority crops to…` | 0.225 | 0.421 | `1. Improve production and productivity of food …` |
| NAP_112 `Establish a target-based supply chain management system…` | 0.3 | **0.6** | `12) Establish a system of transparent, accounta…` |
| NAP_113 `Develop and adopt regulatory measures to implement stan…` | 0.277 | 0.485 | `8. Foster strategic collaboration among the val…` |
| NAP_114 `Introduce and adopt appropriate and modern technologies…` | 0.277 | 0.519 | `8. Foster strategic collaboration among the val…` |
| NAP_115 `Provide support to strengthen infrastructure for value …` | 0.277 | 0.45 | `2. Strengthen delivery and management operation…` |
| NAP_116 `Adopt a well-planned demand-oriented cultivation system…` | 0.225 | 0.514 | `1. Improve production and productivity of food …` |
| NAP_117 `Introduce and adopt measures to strengthen inter-instit…` | 0.169 | 0.321 | `12. Promote adoption of appropriate adaptation …` |
| NAP_118 `Ensure availability of credit facilities for agricultur…` | 0.3 | 0.45 | `4) Increase the adoption of technology develope…` |
| NAP_119 `Strengthen processing ventures through Farmer Producer …` | 0.095 | 0.36 | `9) Establish farmer/agri-producer groups with A…` |
| NAP_120 `Establish regional-level common processing facilities` | 0.056 | 0.118 | `9) Establish farmer/agri-producer groups with A…` |
| NAP_122 `Take appropriate measures to strengthen logistics manag…` | 0.225 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_123 `Introduce and adopt mechanisms and technology for trace…` | 0.245 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_124 `Adopt warehouse receipting system for durables (e.g., g…` | 0.08 | **1.0** | `12) Establish a system of transparent, accounta…` |
| NAP_125 `Establish temperature- and RH-controlled storage and co…` | 0.208 | **1.0** | `12) Establish a system of transparent, accounta…` |
| NAP_126 `Adopt systems to promote branding at farm-gate level to…` | 0.281 | **1.0** | `12. Promote adoption of appropriate adaptation …` |
| NAP_127 `Strengthen District Economic Centers (DECs) as regulate…` | 0.077 | 0.208 | `8) Establish a government-regulated food and fe…` |
| NAP_129 `Establish farmer producer organizations leading to a fa…` | 0.346 | **1.0** | `9) Establish farmer/agri-producer groups with A…` |
| NAP_130 `Create awareness among farming community on cost: benef…` | 0.265 | **1.0** | `3. Improve productivity and sustainability of a…` |
| NAP_131 `Establish farmer-oriented banking system (e.g., Farmers…` | 0.257 | **0.996** | `12) Establish a system of transparent, accounta…` |
| NAP_132 `Re-orient and strengthen the development bank system to…` | 0.472 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_133 `Establish a mechanism to register and recognize fulltim…` | 0.405 | **1.0** | `10) Establish a constituted role and mandatory …` |
| NAP_134 `Establish a strong network of Agrarian Centers, Farmer …` | 0.208 | **1.0** | `9) Establish farmer/agri-producer groups with A…` |
| NAP_135 `Establish agro-industrial zones using farmer-cluster ap…` | 0.208 | **1.0** | `9) Establish farmer/agri-producer groups with A…` |
| NAP_136 `Establish a mechanism to ensure farmers access new tech…` | 0.265 | **1.0** | `10) Establish a constituted role and mandatory …` |
| NAP_137 `Establish an agricultural product procuring and distrib…` | 0.321 | **1.0** | `12) Establish a system of transparent, accounta…` |
| NAP_138 `Establish a mechanism to fully utilize agriculture dipl…` | 0.424 | 0.476 | `10) Establish a constituted role and mandatory …` |
| NAP_140 `Support gender-based development in agriculture includi…` | 0.392 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_141 `Take appropriate measures to incentivize youth engageme…` | 0.527 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_143 `Design and adopt weather index-based climate risk manag…` | 0.095 | **1.0** | `2. Strengthen delivery and management operation…` |
| NAP_144 `Establish a seasonal Agro-met Advisory (AMA) issuing me…` | 0.318 | **0.998** | `10) Establish a constituted role and mandatory …` |
| NAP_145 `Adhere to the actions related to agriculture identified…` | 0.338 | 0.36 | `12. Promote adoption of appropriate adaptation …` |
| NAP_146 `Continue and further strengthen breeding programmes and…` | 0.265 | 0.487 | `10. Strengthen partnerships and mentorship prog…` |
| NAP_147 `Propose and adopt financial incentives to use renewable…` | 0.327 | **0.736** | `11. Empower youth and women in agriculture with…` |
| NAP_148 `Take measures to discourage burning of crop biomass and…` | 0.257 | 0.327 | `12. Promote adoption of appropriate adaptation …` |
| NAP_150 `Adopt crisis management mechanisms to meet the food dem…` | 0.193 | **1.0** | `4. Enhance rational use of irrigation water thr…` |
| NAP_151 `Identify and strengthen critical nodes of the city regi…` | 0.435 | **1.0** | `13. Strengthen food systems by connecting urban…` |
| NAP_152 `Establish an inter-ministerial core group including cen…` | 0.225 | **1.0** | `13. Strengthen food systems by connecting urban…` |
| NAP_154 `Establish a demand-driven agriculture research program …` | 0.3 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_155 `Provide appropriate incentives (financial & physical) t…` | 0.225 | **1.0** | `5. Encourage development and adoption of approp…` |
| NAP_156 `Invest on research and development to produce hybrids a…` | 0.212 | **1.0** | `5) Increase the high quality and high yielding …` |
| NAP_157 `Facilitate and strengthen agriculture education at prim…` | 0.36 | **1.0** | `15. Strengthen institutional coordination mecha…` |
| NAP_158 `Establish real-time agriculture data base with continuo…` | 0.277 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_159 `Incorporate agriculture progressively as a compulsory s…` | 0.061 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_160 `Incorporate more skills development in ancient agricult…` | 0.367 | **1.0** | `11. Empower youth and women in agriculture with…` |
| NAP_161 `Adopt a market oriented agricultural extension system` | 0.386 | **1.0** | `1. Improve production and productivity of food …` |
| NAP_162 `Strengthen PPP to ensure effective information dissemin…` | 0.4 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_163 `Establish a centrally coordinated agriculture extension…` | 0.384 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_164 `Re-visit the grass root level extension modalities incl…` | 0.193 | **1.0** | `4. Enhance rational use of irrigation water thr…` |
| NAP_165 `Create awareness and promote adoption of novel technolo…` | 0.277 | **0.909** | `2. Strengthen delivery and management operation…` |
| NAP_166 `Provide advisory and advocacy to support evidence-based…` | 0.375 | **1.0** | `10) Establish a constituted role and mandatory …` |
| NAP_167 `Institute a market-oriented agriculture extension syste…` | 0.327 | **0.712** | `14. Constitute a centrally-controlled informati…` |
| NAP_168 `Adopt an efficient system for dissemination of market i…` | 0.3 | 0.455 | `12) Establish a system of transparent, accounta…` |
| NAP_169 `Build knowledge on judicious use of fertilizer and pest…` | 0.4 | 0.5 | `2. Strengthen delivery and management operation…` |
| NAP_170 `Conduct knowledge building programs targeting of office…` | 0.245 | 0.409 | `3) Increase the contribution of the Agri-Food S…` |
| NAP_171 `Develop and adopt recruitment criteria to agriculture r…` | 0.3 | 0.321 | `14. Constitute a centrally-controlled informati…` |
| NAP_172 `Develop and establish a mechanism to increase the invol…` | 0.48 | 0.516 | `12. Promote adoption of appropriate adaptation …` |
| NAP_173 `Conduct outreach programs with a view to build knowledg…` | 0.18 | 0.3 | `10) Establish a constituted role and mandatory …` |
| NAP_174 `Develop a mechanism for progressive allocation of finan…` | 0.193 | 0.277 | `12) Establish a system of transparent, accounta…` |
| NAP_175 `Develop and implement training programs to minimize occ…` | 0.277 | 0.346 | `11. Empower youth and women in agriculture with…` |
| NAP_176 `Adopt farmer field schools (FFS) approach as a means of…` | 0.208 | 0.3 | `14. Constitute a centrally-controlled informati…` |
| NAP_178 `Establish a policy implementation, and monitoring and e…` | 0.327 | **1.0** | `15. Strengthen institutional coordination mecha…` |
| NAP_179 `Establish an effective coordination mechanism among lin…` | 0.3 | **1.0** | `7) Supply safe and quality food and feed in com…` |
| NAP_180 `Adopt a stable taxation and fiscal policy system to pro…` | 0.3 | **1.0** | `14. Constitute a centrally-controlled informati…` |
| NAP_181 `Regulate imports based on annual/seasonal production ta…` | 0.08 | **1.0** | `6. Improve access to safe and high-quality food…` |
| NAP_182 `Re-define mandatory functions of line agencies to compl…` | 0.318 | **1.0** | `10) Establish a constituted role and mandatory …` |
| NAP_183 `Adopt a mechanism for policy integration through the in…` | 0.225 | 0.371 | `3) Increase the contribution of the Agri-Food S…` |
| NAP_184 `Adopt a performance-based work evaluation of the state …` | 0.346 | 0.479 | `1. Improve production and productivity of food …` |
| NAP_185 `Update/develop and implement relevant Acts/ordinances a…` | 0.24 | 0.3 | `7) Supply safe and quality food and feed in com…` |
| NAP_186 `Adopt participatory approaches involving engagement of …` | 0.424 | 0.45 | `10) Establish a constituted role and mandatory …` |
| NAP_187 `Impose regulations including punitive actions for viola…` | 0.225 | 0.3 | `11. Empower youth and women in agriculture with…` |
| NAP_188 `Constitute the involvement of private sector and develo…` | 0.482 | 0.481 | `14. Constitute a centrally-controlled informati…` |
| NAP_189 `Adopt a mechanism to implement professional development…` | 0.44 | 0.544 | `14. Constitute a centrally-controlled informati…` |
| NAP_190 `Institute a performance-based reward system in agricult…` | 0.245 | 0.412 | `11. Empower youth and women in agriculture with…` |
| NAP_191 `Take measures to remove financial and regulatory constr…` | 0.25 | 0.491 | `5. Encourage development and adoption of approp…` |
| NAP_192 `Harmonize with agriculture related acts and other polic…` | 0.327 | 0.327 | `11. Empower youth and women in agriculture with…` |

### Unmatched extracted (gold may simply not cover these)

None.

## SL-NWRP (tier 1, NWRP, en)

Trilingual parallel-translation fixture: Sinhala pp.1-~34 / Tamil ~35-74 / English 75-104, with legacy-font Sinhala/Tamil that extracts as Latin gibberish. Gold = the 33 expert-curated corpus rows (English Section 7 'Policy | Strategy' table; sourceLabel carries the doc-native 'Policy N'/'Strategy N' names); 33/33 quotes reachable in the PDF text layer. The 2 Jul 26 pipeline run extracted the Sinhala AND Tamil Section 7 tables (machine-translated duplicates) and produced zero rows from the document's own English Section 7 - this doc gates the parallel-language handling.

- Parse: 99/104 pages with text, 161,962 chars
- Extraction: 60 targets in 99.0s (fresh run); LLM calls 68 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 68, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 68 quotes
- textCleanup: {'cleaned': 58, 'synthesis': 2}; provenance flags: 0
- Length (chars) gold p10/median/p90: 78/172/399 vs extracted: 86/172/302

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| NWRP_1 `Facilitate and assist nation building while ens…` | `Facilitate and assist nation building while ens…` | 1.0 | 0.941 | text |
| NWRP_3 `Conserve and establish the rightful value of th…` | `Conserve and establish the rightful value of th…` | 1.0 | 0.833 | text |
| NWRP_5 `Guidance and strengthening the existing laws, p…` | `Guidance and strengthening the existing laws, p…` | 1.0 | 0.9 | text |
| NWRP_7 `Ensure flexible water allocation criteria which…` | `Ensure flexible water allocation criteria which…` | 1.0 | 0.889 | text |
| NWRP_9 `Recognize water rights of past, current and new…` | `Recognize water rights of past, current and new…` | 1.0 | 0.75 | text |
| NWRP_11 `Promote adherence to water quality standards in…` | `Promote adherence to water quality standards in…` | 1.0 | 0.917 | text |
| NWRP_13 `Promote sustainable management practices on sur…` | `Promote sustainable management practices on sur…` | 1.0 | 0.875 | text |
| NWRP_15 `Taking actions to conserve aquifers by formulat…` | `Taking actions to conserve aquifers by formulat…` | 1.0 | 0.8 | text |
| NWRP_17 `Conserve the upper watersheds, wetlands, riveri…` | `Conserve the upper watersheds, wetlands, riveri…` | 1.0 | 0.833 | text |
| NWRP_19 `Ensure combined use of surface and groundwater …` | `Ensure combined use of surface and groundwater …` | 1.0 | 0.889 | text |
| NWRP_21 `Identify Climate Change impacts on the water se…` | `Identify Climate Change impacts on the water se…` | 1.0 | 0.917 | text |
| NWRP_23 `Ensure that national, provincial and local inte…` | `Ensure that national, provincial and local inte…` | 1.0 | 0.9 | text |
| NWRP_25 `Highlight the economic value of water to preven…` | `Highlight the economic value of water to preven…` | 1.0 | 0.833 | text |
| NWRP_27 `Recognize traditions and customs when planning …` | `Recognize traditions and customs when planning …` | 1.0 | 0.833 | text |
| NWRP_29 `Adopt the current international policies, pract…` | `Adopt the current international policies, pract…` | 1.0 | 0.95 | text |
| NWRP_31 `Promote stakeholder participation in decision m…` | `Promote stakeholder participation in decision m…` | 1.0 | 0.938 | text |
| NWRP_33 `Introducing modern water technical methods as p…` | `Introducing modern water technical methods as p…` | 0.978 | 0.96 | text |

### Unmatched gold (16 of these captured at activity level)

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| NWRP_2 `Identify nation building plans and sectoral water requi…` | 0.42 | **0.9** | `Allocation of water among multiple users should…` |
| NWRP_4 `Establish water quality standards for different sources…` | 0.63 | **0.9** | `Conserve and establish the rightful value of th…` |
| NWRP_6 `List out water related laws and identify the gaps • Rec…` | 0.386 | **0.9** | `Guidance and strengthening the existing laws, p…` |
| NWRP_8 `Promotion of participatory decision making. • Introduct…` | 0.485 | **0.9** | `Introduction of an appropriate special fee syst…` |
| NWRP_10 `Identify riparian rights. Study the current demand. Ass…` | 0.72 | **0.9** | `Recognize water rights of past, current and new…` |
| NWRP_12 `Establish water quality standards for different uses • …` | 0.579 | **0.9** | `Promote adherence to water quality standards in…` |
| NWRP_14 `Develop appropriate river basin plans based on current …` | 0.346 | **0.9** | `Promote sustainable management practices on sur…` |
| NWRP_16 `Preparation of appropriate development plans at the div…` | 0.45 | **0.9** | `Conserve and establish the rightful value of th…` |
| NWRP_18 `Prepare appropriate guidelines for upper watershed mana…` | 0.375 | **1.0** | `Impose penalties for water and watershed pollut…` |
| NWRP_20 `Develop aquifer basin plans and identify re-charge zone…` | 0.762 | **0.9** | `Promote sustainable management practices on sur…` |
| NWRP_22 `Conduct action research and identify vulnerability on w…` | 0.424 | **0.9** | `Identify Climate Change impacts on the water se…` |
| NWRP_24 `Promote regional development in line with river basins …` | 0.5 | **1.0** | `Allocation of water among multiple users should…` |
| NWRP_26 `Considering the capital, maintenance and operational co…` | 0.54 | **0.9** | `Conserve and establish the rightful value of th…` |
| NWRP_28 `Obtain local level stakeholder participation in develop…` | 0.491 | **0.9** | `Recognize traditions and customs when planning …` |
| NWRP_30 `Develop regular interactions with international profess…` | 0.35 | **0.9** | `Introduction of national and international best…` |
| NWRP_32 `Institutionalize committees at various levels to make d…` | 0.48 | **0.9** | `Develop and continuously update appropriate tra…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Establish appropriate policy, legal and institutional frameworks for ef…` | 0.36 | NDC_53 @ 0.456 |
| `Facilitation on conservation of water resources through multiple stakeh…` | 0.36 | NMP_2 @ 0.45 |
| `Maintain a repository of updated data and information to freely share a…` | 0.444 | NMP_5 @ 0.675 |
| `Facilitate to ensure corporation among stakeholders institutions at loc…` | 0.36 | NDC_8 @ 0.4 |
| `Ensure adequate water for drinking, sanitation, irrigation, environment…` | 0.257 | PPPP_1 @ 0.321 |
| `Promote appropriate water efficient irrigation and agri technologies (m…` | 0.321 | NDC_88 @ 0.45 |
| `Support an institutional framework for sound water resources management…` | 0.27 | NAP_140 @ 0.473 |
| `Introduction of national and international best practices on integrated…` | 0.54 | NWRP_23 @ 0.54 |
| `Impose penalties for water and watershed polluters and illegal users in…` | 0.386 | NWRP_4 @ 0.386 |
| `Introduction of an appropriate special fee system for bulk water users …` | 0.485 | NWRP_8 @ 0.485 |
| `Introduction of an appropriate eco-system payment mechanism for hydropo…` | 0.413 | NAP_168 @ 0.4 |
| `Supporting responsible institutions to secure forests and related eco-s…` | 0.343 | NWRP_26 @ 0.343 |
| `Access to Fresh Water is considered as a fundamental human right. Ripar…` | 0.3 | NMP_49 @ 0.35 |
| `Appropriate mechanism will be used to regulate large scale water uses f…` | 0.42 | NMP_40 @ 0.486 |
| `Water requirements of wildlife and eco-systems will be identified and e…` | 0.327 | NMP_16 @ 0.409 |
| `Systematic and provident planning system is essential for efficient wat…` | 0.45 | NAP_104 @ 0.45 |
| `Water Resources Planning for national and provincial development should…` | 0.42 | NFAP_8 @ 0.45 |
| `Water resources conservation, development and management plans should b…` | 0.4 | NWRP_24 @ 0.4 |
| `Groundwater resources, conservation, development and management plans s…` | 0.386 | NMP_2 @ 0.6 |
| `Groundwater abstraction from critical aquifers (i.e., aquifers where th…` | 0.3 | NAP_172 @ 0.386 |
| `Rainwater harvesting should be promoted in areas where water has become…` | 0.257 | NAP_65 @ 0.45 |
| `Each responsible organization and water users should be jointly respons…` | 0.45 | NWRP_25 @ 0.45 |
| `The importance of water quality management should be recognized while i…` | 0.36 | NWRP_3 @ 0.36 |
| `Decentralization of the management of water resources should be in acco…` | 0.405 | NDC_88 @ 0.45 |
| `All inter-province water sharing arrangements should be monitored perio…` | 0.321 | NAP_64 @ 0.409 |
| `Government based on the recommendation of the National Water Resource C…` | 0.4 | NWRP_32 @ 0.4 |
| `All measures should be taken under the guidance of the National Water R…` | 0.471 | NAP_64 @ 0.491 |
| `Watershed management through extensive soil conservation, catchment are…` | 0.45 | NAP_68 @ 0.485 |
| `Water resources conservation initiatives complimented with objectives o…` | 0.36 | NDC_35 @ 0.36 |
| `Precautionary actions should ensure safety of all water storage dams an…` | 0.3 | NDC_50 @ 0.3 |
| `Allocation of water among multiple users should be in accordance with t…` | 0.692 | NWRP_13 @ 0.692 |
| `More appropriate and sustainable water resources management measures sh…` | 0.485 | NWRP_13 @ 0.485 |
| `Water requirements should be met through effective and efficient method…` | 0.36 | NDC_84 @ 0.386 |
| `The conservation, management, operation and maintenance costs of water …` | 0.375 | NDC_8 @ 0.4 |
| `Regulatory agencies should establish, upgrade and modernize their capab…` | 0.45 | NWRP_3 @ 0.45 |
| `Information and data for conservation planning, development and managem…` | 0.512 | NWRP_31 @ 0.529 |
| `Reliable and updated integrated information system and data repository …` | 0.471 | NWRP_31 @ 0.515 |
| `To explore new directions in water resources management, advance resear…` | 0.371 | NDC_88 @ 0.45 |
| `Continuous research to assess the extent of water harnessed, water dema…` | 0.45 | NWRP_25 @ 0.45 |
| `Results of such research should be disseminated among stakeholders, use…` | 0.3 | NMP_40 @ 0.319 |
| `Research studies on inter-connection between surface and groundwater, c…` | 0.312 | NBSAP_8 @ 0.409 |
| `Develop the training capacities of all the stakeholders including relev…` | 0.36 | NWRP_32 @ 0.36 |
| `Develop and continuously update appropriate training modules on commonl…` | 0.48 | NWRP_32 @ 0.48 |

## Comparison: `pre-nwrp-fixes` → `post-nwrp-fixes`

Prompt hash: `7bf02ad80ee8` → `bdede67a8108`  (prompts CHANGED, fresh LLM run)

| doc | recall (reachable) | recall (raw) | extraction matched | granularity | quotes found | flags |
|---|---|---|---|---|---|---|
| PNSH | 93% → 93% | 94% → 94% | 26% → 26% | 359% → 365% | 87 → 94 | 0 → 0 |
| NRVTS | 14% → 14% | 15% → 15% | 33% → 40% | 44% → 37% | 29 → 30 | 0 → 0 |
| ILDN | 0% → 38% | 0% → 38% | 0% → 23% | 125% → 162% | 11 → 14 | 0 → 0 |
| HR | None | 43% → 47% | 65% → 64% | 67% → 73% | 21 → 26 | 0 → 0 |
| SL-PPPP | None | 0% → 0% | None | 0% → 0% | 0 → 0 | 0 → 0 |
| SL-PPPP-TXT | 100% → 100% | 100% → 100% | 100% → 67% | 100% → 150% | 4 → 6 | 0 → 0 |
| SL-NAP | 12% → 12% | 13% → 14% | 100% → 100% | 13% → 14% | 41 → 41 | 0 → 0 |
| SL-NWRP | 0% → 52% | 0% → 52% | 0% → 28% | 70% → 182% | 25 → 68 | 0 → 0 |
