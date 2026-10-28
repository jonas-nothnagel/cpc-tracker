// Runs in the browser before the page becomes interactive.
import { mongolianNumbersAsEnglish } from "@/i18n/mongolian-numbers";

try {
  // Before the Mongolian pages hydrate: their numbers must read as the
  // server wrote them (see the module).
  mongolianNumbersAsEnglish();
} catch (err) {
  console.warn("Mongolian number formatting could not be set up:", err instanceof Error ? err.message : err);
}
