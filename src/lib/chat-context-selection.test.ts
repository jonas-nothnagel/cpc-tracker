import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  CHAT_CONTEXT_TOKEN_BUDGET,
  describeChatContext,
  detectQueryScope,
  estimateTokens,
  selectChatContext,
  type PrimarySlot,
} from "./chat-context-selection";
import type { AlignmentLevel, AlignmentResult, Target } from "@/types";

function makeTarget(id: string, doc: string, text = `${id} body text`): Target {
  return {
    id,
    text,
    sourceDocument: doc as Target["sourceDocument"],
    sourceLabel: id,
    country: "Testland",
    isQuantitative: false,
    isTimeBound: false,
  };
}

function pair(
  a: string,
  b: string,
  level: AlignmentLevel,
  description: string,
): AlignmentResult {
  return { targetAId: a, targetBId: b, alignment: level, description };
}

const docTypes = [
  { id: "FSS", fullLabel: "Food Supply Strategy" },
  { id: "NDC", fullLabel: "Nationally Determined Contribution" },
  { id: "NAP", fullLabel: "National Adaptation Plan" },
];

describe("estimateTokens", () => {
  it("uses the char/4 heuristic and handles empty input", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});

describe("detectQueryScope", () => {
  const targets = [
    makeTarget("FSS_1", "FSS"),
    makeTarget("NDC_1", "NDC"),
    makeTarget("NAP_1", "NAP"),
  ];
  const taxonomies = {
    globe: [
      { id: "globe_2", name: "Water resources", description: "watershed rivers water" },
    ],
    sector: [],
    adaptation: [],
  };

  it("detects two named documents as doc-pair scope", () => {
    const s = detectQueryScope("How does FSS conflict with NDC?", {
      documentTypes: docTypes,
      targets,
      taxonomies,
    });
    expect(s.kind).toBe("doc-pair");
    expect(s.docIds.sort()).toEqual(["FSS", "NDC"]);
  });

  it("detects a named target as target scope (over doc match)", () => {
    const s = detectQueryScope("Tell me about FSS_1", {
      documentTypes: docTypes,
      targets,
      taxonomies,
    });
    expect(s.kind).toBe("target");
    expect(s.targetIds).toContain("FSS_1");
  });

  it("detects a taxonomy topic when no docs/targets are named", () => {
    const s = detectQueryScope("which targets deal with water resources?", {
      documentTypes: docTypes,
      targets,
      taxonomies,
    });
    expect(s.kind).toBe("topic");
    expect(s.topic?.categoryId).toBe("globe_2");
  });

  it("falls back to broad scope for a generic question", () => {
    const s = detectQueryScope("which two documents disagree the most?", {
      documentTypes: docTypes,
      targets,
      taxonomies,
    });
    expect(s.kind).toBe("broad");
  });

  it("does not match a doc id inside a longer token", () => {
    const s = detectQueryScope("what about FSSX plans?", {
      documentTypes: docTypes,
      targets,
      taxonomies,
    });
    expect(s.docIds).not.toContain("FSS");
  });
});

describe("selectChatContext", () => {
  const targets = [
    makeTarget("FSS_1", "FSS"),
    makeTarget("FSS_2", "FSS"),
    makeTarget("NDC_1", "NDC"),
    makeTarget("NAP_1", "NAP"),
  ];
  const primaryByTarget = new Map<string, PrimarySlot>();
  const noGuaranteed = new Set<string>();

  it("includes the whole candidate set at full detail when it fits", () => {
    const longRationale = "x".repeat(1500); // > capped cap of 600
    const alignment = [
      pair("FSS_1", "NDC_1", "flagged", longRationale),
      pair("FSS_2", "NAP_1", "high", longRationale),
    ];
    const broad = detectQueryScope("which documents disagree?", {
      documentTypes: docTypes,
      targets,
      taxonomies: { globe: [], sector: [], adaptation: [] },
    });
    const res = selectChatContext({
      query: "which documents disagree?",
      scope: broad,
      visibleTargets: targets,
      visibleAlignment: alignment,
      primaryByTarget,
      guaranteedTargetIds: noGuaranteed,
    });
    expect(res.meta.capped).toBe(false);
    expect(res.meta.pairsIncluded).toBe(2);
    expect(res.meta.pairsConsidered).toBe(2);
    // Full detail: rationale not truncated to the 600 capped cap.
    expect(res.pairs[0].rationale.length).toBe(1500);
    // Endpoints of included pairs keep full text.
    expect(res.fullTextTargetIds.has("FSS_1")).toBe(true);
    expect(res.fullTextTargetIds.has("NDC_1")).toBe(true);
  });

  it("caps and ranks by relevance when the candidate set overflows", () => {
    const rationale = "y".repeat(2000);
    const alignment = Array.from({ length: 50 }, (_, i) =>
      pair(`FSS_1`, `NDC_1`, "high", rationale + i),
    );
    // Distinct endpoints so dedupe doesn't collapse them.
    const many = alignment.map((a, i) => ({
      ...a,
      targetAId: `A_${i}`,
      targetBId: `B_${i}`,
    }));
    const manyTargets = many.flatMap((a) => [
      makeTarget(a.targetAId, "FSS"),
      makeTarget(a.targetBId, "NDC"),
    ]);
    const broad = detectQueryScope("broad", {
      documentTypes: docTypes,
      targets: manyTargets,
      taxonomies: { globe: [], sector: [], adaptation: [] },
    });
    const res = selectChatContext({
      query: "broad",
      scope: broad,
      visibleTargets: manyTargets,
      visibleAlignment: many,
      primaryByTarget,
      guaranteedTargetIds: noGuaranteed,
      budgetTokens: 2000, // tiny budget forces a cap
    });
    expect(res.meta.capped).toBe(true);
    expect(res.meta.pairsConsidered).toBe(50);
    expect(res.meta.pairsIncluded).toBeLessThan(50);
    expect(res.meta.pairsIncluded).toBeGreaterThan(0);
    // Capped rationale trimmed to 600.
    expect(res.pairs[0].rationale.length).toBe(600);
  });

  it("narrows candidates to pairs between the two named documents", () => {
    const alignment = [
      pair("FSS_1", "NDC_1", "flagged", "fss vs ndc"),
      pair("FSS_2", "NAP_1", "high", "fss vs nap"),
      pair("NDC_1", "NAP_1", "high", "ndc vs nap"),
    ];
    const scope = detectQueryScope("how do FSS and NDC compare?", {
      documentTypes: docTypes,
      targets,
      taxonomies: { globe: [], sector: [], adaptation: [] },
    });
    const res = selectChatContext({
      query: "how do FSS and NDC compare?",
      scope,
      visibleTargets: targets,
      visibleAlignment: alignment,
      primaryByTarget,
      guaranteedTargetIds: noGuaranteed,
    });
    expect(res.meta.scopeKind).toBe("doc-pair");
    expect(res.meta.pairsConsidered).toBe(1);
    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0].rationale).toBe("fss vs ndc");
  });

  it("keeps guaranteed (top-ranked) targets' full text even without a pair", () => {
    const alignment = [pair("FSS_1", "NDC_1", "flagged", "a")];
    const broad = detectQueryScope("broad", {
      documentTypes: docTypes,
      targets,
      taxonomies: { globe: [], sector: [], adaptation: [] },
    });
    const res = selectChatContext({
      query: "broad",
      scope: broad,
      visibleTargets: targets,
      visibleAlignment: alignment,
      primaryByTarget,
      guaranteedTargetIds: new Set(["NAP_1"]),
    });
    expect(res.fullTextTargetIds.has("NAP_1")).toBe(true);
  });
});

describe("describeChatContext", () => {
  it("phrases a capped broad scope honestly", () => {
    const s = describeChatContext({
      scopeKind: "broad",
      scopeLabel: "all documents",
      pairsConsidered: 2464,
      pairsIncluded: 180,
      capped: true,
    });
    expect(s).toContain("180 most relevant of 2464");
    expect(s).toContain("across all documents");
    expect(s).not.toContain("flagged");
    expect(s).not.toContain("—");
  });

  it("phrases a fully-covered doc-pair scope", () => {
    const s = describeChatContext({
      scopeKind: "doc-pair",
      scopeLabel: "FSS and NDC",
      pairsConsidered: 64,
      pairsIncluded: 64,
      capped: false,
      docsInFocus: ["FSS", "NDC"],
    });
    expect(s).toBe("Covers all 64 pairs involving FSS and NDC.");
  });

  it("phrases a topic scope", () => {
    const s = describeChatContext({
      scopeKind: "topic",
      scopeLabel: "Water resources",
      pairsConsidered: 40,
      pairsIncluded: 40,
      capped: false,
      topicLabel: "Water resources",
    });
    expect(s).toContain("Water resources");
  });
});

// ─── Realized-size guard ─────────────────────────────────────────────
//
// Scale-to-corpus guardrail: the selector must keep the dynamic context well
// under the 250K TPM deployment limit on the real Mongolia AND Panama
// corpora, not just on toy fixtures. Reads the tracked pipeline outputs; skips
// gracefully if a checkout doesn't have them.
describe("realized context size stays under budget on real corpora", () => {
  const root = join(process.cwd(), "python");
  const CEILING = CHAT_CONTEXT_TOKEN_BUDGET + 5000; // budget + small slack

  for (const country of ["mongolia", "panama"]) {
    const alignPath = join(root, "output", country, "alignment.json");
    const targetsPath = join(root, "data", `${country}-targets.json`);
    const present = existsSync(alignPath) && existsSync(targetsPath);
    const maybe = present ? it : it.skip;

    maybe(`${country}: a broad question fits the budget`, () => {
      const alignment = JSON.parse(readFileSync(alignPath, "utf8")) as AlignmentResult[];
      const targets = JSON.parse(readFileSync(targetsPath, "utf8")) as Target[];
      const scope = detectQueryScope("which two documents disagree the most?", {
        documentTypes: [],
        targets,
        taxonomies: { globe: [], sector: [], adaptation: [] },
      });
      const res = selectChatContext({
        query: "which two documents disagree the most?",
        scope,
        visibleTargets: targets,
        visibleAlignment: alignment,
        primaryByTarget: new Map(),
        guaranteedTargetIds: new Set(),
      });
      const targetById = new Map(targets.map((t) => [t.id, t]));
      const pairTokens = res.pairs.reduce(
        (sum, p) => sum + estimateTokens(p.rationale) + 24,
        0,
      );
      const textTokens = [...res.fullTextTargetIds].reduce(
        (sum, id) => sum + estimateTokens(targetById.get(id)?.text ?? "") + 30,
        0,
      );
      const realized = pairTokens + textTokens;
      expect(realized).toBeLessThan(CEILING);
      // Sanity: the corpus is large enough that a broad question is capped.
      expect(res.meta.pairsConsidered).toBeGreaterThan(0);
    });
  }
});
