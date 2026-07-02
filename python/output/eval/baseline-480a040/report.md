# Extraction eval report: `baseline-480a040`

- Generated: 2026-07-02T10:39:25+00:00  ·  git `480a040`  ·  model `gpt-5.4` (concurrency 4)
- Prompt hash: `e1e21e5b9f2d` (changes when any extraction prompt changes and the LLM cache invalidates)
- Thresholds: similarity >= 0.6, quote-Jaccard >= 0.3, reachable >= 0.5

Gold is not exhaustive: `extraction matched` is a soft precision proxy, not a target to optimise.
`recall (reachable)` counts only gold targets whose curated quotes actually occur in the parsed local PDF.

## Headline (tier 1 = quote-anchored gold; tier 2 similarity-only, reported separately)

| doc | tier | gold | reachable | extracted | matched | recall (reachable) | recall (raw) | extraction matched | granularity | verbatim quotes found | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PNSH | 1 | 17 | 17 | 0 | 0 | 0% | 0% | n/a | 0.0 | 0/0 | 0 |
| NRVTS | 1 | 27 | 21 | 11 | 4 | 14% | 15% | 36% | 0.41 | 17/17 | 0 |
| ILDN | 1 | 8 | 8 | 10 | 0 | 0% | 0% | 0% | 1.25 | 11/11 | 0 |
| HR | 2 | 30 | 0 | 17 | 10 | n/a | 33% | 59% | 0.57 | 22/22 | 0 |

## Tier-3 fixtures (parse stats only)

- **NP**: 39/39 pages with text, 44,633 chars. Real-world partial-text-layer fixture (20/39 pages with <30 extractable chars). Excluded from recall; exercises the scanned-page detection. Gold recovery option: download the UNFCCC-published version referenced by the corpus sourceUrl and re-check reachability.

## PNSH (tier 1, PNSH, es)

Strongest gold doc: 16/17 quotes reachable; 170 pages of Spanish; gold contains CO transcription typos, so matching must stay fuzzy. Also the runtime stress case.

- Parse: 167/170 pages with text, 798,687 chars
- Extraction: 0 targets in 159.8s (fresh run); LLM calls 46 (0 cached); content-filter warnings 0, parse-failure warnings 1
- Quote match levels: {'exact': 0, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 0 quotes
- textCleanup: {}; provenance flags: 0
- Length (chars) gold p10/median/p90: 402/640/1022 vs extracted: 0/0/0

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| panama_PNSH_1 `Universal access to quality water and sanitation servic…` | 0.0 | `` |
| panama_PNSH_2 `Improvements to the efficiency of drinking water and sa…` | 0.0 | `` |
| panama_PNSH_3 `Increased coverage of drinking water services. This act…` | 0.0 | `` |
| panama_PNSH_4 `Increased sanitation services. The objective is to prov…` | 0.0 | `` |
| panama_PNSH_5 `Planning for water and sanitation systems at the nation…` | 0.0 | `` |
| panama_PNSH_6 `Water for inclusive socio-economic growth. Having basic…` | 0.0 | `` |
| panama_PNSH_7 `Management of water-resource availability. The projects…` | 0.0 | `` |
| panama_PNSH_8 `Management of freshwater demand. This line of action is…` | 0.0 | `` |
| panama_PNSH_9 `Increased availability of freshwater. The actions seek …` | 0.0 | `` |
| panama_PNSH_10 `Preventive management of water-related risks. Climate-c…` | 0.0 | `` |
| panama_PNSH_11 `Preventive risk management. The PNSH's objective in ris…` | 0.0 | `` |
| panama_PNSH_12 `Risk monitoring and early warning. This line of action …` | 0.0 | `` |
| panama_PNSH_13 `Water sustainability. Guaranteeing water sustainability…` | 0.0 | `` |
| panama_PNSH_14 `Water consensus-building. The objective is to help reso…` | 0.0 | `` |
| panama_PNSH_15 `Updating of regulations. This will focus on updating ce…` | 0.0 | `` |
| panama_PNSH_16 `Institutional strengthening. The institutional strength…` | 0.0 | `` |
| panama_PNSH_17 `Education and research on the sustainable use of water …` | 0.0 | `` |

### Unmatched extracted (gold may simply not cover these)

None.

## NRVTS (tier 1, NRVTS, en)

21/27 gold quotes reachable; the gap is transcription drift from land_targets.xlsx, not extraction failure.

- Parse: 56/56 pages with text, 131,018 chars
- Extraction: 11 targets in 29.3s (fresh run); LLM calls 21 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 17, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 17 quotes
- textCleanup: {'synthesis': 4, 'cleaned': 7}; provenance flags: 0
- Length (chars) gold p10/median/p90: 29/71/115 vs extracted: 55/79/105

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| NRVTS_1 `Reduce deforestation and forest degradation to …` | `Reduce deforestation and forest degradation to …` | 1.0 | 0.696 | text |
| NRVTS_10 `Promote sustainable grassland management and st…` | `Promote sustainable grassland management and st…` | 1.0 | 0.5 | text |
| NRVTS_17 `Increase agricultural yields by 2.5 t/ha per an…` | `Increase agricultural yields by 2.5 t/ha per an…` | 1.0 | 0.036 | text |
| NRVTS_23 `Ensure no net loss of wetlands by 2030 compared…` | `Ensure no net loss of wetlands by 2030 compared…` | 1.0 | 0.727 | text |

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| NRVTS_2 `Reforestation of land affected by forest fire, pest ins…` | 0.415 | `expand special protected areas to reach 30% of …` |
| NRVTS_3 `Forest fire monitoring and prevention system` | 0.393 | `Ensure no net loss of wetlands by 2030 compared…` |
| NRVTS_4 `Forest cleaning and weeding` | 0.45 | `Reduce deforestation and forest degradation to …` |
| NRVTS_5 `Promote urban greening` | 0.356 | `Promote sustainable grassland management and st…` |
| NRVTS_6 `Amend, if necessary newly develop standards and norms f…` | 0.344 | `Support green development and enhance the livin…` |
| NRVTS_7 `Establishing a gene bank for major wood species` | 0.317 | `Promote sustainable grassland management and st…` |
| NRVTS_8 `Amend current forest sector policy to oblige forest use…` | 0.409 | `expand special protected areas to reach 30% of …` |
| NRVTS_9 `Integrate greening programs into the urban development …` | 0.43 | `regulate and manage animal numbers in alignment…` |
| NRVTS_11 `Recover the traditional seasonal rotational pasture sys…` | 0.412 | `regulate and manage animal numbers in alignment…` |
| NRVTS_12 (unreachable) `Air seeding, sowing of perennial grasses in areas where…` | 0.403 | `Promote sustainable grassland management and st…` |
| NRVTS_13 (unreachable) `Developing a system for silvo-pastoral animal husbandry…` | 0.407 | `Maintain the appropriate ratio between types of…` |
| NRVTS_14 `Integrate grassland planning into the regional land use…` | 0.514 | `Promote sustainable grassland management and st…` |
| NRVTS_15 `Develop legal instruments and/or establish mechanism fo…` | 0.395 | `regulate and manage animal numbers in alignment…` |
| NRVTS_16 `Support researches towards development of adaptive silv…` | 0.411 | `Support green development and enhance the livin…` |
| NRVTS_18 (unreachable) `Developing agroforestry including shelter belt system d…` | 0.272 | `improve water availability for arable land to i…` |
| NRVTS_19 (unreachable) `Decrease in use of pesticides` | 0.366 | `bring under the protection about 60% of all hea…` |
| NRVTS_20 `Erosion prevention in agriculture` | 0.42 | `introduce no-till soil processing in arable lan…` |
| NRVTS_21 `Amend soil protection and desertification prevention la…` | 0.414 | `expand special protected areas to reach 30% of …` |
| NRVTS_22 `Revise current norms and standards on use of pesticides…` | 0.526 | `Support green development and enhance the livin…` |
| NRVTS_24 `Expanding the national network of special protected are…` | 0.562 | `expand special protected areas to reach 30% of …` |
| NRVTS_25 `Promote sustainable use of wetland ecosystems` | 0.5 | `Promote sustainable grassland management and st…` |
| NRVTS_26 (unreachable) `Develop the suitable system on payment for ecosystem se…` | 0.397 | `bring under the protection about 60% of all hea…` |
| NRVTS_27 `Research and development of PES` | 0.54 | `Support green development and enhance the livin…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `expand special protected areas to reach 30% of the total area;` | 0.562 | NBSAP_3 @ 0.573 |
| `bring under the protection about 60% of all headwaters;` | 0.397 | NBSAP_12 @ 0.456 |
| `introduce no-till soil processing in arable land;` | 0.438 | NDC_12 @ 0.484 |
| `improve water availability for arable land to increase the irrigated ar…` | 0.353 | FSS_15 @ 0.54 |
| `regulate and manage animal numbers in alignment with pasture carrying c…` | 0.43 | SECTORAL_5 @ 0.491 |
| `Maintain the appropriate ratio between types of animals and herd compos…` | 0.421 | NDC_13 @ 0.465 |
| `Support green development and enhance the living standards of herders a…` | 0.54 | NRVTS_27 @ 0.54 |

## ILDN (tier 1, ILDN, en)

8/8 gold quotes reachable. The ILDN gold does NOT come from the LDN TSP Country Report.

- Parse: 19/20 pages with text, 47,067 chars
- Extraction: 10 targets in 4.1s (fresh run); LLM calls 15 (15 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 11, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 11 quotes
- textCleanup: {'synthesis': 1, 'cleaned': 9}; provenance flags: 0
- Length (chars) gold p10/median/p90: 67/196/314 vs extracted: 71/139/195

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| ILDN_1 `The objective of this project is to reduce negative imp…` | 0.346 | `Reduce GHG emissions from deforestation and for…` |
| ILDN_2 `Sustainable forest management in Mongolia's forest land…` | 0.315 | `Reduce rate of pasture degradation; regulate he…` |
| ILDN_3 `The project aims to catalyze the strategic expansion of…` | 0.281 | `A comprehensive plan for emission reductions in…` |
| ILDN_4 `LDN targets: setting targets and establishing the level…` | 0.368 | `Restore 0.6 million hectares of degraded land u…` |
| ILDN_5 `Leverage and impact: catalyzing the multiple benefits t…` | 0.354 | `Make forests resilient to climate change by imp…` |
| ILDN_6 `Partnerships and resource mobilization: rationalizing e…` | 0.28 | `Reduce rate of pasture degradation; regulate he…` |
| ILDN_7 `Transformative action: designing and implementing bold …` | 0.432 | `Enhance and improve early warning and preventio…` |
| ILDN_8 `Monitoring and reporting: tracking progress towards ach…` | 0.311 | `Make forests resilient to climate change by imp…` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Mongolia has committed to set a national voluntary LDN target, establis…` | 0.287 | FSS_5 @ 0.426 |
| `Reduce GHG emissions from deforestation and forest degradation by 2% by…` | 0.346 | NRVTS_1 @ 0.538 |
| `A comprehensive plan for emission reductions in the livestock sub-secto…` | 0.311 | FSS_5 @ 0.386 |
| `Make forests resilient to climate change by improving their productivit…` | 0.354 | NBSAP_12 @ 0.43 |
| `Increase forest area to 9% by 2030 through reforestation activities; re…` | 0.245 | NBSAP_10 @ 0.491 |
| `Reduce bare fallow to 30%; introduce crop rotation system with 3-4 rout…` | 0.281 | NAP_15 @ 0.409 |
| `Reduce rate of pasture degradation; regulate headcounts and types of an…` | 0.323 | NRVTS_10 @ 0.45 |
| `Enhance and improve early warning and prevention systems for natural di…` | 0.432 | NDC_9 @ 0.52 |
| `Combat desertification, restore degraded land and soil, including land …` | 0.312 | SECTORAL_12 @ 0.554 |
| `Restore 0.6 million hectares of degraded land under the Bonn Challenge.` | 0.368 | FSS_15 @ 0.45 |

## HR (tier 2, HR, es)

Gold quotes are CO-composed (concatenated Excel action rows stamped textCleanup=verbatim by the ingest script); only ~13% of quote 4-grams appear contiguously in the PDF. Text-similarity matching only; never gates acceptance.

- Parse: 42/44 pages with text, 114,044 chars
- Extraction: 17 targets in 46.5s (fresh run); LLM calls 28 (0 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 22, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 22 quotes
- textCleanup: {'synthesis': 4, 'verbatim': 4, 'cleaned': 9}; provenance flags: 0
- Length (chars) gold p10/median/p90: 1343/2183/3396 vs extracted: 34/85/269

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| panama_HR_4 `Update and validate a national list of priority…` | `Fortalecimiento del SINAP.` | 0.9 | 0.0 | text |
| panama_HR_19 `Define the national framework of Multi-hazard E…` | `Sistemas de Alerta Temprana Multirriesgo.` | 0.9 | 0.0 | text |
| panama_HR_21 `Formalize the operational mandate of OSIGA (Int…` | `Planes locales y regionales de adaptación.` | 0.9 | 0.0 | text |
| panama_HR_23 `Publication of the Marine-Coastal Adaptation Pl…` | `Implementación de plan de adaptación marino – c…` | 0.9 | 0.0 | text |
| panama_HR_27 `Regulate and operationalize the Climate Risk Ob…` | `Observatorios de riesgo climático.` | 0.9 | 0.0 | text |
| panama_HR_29 `Harmonize the national Roadmap for the implemen…` | `Sistema Nacional de Monitoreo de Adaptación y P…` | 0.9 | 0.0 | text |
| panama_HR_26 `Formally constitute the National Integrated Mar…` | `Sistema Nacional Integrado de Monitoreo Marino–…` | 0.9 | 0.0 | text |
| panama_HR_9 `Carry out a comparative legal analysis on frame…` | `Información de recursos genéticos, distribución…` | 0.825 | 0.0 | text |
| panama_HR_2 `Update the National Forest Restoration Program.…` | `Restauración y corredores biológicos.` | 0.675 | 0.0 | text |
| panama_HR_16 `Build and adopt a national operational definiti…` | `Oficina del Sistema de Información Geoespacial …` | 0.63 | 0.0 | text |

### Unmatched gold

| gold | best score | closest extracted |
|---|---|---|
| panama_HR_1 (unreachable) `Define a prioritized portfolio of policies and measures…` | 0.45 | `Desarrollas instrumentos financieros innovadore…` |
| panama_HR_3 (unreachable) `Review and update the regulatory, normative, and operat…` | 0.6 | `Sistema Nacional Integrado de Monitoreo Marino–…` |
| panama_HR_5 (unreachable) `Identify and prioritize at least five regions of the co…` | 0.6 | `Planes locales y regionales de adaptación.` |
| panama_HR_6 (unreachable) `Identify and prioritize, at the national level, the mai…` | 0.72 | `Sistemas de Alerta Temprana Multirriesgo.` |
| panama_HR_7 (unreachable) `By 2035, Panama will reduce pollution and its cumulativ…` | 0.6 | `Implementación de plan de adaptación marino – c…` |
| panama_HR_8 (unreachable) `Define technical, social, and territorial criteria for …` | 0.6 | `Planes locales y regionales de adaptación.` |
| panama_HR_10 (unreachable) `Identify and prioritize productive sectors and consumpt…` | 0.54 | `Desarrollas instrumentos financieros innovadore…` |
| panama_HR_11 (unreachable) `Design and validate a standardized national methodology…` | 0.36 | `Oficina del Sistema de Información Geoespacial …` |
| panama_HR_12 (unreachable) `By 2035, Panama will have reduced mismanaged plastic po…` | 0.54 | `Sistemas de Alerta Temprana Multirriesgo.` |
| panama_HR_13 (unreachable) `Carry out an exhaustive mapping of competencies, curren…` | 0.525 | `Información de recursos genéticos, distribución…` |
| panama_HR_14 (unreachable) `Exhaustively review the analysis of incentives and subs…` | 0.675 | `Restauración y corredores biológicos.` |
| panama_HR_15 (unreachable) `Delimit and prioritize critical territories of illegal …` | 0.585 | `Desarrollas instrumentos financieros innovadore…` |
| panama_HR_17 (unreachable) `Define technical and climate criteria for the selection…` | 0.75 | `Planes locales y regionales de adaptación.` |
| panama_HR_18 (unreachable) `Build a national baseline of urban green and blue space…` | 0.75 | `Planes locales y regionales de adaptación.` |
| panama_HR_20 (unreachable) `Finalize the Adaptation Plan for the Energy Sector and …` | 0.562 | `Sistema Nacional de Monitoreo de Adaptación y P…` |
| panama_HR_22 (unreachable) `Define a standardized methodology for Local and Regiona…` | 0.9 | `Planes locales y regionales de adaptación.` |
| panama_HR_24 (unreachable) `Finalize the National Adaptation Plan for the Health Se…` | 0.787 | `Sistema Nacional de Monitoreo de Adaptación y P…` |
| panama_HR_25 (unreachable) `Formalize institutional agreements on data flow per ind…` | 0.675 | `Observatorios de riesgo climático.` |
| panama_HR_28 (unreachable) `Formalize the financial architecture of the Nature Pled…` | 0.675 | `Sistema Nacional de Monitoreo de Adaptación y P…` |
| panama_HR_30 (unreachable) `Finalize the process of technical, inter-institutional,…` | 0.45 | `Observatorios de riesgo climático.` |

### Unmatched extracted (gold may simply not cover these)

| extracted | best gold score (this doc) | closest gold anywhere in corpus |
|---|---|---|
| `Reducir sus emisiones de gases de efecto invernadero en un 11 % al año …` | 0.386 | panama_NP_7 @ 0.47 |
| `Implementar programas permanentes de capacitación y certificación; prom…` | 0.4 | panama_PEG_3 @ 0.5 |
| `Armonizar y actualizar marcos normativos bajo una visión común, integra…` | 0.39 | panama_HR_30 @ 0.39 |
| `Desarrollas instrumentos financieros innovadores; fortalecer el Fondo P…` | 0.585 | panama_HR_15 @ 0.585 |
| `Desarrollar un sistema nacional unificado de MRV, apoyado en la PNTC, q…` | 0.428 | panama_HR_2 @ 0.428 |
| `Impulsar la adopción de tecnologías emergentes (teledetección, intelige…` | 0.514 | panama_HR_27 @ 0.514 |
| `Fortalecer la gobernanza participativa; establecer acuerdos de conserva…` | 0.43 | panama_ENR_77 @ 0.54 |
