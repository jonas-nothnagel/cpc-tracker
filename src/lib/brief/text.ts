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
