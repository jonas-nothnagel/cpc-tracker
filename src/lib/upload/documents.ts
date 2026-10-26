/**
 * An upload's documents as the page and the brief name them: a name read
 * from the file, a short code (a framework's own, or the name's capitals),
 * a colour (a framework's, or the palette's next) and the number of target
 * pairs the documents make. Client-safe: nothing here touches the disk.
 */

export const FRAMEWORK_CODES = ["NDC", "NBSAP", "NAP", "LDN"] as const;

/** Framework codes the wizard has always offered. `prompt` is the label the
 *  comparison prompt has always shown for the code (`DOC_TYPE_LABELS` in
 *  python/src/align.py), so a country config changes nothing the AI reads. */
export const KNOWN: Record<string, { full: string; prompt: string; color?: string }> = {
  NDC: { full: "Nationally Determined Contribution", prompt: "NDC", color: "#0468b1" },
  NBSAP: { full: "National Biodiversity Strategy and Action Plan", prompt: "NBT", color: "#166534" },
  NAP: { full: "National Adaptation Plan", prompt: "NAP", color: "#0e7490" },
  LDN: { full: "Land Degradation Neutrality targets", prompt: "LDN", color: "#b45309" },
  SECTORAL: { full: "Sectoral policy", prompt: "SECTORAL" },
  OTHER: { full: "Other document", prompt: "OTHER" },
};

/** Colours for the documents no framework colours, in order. */
export const PALETTE = ["#4f46e5", "#9d174d", "#ca8a04", "#475569", "#db2777", "#65a30d", "#6d28d9", "#0891b2"];

/** Ids the pipeline and the dashboard give a meaning of their own. */
export const RESERVED = new Set(["BTR", "BTR_ADP", "BER", "NR7", "OTHER"]);
export const SAFE_ID = /^[A-Za-z][A-Za-z0-9]{0,11}$/;

/** A framework's names in the project's languages: its code as a word, or
 *  its full name in English, Spanish or French. NBSAP comes before NAP. */
const FRAMEWORK_NAMES: [code: (typeof FRAMEWORK_CODES)[number], pattern: RegExp][] = [
  [
    "NBSAP",
    /\bnbsaps?\b|biodiversity strategy|estrategia nacional de biodiversidad|strat[ée]gie nationale[^.]*biodiversit[ée]/i,
  ],
  [
    "NDC",
    /\bndcs?\b|nationally determined contribution|contribuci[oó]n(?:es)? (?:nacionalmente )?determinada|contributions? d[ée]termin[ée]e/i,
  ],
  ["NAP", /\bnaps?\b|adaptation plan|plan nacional de adaptaci[oó]n|plan national d'adaptation/i],
  [
    "LDN",
    /\bldn\b|land degradation neutrality|neutralidad de la degradaci[oó]n|neutralit[ée] en mati[èe]re de d[ée]gradation/i,
  ],
];

const NAME_MAX = 120;
const EXTENSION = /\.(?:pdf|docx?|txt|csv|tsv|xlsx?)$/i;

/** User text on one line, composed (NFC): control characters out, whitespace
 *  collapsed. Anything that is not a string reads as empty. */
export function cleanText(raw: unknown): string {
  return typeof raw === "string"
    ? raw
        .normalize("NFC")
        .replace(/[\u0000-\u001f\u007f-\u009f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

/** Each document code, first seen first, to the id its targets are filed
 *  under: short safe codes keep themselves, any other gets DOC1, DOC2, … */
export function documentIds(codes: string[]): Map<string, string> {
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  for (const code of codes) {
    if (!ids.has(code) && SAFE_ID.test(code) && !RESERVED.has(code.toUpperCase())) {
      ids.set(code, code);
      taken.add(code);
    }
  }
  let next = 0;
  const ordered = new Map<string, string>();
  for (const code of codes) {
    if (ordered.has(code)) continue;
    let id = ids.get(code);
    if (id === undefined) {
      do id = `DOC${++next}`;
      while (taken.has(id));
      taken.add(id);
    }
    ordered.set(code, id);
  }
  return ordered;
}

/** A file's name as its document's name: the extension dropped, underscores
 *  and word-joining dashes read as spaces (a range such as 2016-2022 keeps
 *  its dash), composed, at most 120 characters. */
export function documentName(fileName: string): string {
  const name = fileName
    .normalize("NFC")
    .trim()
    .replace(EXTENSION, "")
    .replace(/_+/g, " ")
    .replace(/(?<!\d)-+|-+(?!\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(name).slice(0, NAME_MAX).join("").trim();
}

/** A short code the pipeline can file targets under. */
export function isValidCode(code: string): boolean {
  return SAFE_ID.test(code) && !RESERVED.has(code.toUpperCase());
}

/** The short code a document's name suggests: the framework it names, else
 *  the initials of its words that start with a Latin capital (2 to 6 of
 *  them), else DOC. A taken code gets the first free number (NWRP2); DOC
 *  always carries one. The page shows the suggestion and it can be changed. */
export function suggestCode(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((c) => c.toUpperCase()));
  const framework = FRAMEWORK_NAMES.find(([, pattern]) => pattern.test(name))?.[0];
  const initials = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => /^[A-Z]/.test(word))
    .map((word) => word[0])
    .join("")
    .slice(0, 6);
  const base = framework ?? (initials.length >= 2 ? initials : "DOC");
  const free = (code: string) => isValidCode(code) && !used.has(code.toUpperCase());
  if (base !== "DOC" && free(base)) return base;
  for (let n = base === "DOC" ? 1 : 2; ; n++) {
    if (free(`${base}${n}`)) return `${base}${n}`;
  }
}

/** Each code's colour, in order: its framework's, else the palette's next. */
export function documentColors(codes: readonly string[]): string[] {
  let paint = 0;
  return codes.map((code) => KNOWN[code]?.color ?? PALETTE[paint++ % PALETTE.length]);
}

/** Target pairs from two different documents, plus every reported action
 *  compared with every target. */
export function pairCount(counts: readonly number[], actions = 0): number {
  let seen = 0;
  let pairs = 0;
  for (const n of counts) {
    pairs += seen * n;
    seen += n;
  }
  return pairs + actions * seen;
}
