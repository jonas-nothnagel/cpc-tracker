/** A small NR7 file shaped like Mongolia's, for the component tests. */
import type { AlignmentResult, Nr7Data, Target } from "@/types";

export const FIXTURE_NR7: Nr7Data = {
  country: "Testland",
  reportingPeriod: "2026",
  source: { name: "CBD Online Reporting Tool (ORT), 7th National Report", url: "x", fetchedAt: "2026-09-09T00:00:00Z", publishedOn: "2026-02-28" },
  progressItems: [
    { targetId: "NT01", targetText: "By 2030, mainstream biodiversity into all sectors.", progressStatus: "on_track", levelOfProgress: "On track to achieve target", reportedActions: [], nbsapTargetId: "NBSAP_1", progressSummary: "Mainstreaming has advanced through the planning law.\nA second paragraph." },
    { targetId: "NT02", targetText: "By 2030, protect 30% of the territory.", progressStatus: "on_track", levelOfProgress: "On track to achieve target", reportedActions: [], nbsapTargetId: "NBSAP_2", progressSummary: "Coverage reached 21%." },
    { targetId: "NT03", targetText: "By 2030, control invasive alien species.", progressStatus: "unknown", levelOfProgress: "Unknown", reportedActions: [], nbsapTargetId: "NBSAP_3" },
    { targetId: "NT04", targetText: "By 2030, reduce pollution.", progressStatus: "no_progress", levelOfProgress: "No significant change", reportedActions: [], nbsapTargetId: "NBSAP_4" },
  ],
  questionnaire: {
    answers: [
      { targetId: "NT01", indicatorCode: "14.b", indicatorTitle: "14.b", questionNumber: "14.2", questionTitle: "Does your country use environmental economic accounting?", response: "Under development", responseValue: "under_development" },
      { targetId: "NT01", indicatorCode: "14.b", indicatorTitle: "14.b", questionNumber: "14.3", questionTitle: "Does your country integrate biodiversity into policies?", response: "Under development", responseValue: "under_development" },
      { targetId: "NT01", indicatorCode: "14.b", indicatorTitle: "14.b", questionNumber: "14.4", questionTitle: "Are fiscal flows aligned?", response: "Partially", responseValue: "partially" },
      { targetId: "NT01", indicatorCode: "14.b", indicatorTitle: "14.b", questionNumber: "14.5", questionTitle: "Which sectors are covered?", response: "mitigation; adaptation; disasterRiskReduction", responseValue: null },
      { targetId: "NT04", indicatorCode: "7.b", indicatorTitle: "7.b", questionNumber: "7.1", questionTitle: "Is pollution monitored?", response: "No", responseValue: "no" },
    ],
  },
  indicators: [
    { id: "3.1", code: "3.1", name: "Coverage of protected areas", title: "3.1 Coverage of protected areas", indicatorType: "headline", targetIds: ["NT02"], comments: null, series: [
      { disaggregation: "Coverage of protected areas (terrestrial areas)", unit: "%", points: [2020, 2021, 2022, 2023, 2024, 2025].map((year) => ({ year, value: 20.77, valueText: null, footnote: null })) },
      { disaggregation: "Other effective area-based conservation measures", unit: "%", points: [[2020, 15.01], [2023, 18.03], [2025, 18.9]].map(([year, value]) => ({ year, value, valueText: null, footnote: null })) },
    ] },
    { id: "6.1", code: "6.1", name: "Rate of invasive alien species establishment", title: "6.1 Rate of invasive alien species establishment", indicatorType: "headline", targetIds: ["NT03"], comments: null, series: [
      { disaggregation: "Flora", unit: "number of species", points: [{ year: 2024, value: 154, valueText: null, footnote: null }] },
      { disaggregation: "Insects", unit: "number of species", points: [{ year: 2010, value: 27, valueText: null, footnote: null }] },
    ] },
    { id: "A.3", code: "A.3", name: "Red List Index", title: "A.3 Red List Index", indicatorType: "headline", targetIds: ["NT01", "NT02", "NT03", "NT04"], comments: null, series: [
      { disaggregation: null, unit: "index", points: [[1993, 0.965], [2010, 0.96], [2024, 0.953]].map(([year, value]) => ({ year, value, valueText: null, footnote: null })) },
    ] },
    { id: "18.2", code: "18.2", name: "Value of subsidies harmful to biodiversity", title: "18.2 Value of subsidies harmful to biodiversity", indicatorType: "headline", targetIds: [], comments: "A national screening under the BIOFIN methodology assessed government subsidies.", series: [] },
    { id: "ecosystem-category", code: null, name: "Ecosystem Category (WWF)", title: "Ecosystem Category (WWF)", indicatorType: "national", targetIds: ["NT01"], comments: null, series: [
      { disaggregation: "Steppe", unit: "hectares", points: [{ year: 2020, value: 17183524.3, valueText: null, footnote: null }] },
    ] },
  ],
};

export const FIXTURE_TARGETS = new Map<string, Target>(
  ["NBSAP_1", "NBSAP_2", "NBSAP_3", "NBSAP_4", "NDC_1", "NDC_2", "NAP_1"].map((id) => [
    id,
    { id, text: `${id} text`, sourceDocument: id.split("_")[0], sourceLabel: id, country: "Testland", isQuantitative: false, isTimeBound: false },
  ]),
);

const high = (a: string, b: string): AlignmentResult => ({ targetAId: a, targetBId: b, alignment: "high", description: "" });
export const FIXTURE_ALIGNMENT: AlignmentResult[] = [
  high("NBSAP_1", "NDC_1"), high("NBSAP_1", "NDC_2"), high("NBSAP_1", "NAP_1"),
  high("NBSAP_4", "NDC_1"), high("NBSAP_4", "NDC_2"), high("NBSAP_4", "NAP_1"),
  high("NBSAP_2", "NDC_1"),
];
