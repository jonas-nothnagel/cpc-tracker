/**
 * Dashboard payloads for the spending tests: Country X's illustrative file
 * (the earlier shape) and a record the way the Mongolia adapter writes it.
 * Areas g1, g2 and g5 are the brief fixture's GLOBE categories.
 */

/** Country X's illustrative file: P1 in area g1, P2 in g2, P3 with no spending. */
export function legacyPayload(
  scope: Record<string, unknown> | null = { publicSpending: { "2020": 100, "2021": 200 }, illustrative: true },
) {
  return {
    berData: {
      programs: [
        { code: "P1", name: "Protected area security" },
        { code: "P2", name: "Irrigation support" },
        { code: "P3", name: "Unspent line" },
      ],
      expenditure: [
        { code: "P1", values: { "2020": 1, "2021": 2 } },
        { code: "P2", values: { "2020": 3, "2021": 4 } },
        { code: "P3", values: { "2020": null, "2021": null } },
      ],
      currency: "US$",
      unit: "million",
      period: { start: 2020, end: 2021 },
      ...(scope ? { scope } : {}),
    },
    classifications: [
      { targetId: "BER_P1", taxonomyType: "globe", categoryId: "g1", isPrimary: true },
      { targetId: "BER_P2", taxonomyType: "globe", categoryId: "g2", isPrimary: true },
      { targetId: "BER_P2", taxonomyType: "globe", categoryId: "g1", isPrimary: false },
    ],
    budgetAlignment: [
      { targetAId: "A1", targetBId: "BER_P1", alignment: "high" },
      { targetAId: "BER_P1", targetBId: "A2", alignment: "high" },
      { targetAId: "B4", targetBId: "BER_P2", alignment: "medium" },
    ],
  };
}

const cell = (counted: number) => ({ plan: counted * 1.1, actual: counted, counted });

/** Two budget levels, a year that holds the local budgets only, two lines;
 *  billions of tögrög. */
export function levelsPayload(extra: Record<string, unknown> = {}) {
  return {
    berData: {
      programs: [],
      expenditure: [],
      currency: "MNT",
      unit: "billion",
      period: { start: 2020, end: 2021 },
      record: {
        version: 1,
        currency: "MNT",
        unit: "billion",
        levels: [
          { id: "central", name: "State budget" },
          { id: "local", name: "Local budgets" },
        ],
        years: [
          { year: "2020", levels: ["central", "local"], complete: true, reviewed: { central: 3, local: 1 }, public: { central: 100, local: 50 }, gdp: 1000, usdRate: 2000 },
          { year: "2021", levels: ["central", "local"], complete: true, reviewed: { central: 4, local: 2 }, public: { central: 100, local: 50 }, gdp: 1100, usdRate: 2500 },
          { year: "2022", levels: ["local"], complete: false, reviewed: { local: 5 }, public: { local: 60 }, gdp: 1200, usdRate: 3000 },
        ],
        lines: [
          {
            code: "71405",
            kind: "programme",
            name: "Security of protected areas",
            description: "Protection regimes for protected areas.",
            amounts: {
              "2020": { central: cell(3), local: cell(0) },
              "2021": { central: cell(4), local: cell(0) },
              "2022": { central: null, local: cell(1) },
            },
            relevance: [
              { code: "80101", name: "Core operational expenditures", rate: 1, actual: 6, counted: 6 },
              { code: "80918", name: "Other", rate: 0.05, actual: 20, counted: 1 },
            ],
            payments: [{ name: "Wages and salaries, bonuses", share: 0.61 }],
            bodies: { "2021": { count: 31, top: [{ name: "Khan Khentii administration", nameMn: "Хан Хэнтий", counted: 0.8 }] } },
          },
          {
            code: "82212",
            kind: "purpose",
            name: "Solid waste removal",
            description: "Cleaning services.",
            amounts: {
              "2020": { central: cell(0), local: cell(1) },
              "2021": { central: cell(0), local: cell(2) },
              "2022": { central: null, local: cell(4) },
            },
            relevance: [],
            payments: [],
            bodies: {},
          },
        ],
      },
    },
    classifications: [{ targetId: "BER_71405", taxonomyType: "globe", categoryId: "g5", isPrimary: true }],
    budgetAlignment: [{ targetAId: "A1", targetBId: "BER_71405", alignment: "high" }],
    ...extra,
  };
}
