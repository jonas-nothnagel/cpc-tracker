import type { Target, AlignmentResult } from "@/types";

export const MOCK_TARGETS: Target[] = [
  {
    id: "NAP_1",
    text: "Enhance climate adaptation policies",
    sourceDocument: "NAP",
    sourceLabel: "Target 1",
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
  },
  {
    id: "NAP_10",
    text: "Foster sustainable livestock management",
    sourceDocument: "NAP",
    sourceLabel: "Target 10",
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
  },
  {
    id: "NDC_1",
    text: "Protect natural forests and enhance regeneration",
    sourceDocument: "NDC",
    sourceLabel: "Forests 1",
    country: "Mongolia",
    isQuantitative: false,
    isTimeBound: false,
  },
  {
    id: "NDC_2",
    text: "Reduce CO2 by 5.277 million tons by 2030",
    sourceDocument: "NDC",
    sourceLabel: "Mitigation 1",
    country: "Mongolia",
    isQuantitative: true,
    isTimeBound: true,
    quantitativeDetails: "5.277 million tons",
    timeBoundDetails: "by 2030",
  },
  {
    id: "NBT_1",
    text: "Conserve 30% of country in protected areas",
    sourceDocument: "NBSAP",
    sourceLabel: "NBT 1",
    country: "Mongolia",
    isQuantitative: true,
    isTimeBound: false,
    quantitativeDetails: "30%",
  },
];

export const MOCK_ALIGNMENT_DATA: AlignmentResult[] = [
  {
    targetAId: "NAP_1",
    targetBId: "NDC_1",
    alignment: "high",
    description: "Both targets share the same climate adaptation goals.",
  },
  {
    targetAId: "NAP_1",
    targetBId: "NBT_1",
    alignment: "medium",
    description: "Complementary goals around ecosystem protection.",
  },
  {
    targetAId: "NAP_10",
    targetBId: "NDC_2",
    alignment: "moderate_contradiction",
    contradictionType: "resource_competition",
    description: "Competing demands on rangeland resources.",
  },
  {
    targetAId: "NDC_1",
    targetBId: "NBT_1",
    alignment: "low",
    description: "Minor thematic overlap.",
  },
  {
    targetAId: "NAP_10",
    targetBId: "NBT_1",
    alignment: "low_tension",
    contradictionType: "implementation_tension",
    description: "Livestock management may conflict with conservation targets.",
  },
];

export const MOCK_ALIGNMENT_ONLY: AlignmentResult[] = [
  {
    targetAId: "NAP_1",
    targetBId: "NDC_1",
    alignment: "high",
    description: "Strong alignment.",
  },
  {
    targetAId: "NAP_1",
    targetBId: "NBT_1",
    alignment: "medium",
    description: "Medium alignment.",
  },
];
