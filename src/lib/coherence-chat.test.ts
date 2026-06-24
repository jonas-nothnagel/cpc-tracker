import { describe, it, expect } from "vitest";
import { buildChatRequest, pickExampleQueries } from "./coherence-chat";
import type {
  AlignmentResult,
  CorpusThemes,
  DocPairSynthesis,
  PolicyDocumentType,
  SectorSynthesis,
  SynthesisBlock,
  Target,
} from "@/types";

function makeTarget(id: string, doc: string): Target {
  return {
    id,
    text: `${id} text`,
    sourceDocument: doc as PolicyDocumentType,
    sourceLabel: id,
    country: "Testland",
    isQuantitative: false,
    isTimeBound: false,
  };
}

function block(name: string): SynthesisBlock {
  return {
    storyline_name: name,
    reinforce: `${name} reinforce`,
    clash: `${name} clash`,
    coordination_hint: `${name} coordination`,
    confidence: "medium",
  };
}

function makeDocPair(
  labelA: string,
  labelB: string,
  err: string | null = null,
): DocPairSynthesis {
  return {
    doc_a: labelA,
    doc_b: labelB,
    label_a: labelA,
    label_b: labelB,
    aligned_count: 3,
    flagged_count: 1,
    contradiction_types: {},
    synthesis: block(`${labelA}-${labelB}`),
    synthesis_error: err,
  };
}

function makeSector(
  name: string,
  signal: number,
  err: string | null = null,
): SectorSynthesis {
  return {
    taxonomy_type: "globe",
    category_id: name,
    category_name: name,
    aligned_count: signal,
    flagged_count: 0,
    pool_composition: { primary_count: 1, relevant_only_count: 0 },
    contradiction_types: {},
    synthesis: block(name),
    synthesis_error: err,
  };
}

const baseArgs = {
  query: "what is the main storyline?",
  groupMode: "document" as const,
  filter: "all",
  targets: [makeTarget("t1", "FSS"), makeTarget("t2", "NAP")],
  alignment: [] as AlignmentResult[],
  classifications: [],
  sectors: [],
  globeCategories: [],
  availableDocs: ["FSS", "NAP"] as PolicyDocumentType[],
  hiddenDocs: new Set<string>(),
};

type SynthCtx = {
  corpus?: {
    summary: string;
    storylines: { name: string; type: string; description: string }[];
  };
  docPairs: { a: string; b: string; storyline: string }[];
  sectors: { category: string }[];
};

function synthesisOf(
  body: ReturnType<typeof buildChatRequest>,
): SynthCtx | undefined {
  return (body.context as { synthesis?: SynthCtx }).synthesis;
}

describe("buildChatRequest synthesis context", () => {
  it("omits the synthesis key when no artifacts are passed", () => {
    const body = buildChatRequest(baseArgs);
    expect(synthesisOf(body)).toBeUndefined();
  });

  it("includes the corpus summary and storylines", () => {
    const corpusThemes: CorpusThemes = {
      summary_paragraph: "Documents broadly pull together with two frictions.",
      storylines: [
        {
          name: "Shared restoration push",
          type: "reinforcement",
          description: "FSS and NAP both scale restoration.",
          contributing_doc_pairs: ["FSS<->NAP"],
          confidence: "high",
          pair_count: 4,
          spans_documents: ["FSS", "NAP"],
        },
      ],
      doc_pair_count: 1,
    };
    const body = buildChatRequest({ ...baseArgs, corpusThemes });
    const syn = synthesisOf(body);
    expect(syn?.corpus?.summary).toBe(
      "Documents broadly pull together with two frictions.",
    );
    expect(syn?.corpus?.storylines).toEqual([
      {
        name: "Shared restoration push",
        type: "reinforcement",
        description: "FSS and NAP both scale restoration.",
      },
    ]);
  });

  it("includes doc-pair syntheses and drops errored ones", () => {
    const body = buildChatRequest({
      ...baseArgs,
      docPairSyntheses: [
        makeDocPair("FSS", "NAP"),
        makeDocPair("FSS", "NDC", "rate limited"),
      ],
    });
    const syn = synthesisOf(body);
    expect(syn?.docPairs).toHaveLength(1);
    expect(syn?.docPairs[0]).toMatchObject({
      a: "FSS",
      b: "NAP",
      storyline: "FSS-NAP",
    });
  });

  it("ranks sector syntheses by total signal and caps at 15", () => {
    const sectorSyntheses = Array.from({ length: 18 }, (_, i) =>
      makeSector(`s${18 - i}`, 18 - i),
    );
    const body = buildChatRequest({ ...baseArgs, sectorSyntheses });
    const syn = synthesisOf(body);
    expect(syn?.sectors).toHaveLength(15);
    // Highest signal first, lowest three dropped.
    expect(syn?.sectors[0].category).toBe("s18");
    expect(syn?.sectors.map((s) => s.category)).toContain("s4");
    expect(syn?.sectors.map((s) => s.category)).not.toContain("s3");
  });

  it("drops sectors that errored during synthesis", () => {
    const body = buildChatRequest({
      ...baseArgs,
      sectorSyntheses: [
        makeSector("ok", 5),
        makeSector("broken", 9, "content filter"),
      ],
    });
    const syn = synthesisOf(body);
    expect(syn?.sectors.map((s) => s.category)).toEqual(["ok"]);
  });
});

describe("pickExampleQueries gating", () => {
  const none = {
    globeCategoriesAvailable: false,
    sectorsAvailable: false,
    hasAdaptation: false,
    hasTensions: false,
    hasBtr: false,
    hasBudget: false,
  };

  it("returns empty pools when the dataset can answer nothing", () => {
    expect(pickExampleQueries(none)).toEqual({ coherence: [], finance: [] });
  });

  it("leads the coherence pool with reported-vs-planned when BTR data is present", () => {
    const pools = pickExampleQueries({ ...none, hasBtr: true, hasTensions: true });
    expect(pools.coherence[0]).toBe("reportedVsPlanned");
  });

  it("omits the BTR question and keeps the tension-gated ones without BTR", () => {
    const pools = pickExampleQueries({ ...none, hasTensions: true });
    expect(pools.coherence).not.toContain("reportedVsPlanned");
    expect(pools.coherence).toEqual([
      "ministryCoordination",
      "tightenBoundary",
      "missingIndicator",
    ]);
  });

  it("unlocks theme concentration from either a GLOBE or a sector taxonomy", () => {
    expect(
      pickExampleQueries({ ...none, globeCategoriesAvailable: true }).coherence,
    ).toContain("themeConcentration");
    expect(
      pickExampleQueries({ ...none, sectorsAvailable: true }).coherence,
    ).toContain("themeConcentration");
  });

  it("unlocks the adaptation question only with adaptation data", () => {
    expect(pickExampleQueries({ ...none, hasAdaptation: true }).coherence).toEqual([
      "adaptationAlignment",
    ]);
  });

  it("keeps the finance pool empty without tagged budget data", () => {
    expect(pickExampleQueries({ ...none, hasTensions: true }).finance).toEqual([]);
  });

  it("builds the finance pool from budget, tensions and GLOBE availability", () => {
    const pools = pickExampleQueries({
      ...none,
      hasBudget: true,
      hasTensions: true,
      globeCategoriesAvailable: true,
    });
    expect(pools.finance).toEqual([
      "spendVsMisalignment",
      "underFunded",
      "fundedCategories",
    ]);
  });

  it("drops the spend-vs-misalignment and GLOBE finance keys when their extra gate fails", () => {
    const pools = pickExampleQueries({ ...none, hasBudget: true });
    expect(pools.finance).toEqual(["underFunded"]);
  });
});
