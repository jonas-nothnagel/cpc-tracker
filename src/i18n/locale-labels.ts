// Friendly display label per locale; falls back to the code itself for
// locales that haven't had a label assigned yet.
export const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  mn: "Монгол",
};

// Locales whose UI strings are machine-translated and not yet human-reviewed.
// Surfaced as a caveat beside the language choice so users read them with the
// right confidence. Remove a code here once a native speaker has reviewed it.
export const MACHINE_TRANSLATED = new Set(["es", "mn"]);
