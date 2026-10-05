/**
 * Short forms for long words in documents' plain names, one shared list per
 * language, so every country's map of documents is named by the same rules.
 * A name keeps every word: only words with a standard short form shorten,
 * the longest first, and only until the name fits.
 */
const SHORT_FORMS: Record<string, Record<string, string>> = {
  en: {
    government: "gov.",
    "gov't": "gov.",
    strategic: "strat.",
    strategy: "strat.",
    innovation: "innov.",
    degradation: "degr.",
    development: "dev.",
    investment: "invest.",
    biodiversity: "biodiv.",
    adaptation: "adapt.",
    agriculture: "agric.",
    environmental: "env.",
    restoration: "restor.",
    implementation: "impl.",
    management: "mgmt.",
  },
  es: {
    gobierno: "gob.",
    estratégico: "estrat.",
    estratégica: "estrat.",
    estrategia: "estrat.",
    innovación: "innov.",
    degradación: "degrad.",
    desarrollo: "desarr.",
    inversión: "invers.",
    biodiversidad: "biodiv.",
    adaptación: "adapt.",
    agricultura: "agric.",
    ambiental: "amb.",
    restauración: "restaur.",
    planificación: "planif.",
  },
  // Mongolian names are shown whole: no short forms are in common use.
  mn: {},
};

/** Characters a plain name may take under the map before words shorten. */
export const NAME_ROOM = 18;

export function shortName(name: string, locale: string, max = NAME_ROOM): string {
  const forms = SHORT_FORMS[locale] ?? SHORT_FORMS.en;
  const words = name.split(" ");
  const candidates = words
    .map((word, i) => ({ word, i, short: forms[word.toLowerCase()] }))
    .filter((c): c is { word: string; i: number; short: string } => Boolean(c.short))
    .sort((a, b) => b.word.length - a.word.length);
  const out = [...words];
  for (const { word, i, short } of candidates) {
    if (out.join(" ").length <= max) break;
    const capital = word[0] !== word[0].toLowerCase();
    out[i] = capital ? short[0].toUpperCase() + short.slice(1) : short;
  }
  return out.join(" ");
}
