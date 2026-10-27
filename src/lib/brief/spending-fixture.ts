/**
 * Dashboard payloads for the spending tests: Country X's illustrative file
 * (the earlier shape), a record the way the Mongolia adapter writes it, and
 * one the way the Panama adapter writes it. Areas g1, g2 and g5 are the brief
 * fixture's GLOBE categories.
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

const activity = (code: string, programme: string, name: string, a: number, b: number) => ({
  code,
  kind: "activity",
  name,
  programme,
  amounts: { "2016": { all: cell(a) }, "2017": { all: cell(b) } },
});

/** Activities in their programmes and institutions, millions of balboas (at
 *  par with the US$). The agriculture ministry runs the largest programme
 *  (6); the environment ministry spends the most (7) over two programmes. */
export function activitiesPayload(withInstitutions = true) {
  const programme = (code: string, name: string, institution: string, institutionCode: string) => ({
    code,
    name,
    institution,
    ...(withInstitutions ? { institutionCode } : {}),
  });
  return {
    berData: {
      programs: [],
      expenditure: [],
      currency: "PAB",
      unit: "million",
      period: { start: 2016, end: 2017 },
      record: {
        version: 1,
        currency: "PAB",
        unit: "million",
        levels: [{ id: "all", name: "Screened institutions" }],
        years: [
          { year: "2016", levels: ["all"], complete: true, reviewed: { all: 6 }, public: { all: 600 }, usdRate: 1 },
          { year: "2017", levels: ["all"], complete: true, reviewed: { all: 7 }, public: { all: 700 }, usdRate: 1 },
        ],
        ...(withInstitutions
          ? {
              institutions: [
                { code: "0-10", name: "Ministerio de Desarrollo Agropecuario" },
                { code: "0-27", name: "Ministerio de Ambiente" },
              ],
            }
          : {}),
        programmes: [
          programme("0-10-1-3", "Sanidad Agropecuaria", "Ministerio de Desarrollo Agropecuario", "0-10"),
          programme("0-27-0-2", "Dirección General y Administración", "Ministerio de Ambiente", "0-27"),
          programme("0-27-1-1", "Áreas Protegidas y Vida Silvestre", "Ministerio de Ambiente", "0-27"),
        ],
        lines: [
          activity("0-10-1-3-1-1", "0-10-1-3", "Planta de Moscas Estériles", 3, 3),
          activity("0-27-0-2-1-1", "0-27-0-2", "Gestión Administrativa", 2, 2),
          activity("0-27-1-1-1-1", "0-27-1-1", "Guardaparques", 2, 1),
        ],
      },
    },
  };
}

/** The two-level record with who holds each line's budget in the complete
 *  years, the way the Mongolia adapter writes them: the environment minister
 *  holds the programme, the capital city and a province the purpose code. */
export function holdersPayload() {
  const payload = levelsPayload();
  const [programme, purpose] = payload.berData.record.lines as unknown as Record<string, unknown>[];
  const minister = (counted: number) => ({ code: "013", name: "Minister for Nature and Tourism", nameMn: "Байгаль орчин, аялал жуулчлалын сайд", counted });
  const capital = (counted: number) => ({ code: "059", name: "Capital city", nameMn: "Нийслэл", counted });
  programme.holders = { "2020": [minister(3)], "2021": [minister(4)] };
  purpose.holders = {
    "2020": [capital(1)],
    "2021": [capital(1.5), { code: "043", name: "Bulgan province", nameMn: "Булган аймаг", counted: 0.5 }],
  };
  return payload;
}
