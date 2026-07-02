# Extraction eval report: `sri-lanka-2jul26`

- Generated: 2026-07-02T12:11:30+00:00  ·  git `0e42c54`  ·  model `gpt-5.4` (concurrency 4)
- Prompt hash: `be58bec8117e` (changes when any extraction prompt changes and the LLM cache invalidates)
- Thresholds: similarity >= 0.6, quote-Jaccard >= 0.3, reachable >= 0.5

Gold is not exhaustive: `extraction matched` is a soft precision proxy, not a target to optimise.
`recall (reachable)` counts only gold targets whose curated quotes actually occur in the parsed local PDF.

## Headline (tier 1 = quote-anchored gold; tier 2 similarity-only, reported separately)

| doc | tier | gold | reachable | extracted | matched | recall (reachable) | recall (raw) | extraction matched | granularity | verbatim quotes found | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SL-PPPP | 1 | 4 | 0 | 0 | 0 | n/a | 0% | n/a | 0.0 | 0/0 | 0 |
| SL-NAP | 1 | 192 | 188 | 24 | 24 | 11% | 12% | 100% | 0.12 | 40/40 | 0 |

## SL-PPPP (tier 1, PPPP, en)

Expert gold from data_sri_lanka_2Jul26.xlsx (fresh, uncontaminated): only 4 rows at component level (very coarse curation). Gold sourceText is the curated text itself, so reachability measures whether the expert text is verbatim-findable.

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

## SL-NAP (tier 1, NAP, en)

Expert gold from data_sri_lanka_2Jul26.xlsx (fresh, uncontaminated): 192 rows across THREE levels (Goals, Statements, Actions X.Y — the Resolution-36 pattern). By the pipeline's granularity rules the Action rows belong in activities, not targets; read recall level-aware and check the goldCoveredByActivities metric. NAP here = National AGRICULTURAL Policy, not adaptation plan.

- Parse: 20/20 pages with text, 88,169 chars
- Extraction: 24 targets in 19.1s (fresh run); LLM calls 34 (10 cached); content-filter warnings 0, parse-failure warnings 0
- Quote match levels: {'exact': 40, 'normalized': 0, 'fuzzy': 0, 'not_found': 0} of 40 quotes
- textCleanup: {'cleaned': 21, 'synthesis': 3}; provenance flags: 0
- Length (chars) gold p10/median/p90: 71/116/186 vs extracted: 91/142/214

### Matched pairs

| gold | extracted | text | quote | via |
|---|---|---|---|---|
| NAP_1 `Double the resource-productivity (compared to 2…` | `Double the resource-productivity (compared to 2…` | 1.0 | 0.909 | text |
| NAP_2 `Double the economic profitability of farmers/ag…` | `Double the economic profitability of farmers/ag…` | 1.0 | 0.857 | text |
| NAP_3 `Increase the contribution of the Agri-Food Syst…` | `Increase the contribution of the Agri-Food Syst…` | 1.0 | 0.875 | text |
| NAP_4 `Increase the adoption of technology developed l…` | `Increase the adoption of technology developed l…` | 1.0 | 0.938 | text |
| NAP_5 `Increase the high quality and high yielding see…` | `Increase the high quality and high yielding see…` | 1.0 | 0.923 | text |
| NAP_6 `Increase the eco - friendly inputs application …` | `Increase the eco-friendly inputs application in…` | 1.0 | 0.875 | text |
| NAP_8 `Establish a government-regulated food and feed …` | `Establish a government-regulated food and feed …` | 1.0 | 0.889 | text |
| NAP_10 `Establish a constituted role and mandatory part…` | `Establish a constituted role and mandatory part…` | 1.0 | 0.909 | text |
| NAP_13 `Improve production and productivity of food and…` | `Improve production and productivity of food and…` | 1.0 | 0.952 | text |
| NAP_30 `Strengthen delivery and management operations o…` | `Strengthen delivery and management operations o…` | 1.0 | 0.833 | text |
| NAP_121 `Streamline and explore the domestic and interna…` | `Streamline and explore the domestic and interna…` | 1.0 | 0.929 | text |
| NAP_139 `Empower youth and women in agriculture with sup…` | `Empower youth and women in agriculture with sup…` | 1.0 | 0.923 | text |
| NAP_177 `Strengthen institutional coordination mechanism…` | `Strengthen institutional coordination mechanism…` | 1.0 | 0.944 | text |
| NAP_153 `Constitute a centrally-controlled information d…` | `Constitute a centrally-controlled information d…` | 0.997 | 0.391 | text |
| NAP_128 `Strengthen partnerships and mentorship programm…` | `Strengthen partnerships and mentorship programm…` | 0.997 | 0.579 | text |
| NAP_46 `Improve productivity and sustainability of arab…` | `Improve productivity and sustainability of arab…` | 0.997 | 0.684 | text |
| NAP_72 `Encourage development and adoption of appropria…` | `Encourage development and adoption of appropria…` | 0.997 | 0.6 | text |
| NAP_91 `Support sustainability in agriculture developme…` | `Support sustainability in agriculture developme…` | 0.997 | 0.0 | text |
| NAP_63 `Enhance rational use of irrigation water throug…` | `Enhance rational use of irrigation water throug…` | 0.996 | 0.125 | text |
| NAP_149 `Strengthen food systems by connecting urban and…` | `Strengthen food systems by connecting urban and…` | 0.995 | 0.2 | text |
| NAP_82 `Improve access to safe and high-quality food an…` | `Supply safe and quality food and feed in compli…` | 0.9 | 0.938 | quote |
| NAP_12 `Establish a system of transparent, accountable,…` | `Establish a system of transparent, accountable,…` | 0.934 | 0.889 | text |
| NAP_102 `Foster strategic collaboration among the value …` | `Establish farmer/agri-producer groups with Agri…` | 0.9 | 0.923 | quote |
| NAP_11 `Build an agri-food system in Sri Lanka that is …` | `Build an agri-food system in Sri Lanka that is …` | 0.9 | 0.9 | quote |

### Unmatched gold (81 of these captured at activity level)

| gold | best score | in activities | closest extracted |
|---|---|---|---|
| NAP_7 `Supply safe and quality food and feed in compliance wit…` | 0.917 | 0.257 | `Supply safe and quality food and feed in compli…` |
| NAP_9 `Establish farmer/agri-producer groups with Agri-entrepr…` | 0.9 | 0.375 | `Establish farmer/agri-producer groups with Agri…` |
| NAP_14 `Prepare, approve and adopt guidelines for Good Agricult…` | 0.2 | **1.0** | `Improve production and productivity of food and…` |
| NAP_15 `Adopt need-based Crop Prioritization (national and prov…` | 0.2 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_16 `Introduce measures to minimize temporal variation in pr…` | 0.35 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_17 `Adopt measures to produce more with less inputs (enhanc…` | 0.15 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_18 `Adopt Precision Agriculture systems (e.g., new technolo…` | 0.431 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_19 `Support adoption of novel and appropriate technology/me…` | 0.45 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_20 `Encourage and strengthen Climate-Smart Agriculture (CSA…` | 0.415 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_21 `Facilitate new technology generation and adoption (e.g.…` | 0.225 | **1.0** | `Encourage development and adoption of appropria…` |
| NAP_22 `Manage wildlife, based on the carrying capacity of ecos…` | 0.3 | **0.998** | `Strengthen delivery and management operations o…` |
| NAP_23 `Improve productivity of existing farm units (with assur…` | 0.3 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_24 `Introduce low-interest loan schemes (credit) to facilit…` | 0.3 | **1.0** | `Improve production and productivity of food and…` |
| NAP_25 `Establish private-public-producer partnerships (PPPP) f…` | 0.105 | 0.3 | `Strengthen delivery and management operations o…` |
| NAP_26 `Promote cropping systems and cropping patterns that pro…` | 0.45 | 0.375 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_27 `Promote and support systematic home gardening` | 0.1 | 0.45 | `Support sustainability in agriculture developme…` |
| NAP_28 `Promote different production technologies (e.g., vertic…` | 0.24 | 0.415 | `Strengthen food systems by connecting urban and…` |
| NAP_29 `Develop and implement a national cropping plan for prio…` | 0.225 | 0.3 | `Supply safe and quality food and feed in compli…` |
| NAP_31 `Allocation of an adequate budget to carry out operation…` | 0.225 | 0.225 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_32 `Timely supply and/or production of quality inputs inclu…` | 0.468 | 0.537 | `Increase the high quality and high yielding see…` |
| NAP_33 `Establish a mechanism through PPP to ensure availabilit…` | 0.455 | 0.479 | `Increase the high quality and high yielding see…` |
| NAP_34 `Decentralize and strengthen seed certification process …` | 0.3 | 0.3 | `Strengthen institutional coordination mechanism…` |
| NAP_35 `Establish regional level supply/service/renting machine…` | 0.045 | 0.27 | `Establish a system of transparent, accountable,…` |
| NAP_36 `Establish village seed banks for conservation and susta…` | 0.3 | **0.825** | `Establish a system of transparent, accountable,…` |
| NAP_37 `Promote private sector investment for local production …` | 0.318 | 0.4 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_38 `Establish a mechanism to certify machinery and other ag…` | 0.286 | 0.472 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_39 `Establish a mechanism/system for production of fertiliz…` | 0.415 | 0.431 | `Establish a system of transparent, accountable,…` |
| NAP_40 `Take periodic measures to establish, re-visit, assess a…` | 0.225 | 0.338 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_41 `Enforce a regulatory framework for organic/bio fertiliz…` | 0.1 | 0.4 | `Establish a system of transparent, accountable,…` |
| NAP_42 `Provide authority to FOs, FPOs and FPCs to initiate act…` | 0.3 | 0.451 | `Empower youth and women in agriculture with sup…` |
| NAP_43 `Strengthen the mechanism involved in fertilizer import/…` | 0.425 | 0.257 | `Increase the high quality and high yielding see…` |
| NAP_44 `Establish a mechanism to provide organized skilled-labo…` | 0.225 | 0.45 | `Supply safe and quality food and feed in compli…` |
| NAP_45 `Enforce regulations strictly in import, production and …` | 0.386 | 0.409 | `Increase the eco-friendly inputs application in…` |
| NAP_47 `Promote adoption of seeds and planting material of loca…` | 0.4 | **1.0** | `Increase the high quality and high yielding see…` |
| NAP_48 `Adopt measures to optimize the use of fertilizer with a…` | 0.277 | **1.0** | `Enhance rational use of irrigation water throug…` |
| NAP_49 `Introduce and adopt new and appropriate technologies fo…` | 0.257 | **1.0** | `Encourage development and adoption of appropria…` |
| NAP_50 `Adopt a productivity-based and priority-based incentive…` | 0.386 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_51 `Introduce incentive-based mechanism for gradual replace…` | 0.208 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_52 `Enforce regulatory measures to safeguard ecosystem serv…` | 0.095 | **1.0** | `Support sustainability in agriculture developme…` |
| NAP_53 `Adopt a prescription-based sale and use of pesticides –…` | 0.225 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_54 `Establish a system to promote integrated pest/weed mana…` | 0.277 | **1.0** | `Establish a system of transparent, accountable,…` |
| NAP_55 `Introduce and promote adoption of novel and appropriate…` | 0.225 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_56 `Develop and implement plans to increase the extent of l…` | 0.332 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_57 `Introduce and increase the use of Precision agriculture…` | 0.415 | **1.0** | `Enhance rational use of irrigation water throug…` |
| NAP_58 `Conduct Continuing Professional Development (CPD) progr…` | 0.423 | **1.0** | `Encourage development and adoption of appropria…` |
| NAP_59 `Adopt measures to minimize abandoned lands from agricul…` | 0.083 | **1.0** | `Encourage development and adoption of appropria…` |
| NAP_60 `Implement a social audit system as a mandatory activity…` | 0.281 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_61 `Establish agro-industrial zones using farmer cluster ap…` | 0.24 | **1.0** | `Establish farmer/agri-producer groups with Agri…` |
| NAP_62 `Provide economic incentives based on cluster approach` | 0.062 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_64 `Take appropriate regulatory measures to avoid excessive…` | 0.327 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_65 `Promote rainwater harvesting for agricultural purposes` | 0.095 | 0.154 | `Encourage development and adoption of appropria…` |
| NAP_66 `Adopt water-saving technologies such as drip-irrigation…` | 0.277 | 0.281 | `Enhance rational use of irrigation water throug…` |
| NAP_67 `Adopt soil and water conservations measures to control …` | 0.245 | 0.491 | `Supply safe and quality food and feed in compli…` |
| NAP_68 `Adopt catchment management practices by an effective im…` | 0.208 | 0.346 | `Double the resource-productivity (compared to 2…` |
| NAP_69 `Adopt third season cultivation in paddy fields using re…` | 0.045 | 0.083 | `Increase the eco-friendly inputs application in…` |
| NAP_70 `Rehabilitate reservoirs and irrigation systems with the…` | 0.346 | 0.362 | `Enhance rational use of irrigation water throug…` |
| NAP_71 `Integrate activities to ensure fish farming in reservoi…` | 0.189 | 0.3 | `Supply safe and quality food and feed in compli…` |
| NAP_73 `Establish a formal and a well-coordinated mechanism to …` | 0.277 | **1.0** | `Establish a system of transparent, accountable,…` |
| NAP_74 `Provide financial and institutional support to develop …` | 0.193 | **1.0** | `Support sustainability in agriculture developme…` |
| NAP_75 `Upgrade the system of crop production forecasting with …` | 0.4 | **1.0** | `Increase the high quality and high yielding see…` |
| NAP_76 `Promote adoption of technologies targeting value additi…` | 0.4 | **1.0** | `Encourage development and adoption of appropria…` |
| NAP_77 `Adopt correct harvest and pre-harvest technologies, inc…` | 0.3 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_78 `Strengthen technology transfer mechanisms through appro…` | 0.087 | **1.0** | `Strengthen partnerships and mentorship programm…` |
| NAP_79 `Re-visit and restructure existing authoritative body re…` | 0.284 | **1.0** | `Constitute a centrally-controlled information d…` |
| NAP_80 `Adopt mechanisms to promote use of ICT-based agriculture` | 0.4 | 0.5 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_81 `Introduce proven and appropriate technology into the se…` | 0.245 | 0.45 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_83 `Develop and adopt regulations to ensure food and feed s…` | 0.409 | 0.321 | `Supply safe and quality food and feed in compli…` |
| NAP_84 `Incentivize adoption of GAP/Organic agriculture /Ecolog…` | 0.386 | 0.514 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_85 `Establish state of the art laboratories to monitor food…` | 0.5 | 0.277 | `Supply safe and quality food and feed in compli…` |
| NAP_86 `Develop and strictly adopt food safety standards (with …` | 0.45 | 0.452 | `Supply safe and quality food and feed in compli…` |
| NAP_87 `Adopt standard process control measures for food produc…` | 0.327 | 0.45 | `Supply safe and quality food and feed in compli…` |
| NAP_88 `Adopt a stringent labeling system for food products, es…` | 0.332 | 0.386 | `Establish farmer/agri-producer groups with Agri…` |
| NAP_89 `Revisit village fair/farmers market system while promot…` | 0.277 | 0.3 | `Increase the eco-friendly inputs application in…` |
| NAP_90 `Encourage the use of non-traditional food resources` | 0.338 | 0.338 | `Increase the contribution of the Agri-Food Syst…` |
| NAP_92 `Introduce and adopt eco-friendly agricultural practices…` | 0.373 | **1.0** | `Double the resource-productivity (compared to 2…` |
| NAP_93 `Ensure availability of locally improved seed and planti…` | 0.441 | **1.0** | `Increase the high quality and high yielding see…` |
| NAP_94 `Establish village seeds banks for germplasm conservatio…` | 0.281 | **1.0** | `Support sustainability in agriculture developme…` |
| NAP_95 `Introduce and adopt modern eco-friendly input managemen…` | 0.375 | **1.0** | `Strengthen delivery and management operations o…` |
| NAP_96 `Adopt a mechanism to have a mandatory involvement of mu…` | 0.277 | **1.0** | `Increase the eco-friendly inputs application in…` |
| NAP_97 `Adopt stringent measures of plant quarantine by strengt…` | 0.225 | **1.0** | `Increase the high quality and high yielding see…` |
| NAP_98 `Adopt a well-organized surveillance system for early-wa…` | 0.36 | **1.0** | `Improve production and productivity of food and…` |
| NAP_99 `Take appropriate measures to increase the use of renewa…` | 0.35 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_100 `Promote farming systems with crop-animal integration wh…` | 0.087 | **1.0** | `Streamline and explore the domestic and interna…` |
| NAP_101 `Adopt mechanisms to ensure conformity of agricultural p…` | 0.284 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_103 `Establish an effective Agriculture Enterprise Resource …` | 0.237 | 0.277 | `Constitute a centrally-controlled information d…` |
| NAP_104 `Establish a market-oriented production system` | 0.45 | **0.673** | `Establish a government-regulated food and feed …` |
| NAP_105 `Establish a marketing network through the Agrarian Serv…` | 0.327 | 0.525 | `Establish a constituted role and mandatory part…` |
| NAP_106 `Establish a market mechanism to ensure higher returns a…` | 0.257 | 0.438 | `Establish a constituted role and mandatory part…` |
| NAP_107 `Adopt a minimum price for staple crop products` | 0.105 | 0.338 | `Establish a system of transparent, accountable,…` |
| NAP_108 `Provide seed-funds and enhance management capacity of f…` | 0.277 | 0.321 | `Enhance rational use of irrigation water throug…` |
| NAP_109 `Identify niche markets to promote products originated f…` | 0.054 | 0.27 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_110 `Build capacity of the FOs/FPOs, SMEs and existing marke…` | 0.368 | 0.3 | `Establish farmer/agri-producer groups with Agri…` |
| NAP_111 `Create and strengthen value chains of priority crops to…` | 0.225 | 0.421 | `Double the economic profitability of farmers/ag…` |
| NAP_112 `Establish a target-based supply chain management system…` | 0.3 | 0.386 | `Establish a system of transparent, accountable,…` |
| NAP_113 `Develop and adopt regulatory measures to implement stan…` | 0.277 | 0.485 | `Establish farmer/agri-producer groups with Agri…` |
| NAP_114 `Introduce and adopt appropriate and modern technologies…` | 0.277 | 0.519 | `Establish farmer/agri-producer groups with Agri…` |
| NAP_115 `Provide support to strengthen infrastructure for value …` | 0.3 | 0.45 | `Strengthen delivery and management operations o…` |
| NAP_116 `Adopt a well-planned demand-oriented cultivation system…` | 0.225 | 0.514 | `Improve production and productivity of food and…` |
| NAP_117 `Introduce and adopt measures to strengthen inter-instit…` | 0.18 | 0.321 | `Strengthen food systems by connecting urban and…` |
| NAP_118 `Ensure availability of credit facilities for agricultur…` | 0.3 | 0.45 | `Increase the adoption of technology developed l…` |
| NAP_119 `Strengthen processing ventures through Farmer Producer …` | 0.27 | 0.36 | `Establish farmer/agri-producer groups with Agri…` |
| NAP_120 `Establish regional-level common processing facilities` | 0.056 | 0.118 | `Establish a system of transparent, accountable,…` |
| NAP_122 `Take appropriate measures to strengthen logistics manag…` | 0.225 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_123 `Introduce and adopt mechanisms and technology for trace…` | 0.245 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_124 `Adopt warehouse receipting system for durables (e.g., g…` | 0.083 | **1.0** | `Establish a system of transparent, accountable,…` |
| NAP_125 `Establish temperature- and RH-controlled storage and co…` | 0.208 | **1.0** | `Establish farmer/agri-producer groups with Agri…` |
| NAP_126 `Adopt systems to promote branding at farm-gate level to…` | 0.281 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_127 `Strengthen District Economic Centers (DECs) as regulate…` | 0.08 | 0.111 | `Establish a government-regulated food and feed …` |
| NAP_129 `Establish farmer producer organizations leading to a fa…` | 0.263 | **1.0** | `Establish farmer/agri-producer groups with Agri…` |
| NAP_130 `Create awareness among farming community on cost: benef…` | 0.265 | **1.0** | `Improve productivity and sustainability of arab…` |
| NAP_131 `Establish farmer-oriented banking system (e.g., Farmers…` | 0.277 | **0.996** | `Establish a system of transparent, accountable,…` |
| NAP_132 `Re-orient and strengthen the development bank system to…` | 0.477 | **1.0** | `Constitute a centrally-controlled information d…` |
| NAP_133 `Establish a mechanism to register and recognize fulltim…` | 0.41 | **1.0** | `Establish a constituted role and mandatory part…` |
| NAP_134 `Establish a strong network of Agrarian Centers, Farmer …` | 0.208 | **1.0** | `Establish a system of transparent, accountable,…` |
| NAP_135 `Establish agro-industrial zones using farmer-cluster ap…` | 0.169 | **1.0** | `Establish farmer/agri-producer groups with Agri…` |
| NAP_136 `Establish a mechanism to ensure farmers access new tech…` | 0.281 | **1.0** | `Establish a constituted role and mandatory part…` |
| NAP_137 `Establish an agricultural product procuring and distrib…` | 0.346 | **1.0** | `Establish a system of transparent, accountable,…` |
| NAP_138 `Establish a mechanism to fully utilize agriculture dipl…` | 0.45 | 0.476 | `Establish a constituted role and mandatory part…` |
| NAP_140 `Support gender-based development in agriculture includi…` | 0.397 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_141 `Take appropriate measures to incentivize youth engageme…` | 0.532 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_142 (unreachable) `Promote adoption of appropriate adaptation and mitigati…` | 0.836 | 0.514 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_143 `Design and adopt weather index-based climate risk manag…` | 0.1 | 0.36 | `Strengthen delivery and management operations o…` |
| NAP_144 `Establish a seasonal Agro-met Advisory (AMA) issuing me…` | 0.338 | 0.277 | `Establish a constituted role and mandatory part…` |
| NAP_145 `Adhere to the actions related to agriculture identified…` | 0.315 | 0.321 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_146 `Continue and further strengthen breeding programmes and…` | 0.265 | 0.487 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_147 `Propose and adopt financial incentives to use renewable…` | 0.327 | **0.736** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_148 `Take measures to discourage burning of crop biomass and…` | 0.257 | 0.327 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_150 `Adopt crisis management mechanisms to meet the food dem…` | 0.225 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_151 `Identify and strengthen critical nodes of the city regi…` | 0.432 | **1.0** | `Strengthen food systems by connecting urban and…` |
| NAP_152 `Establish an inter-ministerial core group including cen…` | 0.24 | **1.0** | `Strengthen food systems by connecting urban and…` |
| NAP_154 `Establish a demand-driven agriculture research program …` | 0.3 | **1.0** | `Constitute a centrally-controlled information d…` |
| NAP_155 `Provide appropriate incentives (financial & physical) t…` | 0.225 | **1.0** | `Build an agri-food system in Sri Lanka that is …` |
| NAP_156 `Invest on research and development to produce hybrids a…` | 0.25 | **1.0** | `Supply safe and quality food and feed in compli…` |
| NAP_157 `Facilitate and strengthen agriculture education at prim…` | 0.36 | **1.0** | `Strengthen institutional coordination mechanism…` |
| NAP_158 `Establish real-time agriculture data base with continuo…` | 0.277 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_159 `Incorporate agriculture progressively as a compulsory s…` | 0.062 | **1.0** | `Constitute a centrally-controlled information d…` |
| NAP_160 `Incorporate more skills development in ancient agricult…` | 0.371 | **1.0** | `Empower youth and women in agriculture with sup…` |
| NAP_161 `Adopt a market oriented agricultural extension system` | 0.386 | **1.0** | `Improve production and productivity of food and…` |
| NAP_162 `Strengthen PPP to ensure effective information dissemin…` | 0.4 | **1.0** | `Constitute a centrally-controlled information d…` |
| NAP_163 `Establish a centrally coordinated agriculture extension…` | 0.388 | **1.0** | `Constitute a centrally-controlled information d…` |
| NAP_164 `Re-visit the grass root level extension modalities incl…` | 0.142 | **1.0** | `Increase the adoption of technology developed l…` |
| NAP_165 `Create awareness and promote adoption of novel technolo…` | 0.3 | **0.909** | `Strengthen delivery and management operations o…` |
| NAP_166 `Provide advisory and advocacy to support evidence-based…` | 0.375 | **1.0** | `Establish a constituted role and mandatory part…` |
| NAP_167 `Institute a market-oriented agriculture extension syste…` | 0.327 | **0.712** | `Constitute a centrally-controlled information d…` |
| NAP_168 `Adopt an efficient system for dissemination of market i…` | 0.3 | 0.455 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_169 `Build knowledge on judicious use of fertilizer and pest…` | 0.4 | 0.5 | `Strengthen delivery and management operations o…` |
| NAP_170 `Conduct knowledge building programs targeting of office…` | 0.327 | 0.409 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_171 `Develop and adopt recruitment criteria to agriculture r…` | 0.3 | 0.321 | `Constitute a centrally-controlled information d…` |
| NAP_172 `Develop and establish a mechanism to increase the invol…` | 0.45 | 0.516 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_173 `Conduct outreach programs with a view to build knowledg…` | 0.24 | 0.3 | `Supply safe and quality food and feed in compli…` |
| NAP_174 `Develop a mechanism for progressive allocation of finan…` | 0.257 | 0.277 | `Supply safe and quality food and feed in compli…` |
| NAP_175 `Develop and implement training programs to minimize occ…` | 0.277 | 0.346 | `Empower youth and women in agriculture with sup…` |
| NAP_176 `Adopt farmer field schools (FFS) approach as a means of…` | 0.208 | 0.3 | `Constitute a centrally-controlled information d…` |
| NAP_178 `Establish a policy implementation, and monitoring and e…` | 0.327 | 0.225 | `Strengthen institutional coordination mechanism…` |
| NAP_179 `Establish an effective coordination mechanism among lin…` | 0.3 | 0.4 | `Double the economic profitability of farmers/ag…` |
| NAP_180 `Adopt a stable taxation and fiscal policy system to pro…` | 0.3 | 0.386 | `Constitute a centrally-controlled information d…` |
| NAP_181 `Regulate imports based on annual/seasonal production ta…` | 0.061 | 0.338 | `Supply safe and quality food and feed in compli…` |
| NAP_182 `Re-define mandatory functions of line agencies to compl…` | 0.441 | 0.45 | `Establish a constituted role and mandatory part…` |
| NAP_183 `Adopt a mechanism for policy integration through the in…` | 0.245 | 0.321 | `Increase the contribution of the Agri-Food Syst…` |
| NAP_184 `Adopt a performance-based work evaluation of the state …` | 0.434 | 0.479 | `Increase the contribution of the Agri-Food Syst…` |
| NAP_185 `Update/develop and implement relevant Acts/ordinances a…` | 0.25 | 0.25 | `Supply safe and quality food and feed in compli…` |
| NAP_186 `Adopt participatory approaches involving engagement of …` | 0.45 | 0.45 | `Establish a constituted role and mandatory part…` |
| NAP_187 `Impose regulations including punitive actions for viola…` | 0.225 | 0.3 | `Supply safe and quality food and feed in compli…` |
| NAP_188 `Constitute the involvement of private sector and develo…` | 0.486 | 0.42 | `Constitute a centrally-controlled information d…` |
| NAP_189 `Adopt a mechanism to implement professional development…` | 0.444 | 0.544 | `Constitute a centrally-controlled information d…` |
| NAP_190 `Institute a performance-based reward system in agricult…` | 0.245 | 0.412 | `Build an agri-food system in Sri Lanka that is …` |
| NAP_191 `Take measures to remove financial and regulatory constr…` | 0.265 | 0.491 | `Encourage development and adoption of appropria…` |
| NAP_192 `Harmonize with agriculture related acts and other polic…` | 0.327 | 0.245 | `Empower youth and women in agriculture with sup…` |

### Unmatched extracted (gold may simply not cover these)

None.
