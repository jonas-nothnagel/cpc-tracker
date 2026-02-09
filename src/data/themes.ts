import type { Theme } from "@/types";

/**
 * 10 predefined cross-cutting themes.
 * Source: UNDP Climate + Nature Hubs working group.
 */
export const THEMES: Theme[] = [
  {
    id: "theme_adaptation",
    name: "Climate change adaptation",
    description:
      "Actions to reduce vulnerability to current or expected climate impacts: risk assessments, flood defenses, drought-tolerant crops, climate forecasting, ecosystem-based adaptation across biomes.",
    isCustom: false,
  },
  {
    id: "theme_mitigation",
    name: "Climate change mitigation",
    description:
      "Actions to prevent warming above 1.5°C: reducing GHG emissions, renewable energy, low-carbon technology, electrifying transport, decarbonization, carbon sinks, carbon removal and storage.",
    isCustom: false,
  },
  {
    id: "theme_land",
    name: "Land conservation and restoration",
    description:
      "Addressing desertification and drought, Land Degradation Neutrality (LDN), sustainable rangeland and pasture management, landscape restoration, regenerative agriculture, grassland and savanna protection and restoration.",
    isCustom: false,
  },
  {
    id: "theme_species",
    name: "Species conservation and ecosystems",
    description:
      "Halting human-induced extinction, controlling invasive alien species, genetic diversity, reducing human-wildlife conflict, ecosystem services, protected areas, habitat protection, ecosystem integrity.",
    isCustom: false,
  },
  {
    id: "theme_pollution",
    name: "Pollution",
    description:
      "Improved waste management, reduced industrial pollution, reduced nutrient loss, reduced single-use plastics, reduced air pollution, sustainable consumption, reduced pesticide and chemical risk.",
    isCustom: false,
  },
  {
    id: "theme_gender",
    name: "Gender equality",
    description:
      "Gender mainstreaming, gender-responsive decision-making, women's rights and participation, KMGBF Gender Plan of Action, UNCCD Gender Action Plan, women's access to finance and productive resources.",
    isCustom: false,
  },
  {
    id: "theme_capacity",
    name: "Capacity building and development",
    description:
      "Technology transfer, education, south-south exchange, knowledge sharing, scientific cooperation, communities of practice, R&D in green technologies, institutional strengthening, transparent monitoring and reporting.",
    isCustom: false,
  },
  {
    id: "theme_sdg",
    name: "Sustainable development and the SDGs",
    description:
      "Inclusive, equitable, environmentally sustainable development. 2030 Agenda, poverty eradication, food and water security, clean energy, responsible consumption, policy coherence across sectors.",
    isCustom: false,
  },
  {
    id: "theme_indigenous",
    name: "Indigenous Peoples and local communities",
    description:
      "Full, equitable representation and participation in decision-making, respecting cultures and rights over lands, territories, resources, and traditional knowledge with free, prior and informed consent.",
    isCustom: false,
  },
  {
    id: "theme_private",
    name: "Private sector",
    description:
      "Private sector participation in solutions development, policy planning, innovation, financing, business development for NBS/climate value chains, impact monitoring, public-private partnerships.",
    isCustom: false,
  },
];

