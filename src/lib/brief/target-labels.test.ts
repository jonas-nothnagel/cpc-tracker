import { describe, expect, it } from "vitest";
import { labelsIn, parseTargetLabels, textsIn } from "./target-labels";

describe("parseTargetLabels", () => {
  it("reads titles and texts by id and language, skipping anything else", () => {
    const parsed = parseTargetLabels({
      _meta: { purpose: "display only" },
      labels: { NBSAP_1: { mn: "1 Орон зайн төлөвлөлт" }, NDC_1: { mn: "" }, BTR_1: { mn: 3 } },
      texts: { BTR_1: { mn: "Сэргээгдэх эрчим хүч" } },
    });
    expect(parsed).toEqual({
      labels: { NBSAP_1: { mn: "1 Орон зайн төлөвлөлт" } },
      texts: { BTR_1: { mn: "Сэргээгдэх эрчим хүч" } },
    });
  });

  it("is nothing without titles", () => {
    expect(parseTargetLabels(null)).toBeNull();
    expect(parseTargetLabels({ texts: {} })).toBeNull();
  });
});

describe("labelsIn and textsIn", () => {
  const parsed = parseTargetLabels({
    labels: { A: { mn: "А", es: "A-es" }, B: { es: "B-es" } },
    texts: { A: { mn: "Текст" } },
  });

  it("give one language's titles and texts by id", () => {
    expect(labelsIn(parsed, "mn")).toEqual({ A: "А" });
    expect(labelsIn(parsed, "es")).toEqual({ A: "A-es", B: "B-es" });
    expect(textsIn(parsed, "mn")).toEqual({ A: "Текст" });
  });

  it("give nothing for a language the file does not hold", () => {
    expect(labelsIn(parsed, "en")).toBeUndefined();
    expect(textsIn(parsed, "es")).toBeUndefined();
    expect(labelsIn(null, "mn")).toBeUndefined();
  });
});
