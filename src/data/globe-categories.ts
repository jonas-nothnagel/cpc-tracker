import type { GlobeCategory } from "@/types";

/**
 * 9 GLOBE biodiversity expenditure categories.
 * Source: BIOFIN Global Biodiversity Expenditure Taxonomy (2024).
 * These categories serve as the cross-level classification spine connecting
 * policy targets (Level 1), budget programs (Level 2), and BTR implementation
 * actions (Level 3).
 */
export const GLOBE_CATEGORIES: GlobeCategory[] = [
  {
    id: "globe_1",
    name: "Access and benefit sharing",
    description:
      "Access to genetic resources, with a focus on prior informed consent, and the fair and equitable sharing of the benefits of genetic diversity. Includes bioprospecting and permitting, contractual arrangements, benefit-sharing mechanisms, and Nagoya Protocol implementation.",
  },
  {
    id: "globe_2",
    name: "Biodiversity awareness and knowledge",
    description:
      "Production, generation and access to quality biodiversity data and information. Includes formal and non-formal education, awareness campaigns, scientific research, citizen science, and indigenous and local communities' knowledge systems.",
  },
  {
    id: "globe_3",
    name: "Biosafety",
    description:
      "Prevention, containment, and eradication of invasive alien species (IAS) and safe handling, transport and use of living modified organisms (LMOs/GMOs). Includes Cartagena Protocol compliance.",
  },
  {
    id: "globe_4",
    name: "Green economy",
    description:
      "Improved human well-being and social equity while reducing environmental risks. Includes green supply chains, sustainable consumption, energy, tourism, transportation, and urban/rural development.",
  },
  {
    id: "globe_5",
    name: "Biodiversity planning and finance",
    description:
      "Cross-cutting planning, policy, finance, legal, and coordination actions. Includes biodiversity laws and policies, policy coherence and mainstreaming, NBSAPs, finance planning, SEA frameworks, spatial planning, and multilateral environmental agreements.",
  },
  {
    id: "globe_6",
    name: "Pollution management",
    description:
      "Pollution prevention, reduction, reuse, recycling, treatment and disposal. Includes soil, groundwater, surface water protection, ambient air quality, waste management, coastal/marine debris, and other pollutants.",
  },
  {
    id: "globe_7",
    name: "Protected areas and other conservation measures",
    description:
      "In situ and ex situ measures to protect biodiversity at genetic, species and ecosystem levels. Includes protected area management, ICCAs, areas outside PAs, OECMs, and species conservation.",
  },
  {
    id: "globe_8",
    name: "Restoration",
    description:
      "Assisting recovery of degraded or destroyed ecosystems and conserving intact ones. Includes species reintroduction and translocation, site redevelopment and engineering, and ongoing site management.",
  },
  {
    id: "globe_9",
    name: "Sustainable use",
    description:
      "Use of biological diversity at a rate that does not lead to long-term decline. Includes agrobiodiversity, sustainable agriculture, aquaculture, fisheries, forestry, freshwater, marine/coastal management, rangelands, and wildlife.",
  },
];
