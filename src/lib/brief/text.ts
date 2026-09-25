/** Words that end in a full stop without ending a sentence. */
const ABBREVIATIONS = new Set(["e.g", "i.e", "etc", "cf", "no", "nos", "res", "art", "vol", "para", "ref", "approx", "incl"]);

/**
 * Split an AI paragraph into its first sentence and the rest. A sentence
 * ends at . ! or ? followed by a space and a capital letter (Latin or
 * Cyrillic), unless the word before the stop is a known abbreviation: so
 * "Res. 91" or "e.g. Water" never cut a note mid-sentence.
 */
export function firstSentence(text: string): { first: string; rest: string } {
  const end = /[.!?](\s+)(?=[A-ZÀ-ÖØ-ÞА-ЯЁӨҮ])/g;
  let m: RegExpExecArray | null;
  while ((m = end.exec(text)) !== null) {
    const before = text.slice(0, m.index);
    const word = (before.match(/([A-Za-zÀ-ÿ.]+)$/)?.[1] ?? "").toLowerCase();
    if (ABBREVIATIONS.has(word)) continue;
    return { first: text.slice(0, m.index + 1), rest: text.slice(m.index + 1 + m[1].length) };
  }
  return { first: text, rest: "" };
}

export type CodeSegment = string | { code: string; name: string };

/**
 * An AI text in pieces, with each document id it uses ("FSS", "NRVTS")
 * marked with the document's name, so the page can explain the code in
 * place without changing the AI's words. Only ids are matched, whole words
 * and case-sensitive: short codes such as "LDN" are also general terms.
 */
export function docCodeSegments(text: string, docs: { id: string; name: string }[]): CodeSegment[] {
  // Codes are capitalised ids of three or more characters ("NDC", "FSS");
  // a one-letter id would mark every "A" in the text.
  const coded = docs.filter((d) => /^[A-Z][A-Z0-9_]{2,}$/.test(d.id) && d.id !== d.name);
  if (coded.length === 0) return [text];
  const names = new Map(coded.map((d) => [d.id, d.name]));
  const pattern = new RegExp(
    `\\b(${[...names.keys()]
      .sort((x, y) => y.length - x.length)
      .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})\\b`,
    "g",
  );
  const out: CodeSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push({ code: m[1], name: names.get(m[1]) ?? m[1] });
    last = at + m[1].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out.length > 0 ? out : [text];
}

/** First `max` characters of a verbatim text, cut at a word boundary. */
export function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}…`;
}

/** Labels shorter than this ("7 b)", "NBT 3") are clause numbers, not titles. */
const TITLE_LABEL_LENGTH = 24;

/** A target as one readable line: its label, followed by the start of its
 *  verbatim text when the label is only a number. Clipped, never
 *  paraphrased. */
export function targetLine(c: { label: string; text: string }, max = 80): string {
  if (c.label.length >= TITLE_LABEL_LENGTH) return c.label;
  const text = c.text.trim();
  if (!text || text === c.label) return c.label;
  if (text.startsWith(c.label)) return clip(text, max);
  return `${c.label} ${clip(text, max)}`;
}
