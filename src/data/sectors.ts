import type { IpccSector } from "@/types";

/**
 * IPCC sectors used for sectoral classification of policy targets and measures.
 *
 * Descriptions are verbatim quotes from the cited section of the
 * 2006 IPCC Guidelines for National Greenhouse Gas Inventories
 * (https://www.ipcc-nggip.iges.or.jp/public/2006gl/). Each entry
 * carries an explicit `source` field pointing at the volume / chapter
 * / section the description is drawn from.
 *
 * Three project-specific deviations from the canonical 2006 categorisation:
 *
 *   1. Transport (1A3 Mobile Combustion) is a sub-category of Energy in
 *      IPCC inventories but is tracked here as its own sector because
 *      transport policy interventions are distinct.
 *   2. Agriculture and LULUCF are presented separately, matching the
 *      legacy 1996 split that many country reports (and CRT/BTR
 *      reporting tables) still use, rather than the combined AFOLU
 *      sector of the 2006 Guidelines. Their descriptions are extracted
 *      from the AFOLU "Guidance and methods" enumeration in Vol. 4.
 *   3. "Other / Cross-cutting" is project-defined; it is NOT an IPCC
 *      sector. It exists as a catch-all for policy measures that span
 *      multiple sectors.
 */
export const IPCC_SECTORS: IpccSector[] = [
  {
    id: "sector_energy",
    name: "Energy",
    description:
      "The energy sector mainly comprises: exploration and exploitation of primary energy sources, conversion of primary energy sources into more useable energy forms in refineries and power plants, transmission and distribution of fuels, use of fuels in stationary and mobile applications. Emissions arise from these activities by combustion and as fugitive emissions, or escape without combustion.",
    source:
      "IPCC 2006 Guidelines, Vol. 2 Ch. 1 §1.2 (Source Categories) — verbatim",
  },
  {
    id: "sector_transport",
    name: "Transport",
    description:
      "Mobile sources produce direct greenhouse gas emissions of carbon dioxide (CO2), methane (CH4) and nitrous oxide (N2O) from the combustion of various fuel types. Greenhouse gas emissions from mobile combustion are most easily estimated by major transport activity, i.e., road, off-road, air, railways, and water-borne navigation. (1A3 TRANSPORT: Emissions from the combustion and evaporation of fuel for all transport activity, excluding military transport, regardless of the sector, specified by sub-categories below.) Reported as IPCC code 1A3, a sub-category of Energy, but tracked separately here for policy purposes.",
    source:
      "IPCC 2006 Guidelines, Vol. 2 Ch. 3 §3.1 (Overview) + Table 3.1.1 (1A3 Transport) — verbatim quotes; framing sentence about policy-purpose split is project-added",
  },
  {
    id: "sector_ippu",
    name: "Industrial processes and product use",
    description:
      "This volume, Industrial Processes and Product Use (IPPU), covers greenhouse gas emissions occurring from industrial processes, from the use of greenhouse gases in products, and from non-energy uses of fossil fuel carbon. The main emission sources are releases from industrial processes that chemically or physically transform materials (for example, the blast furnace in the iron and steel industry, ammonia and other chemical products manufactured from fossil fuels used as chemical feedstock and the cement industry are notable examples of industrial processes that release a significant amount of CO2). During these processes, many different greenhouse gases, including carbon dioxide (CO2), methane (CH4), nitrous oxide (N2O), hydrofluorocarbons (HFCs) and perfluorocarbons (PFCs), can be produced.",
    source:
      "IPCC 2006 Guidelines, Vol. 3 Ch. 1 §1.1 (Introduction) — verbatim, paragraphs 1-2",
  },
  {
    id: "sector_agriculture",
    name: "Agriculture",
    description:
      "Sub-sector of AFOLU (Agriculture, Forestry and Other Land Use) covering, per the AFOLU Sector Guidance and methods enumeration: CH4 emission from livestock (enteric fermentation); CH4 and N2O emissions from manure management systems; CH4 emissions from rice cultivation; N2O emissions from all managed soils; CO2 emissions associated with liming and urea application to managed soils.",
    source:
      "IPCC 2006 Guidelines, Vol. 4 Ch. 1 §1.1 — verbatim items from the AFOLU 'Guidance and methods' enumeration; framing as a separate Agriculture sub-sector matches legacy 1996 / CRT reporting (2006 Guidelines treat AFOLU as one sector)",
  },
  {
    id: "sector_lulucf",
    name: "Land use, land-use change and forestry (LULUCF)",
    description:
      "Sub-sector of AFOLU covering, per the 2006 Guidelines: CO2 emissions and removals resulting from C stock changes in biomass, dead organic matter and mineral soils, for all managed lands; CO2 and non-CO2 emissions from fire on all managed land; CO2 and N2O emissions from cultivated organic soils; CO2 and N2O emissions from managed wetlands; C stock change associated with harvested wood products. Six land-use categories used in GPG-LULUCF (i.e., Forest Land, Cropland, Grassland, Wetlands, Settlements, and Other Land), further sub-divided into land remaining in the same category and land converted from one category to another.",
    source:
      "IPCC 2006 Guidelines, Vol. 4 Ch. 1 §1.1 — verbatim items from the AFOLU 'Guidance and methods' enumeration plus the six-land-use-categories paragraph; framing as a separate LULUCF sub-sector matches legacy 1996 / CRT reporting",
  },
  {
    id: "sector_waste",
    name: "Waste",
    description:
      "The Waste volume gives methodological guidance for estimation of carbon dioxide (CO2), methane (CH4) and nitrous oxide (N2O) emissions from following categories: Solid waste disposal (Chapter 3); Biological treatment of solid waste (Chapter 4); Incineration and open burning of waste (Chapter 5); Wastewater treatment and discharge (Chapter 6).",
    source:
      "IPCC 2006 Guidelines, Vol. 5 Ch. 1 §1.1 (Introduction) — verbatim",
  },
  {
    id: "sector_other",
    name: "Other / Cross-cutting",
    description:
      "Project-defined catch-all (NOT an IPCC sector) for policy measures that span multiple IPCC sectors or do not fit any single sector. Used for cross-cutting frameworks, institutional capacity, education, gender mainstreaming, finance mechanisms, and health- or water-related climate measures.",
    source: "Project-defined; not present in IPCC 2006 Guidelines",
  },
];
