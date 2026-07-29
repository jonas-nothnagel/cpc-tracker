/**
 * Label → miniature-region mapping for the usage-map drill-down sketches.
 *
 * Click labels are stored as RENDERED, LOCALIZED text (en/es/mn); only
 * data-track values ("Wheel: document arc", ...) and the synthesized
 * "Detail panel: {kind}" are locale-free. Every matcher below therefore
 * lists all three locales' variants, each annotated with its message key;
 * miniature-regions.test.ts locks the fragments against messages/*.json so
 * a copy edit fails the build instead of silently draining clicks into the
 * catch-all.
 *
 * Regions are ORDERED: the first match wins; the last region of every
 * section is the catch-all "other". Off-section events (header doc filter,
 * jump nav, drawer-internal controls — section = null) are deliberately NOT
 * mapped here: sectionUsage is defined over page-order dashboard sections,
 * and those clicks remain visible in the Traffic tab's top clicks.
 *
 * Pure and client-safe; shared by server aggregation (regionsBySection)
 * and the tooltip's example picker. REMOVABLE SYSTEM: see README.md.
 */

export interface MiniatureRegion {
  /** Stable key; miniature scenes bind primitives to this. */
  id: string;
  /** Plain-English name for tooltips and the compact list. */
  name: string;
  match: (label: string) => boolean;
}

const exact = (...variants: string[]) => {
  const set = new Set(variants);
  return (label: string) => set.has(label);
};

const frag = (...fragments: string[]) => (label: string) =>
  fragments.some((f) => label.includes(f));

const either =
  (...matchers: ((label: string) => boolean)[]) =>
  (label: string) =>
    matchers.some((m) => m(label));

const OTHER: MiniatureRegion = {
  id: "other",
  name: "Everything else here",
  match: () => true,
};

/** The wheel centerpiece (data-track values; locale-free). */
const WHEEL: MiniatureRegion = {
  id: "wheel",
  name: "The wheel",
  match: exact(
    "Wheel: document arc",
    "Wheel: connection ribbon",
    "Wheel: clear focus",
  ),
};

/** Friction-mechanism segment buttons: "{mechanism} · {n} ({pct}%)".
 *  labels.contradictionType.* (en/es/mn); the "%"-guard keeps plain
 *  mechanism mentions inside long row text from matching. */
const mechanismSegment = (label: string) =>
  label.includes("%") &&
  frag(
    "Conflicting goals", "Competing for resources", "Delivery & coordination",
    "Objetivos en conflicto", "Competencia por recursos", "Entrega y coordinación",
    "Зөрчилдөх зорилго", "Нөөцийн төлөөх өрсөлдөөн", "Хэрэгжилт ба зохицуулалт",
  )(label);

export const MINIATURE_REGIONS: Record<string, MiniatureRegion[]> = {
  direction: [
    {
      id: "term-buttons",
      name: "Inline example buttons",
      // briefing.direction.popoverAriaLabel
      match: frag(
        "Show an example of",
        "Mostrar un ejemplo de",
        "жишээг харуулах",
      ),
    },
    {
      id: "pipeline-note",
      name: '"How this was built" note',
      // briefing.direction.howPipelineBuilt
      match: exact(
        "How the pipeline built this view",
        "Cómo la canalización construyó esta vista",
        "Пайплайн энэ харагдацыг хэрхэн бүтээсэн",
      ),
    },
    WHEEL,
    {
      id: "theme-cards",
      name: "Theme cards",
      // Detail panels + briefing.direction.groups.showMore/showFewer;
      // the >=40-char heuristic catches the cards' own long text labels
      // (direction's only long text-content clickables).
      match: either(
        exact(
          "Detail panel: theme",
          "Detail panel: storylines",
          "Show fewer",
          "Mostrar menos",
          "Цөөнийг харуулах",
        ),
        frag("more theme", "tema más", "temas más", "сэдэв"),
        (label) => label.length >= 40,
      ),
    },
    OTHER,
  ],

  "doc-focus": [
    WHEEL,
    {
      id: "friction-segments",
      name: "Friction-type bar",
      match: mechanismSegment,
    },
    {
      id: "pair-rows",
      name: "Flagged pair rows",
      // Long text-content rows (target texts); heuristic, section-scoped.
      match: (label) => label.length >= 40,
    },
    {
      id: "doc-pills",
      name: "Document switcher",
      // Short doc names (e.g. "NDC", "Vision 2050"); runs after families.
      match: (label) => label.length <= 24,
    },
    OTHER,
  ],

  "doc-pairs": [
    {
      id: "matrix",
      name: "The document matrix",
      match: exact("Doc matrix: cell"),
    },
    {
      id: "pair-rows",
      name: "Document-pair rows",
      match: either(exact("Detail panel: doc-pair"), frag("↔")),
    },
    OTHER,
  ],

  "friction-types": [
    {
      id: "segments",
      name: "Friction-type bar & legend",
      match: mechanismSegment,
    },
    WHEEL,
    OTHER,
  ],

  "where-to-focus": [
    {
      // MUST precede hotspot-rows: segment titles also contain the rows'
      // "potentially misaligned pairs" fragment.
      id: "concentration-bar",
      name: "Concentration bar",
      // briefing.whereToFocus.bar.segmentTitle
      match: frag(
        "click to open",
        "pulse para abrir",
        "нээхийн тулд дарна уу",
      ),
    },
    {
      id: "hotspot-rows",
      name: "Most-contested target rows",
      // briefing.whereToFocus.rowAriaLabel
      match: frag(
        "potentially misaligned pair",
        "posiblemente desalineados",
        "болзошгүй үл нийцсэн хосд",
      ),
    },
    WHEEL,
    OTHER,
  ],

  sectors: [
    {
      id: "lens-chips",
      name: '"Group by" tabs',
      // briefing.lens.*
      match: exact(
        "Biodiversity", "Biodiversidad", "Биологийн төрөл зүйл",
        "Mitigation sectors", "Sectores de mitigación", "Бууруулах салбарууд",
        "Country sectors", "Sectores del país", "Улсын салбарууд",
        "Climate adaptation", "Adaptación climática", "Уур амьсгалын дасан зохицол",
      ),
    },
    {
      id: "filter-sort",
      name: "Filters & sorting",
      // briefing.sectors.filter.* + col.targets/flaggedShare
      match: exact(
        "Misaligned", "Desalineados", "Үл нийцсэн",
        "Aligned", "Alineados", "Уялдсан",
        "Both", "Ambos", "Хоёулаа",
        "Targets", "Objetivos", "Зорилт",
        "Potential misalignment", "Posible desalineación", "Болзошгүй үл нийцэл",
      ),
    },
    {
      id: "expander",
      name: '"Show all sectors" button',
      // briefing.sectors.showAll / collapseToTop
      match: frag(
        "sectors →", "sectores →", "салбарыг харах →",
        "Collapse to top", "Contraer a los", "-д хураах",
      ),
    },
    {
      id: "sector-rows",
      name: "Sector rows",
      // briefing.sectors.rowAriaLabel + the sector drawer
      match: either(
        exact("Detail panel: sector"),
        frag("primary targets", "objetivos primarios", "үндсэн зорилт"),
      ),
    },
    WHEEL,
    OTHER,
  ],

  financing: [
    {
      id: "coverage-rows",
      name: "Document coverage rows",
      // briefing.financing.matchedCount (rendered without <strong>)
      match: frag(" matched", " coinciden", " нь тохирсон"),
    },
    {
      id: "target-grid",
      name: "Funding dot grid",
      // briefing.financing.targetGrid.tier.* — current aligned-spend labels
      // plus the pre-2026-07 funding-tier labels, so historical events keep
      // resolving to this region.
      match: frag(
        "aligned spend", "asto alineado", "тохирох зарцуулалт",
        "No aligned spend", "Sin gasto alineado", "Зэрэгцэх зарцуулалтгүй",
        "Well-funded", "Funded", "Under-funded",
        "Bien financiada", "Financiada", "Sub-financiada",
        "Сайн санхүүжсэн", "Санхүүжсэн", "Тааруухан санхүүжсэн",
      ),
    },
    OTHER,
  ],

  implementation: [
    {
      id: "view-toggle",
      name: '"Who delivers / where it lands" toggle',
      // briefing.implementationCenter.flow.toggleRoster/toggleFlow
      match: exact(
        "Who delivers", "Quién ejecuta", "Хэн хэрэгжүүлдэг",
        "Where it lands", "Dónde incide", "Хаана тусдаг",
      ),
    },
    {
      id: "coverage-rows",
      name: "Document coverage rows",
      // briefing.implementation.matchedCount (rendered without <strong>)
      match: frag(" addressed", " abordadas", " нь хамрагдсан"),
    },
    {
      id: "flow-diagram",
      name: "Institution flow diagram",
      // Sankey ribbon titles: "{institution} → {doc}: ..." (after coverage).
      match: frag("→"),
    },
    OTHER,
  ],

  explore: [
    {
      id: "wheel",
      name: "The exploration wheel",
      match: exact(
        "Explore: target dot",
        "Explore: category arc",
        "Explore: budget wedge",
      ),
    },
    {
      id: "controls",
      name: "View & grouping controls",
      // explorer.controls.group* + workbench view/scale
      match: exact(
        "Documents", "Documentos", "Баримт бичгүүд",
        "Biodiversity", "Biodiversidad", "Биологийн төрөл зүйл",
        "Mitigation sectors", "Sectores de mitigación", "Бууруулах салбарууд",
        "Climate adaptation", "Adaptación climática", "Уур амьсгалын дасан зохицол",
        "Coherence", "Coherencia", "Уялдаа",
        "Finance · BER", "Finanzas · BER", "Санхүү · BER",
        "Targets", "Metas", "Зорилт",
        "Spend", "Gasto", "Зарлага",
      ),
    },
    {
      id: "chat",
      name: "The chat bar",
      // explorer.chat.*
      match: either(
        frag("Ask the assistant", "Pregunte al asistente", "туслахаас асуух"),
        exact(
          "Ask →", "Preguntar →", "Асуух →",
          "Show another insight", "Mostrar otra observación", "Өөр ойлголт харуулах",
          "Show on the wheel", "Mostrar en la rueda", "Хүрд дээр харуулах",
        ),
      ),
    },
    {
      id: "answers",
      name: "The answers panel",
      // explorer.workbench.answersHandle ("Answers · N") / answersClose
      match: either(
        (label) =>
          label.startsWith("Answers") ||
          label.startsWith("Respuestas") ||
          label.startsWith("Хариултууд"),
        exact("Collapse", "Contraer", "Хураах"),
      ),
    },
    OTHER,
  ],
};

/** First-matching region id for a label; "other" when nothing matches. */
export function regionForLabel(section: string, label: string): string {
  for (const region of MINIATURE_REGIONS[section] ?? []) {
    if (region.match(label)) return region.id;
  }
  return "other";
}
