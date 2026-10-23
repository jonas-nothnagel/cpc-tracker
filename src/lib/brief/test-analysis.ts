import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { DerivedPaths } from "@/lib/dashboard-data";
import { buildAnalysisInputs, writeAnalysisInputs } from "@/lib/upload/analysis-inputs";

/**
 * Test utility: a finished upload on disk, as the route and the pipeline
 * leave it. Three targets in two documents for "Tonga"; optionally the
 * user's own policy areas, or the shape analyses had before uploads wrote a
 * country config (no config, country "Unknown").
 */

export const FIXTURE_ID = "3f9a1c2e-7b4d-4e8a-9c1f-2a6b5d8e0f13";

const CATEGORIES = join(process.cwd(), "python", "data", "categories.json");
const COMPLETED = JSON.stringify({ status: "completed", completedAt: "2026-10-23T12:00:00+00:00" });

export function writeFixtureAnalysis(
  opts: { ownLens?: boolean; legacy?: boolean; status?: string | null; dir?: string } = {},
): DerivedPaths {
  // `dir` places the analysis where a route under test looks for it
  // (`<root>/python/analyses/<id>`); by default it gets a scratch folder.
  const root = opts.dir ?? mkdtempSync(join(tmpdir(), "analysis-fixture-"));
  const input = join(root, "input");
  const output = join(root, "output");
  mkdirSync(input, { recursive: true });
  mkdirSync(output, { recursive: true });
  const json = (path: string, value: unknown) => writeFileSync(path, JSON.stringify(value));

  const targets = [
    { text: "Reduce emissions from energy by 30% by 2030.", sourceDocument: "NDC", sourceLabel: "" },
    { text: "Restore 10,000 hectares of mangroves.", sourceDocument: "NDC", sourceLabel: "" },
    { text: "Protect coastal communities from storm surges.", sourceDocument: "NAP", sourceLabel: "" },
  ];
  if (opts.legacy) {
    json(
      join(input, "targets.json"),
      targets.map((t, i) => ({ ...t, id: ["NDC_1", "NDC_2", "NAP_1"][i], country: "Unknown" })),
    );
    copyFileSync(CATEGORIES, join(input, "categories.json"));
  } else {
    const inputs = buildAnalysisInputs({
      country: "Tonga",
      locale: "en",
      targets,
      ...(opts.ownLens
        ? {
            ownLens: {
              name: "National priorities",
              source: "Tonga Strategic Development Framework",
              areas: [
                { name: "Coastal resilience", description: "Protecting coasts and coastal communities." },
                { name: "Energy transition", description: "Moving from imported fuel to renewable power." },
              ],
            },
          }
        : {}),
    });
    writeAnalysisInputs({ input, output }, inputs, { categories: CATEGORIES });
  }

  json(join(output, "classifications.json"), [
    { targetId: "NDC_1", categoryId: "globe_1", taxonomyType: "globe", score: 0.8, isPrimary: true },
    ...(opts.ownLens
      ? [
          { targetId: "NDC_1", categoryId: "policy_area_2", taxonomyType: "policy_area", score: 0.9, isPrimary: true },
          { targetId: "NAP_1", categoryId: "policy_area_1", taxonomyType: "policy_area", score: 0.9, isPrimary: true },
        ]
      : []),
  ]);
  json(join(output, "alignment.json"), [
    {
      targetAId: "NDC_2",
      targetBId: "NAP_1",
      alignment: "high",
      description: "Mangroves buffer the coast the adaptation plan protects.",
      confidence: "medium",
    },
    {
      targetAId: "NDC_1",
      targetBId: "NAP_1",
      alignment: "flagged",
      mechanism: "resource_competition",
      manageability: "manageable",
      description: "Both may compete for the same coastal land.",
      confidence: "medium",
    },
  ]);
  if (opts.status !== null) writeFileSync(join(output, "status.json"), opts.status ?? COMPLETED);

  return { dataDir: input, outputDir: output, targetsFile: "targets.json", iso3: null, model: null };
}
