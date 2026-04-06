/**
 * Mongolia Biodiversity Expenditure Review (BER) financing data.
 *
 * Source: "BER [ENG] v1.2.docx" — Biodiversity expenditure analysis 2020–2024.
 * All monetary values in billion MNT unless otherwise noted.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BudgetProgram {
  code: string;
  name: string;
  description: string;
}

export interface ExpenditureSeries {
  code: string;
  name: string;
  /** Values by year in billion MNT. "-" in source → null. */
  values: Record<string, number | null>;
}

export interface PrivateSectorExpenditure {
  category: string;
  /** Values by year in million MNT. */
  values: Record<string, number | null>;
}

export interface BiodiversityAttributionCode {
  code: string;
  name: string;
  /** Percentage attributed to biodiversity (0–100). */
  attributionPercent: number;
}

// ---------------------------------------------------------------------------
// Table 0 & 1: Environmental & Non-Environmental Program Definitions
// ---------------------------------------------------------------------------

export const ENVIRONMENTAL_PROGRAMS: BudgetProgram[] = [
  { code: "71401", name: "Waste management", description: "Implementation of the Law on Waste and national and local waste management programs." },
  { code: "71402", name: "Biodiversity conservation", description: "Implementation of the National Biodiversity Program — ecosystem, species, and genetic level conservation." },
  { code: "71403", name: "Afforestation", description: "State institutions responsible for forestry, including the Forestry Agency and inter-Soum forest units." },
  { code: "71404", name: "Water resource, lake and river management", description: "Water Authority, Freshwater Resources and Nature Conservation Center, River Basin Administrations." },
  { code: "71405", name: "Security of protected areas", description: "Protection regimes for protected areas, management plans, monitoring, and information databases." },
  { code: "71406", name: "Environmental pollution and degradation", description: "Air pollution quality control, alternative products, waste collection/transport/disposal/recycling." },
  { code: "71407", name: "Air pollution abatement, climate change", description: "National Program on Air and Environmental Pollution Reduction and climate change policies." },
  { code: "71408", name: "Meteorology", description: "Hydrological and meteorological research, weather forecasts, early warnings, and climate resource use." },
  { code: "71409", name: "Protection of endangered animals, plants and species", description: "National Program for the Protection of Endangered and Rare Species." },
  { code: "71410", name: "Reduce land degradation and prevent from desertification", description: "National Action Program to Combat Desertification." },
  { code: "71411", name: "Environment policy and administration", description: "Government institutions responsible for environmental governance — legal framework, policy implementation." },
  { code: "71412", name: "R&D Environment", description: "Research on preventing environmental pollution and degradation." },
  { code: "71413", name: "Environment protection, recovery", description: "Environmental protection and restoration — water, forest, plant, wildlife, genetic resources." },
];

export const NON_ENVIRONMENTAL_PROGRAMS: BudgetProgram[] = [
  { code: "81702", name: "Forest fire prevention and damage mitigation", description: "Forest fire prevention, suppression, and damage mitigation." },
  { code: "81703", name: "Plant protection and restoration", description: "Protection and restoration of natural vegetation." },
  { code: "81705", name: "Forest inventory", description: "Forest inventories per forest legislation." },
  { code: "81707", name: "Air pollution reduction", description: "Reducing and preventing air pollution." },
  { code: "81708", name: "Afforestation", description: "Plantation forests, forest restoration, seedling preparation." },
  { code: "81709", name: "Control of forest pests and harmful insects", description: "Controlling forest pests and harmful insects." },
  { code: "81710", name: "Hydrological and meteorological research", description: "Hydrological and meteorological research and analysis." },
  { code: "81713", name: "Waste processing", description: "Waste separation and processing." },
  { code: "81714", name: "Support for substitute pollution sources and green product producers", description: "Budgetary support and incentives for green product producers." },
  { code: "81715", name: "Protection, use, and restoration of water and mineral water resources", description: "Water resource protection, reservoir construction, wastewater treatment." },
  { code: "81716", name: "Reduction of land degradation and desertification prevention", description: "Degraded land restoration, desertification mitigation, pastureland protection." },
  { code: "81717", name: "Protection and restoration of wildlife resources", description: "Wildlife protection, captive breeding, reintroduction of endangered species." },
  { code: "81718", name: "Genetic resources of wild plants and animals", description: "Research, assessment, and conservation of genetic resources." },
  { code: "81719", name: "Forest restoration", description: "Forest restoration, seedling propagation, plantation establishment." },
  { code: "82212", name: "Solid waste and environmental pollution removal and cleaning services", description: "Environmental cleaning, public road cleaning, waste removal." },
];

// ---------------------------------------------------------------------------
// Table 7: Private Sector Environmental Expenditure (million MNT)
// ---------------------------------------------------------------------------

export const PRIVATE_SECTOR_EXPENDITURE: PrivateSectorExpenditure[] = [
  { category: "Public awareness", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": 25 } },
  { category: "Protected area support", values: { "2020": 26, "2021": 24, "2022": 369, "2023": 306, "2024": 2 } },
  { category: "Environmentally friendly operations", values: { "2020": 272, "2021": 222, "2022": 254, "2023": 359, "2024": 167 } },
  { category: "Waste management", values: { "2020": 435, "2021": 375, "2022": 626, "2023": 1541, "2024": 158 } },
  { category: "Restoration", values: { "2020": 228, "2021": 435, "2022": 1460, "2023": 479, "2024": 992 } },
  { category: "Sustainable consumption", values: { "2020": null, "2021": null, "2022": 78, "2023": 97, "2024": 1381 } },
];

export const PRIVATE_SECTOR_TOTALS: Record<string, number> = {
  "2020": 961, "2021": 1056, "2022": 2786, "2023": 2782, "2024": 2726,
};

// ---------------------------------------------------------------------------
// Table 8: Environmental Program Expenditure (billion MNT)
// ---------------------------------------------------------------------------

export const ENVIRONMENTAL_PROGRAM_EXPENDITURE: ExpenditureSeries[] = [
  { code: "71408", name: "Meteorology", values: { "2020": 30.4, "2021": 30.1, "2022": null, "2023": 47.0, "2024": null } },
  { code: "71405", name: "Security of protected areas", values: { "2020": 10.2, "2021": 10.5, "2022": null, "2023": 19.0, "2024": 0.9 } },
  { code: "71404", name: "Water resource, lake and river management", values: { "2020": 4.4, "2021": 4.9, "2022": null, "2023": 9.0, "2024": null } },
  { code: "71403", name: "Afforestation", values: { "2020": 6.1, "2021": 5.2, "2022": 3.4, "2023": 15.0, "2024": 9.2 } },
  { code: "71411", name: "Environment policy and administration", values: { "2020": 23.1, "2021": 21.7, "2022": 17.4, "2023": 7.0, "2024": 27.0 } },
  { code: "71407", name: "Air pollution abatement, climate change", values: { "2020": 75.8, "2021": 101.6, "2022": 30.1, "2023": 15.0, "2024": 39.4 } },
  { code: "71412", name: "R&D Environment", values: { "2020": 0.1, "2021": 0.0, "2022": null, "2023": null, "2024": null } },
  { code: "71406", name: "Environmental pollution and degradation", values: { "2020": 0.4, "2021": 0.5, "2022": 0.3, "2023": null, "2024": 1.5 } },
  { code: "71401", name: "Waste management", values: { "2020": 0.5, "2021": 0.7, "2022": 1.9, "2023": null, "2024": 5.9 } },
  { code: "71402", name: "Biodiversity conservation", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "71409", name: "Protection of endangered animals, plants and species", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "71413", name: "Environment protection, recovery", values: { "2020": 11.1, "2021": 10.9, "2022": 13.3, "2023": null, "2024": 30.2 } },
  { code: "71410", name: "Reduce land degradation and prevent from desertification", values: { "2020": 0.5, "2021": 0.9, "2022": null, "2023": 1.0, "2024": null } },
];

export const ENVIRONMENTAL_PROGRAM_SUBTOTALS: Record<string, Record<string, number>> = {
  environment: { "2020": 162.6, "2021": 186.9, "2022": 66.4, "2023": 112.1, "2024": 114.2 },
  nonEnvironment: { "2020": 47.1, "2021": 42.4, "2022": 54.9, "2023": 0.1, "2024": 102.0 },
  total: { "2020": 210, "2021": 229, "2022": 121, "2023": 112, "2024": 216 },
};

// ---------------------------------------------------------------------------
// Table 9: Non-Environmental Program Expenditure (billion MNT)
// ---------------------------------------------------------------------------

export const NON_ENVIRONMENTAL_PROGRAM_EXPENDITURE: ExpenditureSeries[] = [
  { code: "81707", name: "Reducing air pollution", values: { "2020": 2.4, "2021": null, "2022": null, "2023": 0.1, "2024": null } },
  { code: "82212", name: "Solid waste and environmental pollution removal and cleaning services", values: { "2020": 44.7, "2021": 42.4, "2022": 54.8, "2023": null, "2024": 101.9 } },
  { code: "81708", name: "Afforestation", values: { "2020": null, "2021": null, "2022": 0.1, "2023": null, "2024": 0.1 } },
  { code: "81709", name: "Control of forest pests and harmful insects", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81702", name: "Forest fire prevention and damage mitigation", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81705", name: "Forest inventory", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81703", name: "Plant protection and restoration", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81710", name: "Hydrological and meteorological research", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81713", name: "Waste processing", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81714", name: "Support for substitute pollution sources and green product producers", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81715", name: "Protection, use, and restoration of water and mineral water resources", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81716", name: "Reduction of land degradation and desertification prevention", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81717", name: "Protection and restoration of wildlife resources", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81718", name: "Genetic resources of wild plants and animals", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81719", name: "Forest restoration", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
];

export const NON_ENVIRONMENTAL_PROGRAM_TOTALS: Record<string, number> = {
  "2020": 47.1, "2021": 42.4, "2022": 54.9, "2023": 0.1, "2024": 102.0,
};

// ---------------------------------------------------------------------------
// Tables 10–12: Expenditure by Biodiversity Attribution Ratio (billion MNT)
// ---------------------------------------------------------------------------

export const EXPENDITURE_100_PERCENT_ATTRIBUTION: ExpenditureSeries[] = [
  { code: "80101", name: "Core operational expenditure", values: { "2020": 62.1, "2021": 63.2, "2022": 18.2, "2023": 79.7, "2024": 35.4 } },
  { code: "80102", name: "Supporting operational expenditure", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80103", name: "Works and services contracted to third parties", values: { "2020": null, "2021": null, "2022": 0.1, "2023": null, "2024": 0.1 } },
  { code: "80105", name: "Works and services implemented through external assistance", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80215", name: "Research and scientific studies", values: { "2020": 0.4, "2021": null, "2022": null, "2023": 1.2, "2024": null } },
  { code: "80221", name: "Expenditure for contracted personnel", values: { "2020": 1.5, "2021": 1.9, "2022": 0.0, "2023": 0.1, "2024": null } },
  { code: "80224", name: "Remuneration for councils, committees, and commissions", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80312", name: "Training and seminars", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80313", name: "Procurement of samples", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80410", name: "Subsidies to improve air quality", values: { "2020": 0.1, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81701", name: "Environmental protection and restoration", values: { "2020": 16.3, "2021": 15.0, "2022": 16.7, "2023": 1.1, "2024": 13.7 } },
  { code: "81702", name: "Forest fire prevention and mitigation", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81703", name: "Plant protection and restoration", values: { "2020": 0.4, "2021": 0.4, "2022": null, "2023": 0.3, "2024": null } },
  { code: "81705", name: "Forest inventory", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81707", name: "Air pollution reduction", values: { "2020": 76.7, "2021": 100.1, "2022": 28.8, "2023": 14.1, "2024": 38.3 } },
  { code: "81708", name: "Afforestation", values: { "2020": 3.4, "2021": 2.1, "2022": 0.3, "2023": 12.8, "2024": 0.7 } },
  { code: "81709", name: "Control of forest pests and harmful insects", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81710", name: "Hydrological and meteorological research", values: { "2020": 1.8, "2021": 1.6, "2022": null, "2023": 1.6, "2024": null } },
  { code: "81713", name: "Waste processing", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81714", name: "Support for green product producers", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81715", name: "Water and mineral water resource protection", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81716", name: "Land degradation and desertification prevention", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81717", name: "Protection and restoration of wildlife resources", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81718", name: "Genetic resources of wild plants and animals", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81719", name: "Forest restoration", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81834", name: "Education standards and training programs", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "82207", name: "Urban green space services", values: { "2020": null, "2021": null, "2022": 0.3, "2023": null, "2024": 0.7 } },
  { code: "82212", name: "Solid waste and environmental pollution removal", values: { "2020": 45.8, "2021": 43.6, "2022": 56.5, "2023": null, "2024": 107.3 } },
  { code: "82310", name: "Disaster prevention training and awareness-raising", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "82501", name: "Plant protection", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "82706", name: "Containment of highly infectious disease outbreaks", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
];

export const EXPENDITURE_100_PERCENT_TOTALS: Record<string, number> = {
  "2020": 208, "2021": 228, "2022": 121, "2023": 111, "2024": 196,
};

export const EXPENDITURE_75_PERCENT_ATTRIBUTION: ExpenditureSeries[] = [
  { code: "80106", name: "Working groups and committees", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80205", name: "Information and public awareness", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80219", name: "Guarding and security expenses", values: { "2020": 0.2, "2021": 0.2, "2022": 0.1, "2023": 0.1, "2024": null } },
  { code: "80509", name: "Membership fees to international organizations", values: { "2020": 0.2, "2021": 0.2, "2022": null, "2023": 0.1, "2024": null } },
  { code: "80811", name: "Resettlement expenses", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81102", name: "Local contingency funds", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81518", name: "Selected measures in action plans", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "81832", name: "Inclusion in mobile groups", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
];

export const EXPENDITURE_75_PERCENT_TOTALS: Record<string, number> = {
  "2020": 0.4, "2021": 0.5, "2022": 0.2, "2023": 0.2, "2024": 0.1,
};

export const EXPENDITURE_5_PERCENT_ATTRIBUTION: ExpenditureSeries[] = [
  { code: "80220", name: "Fees for use of communication channels", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80226", name: "Facility operation and maintenance", values: { "2020": null, "2021": null, "2022": null, "2023": null, "2024": null } },
  { code: "80802", name: "Allowances, incentives, and support from employers", values: { "2020": 0.2, "2021": 0.1, "2022": null, "2023": 0.1, "2024": null } },
  { code: "80918", name: "Other", values: { "2020": 0.7, "2021": 0.8, "2022": null, "2023": 0.9, "2024": null } },
];

export const EXPENDITURE_5_PERCENT_TOTALS: Record<string, number> = {
  "2020": 0.9, "2021": 1.0, "2022": 0, "2023": 1.1, "2024": 0,
};

// ---------------------------------------------------------------------------
// Biodiversity Attribution Ratios (BAR) taxonomy
// ---------------------------------------------------------------------------

export const BIODIVERSITY_ATTRIBUTION_CODES: BiodiversityAttributionCode[] = [
  // 100% attribution
  { code: "80100", name: "General purpose of operational expenditures", attributionPercent: 100 },
  { code: "80101", name: "Core operational expenditures", attributionPercent: 100 },
  { code: "80102", name: "Supporting operational expenditures", attributionPercent: 100 },
  { code: "80103", name: "Contracted works and services", attributionPercent: 100 },
  { code: "80105", name: "Works and services implemented through foreign assistance", attributionPercent: 100 },
  { code: "80215", name: "Research and scientific studies", attributionPercent: 100 },
  { code: "80221", name: "Cost of contracted personnel", attributionPercent: 100 },
  { code: "80224", name: "Remuneration for councils, committees, and commissions", attributionPercent: 100 },
  { code: "80312", name: "Training and seminars", attributionPercent: 100 },
  { code: "80313", name: "Procurement of samples", attributionPercent: 100 },
  { code: "80410", name: "Subsidies for improving air quality", attributionPercent: 100 },
  { code: "81700", name: "Environmental protection measures", attributionPercent: 100 },
  { code: "81701", name: "Environmental protection and restoration", attributionPercent: 100 },
  { code: "81702", name: "Forest fire prevention and mitigation of fire damage", attributionPercent: 100 },
  { code: "81703", name: "Plant protection and restoration", attributionPercent: 100 },
  { code: "81705", name: "Forest inventory", attributionPercent: 100 },
  { code: "81707", name: "Air pollution reduction", attributionPercent: 100 },
  { code: "81708", name: "Afforestation", attributionPercent: 100 },
  { code: "81709", name: "Control of forest pests and harmful insects", attributionPercent: 100 },
  { code: "81710", name: "Hydrological and meteorological research and analysis", attributionPercent: 100 },
  { code: "81713", name: "Waste processing", attributionPercent: 100 },
  { code: "81714", name: "Support for substitute pollution sources and green product producers", attributionPercent: 100 },
  { code: "81715", name: "Protection, use, and restoration of water and mineral water resources", attributionPercent: 100 },
  { code: "81716", name: "Reduction of land degradation and desertification prevention", attributionPercent: 100 },
  { code: "81717", name: "Protection and restoration of wildlife resources", attributionPercent: 100 },
  { code: "81718", name: "Genetic resources of wild plants and animals", attributionPercent: 100 },
  { code: "81719", name: "Forest restoration", attributionPercent: 100 },
  { code: "81834", name: "Implementation of education standards, curricula, and training programs", attributionPercent: 100 },
  { code: "82207", name: "Urban green space services", attributionPercent: 100 },
  { code: "82212", name: "Solid waste and environmental pollution removal and cleaning services", attributionPercent: 100 },
  { code: "82310", name: "Disaster prevention training and awareness-raising", attributionPercent: 100 },
  { code: "82501", name: "Plant protection", attributionPercent: 100 },
  { code: "82706", name: "Elimination of outbreaks and containment of highly infectious diseases", attributionPercent: 100 },
  // 75% attribution
  { code: "80106", name: "Group and committee operational expenditures", attributionPercent: 75 },
  { code: "80200", name: "General works and services by third parties", attributionPercent: 75 },
  { code: "80205", name: "Information and communication expenditures", attributionPercent: 75 },
  { code: "80219", name: "Guarding and protection expenditures", attributionPercent: 75 },
  { code: "80509", name: "Membership fees to international organizations", attributionPercent: 75 },
  { code: "80811", name: "Relocation expenditures", attributionPercent: 75 },
  { code: "81102", name: "Local contingency reserves", attributionPercent: 75 },
  { code: "81518", name: "Implementation of selected measures in programs", attributionPercent: 75 },
  { code: "81832", name: "Inclusion in mobile teams", attributionPercent: 75 },
  // 50% attribution
  { code: "82502", name: "Veterinary services", attributionPercent: 50 },
  { code: "82542", name: "Mongolian Livestock Program", attributionPercent: 50 },
  { code: "83105", name: "Preparation of projects and activities", attributionPercent: 50 },
  // 5% attribution
  { code: "80220", name: "Fees for use of communication channels", attributionPercent: 5 },
  { code: "80226", name: "Building operation and maintenance services", attributionPercent: 5 },
  { code: "80703", name: "Discounts for elderly persons and war veterans", attributionPercent: 5 },
  { code: "80704", name: "Benefits for decorated veterans and senior citizens", attributionPercent: 5 },
  { code: "80714", name: "Discounts for elderly persons", attributionPercent: 5 },
  { code: "80801", name: "Compensation", attributionPercent: 5 },
  { code: "80802", name: "Allowances, incentives, and support from employers", attributionPercent: 5 },
  { code: "80825", name: "Incentive payments for bag-level chairpersons", attributionPercent: 5 },
  { code: "80836", name: "Performance incentives for discipline and work results", attributionPercent: 5 },
  { code: "80918", name: "Other", attributionPercent: 5 },
  { code: "81519", name: "Capacity building of civil servants", attributionPercent: 5 },
  { code: "81806", name: "Dormitory services", attributionPercent: 5 },
  { code: "81835", name: "Ensuring normal operation of educational activities", attributionPercent: 5 },
  { code: "82903", name: "Promotion of Mongolia abroad", attributionPercent: 5 },
  { code: "80218", name: "International promotion of the country", attributionPercent: 5 },
  // 0% attribution
  { code: "80213", name: "Legal defense and advisory services", attributionPercent: 0 },
  { code: "80229", name: "Enforcement of court decisions", attributionPercent: 0 },
  { code: "80303", name: "Outstanding liabilities from previous years", attributionPercent: 0 },
  { code: "80305", name: "Sports competitions and tournaments", attributionPercent: 0 },
  { code: "80310", name: "State awards, orders, and medals", attributionPercent: 0 },
  { code: "80800", name: "Other transfer purposes", attributionPercent: 0 },
  { code: "80803", name: "Support for families of civil servants", attributionPercent: 0 },
  { code: "80809", name: "Medical treatment expenses", attributionPercent: 0 },
  { code: "80812", name: "Severance payments for organizational restructuring", attributionPercent: 0 },
  { code: "80820", name: "Other assistance and support", attributionPercent: 0 },
  { code: "80835", name: "Cash allowances for civil servants", attributionPercent: 0 },
  { code: "80920", name: "Projects via promissory notes", attributionPercent: 0 },
  { code: "81405", name: "Loans from domestic sources", attributionPercent: 0 },
  { code: "81549", name: "Veterans' fund", attributionPercent: 0 },
  { code: "82201", name: "Crime prevention", attributionPercent: 0 },
  { code: "82203", name: "Lighting of public streets", attributionPercent: 0 },
  { code: "82307", name: "Armed Forces development program", attributionPercent: 0 },
  { code: "82808", name: "Celebrations and commemorative events", attributionPercent: 0 },
  { code: "83201", name: "Other unclassified purposes", attributionPercent: 0 },
];

// ---------------------------------------------------------------------------
// Key findings from the BER conclusions
// ---------------------------------------------------------------------------

export const BER_KEY_FINDINGS = {
  /** National Biodiversity Program total budget vs actual (billion MNT) */
  nbsapFinancingGap: {
    plannedBudget: 1900,
    actualExpenditure: 1200,
    gap: 700,
    programPeriod: "2015–2025",
  },
  /** Programs with zero allocation 2020–2024 */
  zeroAllocationPrograms: [
    { code: "71402", name: "Biodiversity conservation" },
    { code: "71409", name: "Protection of endangered animals, plants and species" },
  ],
  /** Years covered */
  period: { start: 2020, end: 2024 },
  /** Currency */
  currency: "MNT",
} as const;
