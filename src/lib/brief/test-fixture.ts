/**
 * Test fixture for the brief: three documents (A, B, C) of six commitments
 * each, every pair of documents compared 36 times, with levels assigned by
 * position so every count is known by hand:
 *   A~B: 24 reinforce, 6 partial, 6 potential misalignment (A6 against B1-B6)
 *   A~C: 30 reinforce, 6 partial, 0 potential misalignment
 *   B~C: 18 reinforce, 9 partial, 9 potential misalignment (B5 x C4-C6, B6 x C1-C6)
 * Overall: 108 comparisons, 72 reinforce, 21 partial, 15 potential misalignment.
 */
import type { BriefSource } from "./source";

const DOCS = ["A", "B", "C"];
const PER_DOC = 6;

// Level codes: high 0, medium 1, low 2, none 3, flagged 4.
function levelFor(pair: string, k: number): number {
  const reinforceUntil = pair === "A~B" ? 24 : pair === "A~C" ? 30 : 18;
  const partialUntil = pair === "A~B" ? 30 : pair === "A~C" ? 36 : 27;
  if (k < reinforceUntil) return k % 2 === 0 ? 0 : 1;
  if (k < partialUntil) return 2;
  return 4;
}

export function briefFixture(): BriefSource {
  const commitments = DOCS.flatMap((doc) =>
    Array.from({ length: PER_DOC }, (_, i) => ({
      id: `${doc}${i + 1}`,
      doc,
      label: `${i + 1} Commitment ${doc}${i + 1}`,
      text: `Verbatim text of commitment ${doc}${i + 1}.`,
    })),
  );
  const index = new Map(commitments.map((c, i) => [c.id, i]));
  const comparisons: number[] = [];
  for (const [x, y] of [
    ["A", "B"],
    ["A", "C"],
    ["B", "C"],
  ]) {
    for (let i = 0; i < PER_DOC; i++) {
      for (let j = 0; j < PER_DOC; j++) {
        const level = levelFor(`${x}~${y}`, i * PER_DOC + j);
        comparisons.push(
          index.get(`${x}${i + 1}`)!,
          index.get(`${y}${j + 1}`)!,
          level,
          level === 4 ? 2 : 0,
        );
      }
    }
  }
  return {
    countryId: "testland",
    countryName: "Testland",
    commitments,
    documents: DOCS.map((id) => ({
      id,
      code: id,
      name: `Document ${id}`,
      full: `Document ${id} (full title)`,
      color: "#0468b1",
      count: PER_DOC,
      defaultOn: true,
    })),
    comparisons,
    lenses: [
      {
        id: "globe",
        taxonomyType: "globe",
        categories: [
          { id: "g1", name: "Protected areas" },
          { id: "g2", name: "Agriculture" },
          { id: "g5", name: "Water" },
        ],
        primary: {
          A1: "g1",
          A2: "g1",
          A3: "g1",
          B4: "g2",
          B5: "g2",
          B6: "g2",
          C1: "g5",
          C2: "g5",
          C3: "g5",
        },
      },
    ],
    themes: null,
    model: null,
  };
}
