import { describe, expect, it } from "vitest";
import { scopeOf } from "../compute";
import { briefFixture } from "../test-fixture";
import { parseTargetLabels } from "../target-labels";
import { LEVEL_CODES, MECHANISM_CODES } from "../source";
import { buildExploreLayers, layerReadings } from "./layers";
import { LAYER_DATA } from "./test-layers";
import { activitiesPayload, levelsPayload } from "../spending-fixture";
import { buildExploreModel, levelBetween, relationBetween } from "./model";
import { focusMembers, groupProfile, pairsBetween, parseFocusKey, rankMembers } from "./focus";

const SOURCE = briefFixture();
const DATA = LAYER_DATA;

describe("buildExploreLayers", () => {
  const layers = buildExploreLayers(DATA, SOURCE)!;

  it("keeps reported actions by kind and budget lines, in that order", () => {
    expect(layers.items.map((i) => [i.id, i.layer])).toEqual([
      ["BTR_1", "mitigation"],
      ["ADP_1", "adaptation"],
      ["BER_71401", "budget"],
    ]);
    expect(layers.items[0].status).toBe("Ongoing");
  });

  it("splits a budget line's code from its name and totals its spending", () => {
    const line = layers.items[2];
    expect(line.code).toBe("71401");
    expect(line.name).toBe("Waste management");
    expect(line.spend).toEqual({ total: 2, years: 2 });
    expect(layers.budget).toEqual({ currency: "MNT", unit: "billion", start: 2020, end: 2024 });
  });

  it("links targets in scope to actions and budget lines, and drops the rest", () => {
    // A1~BTR_1, B2~BTR_1, C3~ADP_1, A2~BER, A3~BER; Z9 is not a known target.
    expect([...layerReadings(layers.links)].map(([target, item]) => `${target}~${layers.items[item].id}`)).toEqual([
      "A1~BTR_1",
      "B2~BTR_1",
      "C3~ADP_1",
      "A2~BER_71401",
      "A3~BER_71401",
    ]);
  });

  it("packs each item's readings into one row over the targets read", () => {
    expect(layers.links.targets).toEqual(["A1", "A2", "A3", "B2", "C3"]);
    expect(layers.links.rows).toHaveLength(layers.items.length);
    for (const row of layers.links.rows) expect(row).toHaveLength(5);
    // Every level and mechanism comes back as it went in.
    const readings = [...layerReadings(layers.links)];
    const rows = (DATA.alignment as Record<string, unknown>[]).concat((DATA.budgetAlignment as Record<string, unknown>[]) ?? []);
    for (const [target, item, level, mechanism] of readings) {
      const row = rows.find(
        (r) =>
          (r.targetAId === target && r.targetBId === layers.items[item].id) ||
          (r.targetBId === target && r.targetAId === layers.items[item].id),
      )!;
      expect(LEVEL_CODES[level]).toBe(row.alignment);
      expect(MECHANISM_CODES[mechanism]).toBe(row.mechanism ?? null);
    }
  });

  it("marks no description as written with AI unless the review says so", () => {
    expect(layers.items.filter((i) => i.aiWritten)).toEqual([]);
  });

  it("gives an NBSAP target its least advanced NR7 status", () => {
    expect(layers.nr7).toEqual({ A1: "limited", A2: "unknown" });
  });

  it("is absent for a country without reported actions or budget lines", () => {
    expect(buildExploreLayers({ targets: [], alignment: [] }, SOURCE)).toBeNull();
  });
});

describe("a rebuilt record's budget lines", () => {
  it("carry their US$ figure, each year at its own rate, beside the review's own amount", () => {
    const layers = buildExploreLayers(levelsPayload(), SOURCE, { locale: "en" })!;
    expect(layers.budget).toEqual({ currency: "MNT", unit: "billion", start: 2020, end: 2021, usd: true });
    // ₮3 billion at 2,000 and ₮4 billion at 2,500 per US$: US$1.5 + 1.6 million.
    expect(layers.items.find((i) => i.id === "BER_71405")?.spend).toEqual({ total: 7, years: 2, usd: 3.1 });
  });

  it("carry none for a review in US$ (Panama's balboa, at par)", () => {
    const layers = buildExploreLayers(activitiesPayload(), SOURCE, { locale: "en" })!;
    expect(layers.budget?.currency).toBe("US$");
    expect(layers.budget?.usd).toBeUndefined();
    expect(layers.items.filter((i) => i.layer === "budget").every((i) => i.spend?.usd === undefined)).toBe(true);
  });
});

describe("a budget line's names and description", () => {
  // One of Panama's lines, as the review abbreviates it, with the text written
  // for the AI that compared it, and the team's list of its written-out names.
  const SOURCE_NAME = "Fort Gest. Eco. y Admón. Finan.";
  const PANAMA: Record<string, unknown> = {
    budgetPseudoTargets: [
      {
        id: "BER_BER_PA_10_01",
        sourceLabel: `BER_PA_10_01 ${SOURCE_NAME}`,
        text: `${SOURCE_NAME}. Description sourced from the descriptive layer (LLM-generated). Expenditure: 2024: 1 million PAB.`,
        expenditure: { "2024": 1 },
      },
    ],
    berData: {
      currency: "PAB",
      unit: "million",
      period: { start: 2015, end: 2024 },
      programs: [
        {
          code: "BER_PA_10_01",
          name: SOURCE_NAME,
          description: `Programme "${SOURCE_NAME}" under the MINISTERIO DE ECONOMÍA Y FINANZAS.`,
          descriptionEs: `Programa «${SOURCE_NAME}» en Ministerio de Economía y Finanzas.`,
          descriptionEn: `Programme "${SOURCE_NAME}" under the Ministry of Economy and Finance.`,
          descriptionAiGenerated: true,
        },
      ],
    },
  };
  const NAMES = {
    names: {
      BER_PA_10_01: {
        es: "Fortalecimiento Gestión Económica y Administración Financiera",
        en: "Strengthening economic management and financial administration",
      },
    },
  };
  const line = (locale: string, names: typeof NAMES | null = NAMES) =>
    buildExploreLayers(PANAMA, SOURCE, { locale, names })!.items[0];

  it("names the line in English by its machine translation, flagged as one, the review's own name kept", () => {
    const en = line("en");
    expect(en.code).toBe("BER_PA_10_01");
    expect(en.name).toBe("Strengthening economic management and financial administration");
    expect(en.translated).toBe("machine");
    expect(en.original).toBe(SOURCE_NAME);
  });

  it("names the line in Spanish with the review's abbreviations written out", () => {
    const es = line("es");
    expect(es.name).toBe("Fortalecimiento Gestión Económica y Administración Financiera");
    expect(es.translated).toBeUndefined();
    expect(es.original).toBe(SOURCE_NAME);
  });

  it("shows the review's own description in the page's language, not the text written for the AI", () => {
    expect(line("en").text).toBe(`Programme "${SOURCE_NAME}" under the Ministry of Economy and Finance.`);
    expect(line("es").text).toBe(`Programa «${SOURCE_NAME}» en Ministerio de Economía y Finanzas.`);
    expect(line("mn").text).toBe(`Programme "${SOURCE_NAME}" under the Ministry of Economy and Finance.`);
  });

  it("marks the description as written with AI where the review says so", () => {
    expect(line("en").aiWritten).toBe(true);
    expect(line("es").aiWritten).toBe(true);
  });

  it("keeps the review's own name where the list names no line", () => {
    const plain = line("en", null);
    expect(plain.name).toBe(SOURCE_NAME);
    expect(plain.original).toBeUndefined();
    expect(plain.translated).toBeUndefined();
  });
});

describe("Mongolia's ring in Mongolian", () => {
  const MONGOLIA: Record<string, unknown> = {
    targets: [
      { id: "BTR_1", sourceDocument: "BTR", sourceLabel: "Solar parks", text: "Build solar parks.", actionType: "mitigation", measureStatus: "Ongoing" },
    ],
    budgetPseudoTargets: [
      { id: "BER_71401", sourceLabel: "71401 Waste management", text: "Waste management.", expenditure: { "2020": 1 } },
      { id: "BER_81708", sourceLabel: "81708 Afforestation", text: "Afforestation.", expenditure: { "2020": 1 } },
    ],
    berData: {
      currency: "MNT",
      unit: "billion",
      period: { start: 2020, end: 2024 },
      programs: [
        { code: "71401", name: "Waste management", description: "Implementation of the Law on Waste." },
        { code: "81708", name: "Afforestation", description: "Under the Law on Afforestation." },
      ],
    },
  };
  const NAMES = {
    names: {
      "71401": { mn: "Хог хаягдлын менежмент", mnDescription: "Хог хаягдлын тухай хуулийг хэрэгжүүлэх.", mnMachine: true as const },
      "81708": { mn: "Ойжуулалт", mnDescription: "Ойжуулалтын тухай хуульд заасны дагуу." },
    },
  };
  const LABELS = parseTargetLabels({
    labels: { BTR_1: { mn: "Нарны цахилгаан станц" } },
    texts: { BTR_1: { mn: "Нарны цахилгаан станц барих." } },
  });
  const items = (locale: string) => buildExploreLayers(MONGOLIA, SOURCE, { locale, names: NAMES, labels: LABELS })!.items;

  it("names a reported action by its machine translation, flagged as one, the report's own title kept", () => {
    const [action] = items("mn");
    expect(action.label).toBe("Нарны цахилгаан станц");
    expect(action.name).toBe("Нарны цахилгаан станц");
    expect(action.text).toBe("Нарны цахилгаан станц барих.");
    expect(action.translated).toBe("machine");
    expect(action.original).toBe("Solar parks");
    expect(action.status).toBe("Ongoing");
  });

  it("names a budget line by the review's own Mongolian where it has one, unflagged", () => {
    const line = items("mn").find((i) => i.code === "81708")!;
    expect(line.name).toBe("Ойжуулалт");
    expect(line.text).toBe("Ойжуулалтын тухай хуульд заасны дагуу.");
    expect(line.translated).toBeUndefined();
    expect(line.original).toBeUndefined();
  });

  it("names any other budget line by its machine translation, flagged as one, the review's name kept", () => {
    const line = items("mn").find((i) => i.code === "71401")!;
    expect(line.name).toBe("Хог хаягдлын менежмент");
    expect(line.text).toBe("Хог хаягдлын тухай хуулийг хэрэгжүүлэх.");
    expect(line.translated).toBe("machine");
    expect(line.original).toBe("Waste management");
  });

  it("stays as the sources have it on the English page", () => {
    const en = items("en");
    expect(en.map((i) => i.name)).toEqual(["Solar parks", "Waste management", "Afforestation"]);
    expect(en.map((i) => i.text)).toEqual(["Build solar parks.", "Implementation of the Law on Waste.", "Under the Law on Afforestation."]);
    expect(en.filter((i) => i.translated || i.original)).toEqual([]);
  });
});

describe("the model with layers", () => {
  const layers = buildExploreLayers(DATA, SOURCE)!;
  const model = buildExploreModel(scopeOf(SOURCE, ["A", "B", "C"]), layers);
  const at = (id: string) => model.index.get(id)!;

  it("seats actions and budget lines after the targets", () => {
    expect(model.items).toHaveLength(21);
    expect(model.items[18].kind).toBe("action");
    expect(model.items[20].kind).toBe("budget");
    expect(model.items[20].doc).toBe("layer:budget");
  });

  it("counts only a strongly aligned action and a matching budget line", () => {
    expect(relationBetween(model, at("A1"), at("BTR_1"))).toBe("strong");
    expect(relationBetween(model, at("B2"), at("BTR_1"))).toBe("apart");
    // A moderate reading of an action is kept for the record, not counted.
    expect(levelBetween(model, at("C3"), at("ADP_1"))).toBe("medium");
    expect(relationBetween(model, at("C3"), at("ADP_1"))).toBe("none");
    expect(relationBetween(model, at("A2"), at("BER_71401"))).toBe("strong");
    // A budget line is matching or not; no potential misalignment is claimed.
    expect(relationBetween(model, at("A3"), at("BER_71401"))).toBe("none");
  });

  it("does not compare actions or budget lines with each other", () => {
    expect(relationBetween(model, at("BTR_1"), at("ADP_1"))).toBeNull();
    expect(relationBetween(model, at("BTR_1"), at("BER_71401"))).toBeNull();
  });

  it("keeps the targets' own readings", () => {
    expect(relationBetween(model, at("A6"), at("B1"))).toBe("apart");
    expect(relationBetween(model, at("A1"), at("B2"))).toBe("aligned");
  });
});

describe("groups across targets and layers", () => {
  const layers = buildExploreLayers(DATA, SOURCE)!;
  const model = buildExploreModel(scopeOf(SOURCE, ["A", "B", "C"]), layers);
  const at = (id: string) => model.index.get(id)!;

  it("reads targets against a layer by coverage: any strongly aligned action is enough", () => {
    const mitigation = groupProfile(model, focusMembers(model, parseFocusKey("doc:layer:mitigation"), []));
    expect(mitigation.tone[at("A1")]).toBe("reinforce");
    expect(mitigation.tone[at("B2")]).toBe("apart");
    expect(mitigation.tone[at("C1")]).toBe("unrelated");
  });

  it("reads a layer seat against a document by coverage too", () => {
    const doc = groupProfile(model, focusMembers(model, parseFocusKey("doc:A"), []));
    expect(doc.tone[at("BTR_1")]).toBe("reinforce");
    expect(doc.tone[at("BER_71401")]).toBe("reinforce");
  });

  it("keeps a document's own numbers to target pairs", () => {
    const doc = groupProfile(model, focusMembers(model, parseFocusKey("doc:A"), []));
    expect(doc.total).toBe(72);
    const ranked = rankMembers(model, doc);
    expect(ranked.strong.find((r) => model.items[r.id].id === "A1")?.count).toBe(6);
  });

  it("lists a layer's pairs with the group by the layer's own reading", () => {
    const doc = focusMembers(model, parseFocusKey("doc:A"), []);
    const budget = focusMembers(model, parseFocusKey("doc:layer:budget"), []);
    expect(pairsBetween(model, doc, budget, "strong")).toHaveLength(1);
    // A3's flagged budget reading is not a potential misalignment.
    expect(pairsBetween(model, doc, budget, "apart")).toHaveLength(0);
  });
});
