/**
 * Ad-hoc browser check for the briefing, driven from the repo so verification
 * does not depend on a globally-configured Playwright channel.
 *
 * Usage (chromium must already be installed via `npx playwright install`):
 *   node scripts/browser-check.mjs <url> <tag> [selectorToDump]
 *
 * Not a test: `pnpm test` owns the assertions. This exists to look at a real
 * rendered page during development and to capture a screenshot for review.
 */
import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/en/panama";
const tag = process.argv[3] ?? "page";
const outDir = process.env.BROWSER_CHECK_OUT ?? "/tmp";
const exe = process.env.CHROMIUM_PATH;

const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-tour="doc-toggle"]', { timeout: 120_000 });
await page.waitForTimeout(2000);

// Reading lines sit directly under each slide headline.
const readings = await page
  .locator("section[id] p.text-caption.max-w-prose")
  .allInnerTexts();
console.log("=== READING LINES ===");
console.log(readings.filter(Boolean).join("\n") || "(none found)");

// Glossary terms are the dotted-underline buttons inside them.
const terms = await page.locator("section[id] button.decoration-dotted").allInnerTexts();
console.log("\n=== GLOSSARY TERMS ON PAGE ===");
console.log([...new Set(terms)].join(" | ") || "(none)");

const first = page.locator("section[id] button.decoration-dotted").first();
if (await first.count()) {
  await first.hover();
  await page.waitForTimeout(400);
  const card = page.locator('div[role="dialog"]').last();
  console.log("\n=== POPOVER ON HOVER ===");
  console.log((await card.count()) ? await card.innerText() : "(no popover)");
}

console.log("\n=== TOUR BUTTON ===");
const tour = page.getByRole("button", { name: /how to read this chart|cómo leer/i }).first();
console.log((await tour.count()) ? `"${await tour.innerText()}"` : "(not found)");

await page.screenshot({ path: `${outDir}/${tag}.png` });
console.log("\n=== CONSOLE ERRORS ===");
console.log(errors.length ? errors.slice(0, 8).join("\n") : "(none)");
await browser.close();
