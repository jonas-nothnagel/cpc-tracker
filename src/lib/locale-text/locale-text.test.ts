import { describe, it, expect } from "vitest";
import {
  applyAlignmentTranslations,
  localizeLabelled,
  localizeTargetText,
  localizeTargetTexts,
  shouldUseOriginal,
  type LocalizableTarget,
  type TranslatableAlignment,
} from ".";

/** Shaped like a real Panama target: Spanish source, English analysis text. */
const PANAMA_TARGET: LocalizableTarget & { id: string } = {
  id: "panama_NP_1",
  text: "Strengthen coordination mechanisms among institutions.",
  textOriginal: "Fortalecer los mecanismos de coordinación entre instituciones.",
  sourceLabel: "Cross-cutting principle 1",
  sourceLabelOriginal: "Principio transversal 1",
  language: "es",
};

describe("shouldUseOriginal", () => {
  it("swaps when the locale matches the target's source language", () => {
    expect(shouldUseOriginal(PANAMA_TARGET, "es")).toBe(true);
  });

  it("never swaps for English or a missing locale", () => {
    expect(shouldUseOriginal(PANAMA_TARGET, "en")).toBe(false);
    expect(shouldUseOriginal(PANAMA_TARGET, undefined)).toBe(false);
  });

  it("does not swap into an unrelated locale", () => {
    // A Spanish target on the Mongolian page must stay on the English text:
    // the alternative is showing Spanish to a Mongolian reader.
    expect(shouldUseOriginal(PANAMA_TARGET, "mn")).toBe(false);
  });

  it("refuses a machine back-translation as an 'original'", () => {
    expect(
      shouldUseOriginal(
        { ...PANAMA_TARGET, textOriginalSource: "machine" },
        "es",
      ),
    ).toBe(false);
  });

  it("refuses when there is nothing genuinely different to show", () => {
    expect(shouldUseOriginal({ text: "Same", textOriginal: "Same", language: "es" }, "es")).toBe(
      false,
    );
    expect(shouldUseOriginal({ text: "Only English", language: "es" }, "es")).toBe(false);
  });
});

describe("localizeTargetText", () => {
  it("shows the original and keeps the English reachable", () => {
    const out = localizeTargetText(PANAMA_TARGET, "es");
    expect(out.text).toBe(PANAMA_TARGET.textOriginal);
    expect(out.textTranslation).toBe(PANAMA_TARGET.text);
    expect(out.textLocale).toBe("es");
    // The original must still be there — the chip renders both halves from it.
    expect(out.textOriginal).toBe(PANAMA_TARGET.textOriginal);
  });

  it("swaps the in-document label on the same condition", () => {
    const out = localizeTargetText(PANAMA_TARGET, "es");
    expect(out.sourceLabel).toBe("Principio transversal 1");
    expect(out.sourceLabelTranslation).toBe("Cross-cutting principle 1");
  });

  it("leaves the label alone when no source-language label was curated", () => {
    const noLabel: LocalizableTarget = {
      ...PANAMA_TARGET,
      sourceLabelOriginal: undefined,
    };
    const out = localizeTargetText(noLabel, "es");
    expect(out.sourceLabel).toBe("Cross-cutting principle 1");
    expect(out.sourceLabelTranslation).toBeUndefined();
  });

  it("returns the same object when nothing should change", () => {
    expect(localizeTargetText(PANAMA_TARGET, "en")).toBe(PANAMA_TARGET);
  });
});

describe("localizeTargetTexts", () => {
  it("keeps array identity for a country with nothing to swap", () => {
    const targets = [{ text: "English only" }];
    expect(localizeTargetTexts(targets, "es")).toBe(targets);
    expect(localizeTargetTexts(targets, "en")).toBe(targets);
  });

  it("swaps only the targets whose language matches", () => {
    const mixed = [PANAMA_TARGET, { text: "English only", id: "x" }];
    const out = localizeTargetTexts(mixed, "es");
    expect(out[0].text).toBe(PANAMA_TARGET.textOriginal);
    expect(out[1]).toBe(mixed[1]);
  });
});

describe("localizeLabelled", () => {
  const docs = [
    {
      id: "PEG",
      mediumLabel: "PEG (Gov't Strategic Plan)",
      docKind: "Government strategic plan",
      labels: { es: { mediumLabel: "PEG (Plan Estratégico de Gobierno)" } },
    },
    { id: "NDC", mediumLabel: "NDC (Climate)" },
  ];

  it("folds the locale's overrides onto the base fields", () => {
    const [peg] = localizeLabelled(docs, "es");
    expect(peg.mediumLabel).toBe("PEG (Plan Estratégico de Gobierno)");
    // Untranslated fields keep the sourced English rather than blanking.
    expect(peg.docKind).toBe("Government strategic plan");
  });

  it("leaves entries with no override for this locale untouched", () => {
    const out = localizeLabelled(docs, "es");
    expect(out[1]).toBe(docs[1]);
  });

  it("ignores an empty override rather than erasing a sourced label", () => {
    const blank = [{ id: "X", mediumLabel: "X (Real)", labels: { es: { mediumLabel: "" } } }];
    expect(localizeLabelled(blank, "es")[0].mediumLabel).toBe("X (Real)");
  });

  it("keeps array identity for English and for an unlisted locale", () => {
    expect(localizeLabelled(docs, "en")).toBe(docs);
    expect(localizeLabelled(docs, "fr")).toBe(docs);
  });
});

describe("applyAlignmentTranslations", () => {
  const records: TranslatableAlignment[] = [
    { targetAId: "a", targetBId: "b", description: "They reinforce." },
    { targetAId: "c", targetBId: "d", description: "They may pull apart." },
  ];

  it("replaces the rationale for covered pairs", () => {
    const out = applyAlignmentTranslations(
      records,
      { descriptions: { "a::b": "Se refuerzan." } },
      "es",
    );
    expect(out[0].description).toBe("Se refuerzan.");
    expect(out[0].descriptionTranslationPending).toBeUndefined();
  });

  it("discloses, rather than hides, a pair the pass did not cover", () => {
    const out = applyAlignmentTranslations(
      records,
      { descriptions: { "a::b": "Se refuerzan." } },
      "es",
    );
    expect(out[1].description).toBe("They may pull apart.");
    expect(out[1].descriptionTranslationPending).toBe(true);
  });

  it("matches a pair keyed in the other order", () => {
    const out = applyAlignmentTranslations(
      records,
      { descriptions: { "b::a": "Se refuerzan." } },
      "es",
    );
    expect(out[0].description).toBe("Se refuerzan.");
  });

  it("marks nothing when no pass has run — a fully English page has nothing to explain", () => {
    expect(applyAlignmentTranslations(records, null, "es")).toBe(records);
    expect(applyAlignmentTranslations(records, { descriptions: {} }, "en")).toBe(records);
  });
});
