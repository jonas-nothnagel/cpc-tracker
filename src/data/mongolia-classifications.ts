import type { ThematicClassification } from "@/types";

/**
 * Mongolia thematic classification results.
 * Extracted from Sections 3.1 and 3.2 of the Mongolia report.
 *
 * Only "relevant" (isRelevant: true) classifications are listed.
 * Any target×category combination not listed is assumed isRelevant: false.
 */

// Helper to create a batch of classifications
function nbs(targetId: string, categoryId: string): ThematicClassification {
  return { targetId, categoryId, taxonomyType: "nbs", isRelevant: true };
}

function theme(targetId: string, categoryId: string): ThematicClassification {
  return { targetId, categoryId, taxonomyType: "theme", isRelevant: true };
}

// ============================================================================
// NBS Classifications (Section 3.1 / 4.1)
// ============================================================================

export const MONGOLIA_NBS_CLASSIFICATIONS: ThematicClassification[] = [
  // Agriculture and livestock management (14 targets)
  nbs("NBT_7", "nbs_agri"),
  nbs("NDC_AnimalHusbandry_2", "nbs_agri"),
  nbs("NDC_AnimalHusbandry_3", "nbs_agri"),
  nbs("NDC_AnimalHusbandry_4", "nbs_agri"),
  nbs("NDC_LivestockMitigation", "nbs_agri"),
  nbs("NDC_Mitigation_3", "nbs_agri"),
  nbs("NDC_ArableFarming_1", "nbs_agri"),
  nbs("NDC_ArableFarming_2", "nbs_agri"),
  nbs("NDC_ArableFarming_3", "nbs_agri"),
  nbs("NDC_ArableFarming_4", "nbs_agri"),
  nbs("NAP_10", "nbs_agri"),
  nbs("NAP_11", "nbs_agri"),
  nbs("NAP_12", "nbs_agri"),
  nbs("NAP_13", "nbs_agri"),

  // Ecosystem protection and connectivity (10 targets)
  nbs("NBT_1", "nbs_ecosystem"),
  nbs("NBT_2", "nbs_ecosystem"),
  nbs("NBT_3", "nbs_ecosystem"),
  nbs("NBT_4", "nbs_ecosystem"),
  nbs("NBT_8", "nbs_ecosystem"),
  nbs("NBT_9", "nbs_ecosystem"),
  nbs("NDC_Biodiversity_1", "nbs_ecosystem"),
  nbs("NDC_Biodiversity_2", "nbs_ecosystem"),
  nbs("NDC_Forests_3", "nbs_ecosystem"),
  nbs("NAP_3", "nbs_ecosystem"),

  // Forest management, restoration, and protection (10 targets)
  nbs("NBT_1", "nbs_forest"),
  nbs("NBT_2", "nbs_forest"),
  nbs("NBT_6", "nbs_forest"),
  nbs("NBT_7", "nbs_forest"),
  nbs("NBT_8", "nbs_forest"),
  nbs("NDC_Biodiversity_2", "nbs_forest"),
  nbs("NDC_Forests_1", "nbs_forest"),
  nbs("NDC_Forests_2", "nbs_forest"),
  nbs("NDC_Forests_3", "nbs_forest"),
  nbs("NAP_7", "nbs_forest"),

  // Nature-based carbon sequestration (7 targets)
  nbs("NBT_2", "nbs_carbon"),
  nbs("NBT_6", "nbs_carbon"),
  nbs("NBT_7", "nbs_carbon"),
  nbs("NDC_Forests_1", "nbs_carbon"),
  nbs("NDC_Forests_2", "nbs_carbon"),
  nbs("NDC_Mitigation_3", "nbs_carbon"),
  nbs("NAP_7", "nbs_carbon"),

  // Nature-based risk management and disaster prevention (9 targets)
  nbs("NBT_4", "nbs_risk"),
  nbs("NBT_9", "nbs_risk"),
  nbs("NDC_NatDisasters_1", "nbs_risk"),
  nbs("NDC_NatDisasters_2", "nbs_risk"),
  nbs("NDC_AnimalHusbandry_2", "nbs_risk"),
  nbs("NDC_SocialProtection", "nbs_risk"),
  nbs("NDC_ArableFarming_3", "nbs_risk"),
  nbs("NAP_8", "nbs_risk"),
  nbs("NAP_9", "nbs_risk"),

  // Protection and restoration of wetlands and freshwater ecosystems (5 targets)
  nbs("NBT_2", "nbs_wetland"),
  nbs("NBT_8", "nbs_wetland"),
  nbs("NDC_Biodiversity_2", "nbs_wetland"),
  nbs("NDC_WaterResources_2", "nbs_wetland"),
  nbs("NAP_6", "nbs_wetland"),

  // Protection, management, and restoration of marine and coastal habitats (2 targets)
  nbs("NBT_8", "nbs_marine"),
  nbs("NDC_Biodiversity_2", "nbs_marine"),

  // Soil fertility management and restoration (5 targets)
  nbs("NBT_7", "nbs_soil"),
  nbs("NDC_Mitigation_3", "nbs_soil"),
  nbs("NDC_ArableFarming_1", "nbs_soil"),
  nbs("NAP_12", "nbs_soil"),
  nbs("NAP_13", "nbs_soil"),

  // Urban settlements management (1 target)
  nbs("NBT_9", "nbs_urban"),

  // Water management (3 targets)
  nbs("NDC_WaterResources_2", "nbs_water"),
  nbs("NAP_5", "nbs_water"),
  nbs("NAP_6", "nbs_water"),
];

// ============================================================================
// Theme Classifications (Section 3.2 / 4.2)
// ============================================================================

export const MONGOLIA_THEME_CLASSIFICATIONS: ThematicClassification[] = [
  // Climate change adaptation (15 targets)
  theme("NBT_6", "theme_adaptation"),
  theme("NDC_Biodiversity_1", "theme_adaptation"),
  theme("NDC_AnimalHusbandry_2", "theme_adaptation"),
  theme("NDC_SocialProtection", "theme_adaptation"),
  theme("NDC_Culture", "theme_adaptation"),
  theme("NDC_WaterResources_1", "theme_adaptation"),
  theme("NDC_WaterResources_2", "theme_adaptation"),
  theme("NDC_ArableFarming_3", "theme_adaptation"),
  theme("NAP_1", "theme_adaptation"),
  theme("NAP_2", "theme_adaptation"),
  theme("NAP_3", "theme_adaptation"),
  theme("NAP_7", "theme_adaptation"),
  theme("NAP_8", "theme_adaptation"),
  theme("NAP_10", "theme_adaptation"),
  theme("NAP_12", "theme_adaptation"),

  // Climate change mitigation (9 targets)
  theme("NBT_6", "theme_mitigation"),
  theme("NBT_7", "theme_mitigation"),
  theme("NBT_9", "theme_mitigation"),
  theme("NDC_Forests_1", "theme_mitigation"),
  theme("NDC_Forests_2", "theme_mitigation"),
  theme("NDC_Education", "theme_mitigation"),
  theme("NDC_LivestockMitigation", "theme_mitigation"),
  theme("NDC_Mitigation_1", "theme_mitigation"),
  theme("NDC_Mitigation_2", "theme_mitigation"),

  // Land conservation and restoration (12 targets)
  theme("NBT_1", "theme_land"),
  theme("NBT_2", "theme_land"),
  theme("NBT_7", "theme_land"),
  theme("NBT_8", "theme_land"),
  theme("NDC_Biodiversity_1", "theme_land"),
  theme("NDC_Biodiversity_2", "theme_land"),
  theme("NDC_AnimalHusbandry_4", "theme_land"),
  theme("NDC_Mitigation_3", "theme_land"),
  theme("NDC_ArableFarming_1", "theme_land"),
  theme("NAP_4", "theme_land"),
  theme("NAP_10", "theme_land"),
  theme("NAP_13", "theme_land"),

  // Species conservation and ecosystems (15 targets)
  theme("NBT_1", "theme_species"),
  theme("NBT_2", "theme_species"),
  theme("NBT_3", "theme_species"),
  theme("NBT_4", "theme_species"),
  theme("NBT_5", "theme_species"),
  theme("NBT_8", "theme_species"),
  theme("NBT_9", "theme_species"),
  theme("NBT_10", "theme_species"),
  theme("NBT_11", "theme_species"),
  theme("NBT_15", "theme_species"),
  theme("NBT_17", "theme_species"),
  theme("NDC_Biodiversity_1", "theme_species"),
  theme("NDC_Biodiversity_2", "theme_species"),
  theme("NDC_Forests_3", "theme_species"),
  theme("NAP_3", "theme_species"),

  // Pollution (5 targets)
  theme("NBT_5", "theme_pollution"),
  theme("NBT_7", "theme_pollution"),
  theme("NBT_9", "theme_pollution"),
  theme("NBT_12", "theme_pollution"),
  theme("NBT_13", "theme_pollution"),

  // Gender equality (1 target)
  theme("NBT_19", "theme_gender"),

  // Capacity building and development (10 targets)
  theme("NBT_4", "theme_capacity"),
  theme("NBT_8", "theme_capacity"),
  theme("NBT_10", "theme_capacity"),
  theme("NBT_12", "theme_capacity"),
  theme("NBT_17", "theme_capacity"),
  theme("NBT_18", "theme_capacity"),
  theme("NDC_Education", "theme_capacity"),
  theme("NAP_1", "theme_capacity"),
  theme("NAP_2", "theme_capacity"),
  theme("NAP_14", "theme_capacity"),

  // Sustainable development and the SDGs (14 targets)
  theme("NBT_2", "theme_sdg"),
  theme("NBT_5", "theme_sdg"),
  theme("NBT_7", "theme_sdg"),
  theme("NBT_8", "theme_sdg"),
  theme("NBT_9", "theme_sdg"),
  theme("NBT_11", "theme_sdg"),
  theme("NBT_13", "theme_sdg"),
  theme("NBT_17", "theme_sdg"),
  theme("NBT_19", "theme_sdg"),
  theme("NDC_Forests_3", "theme_sdg"),
  theme("NDC_SocialProtection", "theme_sdg"),
  theme("NDC_Education", "theme_sdg"),
  theme("NAP_6", "theme_sdg"),
  theme("NAP_10", "theme_sdg"),

  // Indigenous Peoples and local communities (0 targets for Mongolia)
  // (none identified)

  // Private sector (2 targets)
  theme("NBT_12", "theme_private"),
  theme("NBT_16", "theme_private"),
];

/** Combined classifications */
export const MONGOLIA_CLASSIFICATIONS: ThematicClassification[] = [
  ...MONGOLIA_NBS_CLASSIFICATIONS,
  ...MONGOLIA_THEME_CLASSIFICATIONS,
];

