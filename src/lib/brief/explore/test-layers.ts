/**
 * Test data for the explorer's layers, on the brief fixture's targets: two
 * reported actions (one mitigation, one adaptation), one budget line and NR7
 * progress for two NBSAP targets.
 *   A1 strongly aligned with BTR_1; B2 may be pulled against by BTR_1;
 *   C3 moderately aligned with ADP_1 (not counted); A2 matches BER_71401,
 *   A3 has a flagged reading of it (not counted); Z9 is unknown.
 */
export const LAYER_DATA: Record<string, unknown> = {
  targets: [
    { id: "BTR_1", sourceDocument: "BTR", sourceLabel: "Solar parks", text: "Build solar parks.", actionType: "mitigation", measureStatus: "Ongoing" },
    { id: "ADP_1", sourceDocument: "BTR", sourceLabel: "Wells", text: "Drill wells.", actionType: "adaptation", measureStatus: "Adopted" },
  ],
  alignment: [
    { targetAId: "A1", targetBId: "BTR_1", alignment: "high" },
    { targetAId: "B2", targetBId: "BTR_1", alignment: "flagged", mechanism: "resource_competition" },
    { targetAId: "C3", targetBId: "ADP_1", alignment: "medium" },
    { targetAId: "Z9", targetBId: "BTR_1", alignment: "high" },
  ],
  budgetPseudoTargets: [
    {
      id: "BER_71401",
      sourceLabel: "71401 Waste management",
      text: "Waste management.",
      expenditure: { "2020": 0.5, "2021": null, "2022": 1.5 },
    },
  ],
  budgetAlignment: [
    { targetAId: "A2", targetBId: "BER_71401", alignment: "high" },
    { targetAId: "A3", targetBId: "BER_71401", alignment: "flagged" },
  ],
  berData: { currency: "MNT", unit: "billion", period: { start: 2020, end: 2024 } },
  nr7Data: {
    progressItems: [
      { targetId: "NT01", nbsapTargetId: "A1", progressStatus: "on_track" },
      { targetId: "NT02", nbsapTargetId: "A1", progressStatus: "limited" },
      { targetId: "NT03", nbsapTargetId: "A2", progressStatus: "unknown" },
    ],
  },
};

