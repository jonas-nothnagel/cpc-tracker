import type { IpccSector } from "@/types";

/**
 * 7 IPCC sectors for sectoral classification.
 * Source: 2006 IPCC Guidelines for National Greenhouse Gas Inventories.
 * Transport is separated from Energy for policy-level tracking (as in CTF/BTR).
 */
export const IPCC_SECTORS: IpccSector[] = [
  {
    id: "sector_energy",
    name: "Energy",
    description:
      "Fuel combustion activities including electricity and heat production, petroleum refining, manufacturing and construction industries. Fugitive emissions from solid fuels, oil, and natural gas systems.",
  },
  {
    id: "sector_transport",
    name: "Transport",
    description:
      "All GHG emissions from fuel combustion for transportation: road, railways, domestic aviation, domestic navigation, pipeline and off-road transport. Tracked separately from Energy due to distinct policy interventions.",
  },
  {
    id: "sector_ippu",
    name: "Industrial processes and product use",
    description:
      "GHG emissions from industrial processes that chemically or physically transform materials, and from product use including fluorinated gases (HFCs, PFCs, SF6).",
  },
  {
    id: "sector_agriculture",
    name: "Agriculture",
    description:
      "Non-CO2 GHG emissions from agricultural activities: enteric fermentation, manure management, rice cultivation, agricultural soils, prescribed burning of savannas, field burning of agricultural residues.",
  },
  {
    id: "sector_lulucf",
    name: "Land use, land-use change and forestry (LULUCF)",
    description:
      "GHG emissions and removals from land use and forestry: forest land, cropland, grassland, wetlands, settlements, other land. Includes carbon stock changes, afforestation, deforestation, and harvested wood products.",
  },
  {
    id: "sector_waste",
    name: "Waste",
    description:
      "GHG emissions from waste management: solid waste disposal on land, biological treatment of solid waste, incineration, open burning, wastewater treatment and discharge.",
  },
  {
    id: "sector_other",
    name: "Other / Cross-cutting",
    description:
      "Activities spanning multiple IPCC sectors: cross-cutting policy frameworks, institutional capacity, education, gender mainstreaming, finance mechanisms, monitoring and reporting, water and sanitation, health.",
  },
];
