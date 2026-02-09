import type { NbsCategory } from "@/types";

/**
 * 10 predefined Nature-Based Solution categories.
 * Source: IPCC Special Report on Climate Change and Land + Griscom et al.
 */
export const NBS_CATEGORIES: NbsCategory[] = [
  {
    id: "nbs_agri",
    name: "Agriculture and livestock management",
    description:
      "Climate-resilient crops, livestock management, climate-smart agriculture, regenerative agriculture, agroecology, crop diversification, grazing land management, manure management, agricultural land and soil management, agroforestry, sustainable rangeland management, conservation agriculture, landscape restoration, nature-positive dietary changes, reducing food waste.",
  },
  {
    id: "nbs_ecosystem",
    name: "Ecosystem protection and connectivity",
    description:
      "Protected areas, community reserves, wildlife corridors, pollinator habitats, species extinction prevention, habitat rewilding, invasive species control, ecosystem change detection, OECMs, increased connectivity between protected areas.",
  },
  {
    id: "nbs_forest",
    name: "Forest management, restoration, and protection",
    description:
      "Natural forest management, improved plantations, sustainable forestry, preventing illegal logging, reducing deforestation and degradation, fire management, REDD+, reforestation, afforestation, tree planting on degraded land, forest carbon sink management, monitoring forest changes.",
  },
  {
    id: "nbs_carbon",
    name: "Nature-based carbon sequestration",
    description:
      "BECCS, enhanced weathering, tree planting for carbon sequestration, afforestation, reforestation, proforestation, tree intercropping, silvopasture, forest carbon sequestration, improved plantations for carbon storage.",
  },
  {
    id: "nbs_risk",
    name: "Nature-based risk management and disaster prevention",
    description:
      "Agricultural disaster management, invasive species and pest control, disease surveillance, wildfire management, flood control, infrastructure resilience, landslide reduction, environmental risk monitoring, early warning systems, disaster risk reduction, livelihood diversification, urban blue and green spaces.",
  },
  {
    id: "nbs_wetland",
    name: "Protection and restoration of wetlands and freshwater ecosystems",
    description:
      "River, inland water and wetland protection, peatland rewetting, freshwater ecosystem protection, wetland management, peatland restoration, catchment restoration, watershed protection, sustainable fishery, restoring peatlands.",
  },
  {
    id: "nbs_marine",
    name: "Protection, management, and restoration of marine and coastal habitats",
    description:
      "Coastal zone risk retention, living shorelines, tidal basins, marine protected areas, mangrove protection, coral reef protection, seagrass protection, marine ecosystem restoration, sustainable fishery, marine ecosystem service management.",
  },
  {
    id: "nbs_soil",
    name: "Soil fertility management and restoration",
    description:
      "Increased soil organic carbon, reduced soil erosion, reduced salinization, reduced compaction, conservation tillage, biochar application, improved cropland soil management, soil restoration, sustainable intensification.",
  },
  {
    id: "nbs_urban",
    name: "Urban settlements management",
    description:
      "Urban green spaces, sponge city, urban forests, green roofs, green walls, urban wetlands, rain gardens, vegetated stormwater systems, green infrastructure, urban farms.",
  },
  {
    id: "nbs_water",
    name: "Water management",
    description:
      "Catchment protection, sustainable irrigation, watershed restoration, freshwater ecosystem restoration, integrated water resource management, water quality, water education, monitoring of water resources, pluvial flood risk reduction.",
  },
];

