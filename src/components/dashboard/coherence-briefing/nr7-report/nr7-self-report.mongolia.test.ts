/**
 * The model against the real Mongolia files. Skipped when they are absent
 * (a clone without the Python outputs); no snapshots, only the findings the
 * plan was built on, so a data refresh that moves them is noticed.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildNr7Report } from "./nr7-self-report";
import type { AlignmentResult, Nr7Data, Target } from "@/types";

const NR7 = resolve(process.cwd(), "python/data/external/nr7_mng.json");
const TARGETS = resolve(process.cwd(), "python/data/mongolia-targets.json");
const ALIGNMENT = resolve(process.cwd(), "python/output/mongolia/gpt-5-4/alignment.json");
const present = [NR7, TARGETS, ALIGNMENT].every((p) => existsSync(p));

describe.skipIf(!present)("NR7 self-report model on the Mongolia data", () => {
  const nr7 = JSON.parse(readFileSync(NR7, "utf8")) as Nr7Data;
  const targets = (JSON.parse(readFileSync(TARGETS, "utf8")) as Target[]).filter((t) => t.sourceDocument !== "BTR");
  const targetMap = new Map(targets.map((t) => [t.id, t]));
  const alignment = (JSON.parse(readFileSync(ALIGNMENT, "utf8")) as AlignmentResult[]).filter(
    (p) => targetMap.has(p.targetAId) && targetMap.has(p.targetBId),
  );
  const model = buildNr7Report(nr7, alignment, targetMap)!;
  const rule = (r: string) => model.signals.filter((s) => s.rule === r);

  it("carries the whole report", () => {
    expect(model.totals).toMatchObject({ targets: 20, answers: 93, targetsWithAnswers: 14, indicators: 29, indicatorsWithValues: 16 });
    expect(model.totals.byStatus).toEqual({ on_track: 6, limited: 10, no_progress: 3, unknown: 1 });
    expect(model.indicators.reduce((n, i) => n + i.reads.reduce((m, r) => m + r.points, 0), 0)).toBe(163);
    expect(model.targets.every((t) => t.nbsapTargetId === `NBSAP_${t.number}`)).toBe(true);
  });

  it("NT12 (mainstreaming) is rated on track with most answers under development", () => {
    const s = rule("ratingVsAnswers");
    expect(s.map((x) => x.targetId)).toEqual(["NT12", "NT15"]);
    expect(s[0].params).toMatchObject({ notInPlace: 4, answered: 5 });
    expect(model.targets.find((t) => t.targetId === "NT12")!.policyReach).toBe(60);
  });

  it("NT03 (protected areas) is on track while the terrestrial coverage series is flat", () => {
    const s = rule("flatWhileOnTrack");
    expect(s.map((x) => [x.targetId, x.indicatorId])).toEqual([["NT03", "3.1"]]);
    expect(s[0].params).toMatchObject({ value: "20.77", unit: "%", from: "2020", to: "2025" });
    expect(String(s[0].params.indicator)).toContain("terrestrial");
  });

  it("NT05 (invasive species) is rated unknown although the report carries values for it", () => {
    // 6.1 is one point per taxon (fish, flora, fungi, insects, mammals), so
    // there is no series to read a direction from; the finding is that data
    // exists where the assessment does not.
    const s = rule("unknownWithData");
    expect(s.map((x) => [x.targetId, x.indicatorId])).toEqual([["NT05", "6.1"]]);
    expect(s[0].params).toMatchObject({ points: 5, from: "2010", to: "2024" });
  });

  it("NT07 carries high policy reach with no significant change; NT06 and NT18 do not fire", () => {
    expect(rule("reachWhileNoChange").map((x) => x.targetId)).toEqual(["NT07"]);
    expect(model.targets.find((t) => t.targetId === "NT07")!.policyReach).toBe(38);
  });

  it("two shared indicators decline, each once and drawer-only: domestic funding and the Red List Index", () => {
    const s = rule("sharedIndicatorDeclining");
    expect(s.map((x) => x.indicatorId)).toEqual(["D.2", "A.3"]); // strongest decline first
    expect(s.every((x) => !x.cardEligible)).toBe(true);
    expect(s[0].params).toMatchObject({ first: "355", last: "258", from: "2020", to: "2023", targets: 9, onTrack: 4 });
    expect(s[1].params).toMatchObject({ first: "0.965", last: "0.953", from: "1993", to: "2024", targets: 6 });
  });

  it("keeps every cross-document link behind the reach, so the slide can name the documents", () => {
    const row = (id: string) => model.targets.find((t) => t.targetId === id)!;
    expect(model.targets.every((t) => t.policyReach === (t.policyLinks?.high.length ?? null))).toBe(true);
    expect(row("NT08").policyLinks).toMatchObject({ docs: 6 });
    expect(row("NT08").policyLinks!.high).toHaveLength(51);
    expect(row("NT08").policyLinks!.flagged).toHaveLength(11);
    expect(row("NT08").policyLinks!.byDoc.slice(0, 3).map((d) => [d.doc, d.high])).toEqual([["NDC", 16], ["NRVTS", 12], ["SECTORAL", 9]]);
    expect(row("NT02").policyLinks!.flagged).toHaveLength(21);
    expect(row("NT03").policyLinks!.flagged).toHaveLength(38);
    // Never the NBSAP side, and every counterpart is a visible target.
    expect(model.targets.every((t) => (t.policyLinks?.high ?? []).every((l) => l.doc !== "NBSAP" && targetMap.has(l.targetId)))).toBe(true);
  });

  it("files every national target under the GBF target the country chose", () => {
    const row = (id: string) => model.targets.find((t) => t.targetId === id)!;
    expect(row("NT03").gbfTargets.map((g) => g.id)).toEqual(["T03"]);
    expect(row("NT03").gbfTargets[0].title).toBe("30% of areas are effectively conserved");
    expect(row("NT09").gbfTargets.map((g) => g.id)).toEqual(["T11", "T12", "T09"]);
    const covered = new Set(model.targets.flatMap((t) => t.gbfTargets.map((g) => g.id)));
    expect(covered.size).toBe(23);
    expect(model.targets.every((t) => t.gbfTargets.length > 0)).toBe(true);
  });

  it("the card shows three signals of three distinct rules", () => {
    expect(model.cardSignals.map((s) => [s.rule, s.targetId])).toEqual([
      ["ratingVsAnswers", "NT12"],
      ["unknownWithData", "NT05"],
      ["flatWhileOnTrack", "NT03"],
    ]);
  });
});
