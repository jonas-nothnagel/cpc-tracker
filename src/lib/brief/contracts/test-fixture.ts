import type { BriefDocument, BriefLens } from "../source";
import type { Contract, ContractsFile } from "./model";
import type { ContractsSetup } from "./setup";

/**
 * A small record for tests: two years, three documents (A, B, C), six
 * targets. p1 serves targets in all three documents; the three lots of
 * tender t10 are potentially misaligned with C1; C2 has no contract but a
 * budget line (see `briefSide`).
 */
export function contractsFixture(): ContractsFile {
  const c = (over: Partial<Contract> & Pick<Contract, "id" | "tender" | "year" | "tier" | "value">): Contract => ({
    title: `Contract ${over.id}`,
    translated: true,
    place: null,
    areas: {},
    matches: [],
    misaligned: [],
    ...over,
  });
  const contracts: Contract[] = [
    c({ id: "p1", tender: "t1", year: 2024, tier: "principal", value: 10e9, place: "MN-043", areas: { globe: "g_pollution", ipcc: "sector_waste" }, matches: ["A1", "B1", "C1"] }),
    c({ id: "p2", tender: "t2", year: 2024, tier: "principal", value: 4e9, place: "MN-1", areas: { globe: "g_restoration" }, matches: ["A1"] }),
    c({ id: "p3", tender: "t3", year: 2025, tier: "principal", value: 4e9, place: "MN-043", areas: { globe: "g_restoration" }, matches: ["B1"] }),
    c({ id: "p4", tender: "t4", year: 2025, tier: "principal", value: 2e9, areas: { globe: "g_sustainable" } }),
    c({ id: "p5", tender: "t5", year: 2025, tier: "principal", value: 2e9, place: "several", matches: ["A2"] }),
    c({ id: "s1", tender: "t6", year: 2024, tier: "significant", value: 8e9, place: "MN-1", areas: { globe: "g_pollution" }, matches: ["A1", "B1"] }),
    c({ id: "s2", tender: "t7", year: 2025, tier: "significant", value: 4e9, place: "MN-057", areas: { globe: "g_sustainable" } }),
    c({ id: "s3", tender: "t8", year: 2025, tier: "significant", value: 2e9, matches: ["C1"] }),
    c({ id: "s4", tender: "t9", year: 2025, tier: "significant", value: 2e9, place: "MN-043", areas: { globe: "g_restoration" } }),
    c({ id: "n1", tender: "t10", year: 2025, tier: "none", value: 1e9, misaligned: ["C1"] }),
    c({ id: "n2", tender: "t10", year: 2025, tier: "none", value: 1e9, misaligned: ["C1"] }),
    c({ id: "n3", tender: "t10", year: 2025, tier: "none", value: 1e9, misaligned: ["C1"] }),
    c({ id: "n4", tender: "t11", year: 2024, tier: "none", value: 3e9, matches: ["B2"] }),
  ];
  return {
    version: 1,
    source: {
      name: "tender.gov.mn",
      url: "https://www.tender.gov.mn",
      firstYear: 2024,
      lastYear: 2025,
      snapshot: "2025-12",
      usdRate: 3500,
      duplicates: { records: 2, value: 5e9 },
      comparedOthers: 4,
      excluded: { otherCurrency: 0, rejected: 0 },
    },
    census: { contracts: 40, tenders: 30, value: 250e9 },
    places: [
      { code: "none", contracts: 20, value: 150e9 },
      { code: "MN-1", contracts: 12, value: 60e9 },
      { code: "MN-043", contracts: 6, value: 30e9 },
      { code: "MN-057", contracts: 2, value: 10e9 },
    ],
    years: [
      { year: 2024, contracts: 15, value: 100e9, principal: { contracts: 2, value: 14e9 }, significant: { contracts: 1, value: 8e9 } },
      { year: 2025, contracts: 25, value: 150e9, principal: { contracts: 3, value: 8e9 }, significant: { contracts: 3, value: 8e9 } },
    ],
    contracts,
    agreement: { high: 1, flagged: 1, total: 3 },
    faultline: [{ contract: "p1", pairs: [["A1", "C1"]] }],
    example: "p1",
  };
}

/** The brief's side of the fixture: documents, targets, one lens, and the
 *  targets with a strong budget line or reported action. */
export function briefSide() {
  return {
    docOrder: ["A", "B", "C"],
    targets: [
      { id: "A1", doc: "A", label: "1", text: "Cut emissions from waste" },
      { id: "A2", doc: "A", label: "2", text: "Protect springs" },
      { id: "B1", doc: "B", label: "1", text: "Restore degraded land" },
      { id: "B2", doc: "B", label: "2", text: "Reduce pollution" },
      { id: "C1", doc: "C", label: "1", text: "Shift freight to rail" },
      { id: "C2", doc: "C", label: "2", text: "Reform harmful subsidies" },
    ],
    categories: [
      { id: "g_pollution", name: "Pollution management" },
      { id: "g_restoration", name: "Restoration" },
      { id: "g_sustainable", name: "Sustainable use" },
      { id: "g_abs", name: "Access and benefit sharing" },
    ],
    primary: { A1: "g_sustainable", A2: "g_sustainable", B1: "g_restoration", B2: "g_pollution", C1: "g_sustainable" } as Record<string, string>,
    budget: new Set(["C2"]),
    action: new Set(["A2"]),
  };
}

/** The page's setup for component tests: the fixture record, three
 *  documents, six targets, two lenses (Biodiversity, Mitigation sectors). */
export function setupFixture(): ContractsSetup {
  const side = briefSide();
  const doc = (id: string, name: string): BriefDocument => ({ id, code: id, name, full: name, color: "#000000", count: 2, defaultOn: true });
  const lenses: BriefLens[] = [
    { id: "globe", taxonomyType: "globe", categories: side.categories, primary: side.primary },
    { id: "ipcc", taxonomyType: "sector", categories: [{ id: "sector_waste", name: "Waste" }], primary: { A1: "sector_waste" } },
  ];
  return {
    countryId: "mongolia",
    countryName: "Mongolia",
    file: contractsFixture(),
    documents: [doc("A", "Document A"), doc("B", "Document B"), doc("C", "Document C")],
    targets: side.targets,
    lenses,
    budget: [...side.budget],
    action: [...side.action],
    backing: { C2: { budget: ["71404 Water resources"], action: [] }, A2: { budget: [], action: ["Protect springs"] } },
  };
}
