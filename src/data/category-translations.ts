/**
 * Display-only Spanish (`es`) and Mongolian (`mn`) translations for taxonomy /
 * category NAMES.
 *
 * Why this lives here and not in `python/data/categories.json`:
 *  - `categories.json` is a PIPELINE INPUT: its English `name`/`description`
 *    values are read by `classify.py` and are source-traced (verbatim IPCC /
 *    GLOBE / BIOFIN quotes with `source` fields). We never mutate it, so the
 *    classifier keeps seeing the canonical English (guardrail: no LLM-drafted
 *    pipeline inputs).
 *  - These are DISPLAY labels only. The dashboard assembler
 *    (`src/lib/dashboard-data.ts`) swaps a category's `name` for the active
 *    locale's translation here before sending the payload to the client, so
 *    every render site (coherence wheel, target atlas, sector rows, sector
 *    drawer, GGA lens, financing views) shows the localized name with no
 *    per-component change. English is always the fallback.
 *
 * Scope: per-item NAMES only. Category DESCRIPTIONS are intentionally left in
 * authoritative English. The IPCC / NbS / GLOBE descriptions are verbatim
 * quotes from normative sources; an unofficial machine translation of a
 * normative quote could misrepresent it, whereas a short display label is safe
 * to localize. Taxonomy GROUP / lens labels are localized separately via the
 * message catalog (`lens.*`), not here.
 *
 * Keyed by category `id`. The dashboard taxonomy (`categories.json`) and the
 * upload-flow taxonomy (`src/data/*.ts`) use different NbS ids for the same ten
 * names (`nbs_0..9` vs `nbs_agri`, `nbs_forest`, ...), so both id sets appear
 * below pointing at the same translation. Translations are machine-generated
 * and carry the app's existing "machine translation" caveat on the language
 * switcher; they are not expert-reviewed.
 */

export type SupportedTranslationLocale = "es" | "mn";

interface CategoryNameTranslation {
  /** Localized display name. */
  name: string;
}

type CategoryTranslationEntry = Partial<
  Record<SupportedTranslationLocale, CategoryNameTranslation>
>;

export const CATEGORY_TRANSLATIONS: Record<string, CategoryTranslationEntry> = {
  // ── IPCC sectors (categories.json + src/data/sectors.ts share these ids) ────
  sector_energy: { es: { name: "Energía" }, mn: { name: "Эрчим хүч" } },
  sector_transport: { es: { name: "Transporte" }, mn: { name: "Тээвэр" } },
  sector_ippu: {
    es: { name: "Procesos industriales y uso de productos" },
    mn: { name: "Үйлдвэрлэлийн процесс ба бүтээгдэхүүний хэрэглээ" },
  },
  sector_agriculture: { es: { name: "Agricultura" }, mn: { name: "Хөдөө аж ахуй" } },
  sector_lulucf: {
    es: { name: "Uso de la tierra, cambio de uso de la tierra y silvicultura (UTCUTS)" },
    mn: { name: "Газар ашиглалт, газар ашиглалтын өөрчлөлт ба ойн аж ахуй (LULUCF)" },
  },
  sector_waste: { es: { name: "Residuos" }, mn: { name: "Хог хаягдал" } },
  sector_other: {
    es: { name: "Otros / Transversal" },
    mn: { name: "Бусад / Салбар дундын" },
  },

  // ── Nature-based solutions ──────────────────────────────────────────────────
  // dashboard ids (nbs_0..9) and upload ids (nbs_marine, ...) for the same names.
  nbs_0: {
    es: { name: "Protección, gestión y restauración de hábitats marinos y costeros" },
    mn: { name: "Далай, эргийн амьдрах орчныг хамгаалах, удирдах, нөхөн сэргээх" },
  },
  nbs_marine: {
    es: { name: "Protección, gestión y restauración de hábitats marinos y costeros" },
    mn: { name: "Далай, эргийн амьдрах орчныг хамгаалах, удирдах, нөхөн сэргээх" },
  },
  nbs_1: {
    es: { name: "Gestión de la agricultura y la ganadería" },
    mn: { name: "Хөдөө аж ахуй, мал аж ахуйн менежмент" },
  },
  nbs_agri: {
    es: { name: "Gestión de la agricultura y la ganadería" },
    mn: { name: "Хөдөө аж ахуй, мал аж ахуйн менежмент" },
  },
  nbs_2: { es: { name: "Gestión del agua" }, mn: { name: "Усны менежмент" } },
  nbs_water: { es: { name: "Gestión del agua" }, mn: { name: "Усны менежмент" } },
  nbs_3: {
    es: { name: "Gestión, restauración y protección de los bosques" },
    mn: { name: "Ойн менежмент, нөхөн сэргээлт, хамгаалал" },
  },
  nbs_forest: {
    es: { name: "Gestión, restauración y protección de los bosques" },
    mn: { name: "Ойн менежмент, нөхөн сэргээлт, хамгаалал" },
  },
  nbs_4: {
    es: { name: "Protección y restauración de humedales y ecosistemas de agua dulce" },
    mn: { name: "Намгархаг газар, цэнгэг усны экосистемийг хамгаалах, нөхөн сэргээх" },
  },
  nbs_wetland: {
    es: { name: "Protección y restauración de humedales y ecosistemas de agua dulce" },
    mn: { name: "Намгархаг газар, цэнгэг усны экосистемийг хамгаалах, нөхөн сэргээх" },
  },
  nbs_5: {
    es: { name: "Protección y conectividad de los ecosistemas" },
    mn: { name: "Экосистемийн хамгаалал ба холболт" },
  },
  nbs_ecosystem: {
    es: { name: "Protección y conectividad de los ecosistemas" },
    mn: { name: "Экосистемийн хамгаалал ба холболт" },
  },
  nbs_6: {
    es: { name: "Gestión y restauración de la fertilidad del suelo" },
    mn: { name: "Хөрсний үржил шимийн менежмент ба нөхөн сэргээлт" },
  },
  nbs_soil: {
    es: { name: "Gestión y restauración de la fertilidad del suelo" },
    mn: { name: "Хөрсний үржил шимийн менежмент ба нөхөн сэргээлт" },
  },
  nbs_7: {
    es: { name: "Gestión de riesgos basada en la naturaleza y prevención de desastres" },
    mn: { name: "Байгальд суурилсан эрсдэлийн менежмент ба гамшгаас сэргийлэх" },
  },
  nbs_risk: {
    es: { name: "Gestión de riesgos basada en la naturaleza y prevención de desastres" },
    mn: { name: "Байгальд суурилсан эрсдэлийн менежмент ба гамшгаас сэргийлэх" },
  },
  nbs_8: {
    es: { name: "Captura de carbono basada en la naturaleza" },
    mn: { name: "Байгальд суурилсан нүүрстөрөгч шингээлт" },
  },
  nbs_carbon: {
    es: { name: "Captura de carbono basada en la naturaleza" },
    mn: { name: "Байгальд суурилсан нүүрстөрөгч шингээлт" },
  },
  nbs_9: {
    es: { name: "Gestión de los asentamientos urbanos" },
    mn: { name: "Хот суурин газрын менежмент" },
  },
  nbs_urban: {
    es: { name: "Gestión de los asentamientos urbanos" },
    mn: { name: "Хот суурин газрын менежмент" },
  },

  // ── GLOBE biodiversity expenditure categories ───────────────────────────────
  globe_1: {
    es: { name: "Acceso y participación en los beneficios" },
    mn: { name: "Хүртээмж ба үр өгөөжийн хуваарилалт" },
  },
  globe_2: {
    es: { name: "Concienciación y conocimiento sobre la biodiversidad" },
    mn: { name: "Биологийн төрөл зүйлийн талаарх мэдлэг, ойлголт" },
  },
  globe_3: { es: { name: "Bioseguridad" }, mn: { name: "Биоаюулгүй байдал" } },
  globe_4: { es: { name: "Economía verde" }, mn: { name: "Ногоон эдийн засаг" } },
  globe_5: {
    es: { name: "Planificación y financiación de la biodiversidad" },
    mn: { name: "Биологийн төрөл зүйлийн төлөвлөлт ба санхүүжилт" },
  },
  globe_6: {
    es: { name: "Gestión de la contaminación" },
    mn: { name: "Бохирдлын менежмент" },
  },
  globe_7: {
    es: { name: "Áreas protegidas y otras medidas de conservación" },
    mn: { name: "Тусгай хамгаалалттай газар ба бусад хамгааллын арга хэмжээ" },
  },
  globe_8: { es: { name: "Restauración" }, mn: { name: "Нөхөн сэргээлт" } },
  globe_9: { es: { name: "Uso sostenible" }, mn: { name: "Тогтвортой ашиглалт" } },

  // ── GGA (Global Goal on Adaptation) climate-resilience themes ────────────────
  gga_water: { es: { name: "Agua" }, mn: { name: "Ус" } },
  gga_agriculture_food: {
    es: { name: "Agricultura y alimentación" },
    mn: { name: "Хөдөө аж ахуй ба хүнс" },
  },
  gga_health: { es: { name: "Salud" }, mn: { name: "Эрүүл мэнд" } },
  gga_ecosystems_biodiversity: {
    es: { name: "Ecosistemas y biodiversidad" },
    mn: { name: "Экосистем ба биологийн төрөл зүйл" },
  },
  gga_infrastructure_settlements: {
    es: { name: "Infraestructura y asentamientos humanos" },
    mn: { name: "Дэд бүтэц ба хүн амын суурьшил" },
  },
  gga_livelihoods: { es: { name: "Medios de vida" }, mn: { name: "Амьжиргаа" } },
  gga_cultural_heritage: {
    es: { name: "Patrimonio cultural" },
    mn: { name: "Соёлын өв" },
  },

  // ── Human rights themes ─────────────────────────────────────────────────────
  // Working translations pending native-speaker review: human rights
  // terminology carries legal weight and a loose rendering can misstate a
  // right. English is the authoritative wording until reviewed.
  hr_information_education: {
    es: { name: "Información y educación" },
    mn: { name: "Мэдээлэл ба боловсрол" },
  },
  hr_participation: {
    es: { name: "Participación pública libre, significativa y activa" },
    mn: { name: "Чөлөөтэй, үр дүнтэй, идэвхтэй олон нийтийн оролцоо" },
  },
  hr_access_justice: {
    es: { name: "Acceso a la justicia" },
    mn: { name: "Шүүх эрх зүйн хүртээмж" },
  },
  hr_indigenous_local_communities: {
    es: { name: "Pueblos Indígenas y comunidades locales" },
    mn: { name: "Уугуул иргэд ба нутгийн иргэдийн бүлгүүд" },
  },
  hr_gender_equality: {
    es: { name: "Igualdad de género" },
    mn: { name: "Жендэрийн тэгш байдал" },
  },
  hr_children_youth: {
    es: { name: "Niñez y juventud" },
    mn: { name: "Хүүхэд ба залуучууд" },
  },
  hr_defenders: {
    es: { name: "Personas defensoras de los derechos humanos ambientales" },
    mn: { name: "Байгаль орчны хүний эрхийн хамгаалагчид" },
  },
  hr_business: {
    es: { name: "Empresas" },
    mn: { name: "Бизнес эрхлэгчид" },
  },
  hr_disabilities: {
    es: { name: "Derechos de las personas con discapacidad" },
    mn: { name: "Хөгжлийн бэрхшээлтэй хүмүүсийн эрх" },
  },
};

/**
 * Return a copy of `item` with `name` swapped for the `locale` variant. English
 * passes through unchanged, as does any locale/id without a translation entry.
 * Operates on plain record rows so the dashboard assembler can pass raw JSON
 * straight through.
 */
export function localizeCategory<T extends Record<string, unknown>>(
  item: T,
  locale: string | undefined,
): T {
  if (locale !== "es" && locale !== "mn") return item;
  const id = typeof item.id === "string" ? item.id : undefined;
  const tr = id ? CATEGORY_TRANSLATIONS[id]?.[locale] : undefined;
  if (!tr) return item;
  return {
    ...item,
    ...(tr.name ? { name: tr.name } : {}),
  };
}

/** Map `localizeCategory` over an array, tolerating null/undefined input. */
export function localizeCategories<T extends Record<string, unknown>>(
  items: T[] | null | undefined,
  locale: string | undefined,
): T[] {
  if (!items) return [];
  if (locale !== "es" && locale !== "mn") return items;
  return items.map((it) => localizeCategory(it, locale));
}
