import type { FootprintEvent } from "@/lib/footprint/events";

/**
 * Events on the /sustainability running total: what the footprint was for at
 * the moments it grew. Curated from the project's history; each names the
 * commit, pull request or handoff it comes from. An event only describes: its
 * figures are added up from the ledger rows inside its window (see
 * src/lib/footprint/events.ts), and no row belongs to two events (tested).
 * Mongolian is machine-quality, like the rest of the Mongolian interface.
 */
export const FOOTPRINT_EVENTS: FootprintEvent[] = [
  {
    id: "mongolia-panama",
    from: "2026-06-02T00:00:00Z",
    to: "2026-06-03T23:59:59Z",
    countries: ["mongolia", "panama"],
    title: {
      en: "Mongolia and Panama analyses",
      es: "Análisis de Mongolia y Panamá",
      mn: "Монгол, Панамын шинжилгээ",
    },
    detail: {
      en: "Every pair of targets across the two countries' documents compared; the first runs this record covers.",
      es: "Se compararon todos los pares de metas de los documentos de ambos países; son las primeras ejecuciones que cubre este registro.",
      mn: "Хоёр улсын баримт бичгүүдийн зорилтуудыг хос хосоор нь бүгдийг харьцуулсан; энэ бүртгэлд хамрагдсан анхны ажиллагаа.",
    },
    source: "PR #106 (footprint ledger, Mongolia row backfilled from its run); ledger rows of 2 and 3 June",
  },
  {
    id: "model-comparison",
    from: "2026-06-25T00:00:00Z",
    to: "2026-06-26T23:59:59Z",
    countries: ["mongolia"],
    title: { en: "Model comparison", es: "Comparación de modelos", mn: "Загваруудын харьцуулалт" },
    detail: {
      en: "The Mongolia analysis run again on three more models (GPT-5.4 mini, DeepSeek V4 Pro, Llama 4 Maverick) to compare their results.",
      es: "El análisis de Mongolia se ejecutó de nuevo con tres modelos más (GPT-5.4 mini, DeepSeek V4 Pro, Llama 4 Maverick) para comparar sus resultados.",
      mn: "Монголын шинжилгээг үр дүнг нь харьцуулахын тулд өөр гурван загвараар (GPT-5.4 mini, DeepSeek V4 Pro, Llama 4 Maverick) дахин ажиллуулсан.",
    },
    source: "commit 627330e (Mongolia outputs per model, three model runs added)",
  },
  {
    id: "localization",
    from: "2026-06-30T00:00:00Z",
    to: "2026-06-30T23:59:59Z",
    runIds: ["backfill:translation-2026-06-30"],
    title: {
      en: "Spanish and Mongolian versions",
      es: "Versiones en español y mongol",
      mn: "Испани, монгол хувилбар",
    },
    detail: {
      en: "The countries' texts, Mongolia's targets and the method pages translated into Spanish and Mongolian.",
      es: "Los textos de los países, las metas de Mongolia y las páginas de metodología se tradujeron al español y al mongol.",
      mn: "Улс орнуудын эх бичвэр, Монголын зорилтууд болон аргачлалын хуудсыг испани, монгол хэлнээ орчуулсан.",
    },
    source: "PR #164 (complete es/mn localization); python/scripts/backfill_unrecorded_runs.py",
  },
  {
    id: "sri-lanka-final",
    from: "2026-07-03T00:00:00Z",
    to: "2026-07-04T23:59:59Z",
    countries: ["sri-lanka"],
    title: { en: "Sri Lanka analysis", es: "Análisis de Sri Lanka", mn: "Шри Ланкийн шинжилгээ" },
    detail: {
      en: "Sri Lanka's final set of 404 targets compared, then re-run on the repaired document text, with Spanish versions.",
      es: "Se compararon las 404 metas finales de Sri Lanka y se repitió el análisis con el texto corregido de los documentos, con versiones en español.",
      mn: "Шри Ланкийн эцсийн 404 зорилтыг харьцуулж, засварласан баримт бичгийн бичвэрээр дахин ажиллуулсан; испани хувилбартай.",
    },
    source: "commits 0ad76b6 and 2b5269b",
  },
  {
    id: "retranslation",
    from: "2026-07-06T00:00:00Z",
    to: "2026-07-06T23:59:59Z",
    runIds: ["backfill:translation-2026-07-06"],
    title: {
      en: "Texts translated again",
      es: "Textos traducidos de nuevo",
      mn: "Бичвэрүүдийг дахин орчуулсан",
    },
    detail: {
      en: "Spanish and Mongolian versions redone after the theme summaries of all four countries were regenerated.",
      es: "Las versiones en español y mongol se rehicieron tras regenerar los resúmenes temáticos de los cuatro países.",
      mn: "Дөрвөн улсын сэдэвчилсэн хураангуйг шинэчилсний дараа испани, монгол хувилбарыг дахин хийсэн.",
    },
    source: "commit ac1d892 (theme synthesis re-run for all four countries); python/scripts/backfill_unrecorded_runs.py",
  },
  {
    id: "sri-lanka-nbsap",
    from: "2026-07-28T00:00:00Z",
    to: "2026-07-28T23:59:59Z",
    countries: ["sri-lanka"],
    title: { en: "Sri Lanka re-run", es: "Nueva ejecución para Sri Lanka", mn: "Шри Ланкийг дахин ажиллуулсан" },
    detail: {
      en: "Re-run on Sri Lanka's updated national biodiversity strategy (NBSAP), with Spanish versions of its texts.",
      es: "Análisis repetido con la estrategia nacional de biodiversidad (NBSAP) actualizada de Sri Lanka, con versiones en español de sus textos.",
      mn: "Шри Ланкийн шинэчилсэн биологийн олон янз байдлын үндэсний стратеги (NBSAP)-аар дахин ажиллуулсан; бичвэрүүдийн испани хувилбартай.",
    },
    source: "commit 0b5a1b5",
  },
  {
    id: "mongolia-recurated",
    from: "2026-08-09T00:00:00Z",
    to: "2026-08-09T23:59:59Z",
    countries: ["mongolia"],
    title: { en: "Mongolia re-run", es: "Nueva ejecución para Mongolia", mn: "Монголыг дахин ажиллуулсан" },
    detail: {
      en: "Re-run on Mongolia's re-curated targets, with Mongolian versions of its texts.",
      es: "Análisis repetido con las metas revisadas de Mongolia, con versiones en mongol de sus textos.",
      mn: "Монголын дахин нягталсан зорилтуудаар дахин ажиллуулсан; бичвэрүүдийн монгол хувилбартай.",
    },
    source: "commit ec11ea6",
  },
  {
    id: "country-x",
    from: "2026-08-14T00:00:00Z",
    to: "2026-08-14T23:59:59Z",
    countries: ["countryx"],
    title: { en: "Country X demonstration", es: "Demostración con el País X", mn: "X улсын жишээ" },
    detail: {
      en: "A fictional demonstration country built from de-identified targets; its third run answered almost every request from stored results.",
      es: "Un país ficticio de demostración creado con metas anonimizadas; su tercera ejecución respondió casi todas las solicitudes con resultados almacenados.",
      mn: "Нэрийг нь нууцалсан зорилтуудаас бүтээсэн зохиомол жишээ улс; гурав дахь ажиллагаа нь бараг бүх хүсэлтэд хадгалсан үр дүнгээс хариулсан.",
    },
    source: "commit d756dbf; src/config/countries.ts",
  },
  {
    id: "spanish-explanations",
    from: "2026-08-18T09:00:00Z",
    to: "2026-08-18T09:59:59Z",
    countries: ["mongolia", "panama"],
    title: {
      en: "Spanish explanations for Mongolia",
      es: "Explicaciones en español para Mongolia",
      mn: "Монголын тайлбарын испани хувилбар",
    },
    detail: {
      en: "Mongolia's texts and the explanations of its pairs of targets translated into Spanish; Panama's and the Mongolian versions refreshed.",
      es: "Los textos de Mongolia y las explicaciones de sus pares de metas se tradujeron al español; se actualizaron las versiones de Panamá y en mongol.",
      mn: "Монголын бичвэрүүд болон зорилтын хосуудын тайлбарыг испани хэлнээ орчуулж, Панамын болон монгол хувилбарыг шинэчилсэн.",
    },
    source: "commit 993b62e (Spanish overlays, snapshots and pair rationales)",
  },
  {
    id: "procurement",
    from: "2026-08-27T00:00:00Z",
    to: "2026-08-28T23:59:59Z",
    runIds: ["backfill:nctp-procurement"],
    title: {
      en: "Public procurement screening",
      es: "Revisión de la contratación pública",
      mn: "Төрийн худалдан авалтын хяналт",
    },
    detail: {
      en: "77,101 Mongolian public tenders screened for an environmental purpose and matched to Mongolia's policy targets.",
      es: "Se examinaron 77.101 licitaciones públicas de Mongolia según su propósito ambiental y se relacionaron con las metas de política del país.",
      mn: "Монголын 77,101 төрийн тендерийг байгаль орчны зорилгоор нь шалгаж, улсын бодлогын зорилтуудтай тулгасан.",
    },
    source: "branch data/mongolia-nctp-procurement, docs/nctp-procurement/HANDOFF.md; python/scripts/backfill_unrecorded_runs.py",
  },
  {
    id: "sri-lanka-new-documents",
    from: "2026-09-18T00:00:00Z",
    to: "2026-09-23T23:59:59Z",
    countries: ["sri-lanka"],
    title: {
      en: "Sri Lanka's new documents",
      es: "Nuevos documentos de Sri Lanka",
      mn: "Шри Ланкийн шинэ баримт бичиг",
    },
    detail: {
      en: "Sri Lanka's analysis run on its new set of documents, with 2,305 texts translated into Spanish.",
      es: "El análisis de Sri Lanka se ejecutó con su nuevo conjunto de documentos, con 2.305 textos traducidos al español.",
      mn: "Шри Ланкийн шинжилгээг шинэ баримт бичгүүдээр ажиллуулж, 2,305 бичвэрийг испани хэлнээ орчуулсан.",
    },
    source: "branch data/sri-lanka-overhaul (07a6015); python/scripts/backfill_unrecorded_runs.py",
  },
  {
    id: "contracts-english",
    from: "2026-09-28T00:00:00Z",
    to: "2026-09-29T23:59:59Z",
    runIds: ["backfill:contract-titles", "contracts-translation:"],
    title: {
      en: "Public contracts in English",
      es: "Contratos públicos en inglés",
      mn: "Төрийн гэрээ англи хэлээр",
    },
    detail: {
      en: "The titles, buyers and purpose readings of the 5,913 Mongolian public contracts on the contracts page translated into English.",
      es: "Los títulos, los compradores y las lecturas de propósito de los 5.913 contratos públicos de Mongolia en la página de contratos se tradujeron al inglés.",
      mn: "Гэрээний хуудсан дахь Монголын 5,913 төрийн гэрээний нэр, худалдан авагч, зорилгын үнэлгээг англи хэлнээ орчуулсан.",
    },
    source: "commit bd2f472 (python/scripts/translate_contracts.py records its runs); python/scripts/backfill_unrecorded_runs.py (the titles of 28 and 29 September)",
  },
];
