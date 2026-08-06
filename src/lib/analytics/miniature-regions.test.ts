import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import mn from "../../../messages/mn.json";

import { MINIATURE_REGIONS, regionForLabel } from "./miniature-regions";
import { SECTION_REGISTRY } from "./sections";

describe("MINIATURE_REGIONS structure", () => {
  it("covers every registry section with >= 2 regions and 'other' last", () => {
    for (const s of SECTION_REGISTRY) {
      const regions = MINIATURE_REGIONS[s.id];
      expect(regions, `missing regions for ${s.id}`).toBeDefined();
      expect(regions.length).toBeGreaterThanOrEqual(2);
      const last = regions[regions.length - 1];
      expect(last.id).toBe("other");
      expect(last.match("anything at all")).toBe(true);
    }
    expect(Object.keys(MINIATURE_REGIONS).sort()).toEqual(
      SECTION_REGISTRY.map((s) => s.id).sort(),
    );
  });

  it("routes every stable data-track label to its intended region", () => {
    expect(regionForLabel("direction", "Wheel: document arc")).toBe("wheel");
    expect(regionForLabel("direction", "Wheel: connection ribbon")).toBe("wheel");
    expect(regionForLabel("sectors", "Wheel: clear focus")).toBe("wheel");
    expect(regionForLabel("doc-pairs", "Doc matrix: cell")).toBe("matrix");
    expect(regionForLabel("explore", "Explore: target dot")).toBe("wheel");
    expect(regionForLabel("explore", "Explore: category arc")).toBe("wheel");
    expect(regionForLabel("explore", "Explore: budget wedge")).toBe("wheel");
    expect(regionForLabel("direction", "Detail panel: theme")).toBe("theme-cards");
    expect(regionForLabel("direction", "Detail panel: storylines")).toBe("theme-cards");
    expect(regionForLabel("doc-pairs", "Detail panel: doc-pair")).toBe("pair-rows");
    expect(regionForLabel("sectors", "Detail panel: sector")).toBe("sector-rows");
  });

  it("routes representative dynamic labels per locale", () => {
    // sectors rows — briefing.sectors.rowAriaLabel
    expect(
      regionForLabel("sectors", "Agriculture: 14 primary targets. 31% of reviewed relationships are a potential misalignment."),
    ).toBe("sector-rows");
    expect(
      regionForLabel("sectors", "Agricultura: 14 objetivos primarios. ..."),
    ).toBe("sector-rows");
    expect(
      regionForLabel("sectors", "Хөдөө аж ахуй: 14 үндсэн зорилт. ..."),
    ).toBe("sector-rows");
    // where-to-focus rows vs concentration bar (precedence)
    expect(
      regionForLabel("where-to-focus", "NBSAP T-12: involved in 9 potentially misaligned pairs"),
    ).toBe("hotspot-rows");
    expect(
      regionForLabel("where-to-focus", "NBSAP T-12: in 9 potentially misaligned pairs · click to open"),
    ).toBe("concentration-bar");
    expect(
      regionForLabel("where-to-focus", "NBSAP T-12: en 9 pares posiblemente desalineados · pulse para abrir"),
    ).toBe("concentration-bar");
    // doc-pairs rows
    expect(regionForLabel("doc-pairs", "NDC ↔ NBSAP Energy storyline 4 aligned · 2 flagged")).toBe("pair-rows");
    // friction segments need the %-guard
    expect(regionForLabel("friction-types", "Conflicting goals · 42 (57%)")).toBe("segments");
    expect(regionForLabel("doc-focus", "Objetivos en conflicto · 42 (57%)")).toBe("friction-segments");
    // a long pair-row mentioning a mechanism must NOT be stolen by segments
    expect(
      regionForLabel(
        "doc-focus",
        "NDC target Reduce emissions by expanding hydropower Conflicting goals vs NBSAP target",
      ),
    ).toBe("pair-rows");
    // doc pills are short
    expect(regionForLabel("doc-focus", "Vision 2050")).toBe("doc-pills");
    // financing / implementation coverage rows (rendered without <strong>)
    expect(regionForLabel("financing", "NDC 8 of 12 matched")).toBe("coverage-rows");
    expect(regionForLabel("financing", "NDC 12-аас 8 нь тохирсон")).toBe("coverage-rows");
    expect(regionForLabel("financing", "T2.1: High aligned spend, $4.5M")).toBe("target-grid");
    // pre-2026-07 tier labels in historical events still resolve
    expect(regionForLabel("financing", "T2.1: Well-funded, $4.5M")).toBe("target-grid");
    expect(regionForLabel("implementation", "NDC 5 of 9 addressed")).toBe("coverage-rows");
    expect(regionForLabel("implementation", "Ministry of Energy → NDC: 4 targets")).toBe("flow-diagram");
    expect(regionForLabel("implementation", "Who delivers")).toBe("view-toggle");
    // implementation precedence: coverage beats the "→" fragment
    expect(regionForLabel("implementation", "NDC → 5 of 9 addressed")).toBe("coverage-rows");
    // explore
    expect(regionForLabel("explore", "Ask the assistant about the policy documents")).toBe("chat");
    expect(regionForLabel("explore", "Answers · 3")).toBe("answers");
    expect(regionForLabel("explore", "Biodiversity")).toBe("controls");
    // direction
    expect(regionForLabel("direction", "Show an example of strong alignment")).toBe("term-buttons");
    expect(regionForLabel("direction", "How the pipeline built this view")).toBe("pipeline-note");
    expect(
      regionForLabel("direction", "Forest restoration ambition Broad agreement across plans on restoring degraded land 6"),
    ).toBe("theme-cards");
    // unknown → other
    expect(regionForLabel("direction", "??")).toBe("other");
    expect(regionForLabel("nonexistent-section", "anything")).toBe("other");
  });
});

/**
 * Locale lock: every fragment/exact the registry relies on must remain a
 * substring of its source ICU message in ALL locales, so copy edits break
 * this test instead of silently rerouting clicks to "other". Messages are
 * compared raw (ICU braces and <strong> tags included) — the fragments are
 * chosen to survive rendering.
 */
describe("locale lock against messages/*.json", () => {
  type Messages = typeof en;
  const locales: [string, Messages][] = [
    ["en", en],
    ["es", es as unknown as Messages],
    ["mn", mn as unknown as Messages],
  ];

  // [description, path selector, fragment per locale (en, es, mn)]
  const LOCKS: [string, (m: Messages) => string, [string, string, string]][] = [
    ["direction.popoverAriaLabel", (m) => m.briefing.direction.popoverAriaLabel,
      ["Show an example of", "Mostrar un ejemplo de", "жишээг харуулах"]],
    ["direction.howPipelineBuilt", (m) => m.briefing.direction.howPipelineBuilt,
      ["How the pipeline built this view", "Cómo la canalización construyó esta vista", "Пайплайн энэ харагдацыг хэрхэн бүтээсэн"]],
    ["direction.groups.showFewer", (m) => m.briefing.direction.groups.showFewer,
      ["Show fewer", "Mostrar menos", "Цөөнийг харуулах"]],
    ["labels.contradictionType.goal_conflict", (m) => m.labels.contradictionType.goal_conflict,
      ["Conflicting goals", "Objetivos en conflicto", "Зөрчилдөх зорилго"]],
    ["labels.contradictionType.resource_competition", (m) => m.labels.contradictionType.resource_competition,
      ["Competing for resources", "Competencia por recursos", "Нөөцийн төлөөх өрсөлдөөн"]],
    ["labels.contradictionType.delivery_friction", (m) => m.labels.contradictionType.delivery_friction,
      ["Delivery & coordination", "Entrega y coordinación", "Хэрэгжилт ба зохицуулалт"]],
    ["whereToFocus.rowAriaLabel", (m) => m.briefing.whereToFocus.rowAriaLabel,
      ["potentially misaligned pair", "posiblemente desalineados", "болзошгүй үл нийцсэн хосд"]],
    ["whereToFocus.bar.segmentTitle", (m) => m.briefing.whereToFocus.bar.segmentTitle,
      ["click to open", "pulse para abrir", "нээхийн тулд дарна уу"]],
    ["lens.ipcc", (m) => m.briefing.lens.ipcc,
      ["Mitigation sectors", "Sectores de mitigación", "Бууруулах салбарууд"]],
    ["lens.gga", (m) => m.briefing.lens.gga,
      ["Climate adaptation", "Adaptación climática", "Уур амьсгалын дасан зохицол"]],
    ["sectors.filter.misaligned", (m) => m.briefing.sectors.filter.misaligned,
      ["Misaligned", "Desalineados", "Үл нийцсэн"]],
    ["sectors.col.flaggedShare", (m) => m.briefing.sectors.col.flaggedShare,
      ["Potential misalignment", "Posible desalineación", "Болзошгүй үл нийцэл"]],
    ["sectors.showAll", (m) => m.briefing.sectors.showAll,
      ["sectors →", "sectores →", "салбарыг харах →"]],
    ["sectors.rowAriaLabel", (m) => m.briefing.sectors.rowAriaLabel,
      ["primary targets", "objetivos primarios", "үндсэн зорилт"]],
    ["financing.matchedCount", (m) => m.briefing.financing.matchedCount,
      [" matched", " coinciden", " нь тохирсон"]],
    ["financing.targetGrid.tier.high", (m) => m.briefing.financing.targetGrid.tier.high,
      ["High aligned spend", "Gasto alineado alto", "Их тохирох зарцуулалт"]],
    ["implementation.matchedCount", (m) => m.briefing.implementation.matchedCount,
      [" addressed", " abordadas", " нь хамрагдсан"]],
    ["implementationCenter.flow.toggleRoster", (m) => m.briefing.implementationCenter.flow.toggleRoster,
      ["Who delivers", "Quién ejecuta", "Хэн хэрэгжүүлдэг"]],
    ["implementationCenter.flow.toggleFlow", (m) => m.briefing.implementationCenter.flow.toggleFlow,
      ["Where it lands", "Dónde incide", "Хаана тусдаг"]],
    ["explorer.controls.groupGlobe", (m) => m.explorer.controls.groupGlobe,
      ["Biodiversity", "Biodiversidad", "Биологийн төрөл зүйл"]],
    ["explorer.workbench.viewFinance", (m) => m.explorer.workbench.viewFinance,
      ["Finance · BER", "Finanzas · BER", "Санхүү · BER"]],
    ["explorer.chat.askAriaProminent", (m) => m.explorer.chat.askAriaProminent,
      ["Ask the assistant", "Pregunte al asistente", "туслахаас асуух"]],
    ["explorer.chat.surpriseMe", (m) => m.explorer.chat.surpriseMe,
      ["Show another insight", "Mostrar otra observación", "Өөр ойлголт харуулах"]],
    ["explorer.workbench.answersHandle", (m) => m.explorer.workbench.answersHandle,
      ["Answers", "Respuestas", "Хариултууд"]],
    ["explorer.workbench.answersClose", (m) => m.explorer.workbench.answersClose,
      ["Collapse", "Contraer", "Хураах"]],
  ];

  it.each(LOCKS)("%s", (_desc, select, fragments) => {
    locales.forEach(([_name, messages], i) => {
      const raw = select(messages);
      expect(typeof raw).toBe("string");
      expect(
        raw.includes(fragments[i]),
        `fragment ${JSON.stringify(fragments[i])} not in ${JSON.stringify(raw)}`,
      ).toBe(true);
    });
  });
});
